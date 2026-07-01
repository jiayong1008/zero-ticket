# ZeroTicket Backend Technical Architecture

This document provides a deep dive into the internal workings, process flows, and architecture of the ZeroTicket backend. It is designed to help developers understand how the different pieces of the "vibe coded" system fit together.

## 🧠 High-Level Architecture

The ZeroTicket backend is a **FastAPI-powered AI agent engine**. Its primary objective is to act as a secure intermediary between natural language customer queries and a company's sensitive data. 

It achieves this through three main pillars:
1. **Codebase Understanding:** Parsing and embedding the company's source code (AST parsing + Vector DB).
2. **Secure Database Access:** Connecting to read-only database replicas.
3. **AI SQL Generation & Sandboxing:** Generating SQL via an LLM, injecting security constraints, executing it securely, and returning natural language answers.

---

## 🔄 Core Process Flows

### 1. The Ingestion Pipeline (Sync Codebase)
When a repository is synced via the `/api/ingest` endpoint:
1. **Tree-sitter Parsing (`app/parser/`):** The backend scans the source code files. It specifically targets business logic such as Models, Controllers, and Routes.
2. **Chunking:** The code is chunked into logical units.
3. **Embedding Generation:** The chunks are sent to the embedding model (e.g., `gemini-embedding-001`) to be converted into high-dimensional vector representations.
4. **Vector Storage (`app/vector/`):** The embeddings and their metadata (file path, line numbers) are stored locally in **ChromaDB**. 

### 2. The Chat Execution Pipeline (Support Queries)
When a user asks a question via the chat widget (`/api/chat/send`):
1. **Semantic Search:** The backend embeds the user's question and queries ChromaDB to find the most relevant chunks of code from the ingested repository.
2. **Database State & SQL Generation (Optional):** If a target database is connected, the LLM drafts a SQL query to answer the question.
3. **The Security Guard (`app/engine/security.py`) [Database Mode Only]:** 
   - **Mutation Check:** Ensures the generated SQL contains no mutating commands.
   - **Tenant Injection:** Injects tenant and user ID constraints (extracted from JWT) to prevent cross-tenant data leaks. 
4. **Execution [Database Mode Only]:** The query is executed against the replica database with a strict 500ms timeout.
5. **Response Generation:** 
   - **Database Mode:** The SQL results and code context are fed to the LLM to generate the final natural language response.
   - **Codebase-Only Mode:** If no database is connected, the SQL generation/execution steps are skipped entirely, and the LLM synthesizes an answer purely by explaining the company's rules, logic, and policies found in the codebase.

---

## 📂 Folder Structure (`backend/app/`)

| Directory / File | Description |
| :--- | :--- |
| `main.py` | The FastAPI application entry point. Defines all API routes and ties modules together. |
| `config.py` | Environment variable management (loads from `.env`). |
| `db.py` | Setup and ORM models for the **internal SQLite metadata database** (`zeroticket.db`). |
| `auth.py` | Security logic, JWT token generation/validation, and API key management. |
| `engine/` | The core AI logic. Prompts the LLM, manages chat history, generates SQL, and enforces security guardrails. |
| `parser/` | The ingestion engine. Uses Tree-sitter for AST scanning of target codebases (`code_parser.py`, `schema_extractor.py`). |
| `vector/` | ChromaDB integration (`chroma_store.py`). Handles embedding generation and semantic similarity searches. |

---

## 🗄️ Database Strategy Explained

ZeroTicket utilizes two completely separate types of databases to function securely:

### 1. Internal Metadata Database (`zeroticket.db`)
* **Technology:** SQLite
* **Purpose:** Acts as the backend's internal "brain." 
* **Stores:** Registered companies, API keys, repository connection configs, target database credentials, etc.
* **Note:** *Never* stores actual customer support data or target database contents.

### 2. Target / Client Database (Optional)
* **Technology:** MySQL or PostgreSQL (Configured by the tenant)
* **Purpose:** The actual database containing the company's data. 
* **Security:** The backend connects to this database as a **read-only replica**. It executes the AI-generated, sandboxed SQL queries here to fetch answers for support tickets.
* **Codebase-Only Mode:** If a company chooses to skip database connection during onboarding, the backend gracefully falls back to relying purely on codebase semantic search, skipping all SQL generation and execution.

---

## 🔍 Understanding ChromaDB (`chroma_db/`)

The `chroma_db/` folder is the persistent storage for the vector database. It is not just a single file, but a structured data store managed entirely by ChromaDB.

* **`chroma.sqlite3`:** ChromaDB's own internal SQLite database. It tracks metadata about your collections (e.g., which code chunks belong to which file, chunk IDs).
* **UUID Folders (e.g., `73fde8b0-...`):** These directories contain the actual vector indexes (using the HNSW algorithm). Each collection (e.g., `repo_<repository_id>`) or optimized segment gets its own folder to store the heavy, binary vector data efficiently.

*(Note: If you see a `chroma_db_test/` folder, it is likely a remnant from a manual test script where a custom `persist_dir` was used. It can be safely deleted if no active tests are using it.)*
