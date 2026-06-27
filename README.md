# ZeroTicket: AI-Powered Support-as-Code Platform

ZeroTicket is an autonomous AI customer support platform that integrates directly with a tenant's git repository and a read-only database replica. It resolves the "Why can't User X see Y?" support loophole by answering customer support inquiries using real-time database schema information and codebase logic, while enforcing strict tenant data isolation via a secure SQL Security Guard.

---

## 💡 Runtime Walkthrough (How it Answers a Question)

1. **User Input:** End-user asks a question, e.g., *"Why is my transfer payment pending?"* (Signed JWT contains user context like `user_id: 852`).
2. **Context Retrieval:** ZeroTicket finds the relevant codebase chunks (payment logic) from ChromaDB and the replica database configurations.
3. **Draft SQL Query:** The AI determines it needs to query the database and drafts a query: `SELECT status, amount, created_at, failure_reason FROM payments`
4. **Security Wrapping:** The SQL Security Guard intercepts and reformulates the query with tenant constraints:
   ```sql
   SELECT status, amount, created_at, failure_reason 
   FROM payments 
   WHERE user_id = 852 
   ORDER BY created_at DESC 
   LIMIT 1;
   ```
5. **Database Execution:** The safe query runs on the read-only MySQL replica (constrained by a hard **500ms** timeout and driver-level read-only permissions).
6. **Code Rules Consultation:** The AI consults the retrieved code logic (e.g., standard ACH transfers under $2,000 take 2 business days to clear).
7. **Response Generation:** The AI explains the technical result in clean, human-readable English: *"Your $1,500 payment is pending because it was sent via bank transfer (ACH), which takes up to 2 business days to clear. It should clear by tomorrow morning."*

---

## 🛠️ Project Structure

The project consists of a Python FastAPI backend and a Next.js (React) frontend.

```
zeroticket/
├── backend/                  # FastAPI Backend Server
│   ├── app/
│   │   ├── main.py          # API Endpoints (Ingestion, Sandbox, Chat Session)
│   │   ├── parser/
│   │   │   ├── code_parser.py       # Scans repo and chunks Laravel models & controllers
│   │   │   └── schema_extractor.py  # Connects to MySQL replica and extracts tables/schemas
│   │   ├── vector/
│   │   │   └── chroma_store.py      # Embeds chunks incrementally using Gemini and caches in ChromaDB
│   │   ├── engine/
│   │   │   ├── agent.py             # Generates SQL queries and answers support tickets
│   │   │   └── security.py          # SQL Security Guard to wrap/intercept queries for safety
│   │   └── db.py            # Local SQLite database configurations
│   ├── zeroticket.db        # Backend SQLite metadata DB (ignored by git)
│   └── chroma_db/           # Local Vector database (ignored by git)
│
└── frontend/                 # Next.js Web Client
    ├── app/
    │   ├── layout.tsx       # Root Next.js layout (theme transition listener)
    │   ├── page.tsx         # Dashboard / Connection details and Widget Integration Guides
    │   ├── onboarding/      # 4-Step Onboarding flow (Company info, Git repo, DB credentials, Gemini API key)
    │   ├── sandbox/         # AI Sandbox Emulator (JWT Mock Claims, Chat simulator, and thoughts/SQL trace log)
    │   └── widget/          # Customer-facing embedded chat widget (renders in iframe)
    └── globals.css          # Design system, CSS variables, and light/dark styling overrides
```

💡 **Sub-project Documentation:**
* 🔌 **Backend API Details:** See the [backend/README.md](file:///Users/jiayong/GitHub/zeroticket/backend/README.md) for endpoint breakdowns and local database/vector directory mappings.
* 🎨 **Frontend Client Details:** See the [frontend/README.md](file:///Users/jiayong/GitHub/zeroticket/frontend/README.md) for theme swapping setups, page directories, and client routes.

---

## 🚀 How to Run the Applications

### 1. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Activate virtual environment and launch uvicorn:
   ```bash
   .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8088 --reload
   ```

### 2. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Run development server:
   ```bash
   npm run dev
   ```
   *(Running locally on `http://localhost:3000`)*

---

## 💡 Important Context for Future AI Coding Sessions

### 1. Rate Limit & Chunk Optimization (Free Tier Friendly)
* **The Problem:** Gemini's free embedding model API (`gemini-embedding-001`) enforces a strict daily limit of **1,000 embedding requests**. Scans of larger directories will trigger `RESOURCE_EXHAUSTED` 429 exceptions.
* **The Optimization:** `code_parser.py` is configured to detect Laravel codebases (looking for the `artisan` file) and scope indexing strictly to `app/Models`, `app/Http/Controllers`, and `routes`. Additionally, it parses Laravel Eloquent models as single files instead of line-by-line helper splits. This successfully reduced total chunks for the `edukids-web` repository from **2,220 to 649 chunks**.
* **Incremental Ingestion:** Embedding generation is run asynchronously using FastAPI's `BackgroundTasks`. The vector database caches indexed chunk hashes and checks for duplicates. If a sync fails or gets rate-limited, clicking the **"Sync Repository Code"** button on the dashboard will skip already-embedded files and resume indexing without starting from scratch.

### 2. Dual-Theme Support (Light / Dark Mode)
* The entire project features a dynamic Light Mode toggle (saved in `localStorage` as `"theme"`).
* Layout and card borders transition smoothly by altering core variables (`--background`, `--foreground`, `--card-bg`, `--border-color`) in `globals.css` on the `body.light` selector.
* All dashboard cards, inputs, buttons, chat widget headers, and bubble styling elements switch using React inline class bindings based on the client `isLightMode` state.

### 3. Support Ingestion & SQL Security Guard
* The AI engine translates user inquiries (e.g. *"why is my payment still pending?"*) into SQL queries against the local MySQL database.
* The **SQL Security Guard** (`backend/app/engine/security.py`) automatically rewrites generated SQL queries before executing them. It parses the statements and injects tenant constraints (e.g., `WHERE tenant_id = 'X'`) based on the JWT claims context, guaranteeing that a user from Company A can never view data belonging to Company B.

---

## 🆕 Features Added (June 2026)

### Multi-Project Support
* A single ZeroTicket installation supports **multiple project repositories** under one company account.
* During onboarding Step 2, you can give each project a friendly **Project Name** (e.g., "EduKids Web Portal") separate from the repo folder path.
* A **Project Switcher** dropdown appears on the dashboard header (after the first project is registered). Switching projects instantly updates the active `repository_id` in `localStorage` — all future sandbox queries and sync operations target the selected project.
* The backend endpoint `GET /api/company/projects?company_id=...` returns all registered repositories with their sync statuses and linked DB type.

### Database Type Toggle (MySQL vs PostgreSQL)
* Onboarding Step 3 now includes a **Database Type selector** (MySQL / PostgreSQL).
* Switching DB type auto-fills the default port (3306 for MySQL, 5432 for PostgreSQL).
* The `db_type` field is stored in `DBConnection` and used by `get_target_db_conn()` in `db.py` to create the correct driver connection (`pymysql` or `psycopg2`).

### Multi-LLM Provider Support (Gemini / OpenAI / Claude / DeepSeek / Qwen)
* Onboarding Step 4 now shows a **Provider Picker** grid instead of a plain Gemini API key field.
* Supported providers: **Gemini** (Google), **GPT-4o** (OpenAI), **Claude** (Anthropic), **DeepSeek** (DeepSeek AI), **Qwen** (Alibaba).
* You can also override the model name if you want a specific version (e.g., `claude-3-haiku` instead of the default).
* The selected provider and optional API key are stored in `localStorage` as `llm_provider`, `llm_model`, and `llm_api_key`.
* These are passed to `/api/ingest` and `/api/sandbox/simulate` so the backend's `AgentEngine` can use the correct LLM client.
* The Dashboard's **Developer API Keys** card now shows the active AI Provider in use.

---

## 📦 Current Active Connections
* **Repository Path:** `/Users/jiayong/GitHub/edukids-web` (Branch: `dev`)
* **Local Database:** MySQL replica `edukids` (Host: `127.0.0.1:3306`, User: `root`)

