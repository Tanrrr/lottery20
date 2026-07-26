# Reveal Pageantry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn each pick reveal in the live draft into a short suspense moment (a bingo-drum ball animation with sound) instead of an instant text update, played in sync for the commissioner and every viewer.

**Architecture:** A single shared `RevealAnimation` component (CSS-keyframe driven, no JS animation loop) is mounted by both the commissioner's `LiveDraftView` and the public `/watch/[viewerToken]` page whenever a new pick arrives. Each page defers appending that pick to its visible list until the animation's `onComplete` callback fires. No backend, database, or API changes — this is presentation-only, layered on the existing v1 reveal flow.

**Tech Stack:** Next.js (App Router, TypeScript), CSS Modules (new to this codebase — first use), Vitest + React Testing Library, Playwright.

## Global Constraints

- No database, API route, or lottery-algorithm changes (spec, "What does NOT change").
- The animation plays for every pick, every time, on both the commissioner's view and the viewer's view (spec, "Reveal sequence").
- Animation duration is fixed (~2-3s) and not per-league configurable (spec, "What does NOT change").
- Sound file path: `public/sounds/reveal-suspense.mp3`, provided by the user — code must reference it by a stable path so dropping in the real file requires no code changes (spec, "Sound").
- The viewer page must show a one-time "tap to enable sound" prompt before its first animation, since browsers block un-primed audio; the commissioner's own click already satisfies the browser's interaction requirement, so no prompt is needed there (spec, "Sound").
- Every object/array update remains immutable — spread copies, never in-place mutation (existing project-wide rule).

---

## File Structure

```
lib/
  constants.ts                     # + REVEAL_ANIMATION_MS, REVEAL_SOUND_SRC
vitest.setup.ts                    # new — stubs HTMLMediaElement.play/pause for jsdom
vitest.config.ts                   # + setupFiles

components/
  RevealAnimation.tsx              # new — the shared drum/ball/sound component
  RevealAnimation.module.css       # new — keyframe animations
  RevealAnimation.test.tsx         # new

app/
  league/[commissionerToken]/manage/page.tsx        # LiveDraftView: defer reveal-list append behind the animation
  league/[commissionerToken]/manage/page.test.tsx    # + 1 new test
  watch/[viewerToken]/page.tsx                       # defer append behind animation; add sound-enable prompt
  watch/[viewerToken]/page.test.tsx                  # + 2 new tests

e2e/
  full-draft-flow.spec.ts          # unchanged (verified compatible, see Task 5)
playwright.config.ts               # + top-level test timeout headroom
```

---

### Task 1: Shared constants and audio test setup

**Files:**
- Modify: `lib/constants.ts`
- Create: `vitest.setup.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Produces: `REVEAL_ANIMATION_MS` (number, `2600`), `REVEAL_SOUND_SRC` (string, `/sounds/reveal-suspense.mp3`) — imported by `RevealAnimation.tsx` (Task 2) and its tests.
- Produces: a global jsdom stub for `HTMLMediaElement.prototype.play`/`.pause` so any test that renders `<audio>` doesn't hit jsdom's "not implemented" console noise — consumed by every test file that renders `RevealAnimation` (Tasks 2-4).

This is pure setup with no branching logic, so no dedicated test — correctness is verified by every later task's tests running cleanly against it.

- [ ] **Step 1: Add the constants**

Open `lib/constants.ts` and add these two lines to the existing file (keep all existing exports as-is):
```typescript
export const REVEAL_ANIMATION_MS = 2600
export const REVEAL_SOUND_SRC = '/sounds/reveal-suspense.mp3'
```

- [ ] **Step 2: Create the Vitest setup file**

Create `vitest.setup.ts`:
```typescript
// jsdom does not implement HTMLMediaElement playback. Without this stub,
// calling .play()/.pause() on an <audio> element logs a noisy "not
// implemented" error to the console during tests and, in some jsdom
// versions, returns undefined instead of a Promise.
if (typeof window !== 'undefined') {
  window.HTMLMediaElement.prototype.play = () => Promise.resolve()
  window.HTMLMediaElement.prototype.pause = () => {}
}
```

- [ ] **Step 3: Wire the setup file into Vitest**

Modify `vitest.config.ts` — add `setupFiles` to the `test` block:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['**/node_modules/**', '**/*.integration.test.ts', 'e2e/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
```

- [ ] **Step 4: Verify nothing broke**

Run: `npm test`
Expected: all existing tests still pass (76/76 at time of writing), same as before this change — this step only adds new exports and a no-op-for-existing-tests setup file.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/constants.ts vitest.setup.ts vitest.config.ts
git commit -m "feat: add reveal animation constants and audio test setup"
```

---

### Task 2: RevealAnimation component

**Files:**
- Create: `components/RevealAnimation.tsx`
- Create: `components/RevealAnimation.module.css`
- Test: `components/RevealAnimation.test.tsx`

**Interfaces:**
- Consumes: `REVEAL_ANIMATION_MS`, `REVEAL_SOUND_SRC` from `lib/constants.ts` (Task 1).
- Produces: `RevealAnimation` (default export), a React component with props `{ pick: { slot: number; teamName: string }; onComplete: () => void }`. Renders a self-contained bingo-drum animation + `<audio>` element, and calls `onComplete` exactly once, `REVEAL_ANIMATION_MS` milliseconds after mount. Consumed by `LiveDraftView` (Task 3) and the viewer page (Task 4), which should give it a fresh `key` per pick (e.g. `key={pick.slot}`) so remounting restarts the CSS animations for each new reveal.

- [ ] **Step 1: Write the failing tests**

Create `components/RevealAnimation.test.tsx`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import RevealAnimation from './RevealAnimation'
import { REVEAL_ANIMATION_MS, REVEAL_SOUND_SRC } from '@/lib/constants'

describe('RevealAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the slot and team name', () => {
    render(<RevealAnimation pick={{ slot: 6, teamName: 'Chaos Muppets' }} onComplete={() => {}} />)
    expect(screen.getByText(/slot 6/i)).toBeInTheDocument()
    expect(screen.getByText(/chaos muppets/i)).toBeInTheDocument()
  })

  it('renders an audio element with the configured sound source', () => {
    const { container } = render(
      <RevealAnimation pick={{ slot: 6, teamName: 'Chaos Muppets' }} onComplete={() => {}} />
    )
    const audio = container.querySelector('audio')
    expect(audio).toHaveAttribute('src', REVEAL_SOUND_SRC)
  })

  it('does not call onComplete before the animation duration elapses', () => {
    const onComplete = vi.fn()
    render(<RevealAnimation pick={{ slot: 6, teamName: 'Chaos Muppets' }} onComplete={onComplete} />)

    vi.advanceTimersByTime(REVEAL_ANIMATION_MS - 100)

    expect(onComplete).not.toHaveBeenCalled()
  })

  it('calls onComplete exactly once after the animation duration elapses', () => {
    const onComplete = vi.fn()
    render(<RevealAnimation pick={{ slot: 6, teamName: 'Chaos Muppets' }} onComplete={onComplete} />)

    vi.advanceTimersByTime(REVEAL_ANIMATION_MS)

    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- RevealAnimation`
Expected: FAIL — `Cannot find module './RevealAnimation'`.

- [ ] **Step 3: Create the CSS module**

Create `components/RevealAnimation.module.css`:
```css
/* Keyframe timings here are hand-tuned to match REVEAL_ANIMATION_MS (2600ms)
   in lib/constants.ts. If you change one, change the other. */

.stage {
  position: relative;
  height: 220px;
  border-radius: 12px;
  background: radial-gradient(circle at 50% 30%, #1e293b, #0f172a);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drum {
  position: relative;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  border: 4px solid #475569;
  background: rgba(255, 255, 255, 0.03);
}

.ball {
  position: absolute;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: linear-gradient(145deg, #fbbf24, #d97706);
  box-shadow:
    inset -3px -3px 4px rgba(0, 0, 0, 0.3),
    0 0 6px rgba(0, 0, 0, 0.4);
  animation-duration: 1.2s;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}
.ball:nth-child(1) { animation-name: tumble1; }
.ball:nth-child(2) { animation-name: tumble2; }
.ball:nth-child(3) { animation-name: tumble3; }
.ball:nth-child(4) { animation-name: tumble4; }

@keyframes tumble1 {
  0%   { transform: translate(20px, 10px); opacity: 1; }
  25%  { transform: translate(90px, 40px); }
  50%  { transform: translate(50px, 110px); }
  75%  { transform: translate(110px, 80px); }
  100% { transform: translate(20px, 10px); opacity: 0; }
}
@keyframes tumble2 {
  0%   { transform: translate(100px, 90px); opacity: 1; }
  25%  { transform: translate(30px, 60px); }
  50%  { transform: translate(110px, 20px); }
  75%  { transform: translate(60px, 110px); }
  100% { transform: translate(100px, 90px); opacity: 0; }
}
@keyframes tumble3 {
  0%   { transform: translate(60px, 100px); opacity: 1; }
  25%  { transform: translate(110px, 60px); }
  50%  { transform: translate(20px, 30px); }
  75%  { transform: translate(80px, 20px); }
  100% { transform: translate(60px, 100px); opacity: 0; }
}
@keyframes tumble4 {
  0%   { transform: translate(70px, 20px); opacity: 1; }
  25%  { transform: translate(20px, 90px); }
  50%  { transform: translate(90px, 110px); }
  75%  { transform: translate(30px, 50px); }
  100% { transform: translate(70px, 20px); opacity: 0; }
}

.winnerBall {
  position: absolute;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: linear-gradient(145deg, #fbbf24, #d97706);
  opacity: 0;
  animation: winner-pop 1s ease-out 1.2s forwards;
}
@keyframes winner-pop {
  0%   { opacity: 1; width: 26px; height: 26px; transform: translate(60px, 60px) scale(1); }
  100% { opacity: 1; width: 90px; height: 90px; transform: translate(-8px, -8px) scale(1); }
}

.resultText {
  position: absolute;
  color: #fff;
  font-weight: 800;
  font-size: 1.1rem;
  text-align: center;
  text-shadow: 0 0 12px rgba(250, 204, 21, 0.8);
  opacity: 0;
  animation: fade-in 0.4s ease-out 2.2s forwards;
}
@keyframes fade-in {
  to { opacity: 1; }
}
```

- [ ] **Step 4: Implement the component**

Create `components/RevealAnimation.tsx`:
```tsx
'use client'

import { useEffect, useRef } from 'react'
import { REVEAL_ANIMATION_MS, REVEAL_SOUND_SRC } from '@/lib/constants'
import styles from './RevealAnimation.module.css'

export interface RevealAnimationPick {
  slot: number
  teamName: string
}

interface RevealAnimationProps {
  pick: RevealAnimationPick
  onComplete: () => void
}

export default function RevealAnimation({ pick, onComplete }: RevealAnimationProps) {
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const playResult = audioRef.current?.play()
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch(() => {
        // Browser blocked autoplay (e.g. viewer hasn't tapped "enable sound"
        // yet). The animation still plays without sound — see design spec.
      })
    }

    const timer = setTimeout(onComplete, REVEAL_ANIMATION_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={styles.stage}>
      <audio ref={audioRef} src={REVEAL_SOUND_SRC} />
      <div className={styles.drum}>
        <div className={styles.ball} />
        <div className={styles.ball} />
        <div className={styles.ball} />
        <div className={styles.ball} />
        <div className={styles.winnerBall} />
        <div className={styles.resultText}>
          Slot {pick.slot} — {pick.teamName}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm test -- RevealAnimation`
Expected: PASS (4 tests).

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors from either command.

- [ ] **Step 7: Commit**

```bash
git add components/RevealAnimation.tsx components/RevealAnimation.module.css components/RevealAnimation.test.tsx
git commit -m "feat: add RevealAnimation component"
```

---

### Task 3: Wire RevealAnimation into the commissioner's live-draft view

**Files:**
- Modify: `app/league/[commissionerToken]/manage/page.tsx`
- Modify: `app/league/[commissionerToken]/manage/page.test.tsx`

**Interfaces:**
- Consumes: `RevealAnimation` (Task 2) with props `{ pick: { slot: number; teamName: string }, onComplete: () => void }`.

The `LiveDraftView` function in this file currently appends a revealed pick to its `revealed` list and updates `status` immediately inside `revealNext()`. This task inserts an animation step in between: the pick becomes `pendingPick` first, the "Reveal Next Pick" button disables while it's set, and the pick only joins the visible `revealed` list once `RevealAnimation` calls back.

- [ ] **Step 1: Write the failing test**

Add this test to the `describe('Commissioner manage page (live)', ...)` block in `app/league/[commissionerToken]/manage/page.test.tsx` (the existing `beforeEach` in that block already mocks a 1-team league whose `/reveal` call returns `{ teamId: 't1', teamName: 'Team A', slot: 1, status: 'complete' }` — reuse it as-is):
```typescript
  it('disables Reveal Next Pick while the reveal animation is playing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    render(<Page />)
    await waitFor(() => screen.getByRole('button', { name: /reveal next pick/i }))

    fireEvent.click(screen.getByRole('button', { name: /reveal next pick/i }))

    await waitFor(() => expect(screen.getByRole('button', { name: /reveal next pick/i })).toBeDisabled())

    vi.advanceTimersByTime(3000)

    // Status resolves to 'complete' in this fixture, so the button disappears
    // entirely once the animation finishes rather than re-enabling.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /reveal next pick/i })).not.toBeInTheDocument()
    )

    vi.useRealTimers()
  })
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test -- "app/league/\[commissionerToken\]/manage/page.test.tsx"`
Expected: FAIL — the button is never disabled today (reveal completes synchronously with no animation gate), so the first `waitFor` times out.

- [ ] **Step 3: Update the implementation**

In `app/league/[commissionerToken]/manage/page.tsx`, modify the `LiveDraftView` function (currently lines 194-263). Replace the whole function with:
```tsx
function LiveDraftView({
  commissionerToken,
  league,
  teams,
}: {
  commissionerToken: string
  league: League
  teams: Team[]
}) {
  const teamsById = new Map(teams.map((t) => [t.id, t]))
  const computeInitialRevealed = () => {
    if (!league.revealOrder || league.revealedCount === 0) return []
    return league.revealOrder.slice(0, league.revealedCount).map((teamId, index) => {
      const totalTeams = league.revealOrder!.length
      return {
        teamId,
        teamName: teamsById.get(teamId)?.name ?? 'Unknown team',
        slot: totalTeams - index,
      }
    })
  }

  const [revealed, setRevealed] = useState<{ teamId: string; teamName: string; slot: number }[]>(
    computeInitialRevealed
  )
  const [pendingPick, setPendingPick] = useState<{ teamId: string; teamName: string; slot: number } | null>(
    null
  )
  const [status, setStatus] = useState(league.status)
  const [error, setError] = useState<string | null>(null)

  async function revealNext() {
    setError(null)
    try {
      const response = await fetch(`/api/leagues/${commissionerToken}/reveal`, {
        method: 'POST',
        body: JSON.stringify({ expectedRevealedCount: revealed.length }),
      })
      const body = await response.json()
      if (!body.success) {
        setError(body.error || 'Failed to reveal pick')
        return
      }
      setPendingPick({ teamId: body.data.teamId, teamName: body.data.teamName, slot: body.data.slot })
      setStatus(body.data.status)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reveal pick'
      setError(message)
    }
  }

  function handleAnimationComplete() {
    if (!pendingPick) return
    setRevealed((prev) => [...prev, pendingPick])
    setPendingPick(null)
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">{league.name}</h1>
      <div className="mt-6 flex flex-col gap-2">
        {revealed.map((pick, i) => (
          <div key={i} className="border rounded px-4 py-2">
            Slot {pick.slot} — {pick.teamName}
          </div>
        ))}
      </div>
      {pendingPick && <RevealAnimation key={pendingPick.slot} pick={pendingPick} onComplete={handleAnimationComplete} />}
      {status !== 'complete' && (
        <button
          onClick={revealNext}
          disabled={pendingPick !== null}
          className="mt-4 bg-black text-white rounded px-4 py-2 disabled:opacity-50"
        >
          Reveal Next Pick
        </button>
      )}
      {error && <p className="mt-3 text-red-600">{error}</p>}
    </main>
  )
}
```

Add the import at the top of the file, alongside the existing imports:
```tsx
import RevealAnimation from '@/components/RevealAnimation'
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test -- "app/league/\[commissionerToken\]/manage/page.test.tsx"`
Expected: PASS (all tests in the file, including the new one — 13 total).

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/league/[commissionerToken]/manage/page.tsx" "app/league/[commissionerToken]/manage/page.test.tsx"
git commit -m "feat: play reveal animation before showing picks on commissioner view"
```

---

### Task 4: Wire RevealAnimation into the viewer page, with a sound-enable prompt

**Files:**
- Modify: `app/watch/[viewerToken]/page.tsx`
- Modify: `app/watch/[viewerToken]/page.test.tsx`

**Interfaces:**
- Consumes: `RevealAnimation` (Task 2), `REVEAL_SOUND_SRC` (Task 1).

Only NEW picks arriving via the realtime subscription go through the animation — picks already revealed before the viewer loaded the page (returned by the initial `GET /api/view/[viewerToken]` fetch) render immediately as history, unchanged from today. This task also adds a one-time "tap to enable sound" banner, since a viewer who hasn't interacted with the page yet would have their first reveal's audio silently blocked by the browser.

- [ ] **Step 1: Write the failing tests**

Add these two tests to `app/watch/[viewerToken]/page.test.tsx` (inside the existing `describe('Viewer page', ...)` block, using the file's existing `beforeEach` mock and the existing `capturedOnReveal`/`subscribeToReveals` mock pattern already in the file):
```typescript
  it('shows a tap-to-enable-sound prompt before the first interaction', async () => {
    render(<Page />)
    await waitFor(() => expect(screen.getByRole('button', { name: /enable sound/i })).toBeInTheDocument())
  })

  it('hides the sound prompt and does not block the reveal animation after tapping it', async () => {
    render(<Page />)
    const enableButton = await waitFor(() => screen.getByRole('button', { name: /enable sound/i }))

    fireEvent.click(enableButton)

    await waitFor(() => expect(screen.queryByRole('button', { name: /enable sound/i })).not.toBeInTheDocument())
  })
```

Also add this test verifying the deferred-append behavior for realtime picks (same block). Note: `RevealAnimation` renders its "Slot N — Team" text immediately on mount (only its CSS opacity fades in — jsdom/testing-library queries don't care about opacity), so a plain presence/absence assertion can't distinguish "animating" from "settled." What deferring the append actually guarantees is that the pick's text appears from exactly ONE element at a time — the animation's, then (after it completes and unmounts) the settled list's — never both at once. Test that count-based guarantee:
```typescript
  it('does not duplicate a pick between its animation and the settled list', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Page />)
    await waitFor(() => expect(capturedOnReveal).not.toBeNull())

    act(() => {
      capturedOnReveal!({ teamId: 't2', teamName: 'Team B', slot: 5, status: 'live' })
    })

    // While the animation plays, exactly one "Slot 5 — Team B" node exists
    // (rendered by RevealAnimation) — not a second one from the settled list.
    await waitFor(() => expect(screen.getAllByText(/^Slot 5 —.*Team B/)).toHaveLength(1))

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    // After the animation completes and unmounts, still exactly one — now
    // rendered by the settled list instead.
    await waitFor(() => expect(screen.getAllByText(/^Slot 5 —.*Team B/)).toHaveLength(1))

    vi.useRealTimers()
  })
```

Check the top of the existing test file for its current `import` list — it already imports `act` from `@testing-library/react` (used by the existing `appends a new pick when a realtime broadcast arrives` test); if it doesn't, add `act` to that import.

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npm test -- "app/watch/\[viewerToken\]/page.test.tsx"`
Expected: FAIL — no "enable sound" button exists yet, and `RevealAnimation` isn't wired in at all yet, so the realtime handler still appends directly to the settled list with no separate animating element for `getAllByText` to find.

- [ ] **Step 3: Update the implementation**

Replace the full contents of `app/watch/[viewerToken]/page.tsx`:
```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { subscribeToReveals } from '@/lib/realtimeClient'
import RevealAnimation from '@/components/RevealAnimation'
import { REVEAL_SOUND_SRC } from '@/lib/constants'
import type { PublicLeagueState } from '@/lib/types'

interface PendingPick {
  teamId: string
  teamName: string
  slot: number
  status: PublicLeagueState['status']
}

export default function Page() {
  const { viewerToken } = useParams<{ viewerToken: string }>()
  const [state, setState] = useState<PublicLeagueState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingPick, setPendingPick] = useState<PendingPick | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const primerRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    let cancelled = false

    async function loadLeague() {
      try {
        const response = await fetch(`/api/view/${viewerToken}`)
        const body = await response.json()
        if (cancelled) return
        if (body.success) {
          setState(body.data)
        } else {
          setError(body.error || 'Failed to load league')
        }
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to load league'
        setError(message)
      }
    }
    loadLeague()

    return () => {
      cancelled = true
    }
  }, [viewerToken])

  useEffect(() => {
    if (!state || state.status === 'complete') return
    return subscribeToReveals(viewerToken, (payload) => {
      setPendingPick({
        teamId: payload.teamId,
        teamName: payload.teamName,
        slot: payload.slot,
        status: payload.status,
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerToken, state?.status])

  function handleAnimationComplete() {
    if (!pendingPick) return
    setState((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        status: pendingPick.status,
        revealed: [...prev.revealed, { teamId: pendingPick.teamId, teamName: pendingPick.teamName, slot: pendingPick.slot }],
      }
    })
    setPendingPick(null)
  }

  function enableSound() {
    const audio = primerRef.current
    if (audio) {
      audio
        .play()
        .then(() => audio.pause())
        .catch(() => {})
    }
    setSoundEnabled(true)
  }

  if (error && !state) {
    return (
      <main className="p-8">
        <p className="text-red-600">{error}</p>
      </main>
    )
  }

  if (!state) return <main className="p-8">Loading...</main>

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">{state.name}</h1>
      <p className="text-sm text-gray-600">{state.teamCount} teams &middot; {state.status}</p>
      {!soundEnabled && (
        <button
          onClick={enableSound}
          className="mt-3 border rounded px-4 py-2 text-sm"
        >
          🔊 Tap to enable sound
        </button>
      )}
      <audio ref={primerRef} src={REVEAL_SOUND_SRC} />
      <div className="mt-6 flex flex-col gap-2">
        {state.revealed.map((pick, i) => (
          <div key={i} className="border rounded px-4 py-2 animate-in fade-in">
            Slot {pick.slot} — {pick.teamName}
          </div>
        ))}
      </div>
      {pendingPick && (
        <RevealAnimation
          key={pendingPick.slot}
          pick={{ slot: pendingPick.slot, teamName: pendingPick.teamName }}
          onComplete={handleAnimationComplete}
        />
      )}
    </main>
  )
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npm test -- "app/watch/\[viewerToken\]/page.test.tsx"`
Expected: PASS (all tests in the file, including the 3 new ones).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all test files pass (76 previous + 4 new from Task 2 + 1 new from Task 3 + 3 new from this task = 84 total).

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "app/watch/[viewerToken]/page.tsx" "app/watch/[viewerToken]/page.test.tsx"
git commit -m "feat: play reveal animation and add sound-enable prompt on viewer page"
```

---

### Task 5: Verify the E2E test against the new animation delay

**Files:**
- Modify: `playwright.config.ts`

**Interfaces:**
- Consumes: nothing new — this task verifies `e2e/full-draft-flow.spec.ts` (unchanged) still passes against the real app with the animation in place, and gives it more wall-clock headroom.

Each of the 6 reveals in the E2E test now takes an additional ~2.6s locally before its animation completes. The existing assertions (`page.locator('text=/^Slot \\d+/')`) match text rendered by `RevealAnimation` itself during the animation just as well as text rendered by the settled list afterward — the count stays correct throughout the transition, so **no assertion changes are expected to be necessary**. The real risk is the Playwright test-level timeout (default 30s), which didn't need to budget for ~15s+ of animation time before this feature. Add explicit headroom.

- [ ] **Step 1: Add a top-level test timeout**

Modify `playwright.config.ts`:
```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  use: { baseURL: 'http://localhost:3000' },
})
```

- [ ] **Step 2: Run the E2E test for real**

Run: `npm run test:e2e`
Expected: PASS (1 test). This hits the real dev server and real Supabase project (same as when this test was first built) — requires `.env.local` to be populated. If any assertion in `e2e/full-draft-flow.spec.ts` fails because of the new animation timing (contrary to the analysis above), update that specific assertion's locator/timeout — do not remove or weaken the final order-comparison check.

- [ ] **Step 3: Commit**

```bash
git add playwright.config.ts
git commit -m "test: give E2E test more time budget for the reveal animation"
```

---

### Task 6: Drop in the real sound file

**Files:**
- Create: `public/sounds/reveal-suspense.mp3` (provided by the user, not generated)

**Interfaces:**
- Consumes: nothing — this is an asset drop, not code.

- [ ] **Step 1: Add the file**

Place the user-provided audio file at `public/sounds/reveal-suspense.mp3` (must match `REVEAL_SOUND_SRC` from `lib/constants.ts` exactly — same filename, same `public/sounds/` directory). If the provided file has a different extension (e.g. `.wav`), either convert it to `.mp3` for broad browser support, or update `REVEAL_SOUND_SRC` in `lib/constants.ts` to match the actual filename — don't leave the two inconsistent.

- [ ] **Step 2: Manually verify**

Run `npm run dev`, open a league's viewer page, tap "Enable sound," open the commissioner's manage page in another tab, start a draft, and reveal a pick. Confirm the sound plays alongside the animation on both tabs.

- [ ] **Step 3: Commit**

```bash
git add public/sounds/reveal-suspense.mp3
git commit -m "chore: add reveal suspense sound file"
```
