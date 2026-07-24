# Lablab.ai Hackathon Submission: ZeroTicket

**Hackathon Page:** [AMD Developer Hackathon: ACT II](https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-ii)

## 1. Project Information

**Submission Title:** 
ZeroTicket: AI Support-as-Code

**Short Description (Summary):** 
An autonomous AI Tier-3 support engineer that automates technical SaaS operations by securely reasoning over codebases, database records, server logs, and recent Git history using a secure SQL Security Guard and AMD-optimized local LLMs.

**Long Description:** 
In B2B SaaS, customer support gets bottlenecked by complex technical inquiries like, "Why did my payment fail yesterday?" or "Why was my payment charged incorrectly?" Resolving these require software engineers to stop coding, dig through codebase rules, query production replicas, and trace server log files. This process is slow, expensive, and takes engineers away from building features.

As a developer managing multiple client SaaS projects over long periods of time, I faced a recurring bottleneck: clients would constantly ask technical queries like, "Why can't my user see this button today?"

Answering this is exhausting. First, no developer remembers the exact conditional rules of a codebase they wrote months ago—forcing them to open the IDE and dig through routes or controller permissions. Second, they have to query the replica database to verify that specific user's database role state. This manual lookup loop is incredibly annoying, derails engineering flow, and blocks actual product progress.

Most customer service bots only read static FAQs, Notion pages, and manuals. But they are completely blind to your codebase logic, developer comments, system bugs, or live database records. Because of this, software companies are forced to run expensive, high-friction IT customer support & system maintenance operations just to answer technical client inquiries. ZeroTicket was built to delegate this tedious technical archaeology directly to AI.

ZeroTicket shifts this paradigm from manual escalations to Support-as-Code:

Old Flow: End User ➔ Ask technical question ➔ Support agent escalates ➔ IT/Developer stops building features ➔ Developer digs through server logs, codebase routing, and production replica DBs ➔ Developer writes explanation.

New Flow: End User ➔ Ask technical question ➔ ZeroTicket checks the code rules, live logs, and database replica securely ➔ Explains instantly ➔ IT/Developers focus strictly on coding new features and resolving real system bugs.

ZeroTicket is a self-contained support-as-code engine. It ingests your codebase, connects to a read-only database replica, and parses live logs. When a user asks a complex technical question, the AI reasons over actual code rules and live data to resolve the ticket in seconds.

Key benefits include:
*   **Hands-Off Automated Syncing:** Every time you push updates to GitHub, ZeroTicket automatically re-ingests and updates its vector index via webhook integrations—zero manual configuration required.
*   **Self-Improving AI Loop:** Administrators can "teach" the bot or add custom instructions on the spot. The AI instantly adapts without rebuilding the codebase or database indexes.
*   **Multi-Model & Self-Hosted Privacy:** Supports multiple LLM backends (Gemini, Qwen, Fireworks AI) and completely air-gapped local setups (Gemma 4 running on AMD GPUs) for high-compliance enterprise privacy. Crucially, before executing any database query or log lookup, our proprietary **SQL Security Guard** wraps requests in JWT-based tenant constraints (e.g., `tenant_id = 123`), ensuring absolute multi-tenant data isolation and preventing data leakage.

### 🌟 Key Innovations & Standout Features:
1. **Compiler-Level SQL Security Guard (Mathematical Tenant Isolation):** Traditional database agents rely on prompt instructions, which are highly vulnerable to prompt injection. ZeroTicket solves this by intercepting AI-generated SQL query syntax trees at compile-time and dynamically wrapping all queries in tenant-isolation constraints (e.g., `WHERE tenant_id = ?`) bound to cryptographically verified JWT context. Mutation commands (`DROP`, `DELETE`, `UPDATE`) are rejected at the compiler level.
   ![SQL Security Guard Rewrite Process](../screenshots/sql_security_guard_flow.png)
2. **AST-to-DB Temporal Correlation (Multi-Dimensional RAG):** Traditional RAG models only search static files. ZeroTicket correlates the codebase **Abstract Syntax Tree (AST)**, server logs, and live relational replica database states along a single chronological timeline to resolve complex debugging queries (e.g., *"Why couldn't User A see the billing button yesterday?"*) instantly.
   ![Multi-Dimensional Temporal RAG Fusion](../screenshots/temporal_rag_fusion.png)
3. **Git-as-Source "Human-in-the-Loop" Context Tuning:** ZeroTicket manages support rules as version-controlled configurations (`ai_context_rules.txt`). When a developer corrects the AI's reasoning via the dashboard, the system commits a Git patch directly to the source repository. The agent digests these guidelines instantly in-memory, keeping adjustments transparent and audit-friendly.
4. **Tree-Sitter AST Structural Ingestion:** Standard file chunking loses semantic code context (e.g., which route maps to which controller). ZeroTicket parses the codebase using **Tree-Sitter** to construct a syntax dependency graph. It indexes routes, middleware layers, controller actions, and database schemas natively to trace the exact execution path of client requests.
5. **Local Air-Gapped ROCm Compute Engine (AMD + Gemma 4):** Built for high-compliance enterprise B2B SaaS (FinTech, Healthcare, GovTech) that cannot expose source code or database records to public cloud LLM APIs. ZeroTicket compiles natively with AMD ROCm to run optimized, low-latency local inference on Google's open-weights **Gemma 4** on AMD hardware. It natively supports **Ollama** for low-overhead local testing and **vLLM** for scaling up to high-throughput, concurrent multi-user production serving.
6. **In-Repo Document RAG & Hybrid Source Citations:** Auto-discovers and vector-indexes Markdown user manuals, FAQs, and guides (`.md`, `.txt`, `.rst`) across the entire repository tree. It cross-references static manual rules with live code AST and database replica states, returning inline markdown citations (`[Source 1]`, `[docs/ADMIN_MANUAL.md]`) so users can verify the exact authoritative source of every answer.
7. **Model Context Protocol (MCP) & 4-Tool Engine Architecture:** Structures core capabilities into OpenAPI/MCP-compatible tool schemas (`search_user_manuals`, `search_codebase_ast`, `query_database_replica`, `parse_server_logs`) allowing external MCP clients (Notion MCP, Zendesk MCP, Confluence MCP) to connect seamlessly with ZeroTicket's support engine.

We built this using FastAPI, Next.js, ChromaDB, and Tree-sitter. ZeroTicket proves that AI can securely execute dynamic SQL and parse production logs in a multi-tenant environment without compromising data security or corporate IP.

**Main Tracks:** 
Unicorn Track

**Technologies:** 
Fireworks AI, Python, FastAPI, Next.js, React, TailwindCSS, ChromaDB, MySQL, PostgreSQL, Gemma 4, Llama 3

---

## 2. Media Uploads

**Cover Image:** 
![ZeroTicket Cover Image](../zeroticket_cover_image.png)

**Video Presentation:** 
*(Insert link to your video presentation - ensure it is under 300MB and max 5 minutes)*

---

## 3. Technical Details

**GitHub Repository:** 
https://github.com/jiayong1008/zero-ticket

**Demo Application Platform:** 
Vercel (frontend + backend deployed together as a multi-service project). ZeroTicket also supports fully self-hosted, on-premise Docker deployment — see the AMD ROCm setup below — for enterprise compliance environments.

**Demo Application URL:** 
https://zero-ticket.vercel.app/ — Connected to a live, pre-seeded Supabase PostgreSQL database replica (Alice Johnson & Bob Smith demo records), allowing judges to test the full DB-aware support Q&A and SQL Security Guard live.

**Additional Information:** 
ZeroTicket is designed specifically for enterprise B2B scaling. By utilizing open-source models via Fireworks AI and AMD GPU infrastructure, it offers a pathway for strict enterprise compliance (HIPAA, SOC2, GDPR) by ensuring proprietary code, logs, and database schemas never leave the company's internal network. 

#### System Scalability Highlights:
- **Compile-Time Multi-Tenant Safety:** The SQL Security Guard compiler prevents cross-tenant data leaks by automatically rewriting query AST structures.
- **Git-Native Human-in-the-Loop Tuning:** AI instructions and corrections are automatically stored as version-controlled configurations (`ai_context_rules.txt`) in the source repository itself.
- **AMD local compute fallback:** Support for Google's open-weights Gemma 4 running locally on AMD GPUs with ROCm, providing a 100% private, air-gapped support agent.

---
---

# 🛑 INTERNAL HACKATHON STRATEGY (Do not submit this part) 🛑

## 4. 🎬 Video Script & Shot List (2-Min Pitch)

*   **0:00 - 0:30 | The Problem:** Show a developer distracted by support tickets. "B2B SaaS teams waste 100+ engineering hours/month manually troubleshooting technical tickets. Giving AI direct access to DBs or logs is a massive security/multi-tenant leak risk. ZeroTicket solves this."
*   **0:30 - 1:15 | The Demo:** Screen record the Sandbox console with JWT `{"tenant_id": 1}`. Ask "Why did my payment fail yesterday?". ZeroTicket scans logs (`ERR-ACH-502`), checks `PaymentController.php` rules, and resolves the query in 5s. Demarcate tenant safety: querying "all invoices" triggers compile-time AST rewrite by **SQL Security Guard**, wrapping queries with `WHERE tenant_id = 1` dynamically. Correct the bot using 'Teach AI' to automatically write Git config rules.
*   **1:15 - 1:45 | AMD ROCm & Tech Stack:** Show the Developer Dashboard's green ROCm status dot. "For enterprise compliance, ZeroTicket runs fully air-gapped on AMD Instinct GPUs using Google's Gemma 4. Codebase vector indices are stored in ChromaDB, with FastAPI handling log/DB execution."
*   **1:45 - 2:00 | The Business ROI:** Slide on pricing. "A flat per-project licensing fee saves SaaS teams over $9,000/month by returning 125 hours of senior developer capacity back to product features."

## 5. 💼 Startup Pitch & Business Value

*   **Target Buyer:** CTOs and VPs of Engineering at B2B SaaS firms who want to stop developers from wasting time on L3 support tickets.
*   **The Competitor Gap:** Traditional bots read static FAQs. ZeroTicket securely reads actual code, logs, and database replica state.
*   **Compliance Moat:** On-premise Docker deployment powered by Gemma 4 on AMD GPUs enables high-security sectors (FinTech, Healthcare) to adopt AI support safely.

### 📈 The Business Math (ROI)
*   **Developer Cost:** A typical 5-dev team gets 10 L3 tickets/day, costing **125 hours/month** ($9,375/month) in manual log-grepping and database lookups.
*   **ZeroTicket Impact:** Automates 90% of technical tickets. Developers only intervene for genuine system bugs.

### 🦄 Unicorn Track Judging Criteria Mappings
*   **Product/Market Potential:** Reclaims $9,375/month of engineering time, charged as a predictable flat enterprise subscription.
*   **Creativity & Originality:** Compiler-level SQL Security Guard with JWT tenant-binding prevents prompt-injection leaks.
*   **Completeness:** Live Next.js dashboard, FastAPI backend, schema-mapping wizard, and AMD-ready Ollama deployment.
*   **AMD Platform:** Built to run locally on AMD Instinct GPUs using ROCm for 100% private execution.

## 6. 🔥 Submission Day Checklist
*   **Repo Public:** Ensure repository is set to public.
*   **README:** Verify installation instructions are complete.
*   **Video Demo:** Clearly show the SQL Security Guard and live log correlation trace.

---

## 7. 📊 Hackathon Pitch Deck & Slides Outline (10-Slide Template)

To submit a competitive project for the **Unicorn Track**, your pitch deck must outline a viable business model and technical feasibility.

### 🛝 Slide 1: Title Slide
*   **Headline:** ZeroTicket: Autonomous AI Tier-3 Support Engineer for B2B SaaS
*   **Visual:** [Cover Image](../zeroticket_cover_image.png)
*   **Key Message:** On-premise, AMD ROCm-optimized agent resolving technical tickets via secure code, database, and log correlation.

### 🛝 Slide 2: The Pain Point (Developer Interruption)
*   **Headline:** The B2B SaaS Support Bottleneck
*   **Visual:** [Support Workflow Shift](../screenshots/support_workflow_shift.png)
*   **Key Issues:** Developers waste hours on technical support archaeology (debugging replica DBs/logs). Interruption cost is 23m 15s to refocus, while public AI APIs pose SOC2/HIPAA leakage risks.

### 🛝 Slide 3: The ZeroTicket Solution
*   **Headline:** Secure, Autonomous Tier-3 Operations
*   **Visuals:** [Temporal RAG Fusion](../screenshots/temporal_rag_fusion.png) & [Developer Dashboard](../screenshots/zeroticket_dashboard.png)
*   **Mechanism:** Parses codebase AST rules, queries replica DBs, and traces server logs to resolve issues. Custom instructions are version-controlled in Git (`ai_context_rules.txt`).

### 🛝 Slide 4: Zero-Configuration Developer Onboarding
*   **Headline:** Auto-Ambiguity Setup Wizard
*   **Visuals:** [Step 1: Profile](../screenshots/onboarding_1.jpeg) | [Step 2: Connect Git](../screenshots/onboarding_2.jpeg) | [Step 3: Connect DB](../screenshots/onboarding_3.jpeg)
*   **Mechanism:** Scans DB schemas/logs, identifies gaps, and runs a step-by-step wizard to resolve them, auto-committing rules to Git.

### 🛝 Slide 5: Product Demo: AI Sandbox Emulator
*   **Headline:** Interactive Sandbox Debugger
*   **Visuals:** [Sandbox Console](../screenshots/sandbox_emulator_ach.png), [Reasoning Trace](../screenshots/ai_reasoning.jpeg), [OCR Failure Scan](../screenshots/emulator_ocr_demo.png), [Teach AI Modal](../screenshots/emulator_teach_ai.png)
*   **Mechanism:** Shows step-by-step SQL drafts and log parses. Supports multimodal OCR for screenshots and one-click 'Teach AI' feedback.

### 🛝 Slide 6: Technical Innovation: SQL Security Guard
*   **Headline:** Mathematically Isolated Multi-Tenancy
*   **Visual:** [SQL Security Guard Rewrite](../screenshots/sql_security_guard_flow.png)
*   **Mechanism:** Compiles AI-generated SQL query syntax trees at runtime, wrapping them with JWT-bound tenant constraints (e.g. `WHERE tenant_id = X`). Blocks mutation commands.

### 🛝 Slide 7: Tech Stack & AMD Gemma 4 Integration
*   **Headline:** 100% Private, Air-Gapped Architecture
*   **Visual:** [System Architecture Flow](../screenshots/zeroticket_architecture_flow.png)
*   **Stack:** Next.js, FastAPI, ChromaDB, and Google's open-weights Gemma 4 running locally on AMD Instinct GPUs using ROCm (Ollama/vLLM).

### 🛝 Slide 8: Market Potential & Target Audience
*   **Headline:** Target High-Compliance Enterprise SaaS
*   **Audience:** CTOs, VPs of Eng, and Customer Ops.
*   **Moat:** Captures high-security sectors (FinTech, Healthcare) where cloud-based LLM APIs violate compliance requirements.

### 🛝 Slide 9: Business Model & ROI
*   **Headline:** Enterprise Licensing & Low Operational Overhead
*   **Model:** Predictable flat per-project subscription model for the self-hosted Docker deployment.
*   **High Margin:** Runs on the client's own cloud infrastructure, ensuring near-zero operational costs for ZeroTicket.

### 🛝 Slide 10: Conclusion & Call to Action
*   **Headline:** Give Developers Their Time Back
*   **Key Results:** Cuts L3 support resolution from 2 days to under 5 seconds.
*   **Call to Action:** Clone the repo, configure replica DB, and start on AMD servers. GitHub: jiayong1008/zero-ticket.
