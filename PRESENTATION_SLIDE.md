# ZeroTicket: AI-Powered Support-as-Code Platform

An autonomous AI Tier-3 support engineer that securely answers complex technical customer tickets by reasoning over codebase rules, database records, server logs, and Git history.

![ZeroTicket Cover Image](./zeroticket_cover_image.png)

---

## 💡 The Pain Point & Solution

> [!NOTE]
> **Behind the Idea: The Founder's Pain**
> As a developer managing multiple client projects over long periods, I faced this friction daily. Clients would constantly ask: *"Why can't my user see this button today?"* 
> 
> Answering this is exhausting. First, no developer remembers the exact conditional rules of a codebase they wrote months ago—forcing them to open the IDE and dig through routes or controller permissions. Second, they have to query the database to verify that specific user's database state. This manual look-up loop is incredibly annoying, derails engineering flow, and blocks actual product progress. ZeroTicket was built to delegate this tedious technical archaeology directly to AI.

### Why Typical Customer Support Bots Fail
Most customer service bots only read static FAQs, Notion pages, and manuals. But they are completely blind to your codebase logic, developer comments, system bugs, or live database records. Because of this, software companies are forced to run expensive, high-friction **IT customer support & system maintenance operations** just to answer technical client inquiries.

### The Hidden Cost: Context-Switching & Developer Burnout
Answering repetitive technical support queries doesn't just waste engineering time—it destroys developer flow state and leads to burnout. Because developers are constantly interrupted to dig through replica DB tables or grep server logs for support staff, they lose their momentum. Research shows that it takes an average of **23 minutes** to refocus on a complex coding task after a single support interruption. ZeroTicket protects your developers' focus so they can stay in the zone.

### The Shift: From Manual Escalations to Support-as-Code

*   **Old Flow:** End User ➔ Ask technical question ➔ Support agent escalates ➔ IT/Developer stops building features ➔ Developer digs through server logs, codebase routing, and production replica DBs ➔ Developer writes explanation.
*   **New Flow:** End User ➔ Ask technical question ➔ ZeroTicket checks the code rules, live logs, and database replica securely ➔ Explains instantly ➔ IT/Developers focus strictly on coding new features and resolving real system bugs.

![ZeroTicket Workflow Shift](./screenshots/support_workflow_shift.png)

**ZeroTicket solves this.** It is a self-contained support-as-code engine. It ingests your codebase, connects to a read-only database replica, and parses live logs. When a user asks a complex technical question, the AI reasons over actual code rules and live data to resolve the ticket in seconds.

*   **Hands-Off Automated Syncing:** Every time you push updates to GitHub, ZeroTicket automatically re-ingests and updates its vector index via webhook integrations—zero manual configuration required.
*   **Self-Improving AI Loop:** Administrators can "teach" the bot or add custom instructions on the spot. The AI instantly adapts without rebuilding the codebase or database indexes.
*   **Multi-Model & Self-Hosted Privacy:** Supports multiple LLM backends (Gemini, Qwen, Fireworks AI) and completely air-gapped local setups (Gemma 4 running on AMD GPUs) for high-compliance enterprise privacy.

---

## 📈 The Business Math: Time & Money Saved

Escalating a single technical L3 support ticket (e.g., diagnosing a database state discrepancy or log trace) costs a software company significant engineering resources. Here is the realistic math:

| Metrics | Manual IT Support Loop | ZeroTicket Shift |
| :--- | :--- | :--- |
| **Resolution Time** | **20 - 30 minutes** / ticket | **Instant (< 5 seconds)** / ticket |
| **Developer Cost** | **$37.50** / ticket (at $75/hr loaded cost) | **$0.00** / ticket (0 seconds of dev time needed)* |
| **Context Switch Loss** | **23 minutes & 15 seconds** of lost focus | **Zero distraction** (developer stays in the zone) |

*\* Note: Devs only get involved if the issue represents a genuine system bug or feature request, which ZeroTicket flags and escalates.*

### 💵 Real-World Monthly ROI Example
Suppose a SaaS startup with **5 developers** receives a modest **10 technical tickets per day** (300 tickets/month):
* **Answering Time:** 300 tickets × 25 mins = **125 hours / month** of developer time wasted.
* **Direct Cost:** 125 hours × $75/hr = **$9,375 / month** ($112,500/year) spent on support maintenance.
* **ZeroTicket Cost:** A flat, predictable SaaS licensing fee (pricing to be determined, structured as a small fraction of the direct developer support costs).

> [!IMPORTANT]
> By deploying ZeroTicket to automate frontend technical customer queries, SaaS companies completely eliminate the overhead of routine support maintenance, saving thousands of dollars and hundreds of hours of high-value developer capacity every month.

## 💼 How to Sell It (The Startup Angle)

1.  **Who is the buyer?** CTOs, VPs of Engineering, and Customer Operations leads. They hate that developers are stuck doing support. ZeroTicket gives them their developers back.
2.  **Why buy this over traditional support bots?** Traditional bots just read static FAQ documents and Notion pages. ZeroTicket reads the *actual live database records, server logs, and codebase logic* safely. 
3.  **The "Data Privacy" Moat:** Enterprise companies (Healthcare, FinTech, GovTech) cannot use cloud-based AI tools because of compliance (SOC2/HIPAA). By focusing on self-hosted Docker deployments powered by Gemma 4 on AMD GPUs, you capture the high-end enterprise market that public APIs cannot touch.

---

## 🌟 Key Innovations & Technical Moats

### 1. 🔄 Git-as-Source "Human-in-the-Loop" Context Tuning
Instead of requiring expensive vector re-indexing or model fine-tuning when business rules change, ZeroTicket manages support rules as version-controlled code configurations (`ai_context_rules.txt`). When a developer corrects the AI's reasoning via the "Teach AI" dashboard, the system commits a Git patch directly to the source repository. The agent digests these guidelines instantly in-memory, keeping adjustments transparent, versioned, and audit-friendly.

### 2. ⏱️ AST-to-DB Temporal Correlation (Multi-Dimensional RAG)
Traditional RAG models only search static text files. ZeroTicket correlates the codebase **Abstract Syntax Tree (AST)**, server logs, and live relational replica database states along a single chronological timeline. This allows the AI to answer complex debugging queries like: *"Why couldn't User A see the billing button yesterday?"* by correlating recent git commits, system error logs, and the database status of User A at that specific time.

![Multi-Dimensional Temporal RAG Fusion](./screenshots/temporal_rag_fusion.png)

### 3. 🛡️ Compiler-Level SQL Security Guard (Mathematical Tenant Isolation)
Traditional database agents rely on prompt instructions (e.g., *"Only access tenant 123"*), which are highly vulnerable to prompt injection attacks. ZeroTicket solves this by intercepting AI-generated SQL query syntax trees at compile-time. It uses a secure AST rewriter to dynamically inject strict tenant-isolation constraints (e.g., `WHERE tenant_id = ?`) bound to the cryptographically verified JWT context. Mutation commands (`DROP`, `DELETE`, `UPDATE`) are rejected at the compiler level. It is mathematically impossible for one client to access another client's data.

![SQL Security Guard Rewrite Process](./screenshots/sql_security_guard_flow.png)

### 4. 🌲 Tree-Sitter AST Structural Ingestion
Standard file chunking loses semantic code context (e.g., which route maps to which controller layer). ZeroTicket parses the codebase using **Tree-Sitter** to construct a syntax dependency graph. It indexes routes, middleware layers, controller actions, and database schemas natively. This allows the AI to follow the exact execution path of a customer request and verify permission logic.

### 5. ⚡ Local Air-Gapped ROCm Compute Engine (AMD + Gemma 4)
Built for high-compliance industries (FinTech, Healthcare, GovTech) that cannot expose source code or database records to public cloud LLM APIs. ZeroTicket compiles natively with AMD ROCm to run optimized, low-latency local inference on Google's open-weights **Gemma 4**, providing a 100% private, on-premise deployment. It natively supports **Ollama** for low-overhead local testing and **vLLM** for scaling up to high-throughput, concurrent multi-user production serving.

---

## 🎨 User Interface & Console Tour

### 🖥️ Main Developer Dashboard
Configure multiple git repositories, monitor code ingestion/indexing (incremental syncing), verify database replica connections, and manage version-controlled custom AI instructions.
![ZeroTicket Dashboard](./screenshots/zeroticket_dashboard.png)

### 🛝 AI Sandbox Emulator & Secure Debugger
Test custom queries, simulate user JWT contexts, inspect live server log scanning, and watch the **SQL Security Guard** dynamically rewrite SQL queries to enforce compile-time multi-tenant isolation.
![Sandbox Emulator - ACH Clearing](./screenshots/sandbox_emulator_ach.png)

#### 🧠 AI Reasoning Process (Right Panel Trace)
When using reasoning models like Qwen 3.7 Plus, ZeroTicket isolates the step-by-step logic retrieval and displays it in a clean, formatted trace view on the right-hand panel:
![AI Reasoning Trace](./screenshots/ai_reasoning.jpeg)

### 📂 Multimodal Image OCR Diagnostics
Upload billing failure images or payment errors. ZeroTicket extracts error details via OCR and automatically queries the code models for resolutions.
![Sandbox Emulator - Multimodal OCR](./screenshots/emulator_ocr_demo.png)

### ⚙️ Interactive Developer Onboarding
Onboard new codebases, databases, and AI configurations in minutes. ZeroTicket walks you through connecting your repositories and setting up secure database replicas.

| Step 1: Create Company Profile | Step 2: Connect Git Codebase | Step 3: Connect DB Replica & AI |
|---|---|---|
| ![Onboarding Step 1](./screenshots/onboarding_1.jpeg) | ![Onboarding Step 2](./screenshots/onboarding_2.jpeg) | ![Onboarding Step 3](./screenshots/onboarding_3.jpeg) |

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


## 📊 Enterprise Capabilities & Platform Alignment

Below is how ZeroTicket aligns with core B2B SaaS architecture, security, and scalability standards:

### 1. 💼 Product/Market Fit (The B2B SaaS Support Moat)
*   **The Problem:** B2B SaaS companies lose thousands of dollars escalating routine technical queries to engineering. Developers waste time log-hunting or database-querying instead of writing features.
*   **The Value Prop:** Automates 100% of standard technical inquiries. Reclaims **125 hours/month** of engineering capacity and eliminates the **$9,375/month** overhead of manual support maintenance for a typical 5-developer SaaS team.
*   **The Competitor Gap:** Existing FAQ-based chatbots only read static text (Notion/PDFs). ZeroTicket dynamically queries actual codebase rules and database replicas securely.
*   **Business Model:** Charged at a flat-rate self-hosted subscription (pricing to be determined, structured as a small fraction of direct developer support costs) rather than usage-metered API tokens, providing predictable, high-ROI budgeting for enterprise clients.

### 2. 💡 Technical Innovation
*   **AST Ingestion:** Interprets code files as functional syntax trees (routes, models, controllers) rather than raw text blocks.
*   **Secure SQL Security Guard:** Resolves database queries in a multi-tenant SaaS environment by intercepting and rewriting SQL queries at compile-time to guarantee cross-tenant isolation.
*   **Version-Controlled AI Tuning:** Corrections are processed instantly and saved directly as version-controlled code rules, keeping configurations light and secure.

### 3. ⚙️ Platform Completeness
*   A fully realized Next.js client and FastAPI python backend.
*   Interactive **Setup Discovery** Onboarding wizard to discover and map schemas.
*   Interactive **Sandbox Emulator** supporting user JWT context simulation, live server log tracer, codebase rules viewer, and dynamic SQL Security Guard sanitization.

### 4. ⚡ Private Infrastructure & Air-Gapped Compliance
*   **Hardware Compatibility:** Fully optimized to run Google's open-weights **Gemma 4** locally on AMD GPUs with ROCm support.
*   **Compliance Moat:** In high-compliance sectors (Healthcare, FinTech, GovTech), sending proprietary source code or database schemas to external cloud LLM APIs is a compliance violation. Self-hosting ZeroTicket on AMD developer clouds guarantees data privacy and GDPR/HIPAA compliance out-of-the-box.

---
