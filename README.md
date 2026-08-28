# DraftNight

A link-based web app for running a fantasy football draft-order lottery. A league commissioner sets up teams, runs a random or weighted draw, and reveals the results one pick at a time (worst to first) to a live, shareable viewer page — no accounts or sign-in required.

## How it works

- A **commissioner** creates a league, adds teams (6–32), and picks a lottery mode: **random** (equal odds) or **weighted** (custom per-team weights, e.g. for a lottery skewed toward last-place finishers).
- Creating a league generates two unguessable tokens: a **commissioner token** (a secret URL that lets you manage the league and drive the reveal) and a **viewer token** (a public URL, safe to share, that only shows the live draft state). There are no user accounts — the token *is* the access control.
- Once the draft starts, the commissioner reveals picks one at a time. Order is computed server-side up front (Fisher–Yates shuffle for random mode, weighted draw-without-replacement for weighted mode) and revealed bottom-up (worst slot first, like a real draft lottery), with a suspense animation and sound on each reveal.
- Anyone with the viewer link sees each pick appear live via Supabase Realtime broadcasts, in sync with the commissioner's screen.

## Key features

- **Two lottery modes** — pure random shuffle, or weighted-without-replacement draws driven by per-team weights (`lib/lottery.ts`).
- **Live, multi-viewer reveal** — picks are broadcast over a Supabase Realtime channel scoped to the league's viewer token, so any number of spectators watch the same reveal in real time (`lib/realtime.ts`, `lib/realtimeClient.ts`, `app/watch/[viewerToken]`).
- **Token-based access, no auth system** — a commissioner link (`/league/[commissionerToken]/manage`) and a read-only viewer link (`/watch/[viewerToken]`) are the entire access model; tokens are cryptographically random (`lib/tokens.ts`).
- **Server-enforced correctness** — all reads/writes go through Next.js API routes backed by the Supabase service role; team roster replacement uses an atomic Postgres RPC (`replace_league_teams`) and pick reveals use an optimistic-concurrency check, guarding against double-clicks and race conditions.
- **Rate limiting** — league creation and pick reveals are rate-limited per key (per-IP for creation, per-league for reveals) using a Postgres-backed limiter (`lib/rateLimit.ts`, `rate_limits` table).
- **Full test pyramid** — unit/component tests, an integration suite against a real Supabase project, and a Playwright end-to-end test covering the whole commissioner-to-viewer flow.

## Tech stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Database / Realtime:** Supabase (Postgres, Row Level Security, Realtime broadcast)
- **Validation:** Zod
- **Styling:** Tailwind CSS 4
- **Testing:** Vitest + Testing Library (unit/component), Vitest against live Supabase (integration), Playwright (E2E)

## Prerequisites

- Node.js **20.9+** (required by Next.js 16)
- A [Supabase](https://supabase.com) project (free tier is fine)
- npm

## Setup

1. Clone the repo and install dependencies:
   ```bash
   git clone <repo-url>
   cd lottery20
   npm install
   ```
2. Create a Supabase project and apply the migrations in order (via the Supabase SQL editor or CLI):
   - `supabase/migrations/0001_init.sql` — schema: `leagues`, `teams`, `draft_results`, `rate_limits`, with RLS enabled and no policies (see [Architecture notes](#architecture-notes) below).
   - `supabase/migrations/0002_atomic_replace_teams.sql` — adds the `replace_league_teams` Postgres function used to atomically overwrite a league's team roster.
3. Copy the env example and fill in your Supabase credentials:
   ```bash
   cp .env.local.example .env.local
   ```
   Required variables (see `.env.local.example`):
   | Variable | Description |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (used client-side only for Realtime subscriptions) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — **server-only**, never expose to the browser |

## Running locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Testing

| Command | What it runs |
|---|---|
| `npm test` | Unit and component tests (Vitest + jsdom, no network) |
| `npm run test:watch` | Unit/component tests in watch mode |
| `npm run test:integration` | Repository integration tests against your real Supabase project (needs `.env.local`) |
| `npm run test:e2e` | Playwright E2E test of the full commissioner → reveal → viewer flow (spins up the dev server) |

## Architecture notes

- **Supabase RLS as a lockdown, not a policy set.** Every table has Row Level Security enabled with **zero policies defined**, which means the anon key can't read or write any table directly. All data access goes through Next.js server-side API routes using the Supabase **service role** key (`lib/supabaseAdmin.ts`). The anon key is only ever used client-side to subscribe to Realtime broadcast channels, which don't touch table data. This pushes all authorization logic into the server layer instead of relying on row-level policies.
- **Token-based authorization instead of user accounts.** There is no login. A league's commissioner token is effectively a bearer credential embedded in the URL — anyone with the link can manage the league, and there is no recovery mechanism if it's lost. The viewer token is intentionally read-only and safe to share widely.
- **Atomic writes for concurrent safety.** Replacing a league's team roster is done via a single Postgres function (`replace_league_teams`) rather than separate delete/insert calls, and pick reveals use an optimistic-concurrency check (`expectedRevealedCount`) so double-clicks or concurrent requests can't reveal the same slot twice or reveal out of order.

## Deployment

Deploy to Vercel (or any Next.js host). Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as environment variables in your hosting provider — never commit them.

## Project structure

```
app/                   Next.js App Router pages and API routes
  api/leagues/         League creation, team management, draft start, reveal
  api/view/            Public read-only league state for viewers
  league/.../manage/   Commissioner UI
  watch/...            Public viewer UI
components/            Shared UI (e.g. RevealAnimation)
lib/                   Domain logic: lottery algorithms, repository layer
                       (Supabase + in-memory implementations), validation,
                       tokens, rate limiting, realtime broadcast/subscribe
supabase/migrations/   SQL schema and RPC migrations
e2e/                   Playwright end-to-end tests
```
