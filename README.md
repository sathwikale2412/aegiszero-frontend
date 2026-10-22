# AegisZero Enterprise — IAM Governance Console

A zero-trust governance console for employee identity events. An operator submits a team
transfer or a full deprovisioning request (single record or bulk CSV), the **dispatch
service** validates it and relays it to a **Workato** recipe. Sign-ins and dispatches are
written to the Postgres audit trail **by the console, under the operator's own row-level
security policy, which grants only read and insert** — an operator can add to the trail and
re-read it, but cannot edit or erase a row, and Postgres sets the timestamp rather than
trusting the browser. The dispatch service stores nothing itself, so what the trail proves is
what a signed-in operator says they submitted, not what Workato executed, and a dispatch whose
response never arrives leaves no row.

Live deployment: https://aegiszero-frontend.vercel.app

## Why there is a backend

The original build had none: `src/App.jsx` POSTed straight to the Workato webhook, and the
only way to get that URL into the browser was `VITE_WORKATO_WEBHOOK_URL`. Everything behind
a `VITE_` prefix is inlined into the public bundle, so anyone who opened dev tools would
have held a tenant token that authorises access-revocation calls.

`api/index.py` now keeps that URL server-side. The browser sends the request to `/api/dispatch`
with its Supabase access token; the function verifies the caller, validates the payload,
rebuilds the recipe body from allowlisted fields, and forwards it. The webhook URL never
crosses to the client.

## What is real and what is sample

| Area | Status |
| --- | --- |
| Dispatch (`/api/dispatch` → authenticated relay to Workato) | Real — requires `WORKATO_WEBHOOK_URL` on the function |
| Sign-in / sign-up, sign-in log, audit trail | Real — Supabase Postgres with Row Level Security |
| Team IDs, entitlement groups, department names in the form | Sample values for demonstration |

The header badge is driven by `GET /api/health`, so it reports what the **service** says
about its own configuration — and the health endpoint never returns the webhook URL, only
`configured` / `missing env`.

## Request path

```
browser ──POST /api/dispatch  (kind + payload, Authorization: Bearer <supabase token>)
   │
   ▼
api/index.py
   ├─ verify_caller()   GET {SUPABASE_URL}/auth/v1/user  → user id, or refuse (fails closed)
   ├─ rate_limited()    10 dispatches / 60 s per user
   ├─ validate_*()      event type, id pattern, email pattern, justification length, batch ≤ 200
   ├─ rebuild body      allowlisted fields only + operator = verified user id
   └─ POST WORKATO_WEBHOOK_URL     ── 2xx → accepted, anything else → one generic sentence
```

Unknown endpoints 404, malformed JSON 400, validation failures 422 (with the per-field list),
unauthenticated 401, rate limited 429, upstream trouble 502.

## Stack

React 19 · Vite 8 · `@supabase/supabase-js` · Flask 3 (`api/`) · oxlint. Plain JSX, inline
styles, no router (the console is a single screen with two tabs).

## Setup

```bash
npm install
cp .env.example .env      # fill in the values
flask --app api/index.py run --port 5001   # backend for the dev proxy
npm run dev
```

| Variable | Used by | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | browser | Supabase → Project Settings → API |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | `api/index.py` | same values, no `VITE_` prefix — server-side only |
| `WORKATO_WEBHOOK_URL` | `api/index.py` | **server-only Secret.** Never give it a `VITE_` prefix |

Without the Supabase pair the console skips the sign-in gate, runs guest-only and **dispatch
is refused** — an unauthenticated relay into an access-revocation endpoint is not a fallback
worth having. Without `WORKATO_WEBHOOK_URL` the console renders and the API answers
`pipeline: missing env`.

### Database

Run [`supabase/schema.sql`](supabase/schema.sql) once in the Supabase SQL editor. It creates
`aegis_logins` and `aegis_audit_events`, enables RLS, and adds a read policy and an insert
policy per table, so an operator can only see and add rows tagged with their own `auth.uid()` —
never change one. `before insert` triggers stamp `logged_at` and `created_at` from the database
clock. A database created from the earlier schema gets the same rules from
[`supabase/harden-audit.sql`](supabase/harden-audit.sql).

You can use the same Supabase project as your other apps: `auth.users` is shared, so one
account signs you in across all of them.

### Security notes

- **Passwords** are hashed by Supabase Auth (bcrypt). The app stores no password and no
  verifiable secret, so there is nothing here to encrypt or leak.
- **Sign-in attempts** are rate limited by Supabase GoTrue itself. The limiter in
  `api/index.py` is per warm instance — best effort by design, because a stateless function
  cannot hold a global counter. It covers dispatch, which GoTrue does not.
- **Validation runs on the server.** Client-side checks are gone; the API is the authority.
- **Errors are generic.** Upstream failures return one sentence plus a `request_id`; the
  real detail goes to the function log. The token is never echoed back.
- **Response headers** (`vercel.json`): CSP with `script-src 'self'` and no `unsafe-eval`,
  `nosniff`, `X-Frame-Options: DENY`, `no-referrer`, `Cache-Control: no-store` on the API,
  and camera/mic/geolocation/payment/USB all denied.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | local dev server; `/api` proxies to `127.0.0.1:5001` |
| `npm run build` | production bundle to `dist/` |
| `npm run preview` | serve the built bundle |
| `npm run lint` | oxlint over `src/` |
| `python api/test_dispatch.py` | dispatch-service checks (auth, validation, relay body, generic errors, rate limit) with no live Supabase or Workato |

## Deploying to Vercel

`vercel.json` declares two services (`frontend` → Vite, `backend` → `api/index:app`) with
`/api/(.*)` rewritten to the backend. Headers live inside each service object.

```bash
vercel link
vercel env add VITE_SUPABASE_URL      production   # type Config
vercel env add VITE_SUPABASE_ANON_KEY production   # type Config
vercel env add SUPABASE_URL           production   # type Config (function runtime)
vercel env add SUPABASE_ANON_KEY      production   # type Config (function runtime)
vercel env add WORKATO_WEBHOOK_URL    production --secret
vercel deploy --prod
```

`VITE_` values are inlined at build time, so adding one after a deploy needs a redeploy.
A **Secret** is runtime-only, which is exactly right for the webhook URL — but it means the
function must be re-invoked after it is added, not rebuilt around it.

## Rotate first if the URL was ever shared

If a real `VITE_WORKATO_WEBHOOK_URL` value was ever committed, published, or screenshotted,
rotate the webhook in Workato before going live with this build. The token is the only
credential the old design exposed, and this refactor removes the exposure — it cannot undo a
token that already left the machine.
