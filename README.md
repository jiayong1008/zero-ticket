# ZeroTicket: AI-Powered Support-as-Code Platform

ZeroTicket is an autonomous AI customer support platform that integrates directly with a tenant's git repository and a read-only database replica. It answers customer support inquiries using real-time database schema information and codebase logic, while enforcing strict tenant data isolation via a secure SQL Security Guard.

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

## 📦 Current Active Connections
* **Repository Path:** `/Users/jiayong/GitHub/edukids-web` (Branch: `dev`)
* **Local Database:** MySQL replica `edukids` (Host: `127.0.0.1:3306`, User: `root`)
