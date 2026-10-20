# AegisZero Enterprise — IAM Governance Console

A zero-trust governance console for employee identity events. An operator submits a
team transfer or a full deprovisioning request (single record or bulk CSV), the console
dispatches the event to a **Workato** recipe, and every dispatch plus every sign-in is
written to a Postgres audit trail.

Live deployment: _see the Vercel URL printed by `vercel deploy --prod` (add it here once deployed)._

## What is real and what is sample

| Area | Status |
| --- | --- |
| Workato dispatch (`POST` of a structured event payload) | Real — requires `VITE_WORKATO_WEBHOOK_URL` |
| Sign-in / sign-up, sign-in log, audit trail | Real — Supabase Postgres with Row Level Security |
| Team IDs, entitlement groups, department names in the form | Sample values for demonstration |

The header badge reports whether a webhook is **configured**, not whether the recipe is
healthy — it makes no claim it cannot verify.

## Stack

React 19 · Vite 8 · `@supabase/supabase-js` · oxlint. Plain JSX, inline styles, no router
(the console is a single screen with two tabs).

## Setup

```bash
npm install
cp .env.example .env      # fill in the three values
npm run dev
```

| Variable | Where it comes from | Required for |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API | accounts + audit persistence |
| `VITE_SUPABASE_ANON_KEY` | same | accounts + audit persistence |
| `VITE_WORKATO_WEBHOOK_URL` | Workato → the inbound webhook recipe | any dispatch |

Without the Supabase pair the console skips the sign-in gate and runs guest-only: the
audit console keeps the session's entries and saves nothing. Without the Workato URL the
console renders, but dispatch is refused with an explicit "webhook not configured" entry
instead of a silent failure.

### Database

Run [`supabase/schema.sql`](supabase/schema.sql) once in the Supabase SQL editor. It
creates `aegis_logins` and `aegis_audit_events`, enables RLS, and adds a policy per table
so an operator can only read or write rows tagged with their own `auth.uid()`.

You can use the same Supabase project as your other apps: `auth.users` is shared, so one
account signs you in across all of them.

### Webhook safety

`VITE_WORKATO_WEBHOOK_URL` embeds a tenant token that lets the holder trigger your
recipes. It is read from the environment and is never committed. **Rotate the webhook if
a token ever reached a public repository or a shared screenshot.**

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | local dev server |
| `npm run build` | production bundle to `dist/` |
| `npm run preview` | serve the built bundle |
| `npm run lint` | oxlint over `src/` |

## Deploying to Vercel

```bash
vercel link
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add VITE_WORKATO_WEBHOOK_URL production
vercel deploy --prod
```

All three must be type **Config** — `VITE_` variables are inlined into the client bundle
at build time, so a value added after a deploy needs a redeploy to take effect.
