# Lablab.ai Hackathon Submission: ZeroTicket

## 1. Project Name & Elevator Pitch
**Project Name:** ZeroTicket
**Elevator Pitch:** An autonomous AI Support-as-Code platform that acts as a Tier-2 support engineer. ZeroTicket directly connects to an enterprise codebase and database replica, securely generating and executing SQL queries within a strict "SQL Security Guard" to resolve complex customer tickets in seconds.

## 2. Description Details

### 🏔️ The Problem
In B2B SaaS, customer support often gets bottlenecked by questions like, "Why is my payment pending?" or "Why can't my user see this invoice?" These inquiries require a human engineer to step away from product development, read the source code (business logic), and manually query the production database. This is expensive, slow, and frustrating for both customers and engineers. 

Current AI chatbots fail here because they only read static documentation. They don't know the live state of a customer's data, and giving a generic LLM raw database access is a massive security and data-leak liability.

### 💡 What ZeroTicket Does
ZeroTicket is a self-hosted AI engine that solves this. 
1. It ingests an enterprise codebase (using AST parsing) and embeds the business logic into ChromaDB.
2. It extracts the target database schema.
3. When a user asks a complex question, the AI generates a SQL query to check the live database.
4. **Crucially**, before execution, our proprietary **SQL Security Guard** intercepts the query and dynamically injects JWT-based tenant constraints (e.g., wrapping the query to ensure `tenant_id` matches the requester).
5. The AI reads the code rules, the secure SQL results, and explains the outcome to the user in plain English.

### 🛠️ How we built it
*   **Backend:** Python & FastAPI. We built a custom parser using Tree-sitter to chunk codebase ASTs, optimizing token limits. We implemented a robust SQL Security Guard that parses and rewrites AI-generated SQL on the fly, enforcing a read-only, timeout-restricted, tenant-isolated execution environment.
*   **Frontend:** Next.js (App Router), React, and Tailwind CSS. We built a dual-theme dashboard for company onboarding, a developer Sandbox to test JWT claim overrides, and an embeddable chat widget.
*   **AI & Vector Storage:** We utilized ChromaDB for repository-scoped vector collections. We designed the system to be model-agnostic, easily swapping between Gemini for fast reasoning and open-source models (via Fireworks AI) for localized, secure enterprise deployments.

### ⚠️ Challenges we ran into
*   **Preventing LLM SQL Hallucinations and Data Leaks:** If the AI generates a query for User A but accidentally pulls User B's data, it's a catastrophic failure. Building the SQL Security Guard to intercept, parse, and safely rewrite queries *before* they hit the database was extremely complex.
*   **Context Window Optimization:** Scraping an entire repository blew past embedding and token limits. We had to implement targeted AST chunking (e.g., targeting only Models and Controllers in Laravel) and a sliding token-aware conversational memory window to stay within API limits while maintaining context.

### 🏆 Accomplishments that we're proud of
*   Proving that an AI can securely execute dynamic SQL in a multi-tenant environment without leaking data.
*   Building a complete, production-ready onboarding flow and testing Sandbox in a matter of days.
*   Implementing a highly optimized incremental code-ingestion pipeline that gracefully handles rate limits and avoids duplicate embeddings.

### 🚀 What's next for ZeroTicket
We plan to migrate the inference entirely to localized open-source models using Fireworks AI and AMD GPU infrastructure to offer enterprises a 100% on-premise, air-gapped support AI that never sends proprietary code or database schemas to external LLM providers.

## 3. Tech Stack
*   **Frontend:** Next.js, React, TailwindCSS, TypeScript
*   **Backend:** Python, FastAPI, SQLAlchemy, Tree-sitter AST
*   **AI/Data:** ChromaDB, Gemini / Fireworks AI (Open Source Models), MySQL
