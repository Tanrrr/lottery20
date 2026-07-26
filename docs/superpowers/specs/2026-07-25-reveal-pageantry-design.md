# Reveal Pageantry (Ball Animation + Suspense Sound) — Design

## Overview

Make each pick reveal in the live draft feel like a real event instead of an instant text update. Every "Reveal Next Pick" moment plays a short suspense animation (a bingo-drum of tumbling balls) with a countdown sound, before the slot/team name appears. This plays identically for the commissioner and for everyone watching via the viewer link.

This is a frontend-only enhancement layered on top of the existing v1 reveal flow (spec: `docs/superpowers/specs/2026-07-20-fantasy-draft-lottery-design.md`). The underlying lottery result, API routes, database schema, and realtime broadcast are unchanged — the pick is already decided the instant the data arrives; the animation is presentation only, not a delay on the actual logic.

## Reveal sequence

Today, clicking "Reveal Next Pick" shows the result immediately. With this feature:

1. Commissioner clicks "Reveal Next Pick" (unchanged trigger, unchanged API call).
2. The pick data arrives as it does today — instantly via the API response for the commissioner, via the existing Supabase Realtime broadcast for everyone else.
3. Instead of rendering the result immediately, the receiving screen plays a fixed-duration (~2-3 second) suspense sequence: balls jitter around inside a drum, the countdown sound plays, one ball "pops" out and grows, and the slot/team name fades in.
4. This happens for every pick, every time — not just a subset.

Both the commissioner's live-draft view and the viewer page trigger this sequence independently the moment their own copy of the pick data arrives. Since both already receive that data within a sub-second window of each other (API response vs. realtime broadcast), and both play the identical fixed-duration animation, everyone stays close enough in sync for a shared group-viewing moment. No new server-side synchronization is needed.

## Animation

A bingo-drum style animation, confirmed via an interactive CSS prototype during design:

- A circular "drum" contains a handful of balls that jitter/tumble in place using CSS keyframe animations (~1-1.5s).
- One ball then "pops" out of the drum and scales up to become the reveal moment.
- The slot number and team name fade in over/after the popped ball.
- The whole sequence is deterministic in duration — no dependency on real game state (the balls are decorative, not literal representations of remaining teams/slots).

Implemented as a single shared component (e.g. `components/RevealAnimation.tsx`) used by both the commissioner's `LiveDraftView` and the viewer's `/watch/[viewerToken]` page, so the animation markup/CSS lives in exactly one place rather than being duplicated across the two pages. It accepts the revealed pick (slot + team name) and calls back when the sequence completes, so each page's existing "append to revealed list" logic runs after the animation instead of immediately.

## Sound

- The commissioner will provide an audio file, dropped directly into `public/sounds/` (e.g. `public/sounds/reveal-suspense.mp3`).
- Played via a plain HTML `<audio>` element synced to the animation's start — no new npm dependency required.
- **Autoplay constraint:** browsers block audio playback until the user has interacted with the page. The commissioner's own "Reveal Next Pick" click satisfies this automatically. A viewer who opens the link cold has not interacted yet, so their first reveal's sound would be silently blocked by the browser.
  - Fix: the viewer page shows a one-time "🔊 Tap to enable sound" prompt on load (before any reveal happens). Tapping it plays and immediately pauses/resets a silent primer, which satisfies the browser's interaction requirement for the rest of the session. If the viewer never taps it, the animation still plays — just without sound — so nothing is blocked or broken, only quieter.

## What does NOT change

- No database schema changes.
- No API route changes.
- No changes to the lottery algorithm or reveal-order computation.
- No new per-league configuration — the animation and sound are fixed/global for now, not a commissioner-configurable setting. (If a future league wants a different style, that would be a separate follow-up, not part of this design.)

## Testing

- Component test for `RevealAnimation`: given a revealed pick, it renders the sequence and calls its completion callback after the expected duration (using fake timers, not real waits).
- Component test confirming the commissioner's and viewer's existing "append to revealed list" behavior now happens after the animation completes, not immediately on data arrival (i.e., the list doesn't update until the callback fires).
- Component test for the viewer's "tap to enable sound" prompt: appears on load, dismisses on tap, and the reveal sequence still works (visually) whether or not it was tapped.
- No new backend/API/integration tests needed, since no server-side behavior changes.

## Assets

- `public/sounds/reveal-suspense.mp3` (or equivalent format) — to be provided by the user and dropped into place before/during implementation. Implementation should reference it by a stable path so dropping in the real file requires no code changes.
