# Fantasy Draft Lottery

A link-based website for running a fantasy football draft-order lottery, with a live bottom-up reveal.

## Setup

1. `npm install`
2. Create a Supabase project and apply both migrations in order:
   - `supabase/migrations/0001_init.sql` (initial schema)
   - `supabase/migrations/0002_atomic_replace_teams.sql` (adds atomic replace_league_teams function)
   
   See `docs/superpowers/plans/2026-07-20-fantasy-draft-lottery.md`, Task 10, for exact steps.
3. Copy `.env.local.example` to `.env.local` and fill in your Supabase URL, anon key, and service role key.
4. `npm run dev` and open http://localhost:3000.

## Testing

- `npm test` — unit and component tests (fast, no network).
- `npm run test:integration` — repository tests against your real Supabase project.
- `npm run test:e2e` — Playwright end-to-end test against the running dev server.

## Deployment

Deploy to Vercel; set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as environment variables in the Vercel project settings (never commit them).

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` must only ever be read on the server (`lib/supabaseAdmin.ts`) — never expose it to the browser or a `NEXT_PUBLIC_*` variable.
- Row Level Security is enabled on every table with no policies; all reads/writes go through server-side API routes using the service role key.
- Commissioner access is a bearer token in the URL — anyone with the link can manage the league. There is no recovery if it's lost.
