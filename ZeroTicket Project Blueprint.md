# **ZeroTicket: Support-as-Code Technical Blueprint**

**An Automated AI Customer Support Agent Bootstrapped From Codebases & Database State.**

## **1\. Core Concept & Value Proposition**

**ZeroTicket** resolves the "Why can't User X see Y?" support loophole. It allows developers to plug in their code repository and a read-only MySQL replica. When an end-user runs into an authorization, configuration, or data-state issue, they can chat with an embedded frontend widget.

The AI securely inspects their database state, traces the business logic in the codebase, and returns a human-readable, non-technical explanation—without pulling a developer away from their IDE, driving the goal of having "zero tickets."

## **2\. The Recommended Technical Stack**

| Layer | Technology | Selection Rationale |
| :---- | :---- | :---- |
| **Frontend Widget** | React / Tailwind CSS / TypeScript | Small bundle-size wrapper. Clean, lightweight, and easily embeddable via an iframe or a script tag. |
| **Developer Dashboard** | Next.js (App Router) | Rapid development of tenant/settings UI, billing, and sandbox emulator. |
| **Backend & Engine** | Python (FastAPI) | Ideal for AST parsing libraries (Tree-sitter), AI orchestration (LangChain / LlamaIndex), and interacting with Gemini/OpenAI API drivers. |
| **Primary Database** | **MySQL (8.0+)** | Relational store for configurations, customer metadata, encrypted credentials, chat sessions, and audit trails. |
| **Vector Engine** | Pinecone or Qdrant | Dedicated vector database to store and retrieve codebase embeddings generated during repository ingestion. |
| **Auth & Security** | Jose / PyJWT | Handles secure JSON Web Tokens (JWT) issued by client backends to prevent user impersonation. |

## **3\. Ingestion & Onboarding Pipeline**

\[Connect GitHub Repo & MySQL\]  
              │  
              ▼  
 ┌───────────────────────────────┐  
 │ Phase 1: Code Parsing         │ ──► Tree-sitter abstracts endpoints, routes & rules  
 │ (Python AST Engine)           │  
 └───────────────┬───────────────┘  
                 ▼  
 ┌───────────────────────────────┐  
 │ Phase 2: DB Schema Inspection │ ──► Pull Information Schema (No actual rows/PII)  
 └───────────────┬───────────────┘  
                 ▼  
 ┌───────────────────────────────┐  
 │ Phase 3: Semantic Graph       │ ──► Create schema relations mapping code \-\> tables  
 └───────────────┬───────────────┘  
                 ▼  
     \[System Live & Armed\]

### **Phase 1: Codebase Parsing (The Rules Engine)**

The Python engine clones the repository, strips out non-essential paths (node\_modules, standard assets, tests, lock files), and runs the remaining code through **Tree-sitter**.

* It maps out all public API endpoints and controller functions.  
* It parses authorization structures, policies, and middleware permissions (e.g., checks for @PreAuthorize, Gate::allows, or Next.js middleware).  
* Chunks of code are vectorized and saved to your Vector DB alongside structured metadata mapping back to files and lines.

### **Phase 2: DB Schema Extraction (The State Mapping)**

The engine connects to the customer's read-only MySQL replica.

* It queries the INFORMATION\_SCHEMA database to fetch tables, columns, data types, primary keys, and foreign keys.  
* It grabs 3 sample rows from each non-sensitive table to dynamically learn value conventions (e.g., that is\_active \= 1 represents "true" or that status values map to string states).

### **Phase 3: Semantic Graph Linkage (The Logic Bridge)**

An LLM analyzes the codebase mapping and the database schema mapping to create a unified correlation graph.

* **Example Output:** *"The file InvoiceController.py queries table invoices. To read invoices, the code checks if the requesting user's role column in the users table matches 'billing\_admin'."*

## **4\. Production MySQL Schema (ZeroTicket System DB)**

This is the database schema for the **ZeroTicket** platform itself, written in standard MySQL DDL.

\-- 1\. Tenants / Companies utilizing ZeroTicket  
CREATE TABLE companies (  
    id VARCHAR(36) PRIMARY KEY,  
    name VARCHAR(255) NOT NULL,  
    api\_key\_hash VARCHAR(64) NOT NULL UNIQUE,  
    created\_at TIMESTAMP DEFAULT CURRENT\_TIMESTAMP,  
    updated\_at TIMESTAMP DEFAULT CURRENT\_TIMESTAMP ON UPDATE CURRENT\_TIMESTAMP  
);

\-- 2\. Repositories connected to the system  
CREATE TABLE repositories (  
    id VARCHAR(36) PRIMARY KEY,  
    company\_id VARCHAR(36) NOT NULL,  
    provider ENUM('github', 'gitlab', 'bitbucket') NOT NULL,  
    repo\_name VARCHAR(255) NOT NULL,  
    branch VARCHAR(100) DEFAULT 'main',  
    sync\_status ENUM('pending', 'cloning', 'parsing', 'linked', 'failed') NOT NULL DEFAULT 'pending',  
    last\_synced\_at TIMESTAMP NULL,  
    FOREIGN KEY (company\_id) REFERENCES companies(id) ON DELETE CASCADE  
);

\-- 3\. Safely configured Read-Only Database Connections  
CREATE TABLE db\_connections (  
    id VARCHAR(36) PRIMARY KEY,  
    company\_id VARCHAR(36) NOT NULL UNIQUE,  
    db\_host VARCHAR(255) NOT NULL,  
    db\_port INT DEFAULT 3306,  
    db\_user VARCHAR(100) NOT NULL,  
    encrypted\_db\_pass TEXT NOT NULL, \-- Encrypted at rest using AES-256  
    db\_name VARCHAR(100) NOT NULL,  
    ssl\_required BOOLEAN DEFAULT TRUE,  
    created\_at TIMESTAMP DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (company\_id) REFERENCES companies(id) ON DELETE CASCADE  
);

\-- 4\. End-User Chat Sessions generated via the Widget  
CREATE TABLE chat\_sessions (  
    id VARCHAR(36) PRIMARY KEY,  
    company\_id VARCHAR(36) NOT NULL,  
    external\_user\_id VARCHAR(255) NOT NULL, \-- The user\_id inside the client's app  
    external\_tenant\_id VARCHAR(255) NULL,   \-- The tenant\_id inside the client's app  
    created\_at TIMESTAMP DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (company\_id) REFERENCES companies(id) ON DELETE CASCADE,  
    INDEX idx\_user\_lookup (company\_id, external\_user\_id)  
);

\-- 5\. Individual messages inside a chat session  
CREATE TABLE chat\_messages (  
    id VARCHAR(36) PRIMARY KEY,  
    session\_id VARCHAR(36) NOT NULL,  
    sender ENUM('user', 'assistant', 'system') NOT NULL,  
    content TEXT NOT NULL,  
    internal\_thought\_log TEXT NULL, \-- Holds the AI's internal reasoning/SQL execution details (visible in Dev Sandbox)  
    created\_at TIMESTAMP DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (session\_id) REFERENCES chat\_sessions(id) ON DELETE CASCADE  
);

## **5\. Security & Isolation Safeguards**

Dynamic database querying is a high-risk vector. The system implements a triple-lock mechanism:

1. **Driver-Level Write Prohibition**  
   * The MySQL connection created by the developer must use an explicit read-only user (GRANT SELECT ON database.\* TO 'zeroticket\_ro'@'%').  
   * The Python execution engine rejects raw SQL generation that contains mutate keywords (UPDATE, DROP, INSERT, DELETE, ALTER, TRUNCATE, REPLACE) at the token parser level prior to sending to the database driver.  
2. **Tenant Constraints (No Data Leaks)**  
   * When embedding the widget, the client backend passes an authenticated JSON Web Token (JWT) signed using their private key. This token payload securely contains the current user's user\_id and tenant\_id.  
   * **Rule Injection:** The execution engine automatically wraps every AI-generated query. It appends constraints targeting the specific user or tenant.  
     * *Generated Query:* SELECT \* FROM invoices;  
     * *Enforced Execution Query:* SELECT \* FROM (SELECT \* FROM invoices) AS sub WHERE sub.tenant\_id \= 'CURRENT\_JWT\_TENANT\_ID' LIMIT 10;  
3. **Performance Limits (DDoS / Heavy Query Prevention)**  
   * Every SQL query executed by the LLM is automatically appended with LIMIT 10\.  
   * A hard driver-level timeout of **500ms** is set. Any query that triggers an unindexed sequence scan across millions of rows will instantly self-terminate, and the AI will fallback to standard knowledge-base documentation.

## **6\. Runtime Walkthrough (How it actually answers a question)**

1. **User Input:** End-user chats in: *"Why is my transfer payment pending?"* (Signed JWT contains user\_id: 852).  
2. **Retrieve Context:** ZeroTicket finds the code vector chunk for the payment execution logic and the MySQL connection config.  
3. **Draft Target SQL:** The AI identifies that it needs to check the status of a specific row in the payments table. It drafts a query: SELECT status, amount, created\_at, failure\_reason FROM payments  
4. **Enforce Tenant Rules:** The SQL injection barrier intercepts the draft and reformulates:  
   SELECT status, amount, created\_at, failure\_reason   
   FROM payments   
   WHERE user\_id \= 852   
   ORDER BY created\_at DESC   
   LIMIT 1;

5. **Run DB Query:** The query safely executes against the read-only MySQL database. It returns:  
   {status: "pending", amount: 1500.00, created\_at: "2026-06-25 10:00:00", failure\_reason: "awaiting\_ach\_clearing"}  
6. **Consult Code Rules:** The AI checks the vectorized code logic. The codebase indicates that ACH payments under $2,000 take up to 2 working days to clear automatically.  
7. **Generate Response:** The AI translates this technical status combination into clean english:  
   *"Your $1,500 payment is pending because it was sent via bank transfer (ACH). According to the system guidelines, standard bank transfers under $2,000 take up to 2 business days to settle. It should clear by tomorrow morning."*