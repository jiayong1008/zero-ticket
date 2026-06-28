# ZeroTicket Dashboard Client

Next.js web application providing an onboarding wizard, connection metrics, copy-pasteable widget integration scripts, and a sandbox interface to test AI behaviors under different mock user contexts.

## 🛠️ Technology Stack
* **Framework:** Next.js 16.2.9 (App Router)
* **Library:** React 19.2.4
* **Language:** TypeScript 5
* **CSS & Design System:** TailwindCSS 4 & Vanilla CSS Variables (in `app/globals.css` supporting light/dark themes)
* **Package Manager:** npm

---

## 🚀 Setup & Installation

### 1. Requirements
* Node.js 18+
* npm or yarn

### 2. Installation
```bash
npm install
```

### 3. Launch Development Server
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 🗺️ Routing & Pages Layout

* **`/onboarding`:** Multi-step wizard to setup the company details, clone the repository, configure database access, and select your AI Provider (Gemini, OpenAI, Anthropic, DeepSeek, Qwen, or Custom Local LLM).
* **`/` (Dashboard):** Summary of configurations, active connections status, and guidelines/embed code for site widgets. Contains a secure Admin Passphrase login gate for self-hosted instances.
* **`/sandbox`:** Developer console allowing claims setup (User ID, Tenant ID, custom JSON claims) to simulate how the AI SQL Security Guard behaves, trace logs, and thoughts inspection.
* **`/widget`:** Supports client chat widgets inside an iframe. Connects with JWT claims to guarantee secure queries.

---

## 🎨 Design System & Theme Persistence
* **CSS Variables:** Colors and glassmorphism styling parameters are loaded dynamically via CSS variables in `app/globals.css`.
* **Light Theme Override:** The `--background`, `--foreground`, `--card-bg`, and `--border-color` parameters swap dynamically when `body.light` is appended to the document body.
* **Preferences Storage:** Toggling the theme writes the preference (`"light"` / `"dark"`) into `localStorage.getItem("theme")` which is read on page mounts to prevent flashing.
