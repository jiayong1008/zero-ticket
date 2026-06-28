#!/usr/bin/env python3
"""
migrate_collections.py
One-time migration: copies embeddings from the global 'codebase_chunks' ChromaDB
collection into per-repository collections (repo_<sanitized_id>), without
re-calling any embedding API.

Run from the backend/ directory:
    python migrate_collections.py
"""
import os
import sys

# Ensure backend app is importable
sys.path.insert(0, os.path.dirname(__file__))

import chromadb
from app.db import SessionLocal, Repository

CHROMA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "chroma_db"))
GLOBAL_COLLECTION = "codebase_chunks"
BATCH_SIZE = 500


def sanitize_collection_name(repository_id: str) -> str:
    safe_id = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in repository_id)
    return f"repo_{safe_id[:50]}"


def migrate():
    client = chromadb.PersistentClient(path=CHROMA_DIR)

    # Load global collection
    try:
        global_col = client.get_collection(GLOBAL_COLLECTION)
    except Exception:
        print("No global 'codebase_chunks' collection found. Nothing to migrate.")
        return

    total_in_global = global_col.count()
    print(f"Global collection has {total_in_global} chunks.\n")

    if total_in_global == 0:
        print("Global collection is empty. Nothing to migrate.")
        return

    # Fetch all chunks from the global collection (with embeddings)
    print("Fetching all chunks from global collection...")
    all_data = global_col.get(
        include=["embeddings", "documents", "metadatas"],
        limit=total_in_global
    )
    all_ids        = all_data["ids"]
    all_embeddings = all_data["embeddings"]
    all_documents  = all_data["documents"]
    all_metadatas  = all_data["metadatas"]
    print(f"Fetched {len(all_ids)} chunks.\n")

    # Load all repositories from SQLite
    db = SessionLocal()
    repos = db.query(Repository).all()
    db.close()

    if not repos:
        print("No repositories found in the database. Run the app and add projects first.")
        return

    print(f"Found {len(repos)} repositories:\n")
    for repo in repos:
        print(f"  [{repo.id[:8]}...] {repo.project_name or repo.repo_name} -> {repo.repo_name}")

    print()

    total_migrated = 0
    total_skipped  = 0

    for repo in repos:
        repo_path = repo.repo_name.rstrip("/")
        collection_name = sanitize_collection_name(repo.id)

        # Filter chunks belonging to this repo by file_path prefix
        matched_indices = [
            i for i, meta in enumerate(all_metadatas)
            if meta.get("file_path", "").startswith(repo_path)
        ]

        if not matched_indices:
            print(f"  WARNING [{repo.project_name or repo.repo_name}] No matching chunks in global collection. Skipping.")
            continue

        print(f"  -> [{repo.project_name or repo.repo_name}] {len(matched_indices)} chunks to migrate into '{collection_name}'")

        # Get or create the per-repo collection
        per_repo_col = client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}
        )

        # Check which chunk IDs already exist in the per-repo collection
        matched_ids = [all_ids[i] for i in matched_indices]
        existing_in_repo = set()
        for j in range(0, len(matched_ids), BATCH_SIZE):
            batch_ids = matched_ids[j:j+BATCH_SIZE]
            try:
                res = per_repo_col.get(ids=batch_ids)
                if res and "ids" in res:
                    existing_in_repo.update(res["ids"])
            except Exception:
                pass

        # Only insert chunks that aren't already there
        to_insert = [i for i in matched_indices if all_ids[i] not in existing_in_repo]
        already_had = len(matched_indices) - len(to_insert)

        if already_had:
            print(f"       {already_had} already present in per-repo collection, skipping those.")
            total_skipped += already_had

        if not to_insert:
            print(f"       Nothing new to insert.")
            continue

        # Insert in batches
        for j in range(0, len(to_insert), BATCH_SIZE):
            batch_indices = to_insert[j:j+BATCH_SIZE]
            per_repo_col.add(
                ids=[all_ids[k] for k in batch_indices],
                embeddings=[all_embeddings[k] for k in batch_indices],
                documents=[all_documents[k] for k in batch_indices],
                metadatas=[all_metadatas[k] for k in batch_indices],
            )

        print(f"       OK Migrated {len(to_insert)} chunks.")
        total_migrated += len(to_insert)

    print(f"\n{'='*55}")
    print(f"Migration complete.")
    print(f"  Chunks migrated : {total_migrated}")
    print(f"  Chunks skipped  : {total_skipped} (already in per-repo collection)")
    print(f"\nGlobal 'codebase_chunks' collection remains on disk but")
    print("will no longer be used once per-repo collections have data.")


if __name__ == "__main__":
    migrate()
