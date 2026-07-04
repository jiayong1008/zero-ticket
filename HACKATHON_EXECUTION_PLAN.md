# ZeroTicket: Hackathon Execution & Deployment Plan

**Hackathon Page:** [AMD Developer Hackathon: ACT II](https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-ii)

This document outlines the step-by-step checklist to set up our AMD GPU infrastructure, deploy Google's Gemma model, connect our backend, and prepare for final submission.

---

## 🚀 Phase 1: AMD GPU Droplet Provisioning

1. **Create Droplet:** In the AMD Developer Cloud UI, click **"Create a GPU Droplet"**.
2. **Configuration:**
   * Select a standard Ubuntu image (e.g., Ubuntu 22.04 LTS).
   * Ensure your SSH key is added.
   * Note down the public IP address once created.
3. **Verify GPU Access:**
   * SSH into the server: `ssh root@<YOUR_DROPLET_IP>`
   * Run `rocm-smi` to verify that the AMD GPU is active and recognized by the drivers.

---

## 🧠 Phase 2: Deploying Gemma 2 on AMD ROCm

To qualify for the **$2,000 AMD-Hosted Gemma Project** bonus prize, we will run Google's **Gemma 2** locally on the droplet.

1. **Install Ollama (with AMD ROCm Support):**
   * Ollama automatically detects AMD GPUs and configures ROCm libraries.
   * Run the installer:
     ```bash
     curl -fsSL https://ollama.com/install.sh | sh
     ```
2. **Download Gemma 2:**
   * Pull the lightweight 9-billion parameter version, which has excellent reasoning and runs fast:
     ```bash
     ollama run gemma2
     ```
3. **Expose Ollama API Globally:**
   * By default, Ollama only listens on `127.0.0.1`. We need to bind it to `0.0.0.0` so our local/production backend can query it.
   * Edit the service config:
     ```bash
     sudo systemctl edit ollama.service
     ```
   * Add the following lines in the editor:
     ```ini
     [Service]
     Environment="OLLAMA_HOST=0.0.0.0:11434"
     ```
   * Save, exit, and reload systemd to apply the changes:
     ```bash
     sudo systemctl daemon-reload
     sudo systemctl restart ollama
     ```

---

## 🔌 Phase 3: Wire ZeroTicket Backend to Gemma 2

1. **Update Environment Variables:**
   * In `backend/.env`, set the custom LLM settings to point to your new AMD server:
     ```env
     CUSTOM_LLM_BASE_URL=http://<YOUR_DROPLET_IP>:11434/v1
     ```
2. **Verify in Sandbox:**
   * Run the Next.js frontend and FastAPI backend.
   * Go to the **Sandbox** page, switch the model provider to **Custom**, and run a test query.
   * Confirm that the query reaches your AMD server and executes SQL securely.

---

## 🎬 Phase 4: Recording the Demo & Pitch

1. **Prepare Mock Data:**
   * Populate a local database replica with realistic SaaS subscription and transaction logs.
2. **Record a 3–5 Minute Video:**
   * **The Hook (0:00 - 1:00):** Show the problem (developer overhead, security risks of typical AI bots).
   * **The Demo (1:00 - 2:30):** Show the Sandbox page. Input a query, show the SQL Security Guard injecting the tenant constraint, and display the final answer.
   * **The Tech (2:30 - 3:30):** Show the terminal logs of your AMD GPU droplet running Gemma 2 to prove it's hosted locally.
   * **The Outro (3:30 - 4:00):** Mention B2B market potential and on-premise privacy advantages.

---

## 🏁 Phase 5: Submission Checklist

* [ ] Droplet successfully created on AMD Developer Cloud.
* [ ] Ollama and `gemma2` running on Droplet.
* [ ] FastAPI backend successfully communicating with Droplet API.
* [ ] Video recorded, uploaded (under 300MB), and link ready.
* [ ] GitHub repository set to **Public** (`https://github.com/jiayong1008/zeroticket`).
* [ ] Submission form filled out on Lablab.ai using copy-paste templates from `HACKATHON_SUBMISSION.md`.
