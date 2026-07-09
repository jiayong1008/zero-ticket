# ZeroTicket: AI-Powered Support-as-Code Platform

An autonomous AI Tier-3 support engineer that securely answers complex technical customer tickets by reasoning over codebase rules, database records, server logs, and Git history.

![ZeroTicket Cover Image](./zeroticket_cover_image.png)

---

## 💡 The Pain Point & Solution

In B2B SaaS, customer support gets bottlenecked by complex technical questions (e.g., *"Why did my payment fail yesterday?"* or *"Why was I charged $900 instead of $1,000?"*). 

Resolving these requires software engineers to stop writing code, dig through codebase rules, query production replica databases, and trace server logs. This process is slow, expensive, and takes engineers away from building features.

**ZeroTicket solves this.** It acts as a secure virtual Tier-3 support engineer. It ingests your enterprise codebase, extracts the database schema, parses server logs, and indexes recent Git commits. When a customer asks a complex technical question, the AI reasons over the actual code rules and live data to provide a precise, real-time explanation. 

**Best of all, the AI gets smarter over time.** Using the interactive developer tuning interface, administrators can teach the bot on the spot or add custom instructions when they notice gaps. The AI dynamically adapts to these rules, resolving future inquiries correctly without needing manual codebase changes or tedious re-indexing.

---

## 🌟 Key Innovations & Technical Moats

### 1. 🧠 Self-Improving "Teach-AI" Tuning (Context-as-Code)
ZeroTicket is designed to evolve. When support managers or developers correct an AI response or input a custom business rule, the system automatically digests the feedback and saves it as version-controlled configurations. The bot gets smarter on the fly, instantly tuning its reasoning for future customer support queries.

### 2. ⏱️ Timeline-Aware Log & Code Diagnostics
Traditional RAG models only read static files. ZeroTicket live-scans replica databases and correlates recent server logs and Git updates to trace the exact root cause of customer issues. It instantly explains the technical result to the customer (e.g., *"Your clearing transfer is pending due to a standard bank processing timeout"*), avoiding manual support ticket lookups.

### 3. 🛡️ The SQL Security Guard
Traditional database AI integrations risk cross-tenant data leaks. ZeroTicket features a compiler safety layer that intercepts AI-generated SQL queries and rejects mutations. It automatically wraps all queries in tenant-isolation constraints (e.g., `WHERE tenant_id = X`) matching the user's secure JWT context. It is mathematically impossible for one client to access another client's data.

### 4. 🌲 AST Codebase Ingestion
Rather than generic keyword search, our ingestion pipeline uses AST parsers (supporting FastAPI, Node.js, Laravel, and Prisma schemas) to build structured representations of endpoints, models, and controllers so the AI understands your business logic rules natively.

### 5. 🔒 100% Private, On-Premise (AMD GPU + Gemma 4)
Built for high-compliance enterprise B2B SaaS (FinTech, Healthcare, GovTech). The entire stack can be run on-premise on AMD GPUs using Google's open-weights **Gemma 4**, ensuring that proprietary code and customer records never leave the company's private cloud network.

---

## 🎨 User Interface & Console Tour

### 🖥️ Main Developer Dashboard
Configure multiple git repositories, monitor code ingestion/indexing (incremental syncing), verify database replica connections, and manage version-controlled custom AI instructions.
![ZeroTicket Dashboard](./screenshots/zeroticket_dashboard.png)

### 🛝 AI Sandbox Emulator & Secure Debugger
Test custom queries, simulate user JWT contexts, inspect live server log scanning, and watch the **SQL Security Guard** dynamically rewrite SQL queries to enforce compile-time multi-tenant isolation.
![Sandbox Emulator - ACH Clearing](./screenshots/sandbox_emulator_ach.png)

### 📂 Multimodal Image OCR Diagnostics
Upload billing failure images or payment errors. ZeroTicket extracts error details via OCR and automatically queries the code models for resolutions.
![Sandbox Emulator - Multimodal OCR](./screenshots/emulator_ocr_demo.png)

### ⚙️ Auto-Ambiguity Setup Discovery
Onboard new codebases seamlessly. ZeroTicket scans code structures and prompts support developers with interactive setup questions.
![Onboarding Setup Discovery](./screenshots/onboarding_discovery.png)

### 🧠 Human-in-the-Loop AI Tuning ("Teach AI")
Directly edit AI guidelines within the chat widget. Corrections are compiled and committed directly back to `ai_context_rules.txt` in the source repository.
![Human-in-the-Loop AI Tuning](./screenshots/emulator_teach_ai.png)

### 🛡️ SQL Security Guard Rewrite Pipeline
Intercepts AI-generated SQL query syntax trees at compile-time and dynamically injects tenant constraints to prevent cross-tenant data leaks.
![SQL Security Guard Rewrite Process](./screenshots/sql_security_guard_flow.png)

### 🌐 System Architecture
Data and API flow tracing client requests, vector store matching, local LLM evaluation (AMD ROCm), and safe database replica queries.
![ZeroTicket System Architecture Flow](./screenshots/zeroticket_architecture_flow.png)

---

## 💡 Runtime Walkthrough (How it Answers a Question)

1. **User Input:** End-user asks a question and optionally attaches an image (e.g. a screenshot of an error). ZeroTicket performs Vision OCR to extract relevant context.
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
5. **Database Execution:** The safe query runs on the read-only MySQL/PostgreSQL replica (constrained by a hard **500ms** timeout and driver-level read-only permissions).
6. **Code Rules Consultation:** The AI consults the retrieved code logic (e.g., standard ACH transfers under $2,000 take 2 business days to clear).
7. **Response Generation:** The AI explains the technical result in clean, human-readable English: *"Your $1,500 payment is pending because it was sent via bank transfer (ACH), which takes up to 2 business days to clear. It should clear by tomorrow morning."*

---

## 🚀 Setup & How to Run

### Option 1: Docker (One-Click Compose)
ZeroTicket comes with a full `docker-compose` configuration for one-click setup.
```bash
# From the project root directory
docker compose up -d --build
```
* Renders Next.js Dashboard: `http://localhost:3000`
* Runs FastAPI Backend Server: `http://localhost:8088`

---

### Option 2: Local Development

#### 1. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Setup virtual environment & dependencies:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
3. Configure environment variables in `backend/.env`:
   ```env
   DATABASE_URL=sqlite:///./zeroticket.db
   ENCRYPTION_KEY=your-32-byte-base64-string-here
   LICENSE_KEY=zt_license_trial_key
   ADMIN_PASSWORD=your_secure_password
   CUSTOM_LLM_BASE_URL=http://localhost:11434/v1
   ```
4. Launch Uvicorn development server:
   ```bash
   .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8088 --reload
   ```

#### 2. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install npm modules:
   ```bash
   npm install
   ```
3. Run development client:
   ```bash
   npm run dev
   ```
   *(Access frontend locally at `http://localhost:3000`)*

---

## 🛠️ Repository Directory Map

```
zeroticket/
├── backend/                  # FastAPI Backend Server
│   ├── app/
│   │   ├── main.py          # API Endpoints (Ingestion, Sandbox, Chat Session, Admin Security)
│   │   ├── parser/
│   │   │   ├── code_parser.py       # Scans repo and chunks models & controllers
│   │   │   └── schema_extractor.py  # Connects to MySQL/PostgreSQL replica and extracts tables/schemas
│   │   ├── vector/
│   │   │   └── chroma_store.py      # Embeds chunks incrementally using Multi-LLM providers
│   │   ├── engine/
│   │   │   ├── agent.py             # Generates SQL queries and answers support tickets
│   │   │   └── security.py          # SQL Security Guard to wrap/intercept queries for safety
│   │   └── db.py            # Local SQLite database configurations
│   ├── zeroticket.db        # Backend SQLite metadata DB (gitignored)
│   └── chroma_db/           # Local Vector database (gitignored)
│
└── frontend/                 # Next.js Web Client
    ├── app/
    │   ├── layout.tsx       # Root Next.js layout (theme transition listener)
    │   ├── page.tsx         # Dashboard / Connection details and Widget Integration
    │   ├── onboarding/      # Onboarding flow (Git repo, DB credentials, Multi-LLM setup)
    │   ├── sandbox/         # Developer console for JWT simulation and live widget testing
    │   ├── widget/          # Customer-facing embedded chat widget (renders in iframe)
    │   └── globals.css      # Design system, CSS variables, and light/dark styling overrides
```

---

## 📦 Demo Active Connections
* **Repository Path:** `playground/zero-billing-demo`
* **Local Database:** MySQL replica `zero_billing_replica` (Host: `127.0.0.1:3306`)
