import time
import re
from google import genai
from google.genai import types
import base64
from app.config import settings
from app.db import DBConnection, get_target_db_conn
from app.parser.schema_extractor import SchemaExtractor
from app.vector.chroma_store import ChromaStore
from app.engine.security import SQLSecurityGuard

class AgentEngine:
    def __init__(self, db_session, repository_id: str = "", llm_base_url: str = ""):
        self.db = db_session
        self._repository_id = repository_id
        self._llm_base_url = llm_base_url
        self.chroma = ChromaStore(persist_dir="chroma_db", repository_id=repository_id, llm_base_url=llm_base_url)

    def _extract_date_patterns(self, query: str) -> list[str]:
        import re
        from datetime import datetime, timedelta
        
        patterns = []
        # 1. Look for YYYY-MM-DD (e.g., 2026-07-02 or 2026/07/02)
        iso_match = re.search(r'\b(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b', query)
        if iso_match:
            year, month, day = iso_match.groups()
            patterns.append(f"{year}-{month}-{day}")
            try:
                dt = datetime(int(year), int(month), int(day))
                patterns.append(dt.strftime("%d/%b/%Y")) # e.g. 02/Jul/2026
                patterns.append(dt.strftime("%d/%m/%Y")) # e.g. 02/07/2026
            except Exception:
                pass
                
        # 2. Look for Month DD (e.g., July 2, Jul 2, July 2nd, July 02)
        months_str = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec"
        month_match = re.search(rf'\b({months_str})\s+(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\b', query, re.IGNORECASE)
        if month_match:
            m_name, day_str = month_match.groups()
            day = int(day_str)
            for m_num, m_short in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1):
                if m_name.lower().startswith(m_short):
                    year = 2026
                    patterns.append(f"{year}-{m_num:02d}-{day:02d}")
                    try:
                        dt = datetime(year, m_num, day)
                        patterns.append(dt.strftime("%d/%b/%Y"))
                        patterns.append(dt.strftime("%d/%m/%Y"))
                    except Exception:
                        pass
                    break
                    
        # 3. Look for DD Month (e.g., 2 July, 2nd July, 2 Jul, 02 July)
        day_month_match = re.search(rf'\b(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s+({months_str})\b', query, re.IGNORECASE)
        if day_month_match:
            day_str, m_name = day_month_match.groups()
            day = int(day_str)
            for m_num, m_short in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1):
                if m_name.lower().startswith(m_short):
                    year = 2026
                    patterns.append(f"{year}-{m_num:02d}-{day:02d}")
                    try:
                        dt = datetime(year, m_num, day)
                        patterns.append(dt.strftime("%d/%b/%Y"))
                        patterns.append(dt.strftime("%d/%m/%Y"))
                    except Exception:
                        pass
                    break
                    
        # 4. Handle relative dates: today, yesterday
        if "today" in query.lower():
            dt = datetime.now()
            patterns.append(dt.strftime("%Y-%m-%d"))
            patterns.append(dt.strftime("%d/%b/%Y"))
            patterns.append(dt.strftime("%d/%m/%Y"))
        elif "yesterday" in query.lower():
            dt = datetime.now() - timedelta(days=1)
            patterns.append(dt.strftime("%Y-%m-%d"))
            patterns.append(dt.strftime("%d/%b/%Y"))
            patterns.append(dt.strftime("%d/%m/%Y"))
            
        return list(set(patterns))

    def _get_live_logs(self, company_id: str, repository_id: str, jwt_claims: dict, query: str = "") -> tuple[str, list[str]]:
        """
        Scans for .log files in the repository directory, reads from the bottom up,
        filters for rows containing jwt_claims (user_id/tenant_id) and optional date/keyword filters,
        and returns a formatted log string and a list of thought logs.
        """
        import os
        from app.db import Repository
        from collections import deque
        import re
        
        # 1. Resolve repository path
        repo = None
        if repository_id:
            repo = self.db.query(Repository).filter(Repository.id == repository_id).first()
        if not repo:
            repo = self.db.query(Repository).filter(Repository.company_id == company_id).first()
            
        if not repo or not repo.repo_name or not os.path.exists(repo.local_path):
            return "No active repository found or directory does not exist.", ["No repository mapped for live log scanning."]
            
        repo_path = repo.local_path
        log_files = []
        exclude_dirs = {'.venv', 'venv', 'node_modules', '.git', 'vendor'}
        
        # 2. Scan for log files
        try:
            for root, dirs, files in os.walk(repo_path):
                dirs[:] = [d for d in dirs if d not in exclude_dirs]
                for file in files:
                    if file.endswith('.log'):
                        log_files.append(os.path.join(root, file))
        except Exception as e:
            return f"Error scanning log files: {str(e)}", [f"Failed to scan directory for logs: {str(e)}"]
            
        if not log_files:
            return "No server log files (.log) found in the repository.", ["No local log files discovered in repository path."]
            
        # 3. Resolve user identifiers to filter (for secure isolation)
        search_terms = []
        for key in ["user_id", "tenant_id", "company_id", "customer_id", "client_id"]:
            val = jwt_claims.get(key)
            if val is not None and val != "":
                search_terms.append(str(val))
                
        if not search_terms:
            return "No secure user identifier claims provided in JWT context. Logs omitted for security.", ["Logs omitted: missing user/tenant ID in JWT context."]
            
        # 4. Extract dates and keyword patterns from query
        date_patterns = self._extract_date_patterns(query) if query else []
        
        # Extract UUIDs or high-value transaction patterns
        keyword_patterns = []
        if query:
            uuids = re.findall(r'\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b', query, re.IGNORECASE)
            keyword_patterns.extend(uuids)
            errors = re.findall(r'\b[A-Z]{3,}-[A-Z]{3,}-\d{3,}\b', query)
            keyword_patterns.extend(errors)
            
        # Determine scan limit: expand scan size if searching for historical logs/keywords
        has_filter = bool(date_patterns or keyword_patterns)
        scan_limit = 25000 if has_filter else 1000
        
        # 5. Read and filter logs
        matching_lines = []
        thought_logs = [
            f"Scanning log files: {[os.path.basename(f) for f in log_files]}",
            f"Scanning depth: {scan_limit} lines",
            f"Filtering securely for identifiers: {search_terms}"
        ]
        if date_patterns:
            thought_logs.append(f"Applying date patterns: {date_patterns}")
        if keyword_patterns:
            thought_logs.append(f"Applying keyword patterns: {keyword_patterns}")
            
        secure_patterns = [re.compile(r'\b' + re.escape(term) + r'\b') for term in search_terms]
        filter_terms = date_patterns + keyword_patterns
        filter_regexes = [re.compile(re.escape(term), re.IGNORECASE) for term in filter_terms]
        
        try:
            for log_path in log_files:
                try:
                    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
                        lines = deque(f, maxlen=scan_limit)
                        
                        for line in reversed(lines):
                            # Must match at least one secure user identifier
                            has_secure_match = any(pat.search(line) for pat in secure_patterns)
                            if not has_secure_match:
                                continue
                                
                            # If date/keyword filters are specified, it must also match at least one filter pattern
                            if filter_regexes:
                                has_filter_match = any(fpat.search(line) for fpat in filter_regexes)
                                if not has_filter_match:
                                    continue
                                    
                            matching_lines.append(f"[{os.path.basename(log_path)}] {line.strip()}")
                            if len(matching_lines) >= 100:
                                break
                except Exception as ex:
                    thought_logs.append(f"Failed to read file {os.path.basename(log_path)}: {str(ex)}")
                if len(matching_lines) >= 100:
                    break
        except Exception as e:
            return f"Error reading log files: {str(e)}", thought_logs + [f"Error reading log: {str(e)}"]
            
        # 6. Format results
        if matching_lines:
            log_context = "LIVE LOG ENTRIES MATCHING USER CONTEXT:\n" + "\n".join(reversed(matching_lines))
            thought_logs.append(f"Matched {len(matching_lines)} secure log lines.")
        else:
            log_context = "No live server log entries matched this user's context/identifiers."
            thought_logs.append("No matching log entries found.")
            
        return log_context, thought_logs

    def _get_custom_guidelines(self, company_id: str, repository_id: str) -> str:
        """
        Reads custom user guidelines if ai_context_rules.txt exists in the repository root.
        """
        import os
        from app.db import Repository
        repo = None
        if repository_id:
            repo = self.db.query(Repository).filter(Repository.id == repository_id).first()
        if not repo:
            repo = self.db.query(Repository).filter(Repository.company_id == company_id).first()
            
        if repo and repo.repo_name:
            rules_path = os.path.join(repo.local_path, "ai_context_rules.txt")
            if os.path.exists(rules_path):
                try:
                    with open(rules_path, 'r', encoding='utf-8', errors='ignore') as f:
                        return f.read().strip()
                except Exception:
                    pass
        return ""

    def _get_gemini_client(self, api_key: str = ""):
        key = api_key or settings.GEMINI_API_KEY
        if not key:
            raise ValueError("GEMINI_API_KEY is not configured.")
        return genai.Client(
            api_key=key,
            http_options={'timeout': 30000}
        )

    def _generate_llm_content(self, provider: str, model: str, api_key: str, prompt: str, image_data: str = None, stream: bool = False, max_tokens: int = None):
        """
        Routes the generation request to the requested LLM provider dynamically.
        Supports multimodal image inputs via image_data (data URI format).
        """
        prov = (provider or "gemini").lower()
        
        if prov == "openai":
            from openai import OpenAI
            client = OpenAI(api_key=api_key)
            content_list = [{"type": "text", "text": prompt}]
            if image_data:
                content_list.append({"type": "image_url", "image_url": {"url": image_data}})
            
            response = client.chat.completions.create(
                model=model or "gpt-4o",
                messages=[{"role": "user", "content": content_list}],
                temperature=0.0,
                stream=stream
            )
            if stream:
                def stream_gen(c, resp):
                    for chunk in resp:
                        if chunk.choices:
                            delta = chunk.choices[0].delta
                            content = getattr(delta, "content", None) or ""
                            reasoning = getattr(delta, "reasoning_content", None) or ""
                            if reasoning:
                                yield ("reasoning", reasoning)
                            elif content:
                                yield ("content", content)
                return stream_gen(client, response)
            return response.choices[0].message.content or ""
            
        elif prov == "anthropic":
            from anthropic import Anthropic
            client = Anthropic(api_key=api_key)
            content_list = [{"type": "text", "text": prompt}]
            if image_data:
                mime_type = "image/jpeg"
                b64_data = image_data
                if image_data.startswith("data:"):
                    header, b64_data = image_data.split(",", 1)
                    mime_type = header.split(":")[1].split(";")[0]
                content_list.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": mime_type,
                        "data": b64_data
                    }
                })
            
            if stream:
                def stream_gen(c):
                    with c.messages.stream(
                        model=model or "claude-3-5-sonnet-20241022",
                        max_tokens=2000,
                        messages=[{"role": "user", "content": content_list}],
                        temperature=0.0
                    ) as stream_response:
                        for text in stream_response.text_stream:
                            yield ("content", text)
                return stream_gen(client)
                
            response = client.messages.create(
                model=model or "claude-3-5-sonnet-20241022",
                max_tokens=2000,
                messages=[{"role": "user", "content": content_list}],
                temperature=0.0
            )
            return response.content[0].text or ""
            
        elif prov in ["deepseek", "qwen", "custom"]:
            from openai import OpenAI
            if prov == "deepseek":
                base_url = "https://api.deepseek.com/v1"
                model_name = model or "deepseek-chat"
            elif prov == "qwen":
                base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
                model_name = model or "qwen-plus"
            else:
                base_url = self._llm_base_url or settings.CUSTOM_LLM_BASE_URL
                model_name = model or "llama3"
                
            if prov == "custom":
                client = OpenAI(
                    api_key=api_key or "noop",
                    base_url=base_url,
                    default_headers={"Bypass-Tunnel-Reminder": "true"}
                )
            else:
                client = OpenAI(api_key=api_key or "noop", base_url=base_url)
            content_list = [{"type": "text", "text": prompt}]
            if image_data:
                content_list.append({"type": "image_url", "image_url": {"url": image_data}})

            extra_params = {}
            if max_tokens:
                extra_params["max_completion_tokens"] = max_tokens

            response = client.chat.completions.create(
                model=model_name,
                messages=[{"role": "user", "content": content_list}],
                temperature=0.0,
                stream=stream,
                **extra_params
            )
            if stream:
                def stream_gen(c, resp):
                    for chunk in resp:
                        if chunk.choices:
                            delta = chunk.choices[0].delta
                            content = getattr(delta, "content", None) or ""
                            reasoning = getattr(delta, "reasoning_content", None) or ""
                            if reasoning:
                                yield ("reasoning", reasoning)
                            elif content:
                                yield ("content", content)
                return stream_gen(client, response)
            
            return response.choices[0].message.content or ""
            
        else:
            client = self._get_gemini_client(api_key)
            target_model = model or "gemini-2.5-flash"
            
            contents = [prompt]
            if image_data:
                mime_type = "image/jpeg"
                b64_data = image_data
                if image_data.startswith("data:"):
                    header, b64_data = image_data.split(",", 1)
                    mime_type = header.split(":")[1].split(";")[0]
                image_bytes = base64.b64decode(b64_data)
                contents.insert(0, types.Part.from_bytes(data=image_bytes, mime_type=mime_type))

            if stream:
                response = client.models.generate_content_stream(
                    model=target_model,
                    contents=contents
                )
                def stream_gen(c, resp):
                    for chunk in resp:
                        if chunk.text:
                            yield ("content", chunk.text)
                return stream_gen(client, response)

            response = client.models.generate_content(
                model=target_model,
                contents=contents
            )
            return response.text or ""

    def execute_inquiry(self, company_id: str, query: str, jwt_claims: dict, api_key: str = "", repository_id: str = "", provider: str = "gemini", model_name: str = "", chat_history: list = None, image_data: str = None, llm_base_url: str = "") -> dict:
        """
        Coordinates the full execution loop:
        1. Retrieves relevant codebase context from Chroma.
        2. Retrieves target DB connection details.
        3. Invokes LLM to draft a database query.
        4. Rewrites the query using SQLSecurityGuard (enforcing tenant rules).
        5. Executes the query against target DB (MySQL or PostgreSQL).
        6. Invokes LLM to formulate the final explanation.
        """
        start_time = time.time()
        
        # 0. Resolve LLM Configuration
        from app.db import Company, decrypt_password
        company = self.db.query(Company).filter(Company.id == company_id).first()
        if company:
            if not api_key and company.encrypted_llm_api_key:
                try:
                    api_key = decrypt_password(company.encrypted_llm_api_key)
                except Exception:
                    pass
            # Set values from database company record if they exist
            provider = company.llm_provider or provider
            model_name = company.llm_model or model_name
            if company.llm_base_url:
                self._llm_base_url = company.llm_base_url
                
        if llm_base_url:
            self._llm_base_url = llm_base_url
            
        prov = (provider or "gemini").lower()
        if not api_key and prov != "custom":
            return {
                "answer": "Error: Failed to generate SQL draft using LLM: LLM API Key is not configured. Please save your API key in the Developer Dashboard.",
                "thought_log": "LLM API Key missing in request and database."
            }

        # 0.5 Preprocess Image OCR if image_data exists
        thought_log = []
        if image_data:
            ocr_prompt = f"Analyze this image in the context of the user's inquiry: '{query}'. Extract any visible text, error messages, IDs, or relevant UI state that might be useful for a database lookup. Keep it concise."
            try:
                ocr_provider = provider
                ocr_model = model_name
                ocr_key = api_key
                # Fallback to Gemini if custom provider is used (no vision support) and Gemini API Key is available.
                if prov == "custom" and settings.GEMINI_API_KEY:
                    ocr_provider = "gemini"
                    ocr_model = "gemini-2.5-flash"
                    ocr_key = settings.GEMINI_API_KEY
                    thought_log.append("--- [Image OCR Local-to-Cloud Fallback] ---\nUsing Gemini for vision analysis (local Gemma is text-only).\n")
                extracted_text = self._generate_llm_content(ocr_provider, ocr_model, ocr_key, ocr_prompt, image_data=image_data)
                query = f"{query}\n\n[Extracted Image Context]: {extracted_text}"
                thought_log.append(f"--- [Extracted Image Context] ---\n{extracted_text}\n")
            except Exception as e:
                thought_log.append(f"--- [Image OCR Error] ---\nFailed to extract image text: {str(e)}\n")
            
        # 1. Fetch DB Connection details
        conn_details = None
        if repository_id:
            conn_details = self.db.query(DBConnection).filter(DBConnection.repository_id == repository_id).first()
        if not conn_details:
            conn_details = self.db.query(DBConnection).filter(
                DBConnection.company_id == company_id,
                DBConnection.repository_id == None
            ).first()
            
        has_db = bool(conn_details)

        db_type = getattr(conn_details, "db_type", "mysql") if has_db else "mysql"

        # 2. Extract database schema
        schema_extractor = None
        target_conn = None
        schema_context = "No database connected. Do not attempt to query state."
        db_schema = {}
        if has_db:
            try:
                target_conn = get_target_db_conn(conn_details)
                schema_extractor = SchemaExtractor(target_conn)
                db_schema = schema_extractor.extract_schema(conn_details.db_name)
                schema_context = schema_extractor.format_schema_for_llm(db_schema)
            except Exception as e:
                return {
                    "answer": f"Error: Failed to connect or inspect target database schema. Detail: {str(e)}",
                    "thought_log": f"Failed target DB setup: {str(e)}"
                }
            finally:
                if target_conn:
                    target_conn.close()

        # 3. Retrieve relevant codebase chunks from Chroma (per-repository collection)
        # Re-init chroma with the resolved repository_id if it wasn't set at construction time.
        if repository_id and repository_id != self._repository_id:
            from app.vector.chroma_store import ChromaStore as _CS
            chroma = _CS(persist_dir="chroma_db", repository_id=repository_id, llm_base_url=self._llm_base_url)
        else:
            chroma = self.chroma
            chroma._llm_base_url = self._llm_base_url
        
        # Ingest live logs context and custom guidelines
        log_context, log_thoughts = self._get_live_logs(company_id, repository_id, jwt_claims, query)
        custom_guidelines = self._get_custom_guidelines(company_id, repository_id)
        guideline_context = f"\nCUSTOM REPOSITORY CONFIGURATION & RULES:\n{custom_guidelines}\n" if custom_guidelines else ""
        
        thought_log.append("--- [Live Logs Matching Context] ---")
        for t in log_thoughts:
            thought_log.append(t)
        thought_log.append(log_context + "\n")

        code_snippets = []
        code_context = ""
        try:
            # Route embedding extraction based on active provider
            results = chroma.query_similar_code(query, limit=5, api_key=api_key, provider=provider)
            for res in results:
                meta = res['metadata']
                code_snippets.append({
                    "file_path": meta['file_path'],
                    "lines": f"{meta['start_line']}-{meta['end_line']}",
                    "name": meta['name'],
                    "content": res['document']
                })
            
            code_context = "\n\n".join([
                f"### File: {s['file_path']} (Lines {s['lines']}, function/class: {s['name']})\n```\n{s['content']}\n```" 
                for s in code_snippets
            ])
        except Exception as e:
            print(f"Codebase search skipped/failed: {str(e)}")
            code_context = "No codebase context retrieved."

        # 4. Format chat history (Dynamic Token-Aware Sliding Window)
        history_context = ""
        if chat_history:
            history_lines = []
            char_count = 0
            for msg in reversed(chat_history):
                role_str = "ZeroTicket" if msg.get("role") == "assistant" else "User"
                line = f"[{role_str}]: {msg.get('content', '')}"
                if char_count + len(line) > 3000:
                    break
                history_lines.insert(0, line)
                char_count += len(line)
            if history_lines:
                history_context = "RECENT CONVERSATION HISTORY:\n" + "\n".join(history_lines) + "\n"

        # 5. Draft SQL Query
        draft_sql = ""
        sanitized_sql = "N/A (Codebase-Only Mode)"
        db_rows = []
        execution_time_ms = 0
        
        if has_db:
            sql_draft_prompt = f"""
You are the database inspection unit of ZeroTicket.
Your job is to write a single read-only {db_type.upper()} SELECT query that will extract the database state needed to answer the user's inquiry.

DATABASE SCHEMA:
{schema_context}

{history_context}
RELEVANT CODE LOGIC:
{code_context}

USER INQUIRY:
"{query}"

JWT CLAIMS FOR LOGGED IN USER:
{str(jwt_claims)}

INSTRUCTIONS:
1. Write a SELECT statement to query tables.
2. Ensure you filter rows correctly using the columns. Do NOT worry about injecting security tenant filters yourself—our middleware security rewriter will automatically inject subqueries with WHERE statements for columns like `tenant_id` or `user_id`. But feel free to filter by appropriate keys if you know them.
3. Keep the query simple and efficient.
4. Output ONLY the raw SQL query inside a single ```sql ... ``` block. Do NOT write any conversational text or explanation.
"""
            thought_log.append("--- [Retrieved Code Snippets] ---")
            thought_log.append(code_context)
            thought_log.append("\n--- [DB Schema] ---")
            thought_log.append(schema_context)
    
            try:
                sql_text = self._generate_llm_content(provider, model_name, api_key, sql_draft_prompt, max_tokens=1000)
                
                # Extract query from markdown code block
                sql_match = re.search(r"```sql(.*?)```", sql_text, re.DOTALL | re.IGNORECASE)
                if sql_match:
                    draft_sql = sql_match.group(1).strip()
                else:
                    draft_sql = sql_text.strip()
                    
                thought_log.append(f"\n--- [LLM Drafted SQL] ---\n{draft_sql}")
            except Exception as e:
                return {
                    "answer": f"Error: Failed to generate SQL draft using LLM: {str(e)}",
                    "thought_log": "\n".join(thought_log) + f"\nError generating SQL: {str(e)}"
                }
    
            # 5. Rewrite/Sanitize Query with SQLSecurityGuard
            try:
                guard = SQLSecurityGuard(db_schema, dialect=db_type)
                sanitized_sql = guard.validate_and_rewrite(draft_sql, jwt_claims)
                thought_log.append(f"\n--- [Security Guard Sanitized SQL] ---\n{sanitized_sql}")
                
                # 6. Execute SQL query on target replica
                db_start = time.time()
                target_conn = get_target_db_conn(conn_details)
                with target_conn.cursor() as cursor:
                    # Set session timeout of 500ms
                    if db_type in ["postgres", "postgresql"]:
                        cursor.execute("SET statement_timeout = 500")
                    else:
                        cursor.execute("SET max_execution_time = 500")
                    cursor.execute(sanitized_sql)
                    db_rows = cursor.fetchall()
                target_conn.close()
                execution_time_ms = int((time.time() - db_start) * 1000)
                
                thought_log.append(f"\n--- [Database Query Results] (Time: {execution_time_ms}ms) ---\n{str(db_rows)}")
            except Exception as e:
                thought_log.append(f"\n--- [SQL Execution/Security Error] ---\n{str(e)}")
                db_rows = [{"error": str(e)}]
        else:
            thought_log.append("--- [Retrieved Code Snippets] ---")
            thought_log.append(code_context)
            thought_log.append("\n--- [Database] ---")
            thought_log.append("No database connected. Skipped SQL generation and execution.")

        # 7. Synthesize Response
        if has_db:
            db_instructions = """3. Use the retrieved codebase rules to justify the explanation. (e.g. "According to our policy, standard ACH payments take up to 2 working days to settle").
4. If there was a database error or no data found, politely explain that you cannot locate the record or verify the state, and suggest what they can check or how to contact support."""
        else:
            db_instructions = """3. No database is connected. Answer the user's question PURELY by explaining the rules, logic, and policies found in the CODE LOGIC EXPLAINER.
4. Do NOT apologize for missing database records, since you are operating in Codebase-Only mode."""

        synthesis_prompt = f"""
You are ZeroTicket, the AI support assistant. 
Your goal is to answer the customer's support inquiry in a helpful, non-technical way.

{history_context}
CODE LOGIC EXPLAINER:
{code_context}

LIVE SERVER LOGS:
{log_context}

{guideline_context}
USER INQUIRY:
"{query}"

JWT CLAIMS FOR LOGGED IN USER:
{str(jwt_claims)}

SQL QUERY EXECUTED:
{sanitized_sql or "No query executed"}

DATABASE STATE RETRIEVED:
{str(db_rows)}

INSTRUCTIONS:
1. Address the customer directly and explain their situation clearly in simple English.
2. Avoid raw developer terms, SQL queries, column names, or raw JSON states in your final reply. For example, do not say "The invoice table has status = 2", instead say "Your invoice is currently in pending state".
3. STRICT EVIDENCE CONSTRAINT: Never speculate, assume, or state generic support policies, timelines (e.g. "takes 1-3 working days"), or procedures unless they are explicitly present in the DATABASE STATE RETRIEVED, LIVE SERVER LOGS, CODE LOGIC EXPLAINER, or the CUSTOM GUIDELINES. If the data does not confirm a timeline or status, clearly state that you cannot verify it rather than making it up.
{db_instructions}
"""
        
        try:
            answer = self._generate_llm_content(provider, model_name, api_key, synthesis_prompt, max_tokens=800)
        except Exception as e:
            answer = f"Error: Failed to synthesize response. Detail: {str(e)}"
            thought_log.append(f"Failed response synthesis: {str(e)}")

        total_time_ms = int((time.time() - start_time) * 1000)
        minutes = (total_time_ms // 1000) // 60
        seconds = (total_time_ms // 1000) % 60
        ms = total_time_ms % 1000
        time_str = f"{total_time_ms}ms ({minutes}m {seconds}s {ms}ms)" if minutes > 0 else f"{total_time_ms}ms ({seconds}s {ms}ms)"
        thought_log.append(f"\n--- [Total Processing Time] ---\n{time_str}")

        return {
            "answer": answer,
            "thought_log": "\n".join(thought_log)
        }


    def execute_inquiry_stream(self, company_id: str, query: str, jwt_claims: dict, api_key: str = "", repository_id: str = "", provider: str = "gemini", model_name: str = "", chat_history: list = None, image_data: str = None, llm_base_url: str = ""):
        import json
        
        def yield_event(event_type: str, content_data: str):
            payload = json.dumps({"type": event_type, "content": content_data})
            return f"data: {payload}\n\n"

        start_time = time.time()
        
        # 0. Resolve LLM Configuration
        from app.db import Company, decrypt_password
        company = self.db.query(Company).filter(Company.id == company_id).first()
        if company:
            if not api_key and company.encrypted_llm_api_key:
                try:
                    api_key = decrypt_password(company.encrypted_llm_api_key)
                except Exception:
                    pass
            # Set values from database company record if they exist
            provider = company.llm_provider or provider
            model_name = company.llm_model or model_name
            if company.llm_base_url:
                self._llm_base_url = company.llm_base_url
                
        if llm_base_url:
            self._llm_base_url = llm_base_url
            
        prov = (provider or "gemini").lower()
        if not api_key and prov != "custom":
            yield yield_event("error", "Error: Failed to generate SQL draft using LLM: LLM API Key is not configured.")
            return

        # 0.5 Preprocess Image OCR if image_data exists
        if image_data:
            yield yield_event("thought", "--- [Image OCR Extraction] ---\nExtracting text from image...\n")
            ocr_prompt = f"Analyze this image in the context of the user's inquiry: '{query}'. Extract any visible text, error messages, IDs, or relevant UI state that might be useful for a database lookup. Keep it concise."
            try:
                ocr_provider = provider
                ocr_model = model_name
                ocr_key = api_key
                # Fallback to Gemini if custom provider is used (no vision support) and Gemini API Key is available.
                if prov == "custom" and settings.GEMINI_API_KEY:
                    ocr_provider = "gemini"
                    ocr_model = "gemini-2.5-flash"
                    ocr_key = settings.GEMINI_API_KEY
                    yield yield_event("thought", "Using Gemini for vision analysis (local Gemma is text-only).\n")
                extracted_text = self._generate_llm_content(ocr_provider, ocr_model, ocr_key, ocr_prompt, image_data=image_data)
                query = f"{query}\n\n[Extracted Image Context]: {extracted_text}"
                yield yield_event("thought", f"Extracted text:\n{extracted_text}\n\n")
            except Exception as e:
                yield yield_event("thought", f"Failed to extract image text: {str(e)}\n\n")
            
        # 1. Fetch DB Connection details
        conn_details = None
        if repository_id:
            conn_details = self.db.query(DBConnection).filter(DBConnection.repository_id == repository_id).first()
        if not conn_details:
            conn_details = self.db.query(DBConnection).filter(
                DBConnection.company_id == company_id,
                DBConnection.repository_id == None
            ).first()
            
        has_db = bool(conn_details)

        db_type = getattr(conn_details, "db_type", "mysql") if has_db else "mysql"

        # 2. Extract database schema
        schema_extractor = None
        target_conn = None
        schema_context = "No database connected. Do not attempt to query state."
        db_schema = {}
        if has_db:
            try:
                target_conn = get_target_db_conn(conn_details)
                schema_extractor = SchemaExtractor(target_conn)
                db_schema = schema_extractor.extract_schema(conn_details.db_name)
                schema_context = schema_extractor.format_schema_for_llm(db_schema)
            except Exception as e:
                yield yield_event("error", f"Error: Failed to connect or inspect target database schema. Detail: {str(e)}")
                return
            finally:
                if target_conn:
                    target_conn.close()

        # 3. Retrieve relevant codebase chunks from Chroma
        if repository_id and repository_id != self._repository_id:
            from app.vector.chroma_store import ChromaStore as _CS
            chroma = _CS(persist_dir="chroma_db", repository_id=repository_id, llm_base_url=self._llm_base_url)
        else:
            chroma = self.chroma
            chroma._llm_base_url = self._llm_base_url
            
        # Ingest live logs context and custom guidelines
        log_context, log_thoughts = self._get_live_logs(company_id, repository_id, jwt_claims, query)
        custom_guidelines = self._get_custom_guidelines(company_id, repository_id)
        guideline_context = f"\nCUSTOM REPOSITORY CONFIGURATION & RULES:\n{custom_guidelines}\n" if custom_guidelines else ""
        
        yield yield_event("thought", "--- [Live Logs Matching Context] ---\n")
        for t in log_thoughts:
            yield yield_event("thought", t + "\n")
        yield yield_event("thought", log_context + "\n\n")

        code_snippets = []
        code_context = ""
        try:
            results = chroma.query_similar_code(query, limit=5, api_key=api_key, provider=provider)
            for res in results:
                meta = res['metadata']
                code_snippets.append({
                    "file_path": meta['file_path'],
                    "lines": f"{meta['start_line']}-{meta['end_line']}",
                    "name": meta['name'],
                    "content": res['document']
                })
            
            code_context = "\n\n".join([
                f"### File: {s['file_path']} (Lines {s['lines']}, function/class: {s['name']})\n```\n{s['content']}\n```" 
                for s in code_snippets
            ])
            yield yield_event("thought", "--- [Retrieved Code Snippets] ---\n")
            yield yield_event("thought", code_context + "\n\n")
        except Exception as e:
            code_context = "No codebase context retrieved."
            yield yield_event("thought", "--- [Codebase Search Failed] ---\n" + str(e) + "\n\n")

        yield yield_event("thought", "--- [DB Schema] ---\n")
        yield yield_event("thought", schema_context + "\n\n")

        # 4. Format chat history
        history_context = ""
        if chat_history:
            history_lines = []
            char_count = 0
            for msg in reversed(chat_history):
                role_str = "ZeroTicket" if msg.get("role") == "assistant" else "User"
                line = f"[{role_str}]: {msg.get('content', '')}"
                if char_count + len(line) > 3000:
                    break
                history_lines.insert(0, line)
                char_count += len(line)
            if history_lines:
                history_context = "RECENT CONVERSATION HISTORY:\n" + "\n".join(history_lines) + "\n"

        # 5. Draft SQL Query
        draft_sql = ""
        sanitized_sql = "N/A (Codebase-Only Mode)"
        db_rows = []
        execution_time_ms = 0
        
        if has_db:
            sql_draft_prompt = f"""
You are the database inspection unit of ZeroTicket.
Your job is to write a single read-only {db_type.upper()} SELECT query that will extract the database state needed to answer the user's inquiry.

DATABASE SCHEMA:
{schema_context}

{history_context}
RELEVANT CODE LOGIC:
{code_context}

USER INQUIRY:
"{query}"

JWT CLAIMS FOR LOGGED IN USER:
{str(jwt_claims)}

INSTRUCTIONS:
1. Write a SELECT statement to query tables.
2. Ensure you filter rows correctly using the columns. Do NOT worry about injecting security tenant filters yourself—our middleware security rewriter will automatically inject subqueries with WHERE statements for columns like `tenant_id` or `user_id`. But feel free to filter by appropriate keys if you know them.
3. Keep the query simple and efficient.
4. Output ONLY the raw SQL query inside a single ```sql ... ``` block. Do NOT write any conversational text or explanation.
"""
            yield yield_event("thought", "--- [LLM Drafted SQL] ---\n")
            
            sql_text = ""
            try:
                for token_type, chunk in self._generate_llm_content(provider, model_name, api_key, sql_draft_prompt, stream=True, max_tokens=1000):
                    sql_text += chunk
                    yield yield_event("thought", chunk)
                
                yield yield_event("thought", "\n\n")
                
                sql_match = re.search(r"```sql(.*?)```", sql_text, re.DOTALL | re.IGNORECASE)
                if sql_match:
                    draft_sql = sql_match.group(1).strip()
                else:
                    draft_sql = sql_text.strip()
            except Exception as e:
                yield yield_event("error", f"Error: Failed to generate SQL draft using LLM: {str(e)}")
                return
    
            # 5. Rewrite/Sanitize Query with SQLSecurityGuard
            try:
                guard = SQLSecurityGuard(db_schema, dialect=db_type)
                sanitized_sql = guard.validate_and_rewrite(draft_sql, jwt_claims)
                yield yield_event("thought", f"--- [Security Guard Sanitized SQL] ---\n{sanitized_sql}\n\n")
                
                # 6. Execute SQL query on target replica
                db_start = time.time()
                target_conn = get_target_db_conn(conn_details)
                with target_conn.cursor() as cursor:
                    if db_type in ["postgres", "postgresql"]:
                        cursor.execute("SET statement_timeout = 500")
                    else:
                        cursor.execute("SET max_execution_time = 500")
                    cursor.execute(sanitized_sql)
                    db_rows = cursor.fetchall()
                target_conn.close()
                execution_time_ms = int((time.time() - db_start) * 1000)
                
                yield yield_event("thought", f"--- [Database Query Results] (Time: {execution_time_ms}ms) ---\n{str(db_rows)}\n\n")
            except Exception as e:
                yield yield_event("thought", f"--- [SQL Execution/Security Error] ---\n{str(e)}\n\n")
                db_rows = [{"error": str(e)}]
        else:
            yield yield_event("thought", "--- [Database] ---\nNo database connected. Skipped SQL generation and execution.\n\n")

        # 7. Synthesize Response
        if has_db:
            db_instructions = """3. Use the retrieved codebase rules to justify the explanation. (e.g. "According to our policy, standard ACH payments take up to 2 working days to settle").
4. If there was a database error or no data found, politely explain that you cannot locate the record or verify the state, and suggest what they can check or how to contact support."""
        else:
            db_instructions = """3. No database is connected. Answer the user's question PURELY by explaining the rules, logic, and policies found in the CODE LOGIC EXPLAINER.
4. Do NOT apologize for missing database records, since you are operating in Codebase-Only mode."""

        synthesis_prompt = f"""
You are ZeroTicket, the AI support assistant. 
Your goal is to answer the customer's support inquiry in a helpful, non-technical way.

{history_context}
CODE LOGIC EXPLAINER:
{code_context}

LIVE SERVER LOGS:
{log_context}

{guideline_context}
USER INQUIRY:
"{query}"

JWT CLAIMS FOR LOGGED IN USER:
{str(jwt_claims)}

SQL QUERY EXECUTED:
{sanitized_sql or "No query executed"}

DATABASE STATE RETRIEVED:
{str(db_rows)}

INSTRUCTIONS:
1. Address the customer directly and explain their situation clearly in simple English.
2. Avoid raw developer terms, SQL queries, column names, or raw JSON states in your final reply. For example, do not say "The invoice table has status = 2", instead say "Your invoice is currently in pending state".
3. STRICT EVIDENCE CONSTRAINT: Never speculate, assume, or state generic support policies, timelines (e.g. "takes 1-3 working days"), or procedures unless they are explicitly present in the DATABASE STATE RETRIEVED, LIVE SERVER LOGS, CODE LOGIC EXPLAINER, or the CUSTOM GUIDELINES. If the data does not confirm a timeline or status, clearly state that you cannot verify it rather than making it up.
{db_instructions}
"""
        
        try:
            reasoning_started = False
            for token_type, chunk in self._generate_llm_content(provider, model_name, api_key, synthesis_prompt, stream=True, max_tokens=4000):
                if token_type == "reasoning":
                    if not reasoning_started:
                        reasoning_started = True
                        yield yield_event("thought", "--- [🧠 AI Reasoning Process] ---\n")
                    yield yield_event("thought", chunk)
                else:
                    yield yield_event("answer", chunk)
        except Exception as e:
            yield yield_event("error", f"Error: Failed to synthesize response. Detail: {str(e)}")

        total_time_ms = int((time.time() - start_time) * 1000)
        minutes = (total_time_ms // 1000) // 60
        seconds = (total_time_ms // 1000) % 60
        ms = total_time_ms % 1000
        time_str = f"{total_time_ms}ms ({minutes}m {seconds}s {ms}ms)" if minutes > 0 else f"{total_time_ms}ms ({seconds}s {ms}ms)"
        yield yield_event("thought", f"\n--- [Total Processing Time] ---\n{time_str}\n")
