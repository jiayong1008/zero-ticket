# ZeroTicket: Dummy Project Setup & Demo Plan

To demo ZeroTicket securely without exposing any client code or data, we have set up a mock SaaS billing application codebase ("Zero Billing") and database schema.

This document outlines the file structures, database tables, and seed data required to execute a complex, realistic multi-tenant SaaS support demonstration.

---

## 📂 1. Mock Codebase Structure (`/Users/jiayong/GitHub/playground/zero-billing-demo`)

The repository contains the following files to simulate a Laravel codebase:

### 📄 File 1: `artisan` (Root)
*   Used for Laravel project structure detection.

### 📄 File 2: `User Model` (`app/Models/User.php`)
*   Defines relationship with payments and tenant parameters.

### 📄 File 3: `Invoice Model` (`app/Models/Invoice.php`)
*   Defines relationship with billing invoices.

### 📄 File 4: `Payment Controller` (`app/Http/Controllers/PaymentController.php`)
*   **ACH Clearing Rule:** Logic stating bank transfers (ACH) take 3 business days to clear, while credit cards are processed instantly.

### 📄 File 5: `Discount Controller` (`app/Http/Controllers/DiscountController.php`)
*   **SaaS Tier Discount Rules:**
    *   `enterprise` users get a flat 20% discount on all invoices.
    *   `premium` users get a 10% discount on invoices of $1,000 or more.
    *   `standard` / `free` users get no discount.

---

## 🗄️ 2. Mock Database Schema (Run this in MySQL Workbench!)

Run the following SQL commands to set up the tables and populate them with mock records representing different tenant companies and user tiers.

```sql
CREATE DATABASE IF NOT EXISTS zero_billing_replica;
USE zero_billing_replica;

-- Drop old tables if they exist to start fresh
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS users;

-- 1. Create Users Table (added 'tier' column for discount logic)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    tenant_id INT NOT NULL,
    tier VARCHAR(50) NOT NULL DEFAULT 'standard'
);

-- 2. Create Payments Table
CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 3. Create Invoices Table (for complex invoice discount calculations)
CREATE TABLE invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,          -- Final charged amount
    original_amount DECIMAL(10, 2) NOT NULL, -- Price before discounts
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 4. Seed Data (Tenant 1 vs Tenant 2 Isolation + User Tiers)
INSERT INTO users (id, name, email, tenant_id, tier) VALUES 
(101, 'Alice Johnson', 'alice@company-a.com', 1, 'premium'),    -- Tenant 1 (Premium)
(102, 'Bob Smith', 'bob@company-b.com', 2, 'enterprise');        -- Tenant 2 (Enterprise)

-- Seed Payments
INSERT INTO payments (id, user_id, amount, payment_method, status) VALUES 
(1, 101, 1500.00, 'ACH', 'pending'),   -- Alice's Pending ACH Transfer
(2, 102, 45.00, 'Credit Card', 'active'); -- Bob's Cleared CC Payment

-- Seed Invoices
INSERT INTO invoices (id, user_id, amount, original_amount, status) VALUES 
(10, 101, 900.00, 1000.00, 'paid'),    -- Alice: $1,000 original, $900 charged (10% premium discount)
(20, 102, 160.00, 200.00, 'paid');     -- Bob: $200 original, $160 charged (20% enterprise discount)
```

---

## 🎬 3. How to Execute the Demo (Complex Multi-Step Scenario)

### Scenario 1: Checking ACH Payment Status (Fast/Basic)
*   **JWT Claims:** `{"tenant_id": 1, "user_id": 101}` (Alice)
*   **Question:** *"Why is my payment pending?"*
*   **AI Action:** Queries `payments`, sees status `pending` via `ACH`. Reads `PaymentController.php` logic and responds explaining the 3-day clearing delay for bank transfers.

### Scenario 2: Explaining Bill Discount Logic (Standout Complexity - "Why was I charged X?")
*   **JWT Claims:** `{"tenant_id": 1, "user_id": 101}` (Alice)
*   **Question:** *"Why was I charged $900 instead of $1,000 for invoice 10?"*
*   **AI Action:** 
    1. Queries the `invoices` table for invoice 10. Sees `amount = 900.00` and `original_amount = 1000.00`.
    2. Queries the `users` table for Alice's profile and finds her tier is `premium`.
    3. Reads `DiscountController.php` and retrieves the rule: *"premium tier users get a 10% discount on invoices of $1,000 or more."*
    4. Correlates the facts and explains: *"Your invoice 10 originally totaled $1,000.00, but because you are a Premium tier user, you received a 10% discount, reducing your final charged amount to $900.00."*

### Scenario 3: SQL Security Isolation Guard (Safety Proof)
*   **JWT Claims:** `{"tenant_id": 1, "user_id": 101}` (Alice)
*   **Question:** *"Show me all invoices."*
*   **AI Action:** Drafts `SELECT * FROM invoices;`.
*   **Security Guard Intercept:** Rewrites the query to constrain `user_id = '101'`. 
*   **Result:** Alice **only** sees Invoice 10. She cannot see Bob's Invoice 20 (Tenant 2), proving the multi-tenant sandbox is unbreakable.
