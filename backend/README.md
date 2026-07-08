# ZeroTicket Backend API Server

FastAPI-powered agent engine that scans repositories, extracts database schemas, generates embedding vectors, and securely maps natural language customer support queries to sandboxed SQL queries.

## ⚙️ Core Modules & Features

### 1. Codebase Parsing & AST Engine
* The parsing system uses **Tree-sitter** / Abstract Syntax Tree (AST) scanning to map endpoints, routes, controllers, and permission checks.
* For **Laravel codebases**, it detects the `artisan` entrypoint and scopes parsing strictly to `app/Models`, `app/Http/Controllers`, and `routes/`.
* Code files are chunked as unified class/module structures to optimize embedding count and stay within the daily free tier limits of `gemini-embedding-001`.

### 2. SQL Security Guard & Protection Layers
To prevent data leaks and SQL injection vulnerabilities:
* **Driver-Level Write Prohibition:** The database connection utilizes a strictly read-only user (e.g., `GRANT SELECT`). Additionally, the token-level SQL parser rejects query execution containing mutating commands (`UPDATE`, `INSERT`, `DELETE`, `DROP`, `ALTER`, etc.).
* **Automatic Tenant Constraint Injector:** The security guard intercepts all generated queries and wraps them in a subquery enforcing context filters based on active JWT claims:
  ```sql
  -- Original: SELECT * FROM invoices;
  -- Secured:  SELECT * FROM (SELECT * FROM invoices) AS sub WHERE sub.tenant_id = :tenant_id LIMIT 10;
  ```
* **Performance Timeout:** Queries are limited to a hard **500ms execution timeout** to prevent denial of service (DoS) from unindexed or highly nested queries. Every query is also appended with `LIMIT 10`.

---

## 🚀 Setup & Installation

### 1. Requirements
* Python 3.10+
* MySQL or PostgreSQL Server (local replica to query target schema)

### 2. Setup Virtual Environment
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```
*(Note: If requirements.txt is not yet generated, standard packages are: `fastapi uvicorn sqlalchemy pymysql google-genai chromadb pyjwt`)*

### 3. Environment Variables
Create a `.env` file in the `backend/` directory with the following minimum required configuration for a self-hosted instance:

```env
# Database configuration (SQLite for local metadata)
DATABASE_URL=sqlite:///./zeroticket.db

# Encryption key for securing replica DB credentials at rest
ENCRYPTION_KEY=your-32-byte-base64-string-here

# Enterprise License Key
LICENSE_KEY=zt_license_trial_key

# Admin Passphrase to access the dashboard and configuration endpoints
ADMIN_PASSWORD=your_secure_password

# (Optional) Custom LLM base URL (e.g., for local Ollama/vLLM)
CUSTOM_LLM_BASE_URL=http://localhost:11434/v1
```

### 4. Launching Server
Start the development server using uvicorn on port `8088`:
```bash
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8088 --reload
```

---

## 🗄️ Database & Vector Indexes
* **SQLite metadata (`zeroticket.db`):** Stores registered tenant company mappings, API keys, repository links, and database connection credentials.
* **ChromaDB (`chroma_db/`):** Local vector database storing codebase chunk embeddings, structured in isolated, repository-scoped collections (`repo_<repository_id>`).

---

## 🔌 API Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health check endpoint. |
| `POST` | `/api/admin/login` | Admin login with passphrase. |
| `GET` | `/api/admin/status` | Checks if admin authentication is required. |
| `POST` | `/api/admin/generate_jwt` | Generates a mock tenant JWT token for testing. |
| `POST` | `/api/company/register` | Registers a new company and generates API keys. |
| `POST` | `/api/company/save_llm_config` | Saves company LLM configuration (provider, key, model). |
| `POST` | `/api/repository/connect` | Configures repository path and target git branches. |
| `POST` | `/api/database/connect` | Verifies connection to client MySQL replica. |
| `POST` | `/api/ingest` | Triggers background codebase parser and embeds code blocks asynchronously. |
| `POST` | `/api/webhooks/github` | Automated webhook ingestion triggered by GitHub push events. |
| `POST` | `/api/sandbox/simulate` | Simulates AI support agent responses with custom mock JWT claims context. |
| `POST` | `/api/chat/session` | Authenticates support iframe widget and issues JWT context. |
| `POST` | `/api/chat/send` | Chat communication bridge for active support widgets. |
| `GET` | `/api/repository/{id}/rules` | Fetches the custom AI guidelines (`ai_context_rules.txt`) for a repository. |
| `POST` | `/api/repository/{id}/rules` | Overwrites the custom AI guidelines (`ai_context_rules.txt`) for a repository. |
