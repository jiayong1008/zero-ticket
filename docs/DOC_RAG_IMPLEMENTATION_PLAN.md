# Implementation Plan: In-Repo Document RAG & MCP Tool Connector for ZeroTicket

## 1. Executive Summary & Objective

The goal of this feature is to empower **ZeroTicket** to ground its technical support responses on user manuals, admin documentation, FAQs, and external tools—similar to Google NotebookLM—while preserving ZeroTicket's core architectural advantages:
- **Mathematical Multi-Tenant Isolation** (SQL Security Guard with JWT context).
- **Multi-Dimensional Temporal RAG** (Codebase AST + Relational DB + Production Logs + Manual Docs).
- **Air-Gapped Privacy & Local Compute** (AMD ROCm / Gemma 4 support).

This plan outlines the end-to-end strategy for:
1. **Automatic In-Repo Document RAG:** Auto-discovering and vector-indexing `.md`, `.txt`, and `.rst` documentation files located inside onboarded codebases (e.g., `docs/`, `README.md`, `FAQ.md`).
2. **Manual File Upload Endpoint:** Enabling administrators to upload external PDF/Markdown manuals directly via the dashboard.
3. **Hybrid RAG & Citations Engine:** Combining document chunks with code AST and DB schema chunks in ChromaDB, returning clickable source citations `[1]` in the chat UI.
4. **Model Context Protocol (MCP) & Tool-Calling Architecture:** Structuring ZeroTicket's capabilities into modular tools and supporting external MCP connectors (Notion MCP, Zendesk MCP, Confluence MCP).

---

## 2. Architecture Diagram

```
                              ┌───────────────────────────────────┐
                              │           End User / Agent        │
                              └─────────────────┬─────────────────┘
                                                │ Inquiry
                                                ▼
                              ┌───────────────────────────────────┐
                              │         ZeroTicket Router         │
                              └─────────────────┬─────────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 ▼                              ▼                              ▼
    ┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
    │   Codebase AST Chunks    │   │     Manual Doc Chunks    │   │   Relational DB Schema   │
    │ (.py, .ts, .php, .prisma)│   │  (.md, .txt, .pdf, FAQ)  │   │  (Via SQL Security Guard)│
    └────────────┬─────────────┘   └────────────┬─────────────┘   └────────────┬─────────────┘
                 │                              │                              │
                 └──────────────────────────────┼──────────────────────────────┘
                                                ▼
                               ┌───────────────────────────────────┐
                               │     Hybrid Vector Retrieval       │
                               │           (ChromaDB)              │
                               └────────────────┬──────────────────┘
                                                │
                                                ▼
                               ┌───────────────────────────────────┐
                               │  LLM Synthesis + Citation Engine  │
                               └────────────────┬──────────────────┘
                                                │
                                                ▼
                                 Response with Citations [1][2]
```

---

## 3. Proposed Component Changes

### Component 1: Markdown & Document Parser (`backend/app/parser/code_parser.py`)

#### `[NEW]` `MarkdownParser` class
- **Functionality:** Parses `.md`, `.txt`, `.rst`, and `.markdown` files.
- **Chunking Strategy:** 
  - Splits files dynamically by Markdown headers (`#`, `##`, `###`).
  - Falls back to line-count sliding windows (50 lines per chunk with 10-line overlap) for plain text files.
- **Metadata Fields:** `file_path`, `heading`, `start_line`, `end_line`, `chunk_type="documentation"`.

#### `[MODIFY]` `CodeParser.walk_and_parse()`
- Expand the extension white-list to include `['.md', '.txt', '.rst', '.markdown']`.
- Ensure directory walker scans `docs/`, `documentation/`, and root `.md` files while respecting `.gitignore` and `.antigravityignore`.

---

### Component 2: External Document Upload API (`backend/app/api/endpoints/sources.py`)

#### `[NEW]` File Upload Endpoint
- `POST /api/v1/sources/upload`: Accepts file uploads (`.pdf`, `.md`, `.txt`, `.docx`).
- Stores files in per-tenant storage (`/storage/tenants/{tenant_id}/docs/`).
- Triggers background vector ingestion into ChromaDB collection `zeroticket_manuals`.

---

### Component 3: Hybrid Retrieval & Citation Engine (`backend/app/engine/agent.py`)

#### `[MODIFY]` Vector Retrieval Loop
- Retrieve top-$k$ relevant chunks across both `code_ast` and `documentation` collections in ChromaDB.
- Inject source metadata into the prompt context:
  ```text
  [Source 1: docs/ADMIN_MANUAL.md | Lines 12-45]
  Audio question type is only allowed when category contains 'Memory'.
  ```
- Instruct LLM backend to append Markdown citations `[1]`, `[2]` when deriving answers from manual documentation.

---

### Component 4: Model Context Protocol (MCP) & Tool-Calling Layer (`backend/app/engine/mcp_tools.py`)

#### `[NEW]` Tool Registry & MCP Client
- Standardize ZeroTicket internal capabilities as JSON-Schema function tools:
  - `search_user_manuals(query: str)`
  - `search_codebase_ast(symbol_or_path: str)`
  - `query_database_replica(sql_query: str)` (wrapped by `SQLSecurityGuard`)
  - `parse_server_logs(time_range: str, log_level: str)`
- Add **MCP Client Protocol** compatibility to query external MCP servers (e.g., Notion MCP, Zendesk MCP, Google Drive MCP).

---

### Component 5: Frontend Citations & Manual Sources UI (`frontend/app/`)

#### `[MODIFY]` Chat Interface (`frontend/app/chat/page.tsx` or components)
- Render interactive citation badges `[1]`, `[2]` next to bot responses.
- Clicking a citation opens a modal/drawer showing the exact excerpt from `docs/ADMIN_MANUAL.md`.
- Add a **Sources Tab** in the side panel showing active repository docs and uploaded manual files.

---

## 4. Implementation Steps & Milestones

1. **Milestone 1: In-Repo Markdown Parsing (Backend)**
   - Implement `MarkdownParser` in `code_parser.py`.
   - Enable `.md` and `.txt` ingestion during repository onboarding.
   - Write unit tests for Markdown header-based chunking.

2. **Milestone 2: Hybrid RAG & Context Citation Prompting**
   - Update `agent.py` to query document chunks alongside code AST chunks.
   - Add citation formatting logic and verify with sample admin manual queries.

3. **Milestone 3: Tool Calling & MCP Infrastructure**
   - Implement `mcp_tools.py` with standard tool definitions.
   - Enable tool choice routing for Gemini / Gemma / Claude backends.

4. **Milestone 4: Frontend Citation Badges & Sources Panel**
   - Update UI components to render clickable citations.
   - Add a source inspector drawer.

---

## 5. Verification & Testing Plan

### Automated Tests
- `pytest backend/tests/test_md_parser.py`: Verifies Markdown header parsing and edge cases (empty headings, code blocks in markdown).
- `pytest backend/tests/test_hybrid_rag.py`: Verifies document chunk retrieval and prompt context formatting.
- `pytest backend/tests/test_mcp_tools.py`: Verifies tool schema generation and execution safety.

### Manual Verification
- Index a repository containing `docs/ADMIN_MANUAL.md`.
- Ask ticket question: *"How do I set up audio questions in the test system?"*
- Confirm response cites `docs/ADMIN_MANUAL.md [1]` and accurately explains the rule.
