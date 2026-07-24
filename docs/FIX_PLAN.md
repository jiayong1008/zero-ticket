# ZeroTicket — Outstanding Fixes (handoff plan)

Context: this repo is being deployed to Vercel (`https://zero-ticket.vercel.app/`, multi-service
project — Next.js frontend + FastAPI backend in one Vercel project via `vercel.json`) ahead of a
hackathon submission. A security review turned up several issues. Two are already fixed and
committed; the rest are open. Each item below has the exact file/location, why it matters, and a
concrete fix — written so a coding agent can act on it directly without further clarification.

---

## Already fixed (verify only, no action needed)

1. **Hardcoded encryption-key fallback removed** — `backend/app/config.py`. Previously had
   `ENCRYPTION_KEY: str = "tVv5F3a7-...="` as a literal default, committed to a public repo. Now
   raises `RuntimeError` at startup if `ENCRYPTION_KEY` isn't set via env var, so the app can never
   silently run with a publicly-known key.
2. **`ADMIN_PASSWORD` required on Vercel** — same file. Raises `RuntimeError` at startup if
   `VERCEL=1` (auto-set by the platform) and `ADMIN_PASSWORD` is empty, so admin/onboarding
   endpoints can never be unauthenticated on a real deployment. Empty is still allowed for pure
   local dev (prints a warning instead of crashing).
3. **GitHub repo name mismatch fixed** across `README.md`, `HACKATHON_SUBMISSION.md`,
   `HACKATHON_EXECUTION_PLAN.md` — all now correctly point at `jiayong1008/zero-ticket` (previously
   said `zeroticket`, which doesn't match the actual `git remote`).

Verification step: confirm `ENCRYPTION_KEY` and `ADMIN_PASSWORD` are set in Vercel → Project →
Environment Variables (Production + Preview) — user confirmed this is already done.

---

## Open Issue 1 — Backend returns 500 on Vercel (blocking, highest priority)

**Symptom:** `GET https://zero-ticket.vercel.app/api/backend/api/admin/status` returns a 500. This
confirms Vercel's rewrite *is* routing the full path to the backend service (a routing failure
would 404, not 500), so the FastAPI process itself is erroring — either failing to boot, or
crashing on that specific request.

**Likely causes, in order of probability:**
- A dependency in `backend/requirements.txt` needs a native/system library that Vercel's Python
  runtime doesn't provide out of the box (the project's own `Dockerfile` explicitly installs
  `build-essential` and `default-mysql-client` before `pip install` — Vercel's managed Python
  runtime may not have equivalents). Prime suspects: `chromadb` (native/onnx deps), `psycopg2`
  (needs `libpq-dev` — should be `psycopg2-binary` instead for a runtime without system libs),
  `tree-sitter` bindings.
- An import-time crash unrelated to the above (e.g. a module-level call that fails outside a
  Docker/local environment).

**Fix procedure:**
1. Pull the real traceback from Vercel → Project → the specific deployment → **Logs** /
   **Runtime Logs** for the `backend` service. This is required before guessing further —
   don't attempt blind fixes without seeing the actual exception.
2. If it's `psycopg2` failing to import: switch `backend/requirements.txt` from `psycopg2` to
   `psycopg2-binary` (no system `libpq` dependency).
3. If it's `chromadb` or `tree-sitter`: check whether Vercel's Python "Web Service" runtime
   documentation lists supported system packages / a way to specify build-time apt packages
   (equivalent to what the Dockerfile does). If no such mechanism exists for this Vercel
   feature, this is very likely a hard platform limitation, not a config bug.
4. **Time-box this to one investigation + one fix attempt.** If the traceback points at a
   platform limitation (a native dependency Vercel's Python runtime fundamentally can't
   support) rather than something fixable in requirements.txt, stop iterating on Vercel and
   fall back to hosting the backend on **Railway** instead (Docker-based, supports the exact
   same `backend/Dockerfile` already in the repo unmodified). Keep Vercel for the frontend
   only, point `NEXT_PUBLIC_API_URL` (see Issue 2) at the Railway backend URL. This is a known,
   low-risk path already scoped out — don't burn more time on the experimental Vercel path if
   it isn't resolving quickly.

---

## Open Issue 2 — Frontend hardcodes `http://localhost:8088` (blocking, do alongside Issue 1)

**Symptom:** every deployed environment (Vercel, or Railway-for-backend) is non-functional from
any browser except the developer's own laptop, because the frontend tries to call the visiting
browser's own `localhost:8088`, which nothing is listening on.

**Locations (11 occurrences across 4 files):**
- `frontend/app/onboarding/page.tsx` — line 49: `const BACKEND_URL = "http://localhost:8088";`
  Also two *separate* hardcoded literals that don't even use that constant: line 71
  (`http://localhost:8088/api/admin/login`) and line 140 (`http://localhost:8088/api/admin/status`).
  The other 8 occurrences already use `${BACKEND_URL}`.
- `frontend/app/page.tsx` — 6 occurrences (check for both a `BACKEND_URL` constant and any
  separate literal strings, same pattern as onboarding).
- `frontend/app/sandbox/page.tsx` — 1 occurrence.
- `frontend/app/widget/page.tsx` — 1 occurrence.

**Fix:**
1. In every file above, replace the hardcoded constant with:
   ```ts
   const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8088";
   ```
   This preserves local dev (`npm run dev` with no env var still hits `localhost:8088`) and
   `docker-compose` (which already sets `NEXT_PUBLIC_API_URL=http://backend:8088` as a build env
   var per `docker-compose.yml`).
2. Fix the two literal (non-constant) occurrences in `onboarding/page.tsx` (lines 71 and 140) to
   use the same `BACKEND_URL` constant instead of a separate hardcoded string — search for any
   other files where a literal `http://localhost:8088` string appears outside the `BACKEND_URL`
   declaration and fix those the same way.
3. In Vercel → Project → Environment Variables, set `NEXT_PUBLIC_API_URL` for the **frontend**
   service. Given the `vercel.json` rewrite forwards `/api/backend/*` to the backend service on
   the same domain, the value should be a relative path: `/api/backend`. (If the backend gets
   moved to Railway per Issue 1's fallback, this becomes the full Railway URL instead, e.g.
   `https://your-backend.up.railway.app`.)
4. After redeploying, verify: open the deployed frontend, check the browser Network tab, confirm
   requests go to `/api/backend/...` (or the Railway URL) — not `localhost:8088`.

---

## Open Issue 3 — CORS misconfiguration (security, medium priority)

**Location:** `backend/app/main.py`, lines 42-48:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
**Why it matters:** `allow_origins=["*"]` combined with `allow_credentials=True` means Starlette
reflects whatever `Origin` header the requester sends back as an allowed origin — in practice this
lets literally any website make credentialed cross-origin requests to this API. The code comment
(`# Adjust for production`) shows this was already flagged as temporary and never revisited.

**Fix:** replace the wildcard with an explicit allowlist of real origins:
```python
allow_origins=[
    "http://localhost:3000",
    "https://zero-ticket.vercel.app",
    # add any Vercel preview-deployment domains as needed
],
```

---

## Open Issue 4 — SQL Security Guard: tenant-column detection is a fixed allowlist (security/correctness, lower priority)

**Location:** `backend/app/engine/security.py`, `CLAIM_COLUMN_MAPPING` (lines 7-14):
```python
CLAIM_COLUMN_MAPPING = {
    'tenant_id': 'tenant_id',
    'company_id': 'company_id',
    'user_id': 'user_id',
    'owner_id': 'user_id',
    'customer_id': 'user_id',
    'client_id': 'tenant_id',
}
```
**Why it matters:** the tenant-isolation rewrite (the core "SQL Security Guard" pitch feature)
only adds a `WHERE` filter to a table if that table has a column whose name exactly matches one of
these six strings. A table using a different but equally common convention — `org_id`,
`workspace_id`, `account_id`, `team_id` — gets **no filter applied at all**, and the query runs
unscoped against that table. This is a silent bypass, not a loud failure: nothing errors, it just
quietly returns unfiltered data for any table whose tenant column isn't one of the six hardcoded
names.

**Fix options (pick one, or note as a documented known-limitation if out of scope for the
deadline):**
- Expand `CLAIM_COLUMN_MAPPING` with more common naming conventions.
- Safer alternative: when a table has *no* recognized tenant/user column at all, decide explicitly
  whether to (a) allow it through unscoped (assume shared/lookup table — current behavior, but
  should be an intentional choice, not a silent fallthrough) or (b) reject the query with a 403
  ("this table has no recognized tenant-isolation column, refusing to query it") unless the table
  is on an explicit allowlist of known-shared tables. Option (b) is more consistent with the
  "mathematically impossible to leak" claim already made in the hackathon submission docs.

---

## Suggested order of execution

1. Issue 1 (backend 500) — nothing else can be verified until the backend actually runs.
2. Issue 2 (frontend hardcoded URL) — do alongside Issue 1 since both block the same end-to-end test.
3. Redeploy, verify: `/api/backend/api/admin/status` returns real JSON (not 500/404), the
   onboarding page's login-required check works, and the "no auth" bug from earlier is confirmed
   fixed (i.e. hitting `/api/backend/api/db/connect` directly without an `X-Admin-Token` header
   returns 401).
4. Issue 3 (CORS) — quick, no dependencies on the above.
5. Issue 4 (SQL Security Guard gap) — lowest urgency; fine to document as a known limitation in
   the submission if time runs out, but shouldn't be silently left unmentioned given it undercuts
   the "mathematically impossible" security claim in the pitch docs.
