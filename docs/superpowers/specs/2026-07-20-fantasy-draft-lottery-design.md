# Fantasy Draft Lottery — Design

## Overview

A website for a fantasy football league's commissioner to run a draft-order lottery and have the league watch the result get revealed live. Supports leagues of 6-32 teams. No accounts — access is via shareable links. Each league is a one-off event: created for a draft, run once, not reused across seasons.

## Architecture

- **Next.js** (App Router), deployed on **Vercel**.
- **Supabase** for Postgres (source of truth) and Realtime (broadcast channel for the live reveal).
- No auth provider. Access is link-based:
  - **Commissioner link** — contains a secret token; grants edit rights on the league (manage teams, set weights, run the draw).
  - **Viewer link** — public, read-only; joins the realtime channel to watch the live reveal, or see the final result if opened after the draw completes.

## Data model (Postgres)

```
leagues
  id
  commissioner_token
  viewer_token
  name
  mode              -- 'random' | 'weighted'
  status            -- 'setup' | 'live' | 'complete'
  reveal_order       -- jsonb, computed order of picks, bottom-up
  current_reveal_index

teams
  id
  league_id
  name
  weight            -- nullable; only used when mode = 'weighted'

draft_results
  league_id
  team_id
  slot              -- 1..N
```

`reveal_order` is computed once, server-side, at the moment the commissioner starts the draw — not recomputed live. The outcome is fixed at that point; the "live draw" only reveals it step by step.

## Commissioner setup flow

1. Commissioner creates a league: name + list of teams (6-32), name per team, owner name optional.
2. Picks a mode:
   - **Random** — every team has an equal chance at every slot.
   - **Weighted** — commissioner assigns a custom weight ("number of balls in the drum") to each team inline. Every team needs a weight ≥ 1 before the draft can start.
3. Commissioner receives two links: the commissioner (control) link and the viewer (share) link.
4. The league stays in `setup` status until the commissioner starts the draft. Teams and weights can be freely edited in this state.

## Lottery mechanics

- **Random mode**: Fisher-Yates shuffle of team IDs.
- **Weighted mode**: weighted-random-without-replacement — repeatedly draw one "ball" from the remaining weighted pool, remove that team from the pool, repeat until all teams are placed. This generalizes the NBA-lottery "better odds, not guarantees" feel to any league size and any weight distribution.
- The order is computed once and stored as `reveal_order`, ordered last-slot-first (since the reveal is bottom-up).

## Live draw / reveal flow

- The commissioner's control panel has a single **"Reveal Next Pick"** action. The viewer link has no controls — it is watch-only.
- Each reveal action atomically advances `current_reveal_index`, writes the corresponding `draft_results` row, and broadcasts the new pick over the Supabase Realtime channel.
- Viewer screen shows a bottom-up list: revealed picks stack up as they're announced, the next slot shows as unrevealed until its turn, with a brief reveal animation (e.g. card flip / fade-in). A single-column list scales fine from 6 to 32 teams — it just scrolls further for bigger leagues.
- When slot 1 is revealed, league `status` becomes `complete`. From then on, anyone opening the viewer link sees the full final order immediately — no replay mechanism needed.

## Error handling & edge cases

- **Duplicate reveal actions** (double-click, two open commissioner tabs): `current_reveal_index` advances via an atomic "increment if matches expected value" DB update, so a slot can't be skipped or duplicated.
- **Weighted mode with a missing or zero weight**: "Start Draft" stays disabled with inline validation until every team has a weight ≥ 1.
- **Lost commissioner link**: there is no recovery path, since there's no login. The create-league screen must warn the commissioner to save the link.
- **Viewer joins mid-reveal**: on load, the viewer fetches current state (all picks revealed so far, plus league status) before subscribing to the realtime channel, so latecomers see full history rather than only future events.
- **Commissioner closes their tab mid-draft**: all state lives in Postgres, not the browser. Reopening the commissioner link resumes exactly where they left off.

## Testing

- Unit tests for the weighted-draw algorithm: run many simulated draws at known weights and assert observed slot-1 frequency roughly matches the expected odds.
- Integration test for the reveal-index race condition: fire concurrent "reveal next" calls and assert exactly one advances the index.
- Manual/E2E pass on the full live flow: create league → set weights → start draft → reveal all picks → verify the commissioner and viewer views agree on the final order.

## Deferred (v2+)

These are out of scope for v1, but the data model is designed not to require a rewrite when they're added:

- **Horse race reveal mode** — a different animated front-end over the same `reveal_order` data. No schema changes needed.
- **Pick-your-slot mode** — instead of the lottery directly assigning a slot, it determines a *selection order*; each team then actively picks their preferred remaining draft slot live, in turn. This needs additional schema (an "available slots" set that shrinks as picks are made) and a real interactive turn/lock mechanism, not just a reveal — a solid v2 candidate once v1 is proven out.

## Explicitly out of scope

- User accounts / login of any kind.
- Cross-season history or league reuse — every league is a one-off event.
- Notifications (email/SMS) — link distribution is manual, via however the commissioner normally reaches the group (group chat, email, etc.).
