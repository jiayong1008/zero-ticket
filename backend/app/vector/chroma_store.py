import os
import time
import chromadb
from google import genai
from app.config import settings

def interruptible_sleep(seconds: int, check_interval: float = 1.0, on_progress=None, current_idx=0, status_msg=None):
    start_time = time.time()
    while time.time() - start_time < seconds:
        try:
            from app.main import SHUTDOWN_SIGNAL
            if SHUTDOWN_SIGNAL:
                raise ValueError("Server shutting down")
        except ImportError:
            pass
            
        if on_progress:
            try:
                on_progress(current_idx, status_msg)
            except Exception as ex:
                if "Sync cancelled by user" in str(ex):
                    raise ex
                pass
                
        time.sleep(min(check_interval, seconds - (time.time() - start_time)))

class ChromaStore:
    def __init__(self, persist_dir: str = "chroma_db", repository_id: str = "", llm_base_url: str = ""):
        self.persist_dir = os.path.abspath(persist_dir)
        self.client = chromadb.PersistentClient(path=self.persist_dir)
        self._llm_base_url = llm_base_url
        # Use per-repository collection so projects don't share/pollute each other's index.
        # ChromaDB collection names: 3-63 chars, alphanumeric + underscores/hyphens only.
        if repository_id:
            safe_id = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in repository_id)
            self.collection_name = f"repo_{safe_id[:50]}"
        else:
            self.collection_name = "codebase_chunks"  # legacy global collection
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"}
        )
        
    def _get_gemini_client(self, api_key: str = ""):
        key = api_key or settings.GEMINI_API_KEY
        if not key:
            raise ValueError("GEMINI_API_KEY is not configured.")
        return genai.Client(
            api_key=key, 
            http_options={'timeout': 30000, 'retryOptions': {'attempts': 1}}
        )

    def _generate_embeddings(self, texts: list[str], api_key: str = "", provider: str = "gemini") -> list[list[float]]:
        """
        Generates embeddings for a list of texts using Gemini or OpenAI models.
        """
        prov = (provider or "gemini").lower()
        if prov == "openai":
            from openai import OpenAI
            client = OpenAI(api_key=api_key)
            response = client.embeddings.create(
                model="text-embedding-3-small",
                input=texts
            )
            return [data.embedding for data in response.data]
        elif prov == "gemini":
            client = self._get_gemini_client(api_key)
            response = client.models.embed_content(
                model="gemini-embedding-001",
                contents=texts
            )
            return [e.values for e in response.embeddings]
        elif prov == "custom":
            from openai import OpenAI
            base_url = self._llm_base_url or settings.CUSTOM_LLM_BASE_URL
            try:
                client = OpenAI(
                    api_key=api_key or "noop",
                    base_url=base_url,
                    default_headers={"Bypass-Tunnel-Reminder": "true"}
                )
                embedding_model = "nomic-ai/nomic-embed-text-v1.5" if "fireworks.ai" in (base_url or "") else "nomic-embed-text"
                response = client.embeddings.create(
                    model=embedding_model,
                    input=texts
                )
                return [data.embedding for data in response.data]
            except Exception as e:
                print(f"[embeddings] Local nomic-embed-text at {base_url} failed: {e}")
                if settings.GEMINI_API_KEY:
                    print("[embeddings] Falling back to cloud Gemini embedding model.")
                    client = self._get_gemini_client(settings.GEMINI_API_KEY)
                    response = client.models.embed_content(
                        model="gemini-embedding-001",
                        contents=texts
                    )
                    return [e.values for e in response.embeddings]
                else:
                    raise ValueError(
                        f"Local embedding generation failed: {str(e)}. "
                        "Please verify that Ollama is running and you have run 'ollama pull nomic-embed-text' "
                        "on your AMD server, or configure a GEMINI_API_KEY in the backend for automated hybrid fallback."
                    )
        else:
            # Fall back to Gemini using the backend's environment key for embeddings,
            # since Claude/DeepSeek/Qwen keys cannot be used for Google GenAI embedding.
            client = self._get_gemini_client("")
            response = client.models.embed_content(
                model="gemini-embedding-001",
                contents=texts
            )
            return [e.values for e in response.embeddings]

    def add_code_chunks(self, chunks: list[dict], api_key: str = "", provider: str = "gemini", on_progress=None):
        """
        Processes and inserts codebase chunks into ChromaDB incrementally.
        """
        if not chunks:
            return
            
        # 1. Filter out chunks that are already indexed in Chroma
        all_chunk_ids = [f"{chunk['file_path']}_{chunk['start_line']}_{chunk['end_line']}" for chunk in chunks]
        
        # Check existing IDs in batches of 500 to find what to skip
        existing_ids = set()
        for j in range(0, len(all_chunk_ids), 500):
            batch_ids = all_chunk_ids[j:j+500]
            try:
                res = self.collection.get(ids=batch_ids)
                if res and "ids" in res:
                    existing_ids.update(res["ids"])
            except Exception:
                pass
                
        # Filter chunks and IDs
        pending_chunks = []
        for chunk, cid in zip(chunks, all_chunk_ids):
            if cid not in existing_ids:
                pending_chunks.append((cid, chunk))
                
        if not pending_chunks:
            return
        
        # Track offset so progress counter is cumulative (already-indexed + newly indexed)
        already_indexed_count = len(existing_ids)
            
        # 2. Batch generate embeddings and add incrementally
        # Gemini Free Tier limits embeddings to 15 Requests Per Minute.
        # Since each string in the batch counts as 1 request, we must use a batch_size < 15.
        batch_size = 10 if (provider or "gemini").lower() == "gemini" else 50
        import time
        
        for i in range(0, len(pending_chunks), batch_size):
            batch = pending_chunks[i:i+batch_size]
            batch_ids = [item[0] for item in batch]
            batch_chunks = [item[1] for item in batch]
            
            # Combine content with metadata headers
            batch_docs = []
            batch_metadatas = []
            for chunk in batch_chunks:
                doc_content = f"File: {chunk['file_path']}\nType: {chunk['chunk_type']}\nName: {chunk['name']}\n\n{chunk['content']}"
                batch_docs.append(doc_content)
                batch_metadatas.append({
                    "file_path": chunk["file_path"],
                    "start_line": chunk["start_line"],
                    "end_line": chunk["end_line"],
                    "chunk_type": chunk["chunk_type"],
                    "name": chunk["name"]
                })
                
            retries = 5
            backoff = 60
            batch_embeddings = []
            while retries > 0:
                try:
                    batch_embeddings = self._generate_embeddings(batch_docs, api_key, provider)
                    break
                except Exception as e:
                    if "429" in str(e) and retries > 1:
                        print(f"Rate limited (429) during embedding. Sleeping for {backoff} seconds...")
                        status_msg = f"Rate limit hit. Retrying in {backoff}s..."
                        if on_progress:
                            try:
                                on_progress(already_indexed_count + i, status_msg)
                            except Exception as ex:
                                if "Sync cancelled by user" in str(ex):
                                    raise ex
                        interruptible_sleep(backoff, on_progress=on_progress, current_idx=i, status_msg=status_msg)
                        backoff *= 2
                        retries -= 1
                    else:
                        if "429" in str(e):
                            raise Exception("Quota exceeded or persistent rate limit. Please check your API key limits or try again later.")
                        raise e
            
            if batch_embeddings:
                # Add this batch to Chroma immediately
                self.collection.add(
                    ids=batch_ids,
                    embeddings=batch_embeddings,
                    documents=batch_docs,
                    metadatas=batch_metadatas
                )
                if on_progress:
                    try:
                        on_progress(already_indexed_count + i + len(batch))
                    except Exception as ex:
                        if "Sync cancelled by user" in str(ex):
                            raise ex
                
            # Simple throttling sleep to respect free tier rate limit
            if i + batch_size < len(pending_chunks):
                time.sleep(6)

    def query_similar_code(self, query: str, limit: int = 5, api_key: str = "", provider: str = "gemini") -> list[dict]:
        """
        Queries Chroma for codebase chunks similar to the query.
        If the per-repository collection is empty (e.g. not yet migrated to the new
        per-repo isolation), automatically falls back to the legacy global collection.
        """
        # 1. Embed query
        query_embedding = self._generate_embeddings([query], api_key, provider)[0]

        # 2. Determine which collection to query.
        # If this is a per-repo collection but it has no data yet, fall back to the
        # legacy global collection so queries keep working without a forced resync.
        collection = self.collection
        if self.collection_name != "codebase_chunks":
            try:
                count = self.collection.count()
            except Exception:
                count = 0
            if count == 0:
                # Fall back to global legacy collection
                try:
                    collection = self.client.get_collection("codebase_chunks")
                except Exception:
                    pass  # Global collection doesn't exist either — return empty

        # 3. Query Chroma
        try:
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=limit
            )
        except Exception:
            return []

        formatted_results = []
        if results and results["documents"]:
            docs = results["documents"][0]
            metas = results["metadatas"][0]
            distances = results["distances"][0] if "distances" in results else [0.0] * len(docs)
            
            for doc, meta, dist in zip(docs, metas, distances):
                formatted_results.append({
                    "document": doc,
                    "metadata": meta,
                    "score": 1.0 - dist  # Cosine similarity score
                })
                
        return formatted_results

    def clear_database(self):
        """
        Clears all records in the codebase collection.
        """
        self.client.delete_collection(name=self.collection_name)
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"}
        )
