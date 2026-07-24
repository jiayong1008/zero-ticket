# ZeroTicket Backend API Server

FastAPI-powered AI agent engine that scans codebases, extracts database schemas, generates embedding vectors, and securely maps natural language customer support queries to sandboxed SQL queries.

---

## 🧠 High-Level Architecture

The ZeroTicket backend acts as a secure intermediary between natural language customer queries and a company's sensitive data through three main pillars:

1. **Codebase Understanding (AST Engine):** Uses **Tree-sitter** to parse endpoints, routes, controllers, and permission logic into unified structural chunks embedded in **ChromaDB**.
2. **Secure Database Access:** Connects to read-only database replicas (MySQL or PostgreSQL).
3. **AI SQL Sandboxing & Execution:** Generates SQL via an LLM, intercepts and wraps queries with compile-time multi-tenant constraints via the **SQL Security Guard**, executes queries securely, and returns natural language answers.

---

## 🔄 Core Process Flows

### 1. Codebase Ingestion Pipeline (`/api/ingest`)
* **AST Scanning:** Scans source code files for Models, Controllers, Routes, and permission checks (e.g. `@PreAuthorize`, `Gate::allows`).
* **Embedding Generation:** Chunks code into logical units and generates vector embeddings (`nomic-embed-text` locally or `text-embedding-004` / Gemini embeddings).
* **Vector Storage:** Stores embeddings and metadata (file path, line numbers) in isolated ChromaDB collections (`repo_<repository_id>`).

#### 🤖 GitOps & GitHub Webhook Sync (`/api/webhooks/github`)
* Automated codebase re-ingestion triggered by GitHub push events.
* Verifies event payload signatures using SHA-256 HMAC authentication with the **Repository ID** as the secret key.
* **Testing locally via ngrok:**
  ```bash
  ngrok http 8088
  # Webhook URL: http://<subdomain>.ngrok-free.app/api/webhooks/github?repository_id=<REPO_ID>
  ```

### 2. Support Query Execution Pipeline (`/api/chat/send`)
1. **Semantic Context Search:** Queries ChromaDB for relevant codebase chunks matching the user query.
2. **SQL Generation & Sandboxing:** LLM drafts target SQL, which is intercepted by `app/engine/security.py`:
   * **Mutation Check:** Rejects `UPDATE`, `INSERT`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE` commands.
   * **Tenant Injection:** Injects JWT-bound `WHERE tenant_id = :tenant_id` constraints.
   * **Timeout:** Enforces a hard **500ms limit** and appends `LIMIT 10`.
3. **Safe Execution & Synthesis:** Executes query against read-only replica and feeds query results + code context to LLM for natural language response.
4. **Codebase-Only Mode:** If no database is connected, skips SQL generation and synthesizes answers purely using codebase logic.

### 3. Context-as-Code Alignment Loop ("Teach AI")
* Reads custom guidelines from `ai_context_rules.txt` in the root of the target repository.
* Administrators can correct AI mistakes from the Sandbox UI (`/api/sandbox/learn`), which commits updated rules directly back to `ai_context_rules.txt` via Git.

---

## 🚀 Setup & Installation

### 1. Prerequisites
* Python 3.10+
* MySQL or PostgreSQL Server (read-only replica for target schema)

### 2. Virtual Environment Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Environment Variables Configuration
Create `.env` in the `backend/` directory:

```env
# Database configuration (SQLite for local metadata)
DATABASE_URL=sqlite:///./zeroticket.db

# Encryption key for securing replica DB credentials at rest
ENCRYPTION_KEY=your-32-byte-base64-string-here

# Enterprise License Key
LICENSE_KEY=zt_license_trial_key

# Admin Passphrase to access dashboard and configuration endpoints
ADMIN_PASSWORD=your_secure_password

# (Optional) Custom LLM base URL for local Ollama/vLLM (AMD ROCm)
CUSTOM_LLM_BASE_URL=http://localhost:11434/v1
```

### 4. Launching the Server
Start the development server using Uvicorn on port `8088`:
```bash
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8088 --reload
```

---

## 📂 Folder Structure & Storage

```
backend/app/
├── main.py              # FastAPI application entry point & route definitions
├── config.py            # Environment variable configuration
├── db.py                # Internal SQLite metadata ORM models (Company, Repository, DBConfig)
├── auth.py              # JWT token generation, verification & API key auth
├── engine/              # AI Orchestration, LLM Prompts & SQL Security Guard
│   ├── agent.py         # Main AI reasoning loop
│   └── security.py      # AST SQL Security Guard rewriter
├── parser/              # AST code parsing & schema extractor
│   ├── code_parser.py   # Tree-sitter AST scanner
│   └── schema_extractor.py # Replica DB schema inspector
└── vector/              # Vector database interface
    └── chroma_store.py  # ChromaDB embedding & retrieval manager
```

### Databases & Storage
* **Internal Metadata DB (`zeroticket.db`):** SQLite database tracking company registrations, API keys, repository links, and encrypted DB credentials.
* **Vector Database (`chroma_db/`):** Persistent ChromaDB vector store for codebase embeddings (`chroma.sqlite3` + HNSW vector index segments).

---

## 🔌 API Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health check endpoint. |
| `POST` | `/api/admin/login` | Admin login with passphrase. |
| `GET` | `/api/admin/status` | Checks if admin authentication is active. |
| `POST` | `/api/admin/generate_jwt` | Generates a mock tenant JWT token for testing. |
| `POST` | `/api/company/register` | Registers a new company and issues API keys. |
| `POST` | `/api/company/save_llm_config` | Saves company LLM provider, model, and key configuration. |
| `POST` | `/api/repository/connect` | Configures target repository path and git branches. |
| `POST` | `/api/database/connect` | Tests connection to client MySQL/PostgreSQL replica. |
| `POST` | `/api/ingest` | Triggers background codebase AST parsing & embedding. |
| `POST` | `/api/webhooks/github` | Automated webhook re-ingestion on GitHub push events. |
| `POST` | `/api/sandbox/simulate` | Simulates AI support agent responses under mock JWT claims. |
| `POST` | `/api/sandbox/learn` | Updates `ai_context_rules.txt` with developer corrections. |
| `POST` | `/api/chat/session` | Issues JWT context for embedded chat widget iframe. |
| `POST` | `/api/chat/send` | Communication endpoint for active support widgets. |
| `GET` | `/api/repository/{id}/rules` | Fetches custom AI context guidelines (`ai_context_rules.txt`). |
| `POST` | `/api/repository/{id}/rules` | Overwrites custom AI context guidelines (`ai_context_rules.txt`). |
