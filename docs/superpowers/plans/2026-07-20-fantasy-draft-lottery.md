# Fantasy Draft Lottery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a link-based website where a commissioner sets up a fantasy football league (6-32 teams), configures a random or custom-weighted lottery, and runs a live draw where picks reveal bottom-up in real time to anyone watching via a shared link.

**Architecture:** Next.js (App Router) deployed on Vercel, with Supabase for Postgres (source of truth) and Realtime (broadcast channel for the live reveal). All database access goes through a `LeagueRepository` interface — a Supabase-backed implementation in production, an in-memory fake in tests — so business logic in `leagueService.ts` is fully unit-testable without a live database. API routes are thin wrappers around `leagueService`.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Tailwind CSS, Supabase (`@supabase/supabase-js`), Zod, Vitest + React Testing Library (unit/component), Playwright (E2E), npm.

## Global Constraints

- Team count per league: **6-32** (spec, "Overview").
- No user accounts/login anywhere — access is via commissioner token and viewer token only (spec, "Architecture").
- Leagues are one-off/ephemeral — no cross-season history (spec, "Explicitly out of scope").
- `reveal_order` is computed once, server-side, at "Start Draft" time and never recomputed (spec, "Data model").
- Reveal is bottom-up: first reveal = worst slot (highest slot number), last reveal = slot 1 (spec, "Live draw / reveal flow").
- Weighted mode requires every team to have a weight ≥ 1 before the draft can start (spec, "Commissioner setup flow").
- `current_reveal_index` must advance atomically — no duplicate or skipped slots under concurrent requests (spec, "Error handling & edge cases").
- All state changes go through the Next.js server (service-role Supabase key never reaches the browser); the browser only ever holds the public anon key, used solely to subscribe to the realtime broadcast channel.
- Every object/array is treated as immutable — functions return new copies, never mutate arguments in place (user global rule, coding-style.md).
- Data access goes through a Repository interface, not ad-hoc queries scattered through route handlers (user global rule, patterns.md "Repository Pattern").
- Every API response uses a consistent `{success, data, error}` envelope (user global rule, patterns.md "API Response Format").
- All user input is validated at the API boundary with Zod schemas before touching business logic (user global rule, coding-style.md "Input Validation").
- Minimum 80% test coverage across unit, integration, and E2E tests; TDD (RED → GREEN → REFACTOR) for every non-trivial function (user global rule, testing.md).
- All mutating API routes are rate-limited (user global rule, security.md).
- Files stay small and single-purpose (200-400 lines typical, 800 max) (user global rule, coding-style.md).

---

## File Structure

```
lib/
  constants.ts          # MIN_TEAMS, MAX_TEAMS, MIN_WEIGHT, RATE_LIMIT_*
  types.ts              # Shared domain types (League, Team, DraftResult, LotteryMode, LeagueStatus)
  apiResponse.ts         # ApiResponse<T> envelope + helpers
  tokens.ts             # generateToken()
  lottery.ts            # randomOrder(), weightedOrder(), toRevealSequence()
  validation.ts          # Zod schemas for API inputs
  repository.ts          # LeagueRepository interface + domain errors
  repository.memory.ts   # In-memory fake implementing LeagueRepository
  repository.supabase.ts # Supabase-backed implementation of LeagueRepository
  rateLimit.ts           # checkRateLimit() backed by LeagueRepository's rate-limit methods
  leagueService.ts        # Business logic: createLeague, replaceTeams, startDraft, revealNext, getCommissionerView, getViewerState
  realtime.ts             # Server-side broadcast helper
  realtimeClient.ts       # Browser-side subscribe helper
  supabaseAdmin.ts        # Server-only Supabase client (service role key)
  supabaseBrowser.ts      # Browser Supabase client (anon key)

supabase/
  migrations/0001_init.sql

app/
  page.tsx                                       # Create-league landing page
  page.test.tsx
  league/[commissionerToken]/manage/page.tsx      # Commissioner control panel
  league/[commissionerToken]/manage/page.test.tsx
  watch/[viewerToken]/page.tsx                    # Viewer page
  watch/[viewerToken]/page.test.tsx
  api/leagues/route.ts                            # POST create league
  api/leagues/route.test.ts
  api/leagues/[commissionerToken]/route.ts        # GET commissioner view
  api/leagues/[commissionerToken]/route.test.ts
  api/leagues/[commissionerToken]/teams/route.ts  # PUT replace teams
  api/leagues/[commissionerToken]/teams/route.test.ts
  api/leagues/[commissionerToken]/start/route.ts  # POST start draft
  api/leagues/[commissionerToken]/start/route.test.ts
  api/leagues/[commissionerToken]/reveal/route.ts # POST reveal next pick
  api/leagues/[commissionerToken]/reveal/route.test.ts
  api/view/[viewerToken]/route.ts                 # GET public state
  api/view/[viewerToken]/route.test.ts

e2e/
  full-draft-flow.spec.ts
```

---

### Task 1: Project scaffold

**Files:**
- Create: entire Next.js project at repo root (via `create-next-app`)
- Create: `vitest.config.ts`
- Create: `lib/sanity.ts`
- Test: `lib/sanity.test.ts`

**Interfaces:**
- Produces: a working Next.js + TypeScript + Tailwind app, with Vitest wired up to run `*.test.ts`/`*.test.tsx` files.

- [ ] **Step 1: Scaffold Next.js**

Run:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm
```
Expected: project files created (`app/`, `package.json`, `tsconfig.json`, etc.) alongside the existing `docs/` and `.git/`.

- [ ] **Step 2: Install test & data dependencies**

Run:
```bash
npm install @supabase/supabase-js zod
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @playwright/test
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a failing sanity test**

Create `lib/sanity.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { ping } from './sanity'

describe('ping', () => {
  it('returns pong', () => {
    expect(ping()).toBe('pong')
  })
})
```

- [ ] **Step 5: Run test, verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './sanity'` (or similar).

- [ ] **Step 6: Implement**

Create `lib/sanity.ts`:
```typescript
export function ping(): string {
  return 'pong'
}
```

- [ ] **Step 7: Run test, verify it passes**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest"
```

---

### Task 2: Shared constants and domain types

**Files:**
- Create: `lib/constants.ts`
- Create: `lib/types.ts`

**Interfaces:**
- Produces: `MIN_TEAMS`, `MAX_TEAMS`, `MIN_WEIGHT`, `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS` constants; `LotteryMode = 'random' | 'weighted'`; `LeagueStatus = 'setup' | 'live' | 'complete'`; `Team`, `League`, `DraftResult`, `LeagueWithTeams`, `PublicLeagueState` types used by every later task.

These are plain constant/type declarations with no branching logic, so no dedicated test — covered indirectly by every task that imports them.

- [ ] **Step 1: Create constants**

Create `lib/constants.ts`:
```typescript
export const MIN_TEAMS = 6
export const MAX_TEAMS = 32
export const MIN_WEIGHT = 1
export const RATE_LIMIT_MAX_REQUESTS = 30
export const RATE_LIMIT_WINDOW_MS = 60_000
```

- [ ] **Step 2: Create domain types**

Create `lib/types.ts`:
```typescript
export type LotteryMode = 'random' | 'weighted'
export type LeagueStatus = 'setup' | 'live' | 'complete'

export interface Team {
  id: string
  leagueId: string
  name: string
  weight: number | null
}

export interface League {
  id: string
  commissionerToken: string
  viewerToken: string
  name: string
  mode: LotteryMode
  status: LeagueStatus
  revealOrder: string[] | null // team ids, reveal sequence: index 0 = first revealed
  revealedCount: number
}

export interface DraftResult {
  leagueId: string
  teamId: string
  slot: number
}

export interface LeagueWithTeams {
  league: League
  teams: Team[]
}

export interface PublicLeagueState {
  name: string
  mode: LotteryMode
  status: LeagueStatus
  teamCount: number
  revealed: Array<{ teamId: string; teamName: string; slot: number }>
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/constants.ts lib/types.ts
git commit -m "feat: add shared constants and domain types"
```

---

### Task 3: API response envelope

**Files:**
- Create: `lib/apiResponse.ts`
- Test: `lib/apiResponse.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `ApiResponse<T> = { success: true; data: T } | { success: false; error: string }`, `ok<T>(data: T): ApiResponse<T>`, `fail(error: string): ApiResponse<never>`. Every route handler in later tasks wraps its response with these.

- [ ] **Step 1: Write failing tests**

Create `lib/apiResponse.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { ok, fail } from './apiResponse'

describe('ok', () => {
  it('wraps data in a success envelope', () => {
    expect(ok({ id: '1' })).toEqual({ success: true, data: { id: '1' } })
  })
})

describe('fail', () => {
  it('wraps a message in a failure envelope', () => {
    expect(fail('not found')).toEqual({ success: false, error: 'not found' })
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- apiResponse`
Expected: FAIL — `Cannot find module './apiResponse'`.

- [ ] **Step 3: Implement**

Create `lib/apiResponse.ts`:
```typescript
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data }
}

export function fail(error: string): ApiResponse<never> {
  return { success: false, error }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- apiResponse`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/apiResponse.ts lib/apiResponse.test.ts
git commit -m "feat: add API response envelope"
```

---

### Task 4: Secure token generator

**Files:**
- Create: `lib/tokens.ts`
- Test: `lib/tokens.test.ts`

**Interfaces:**
- Produces: `generateToken(): string` — a URL-safe, unguessable token used for both `commissionerToken` and `viewerToken`.

- [ ] **Step 1: Write failing tests**

Create `lib/tokens.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { generateToken } from './tokens'

describe('generateToken', () => {
  it('returns a URL-safe string of reasonable length', () => {
    const token = generateToken()
    expect(token.length).toBeGreaterThanOrEqual(20)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('returns a different value on each call', () => {
    const a = generateToken()
    const b = generateToken()
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- tokens`
Expected: FAIL — `Cannot find module './tokens'`.

- [ ] **Step 3: Implement**

Create `lib/tokens.ts`:
```typescript
import { randomBytes } from 'crypto'

export function generateToken(): string {
  return randomBytes(24).toString('base64url')
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- tokens`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tokens.ts lib/tokens.test.ts
git commit -m "feat: add secure token generator"
```

---

### Task 5: Lottery algorithm

**Files:**
- Create: `lib/lottery.ts`
- Test: `lib/lottery.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `randomOrder(teamIds: string[]): string[]` (slot-ascending: index 0 = slot 1 winner), `weightedOrder(teams: { id: string; weight: number }[]): string[]` (slot-ascending), `toRevealSequence(slotOrder: string[]): string[]` (reverses to bottom-up reveal order: index 0 = first revealed = worst slot).

- [ ] **Step 1: Write failing tests**

Create `lib/lottery.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { randomOrder, weightedOrder, toRevealSequence } from './lottery'

describe('randomOrder', () => {
  it('returns every team exactly once', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    const order = randomOrder(ids)
    expect(order).toHaveLength(6)
    expect(new Set(order)).toEqual(new Set(ids))
  })

  it('does not mutate the input array', () => {
    const ids = ['a', 'b', 'c']
    const copy = [...ids]
    randomOrder(ids)
    expect(ids).toEqual(copy)
  })
})

describe('weightedOrder', () => {
  it('returns every team exactly once', () => {
    const teams = [
      { id: 'a', weight: 10 },
      { id: 'b', weight: 5 },
      { id: 'c', weight: 1 },
    ]
    const order = weightedOrder(teams)
    expect(order).toHaveLength(3)
    expect(new Set(order)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('gives higher-weighted teams the top slot more often than lower-weighted teams', () => {
    const teams = [
      { id: 'heavy', weight: 90 },
      { id: 'light', weight: 10 },
    ]
    let heavyWonSlot1 = 0
    const trials = 2000
    for (let i = 0; i < trials; i++) {
      if (weightedOrder(teams)[0] === 'heavy') heavyWonSlot1++
    }
    // Expected ~90%; assert it's clearly weighted, not 50/50, with tolerance for randomness.
    expect(heavyWonSlot1 / trials).toBeGreaterThan(0.75)
  })

  it('does not mutate the input array', () => {
    const teams = [{ id: 'a', weight: 5 }, { id: 'b', weight: 5 }]
    const copy = teams.map((t) => ({ ...t }))
    weightedOrder(teams)
    expect(teams).toEqual(copy)
  })
})

describe('toRevealSequence', () => {
  it('reverses the slot order', () => {
    expect(toRevealSequence(['a', 'b', 'c'])).toEqual(['c', 'b', 'a'])
  })

  it('does not mutate the input array', () => {
    const slotOrder = ['a', 'b', 'c']
    const copy = [...slotOrder]
    toRevealSequence(slotOrder)
    expect(slotOrder).toEqual(copy)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- lottery`
Expected: FAIL — `Cannot find module './lottery'`.

- [ ] **Step 3: Implement**

Create `lib/lottery.ts`:
```typescript
/**
 * Fisher-Yates shuffle. Returns a new array; input is never mutated.
 * Index 0 = slot 1 winner.
 */
export function randomOrder(teamIds: string[]): string[] {
  const result = [...teamIds]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Weighted-random-without-replacement draw. Each draw picks one team from
 * the remaining weighted pool; higher weight = higher chance of an earlier
 * (better) slot. Index 0 = slot 1 winner. Input is never mutated.
 */
export function weightedOrder(teams: { id: string; weight: number }[]): string[] {
  const pool = teams.map((t) => ({ ...t }))
  const result: string[] = []

  while (pool.length > 0) {
    const totalWeight = pool.reduce((sum, t) => sum + t.weight, 0)
    let roll = Math.random() * totalWeight
    let winnerIndex = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i].weight
      if (roll <= 0) {
        winnerIndex = i
        break
      }
    }
    result.push(pool[winnerIndex].id)
    pool.splice(winnerIndex, 1)
  }

  return result
}

/**
 * Converts a slot-ascending order (index 0 = slot 1) into the bottom-up
 * reveal sequence (index 0 = first revealed = worst slot).
 */
export function toRevealSequence(slotOrder: string[]): string[] {
  return [...slotOrder].reverse()
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test -- lottery`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/lottery.ts lib/lottery.test.ts
git commit -m "feat: add lottery order algorithms"
```

---

### Task 6: Validation schemas

**Files:**
- Create: `lib/validation.ts`
- Test: `lib/validation.test.ts`

**Interfaces:**
- Consumes: `MIN_TEAMS`, `MAX_TEAMS`, `MIN_WEIGHT` from `lib/constants.ts`; `LotteryMode` from `lib/types.ts`.
- Produces: `createLeagueSchema` (validates `{ name: string; mode: LotteryMode }`), `teamInputSchema`, `replaceTeamsSchema` (validates `{ teams: { name: string; weight?: number }[] }`, enforcing team count 6-32 and, when called via `validateTeamsForMode`, that weighted mode requires every weight ≥ 1).

- [ ] **Step 1: Write failing tests**

Create `lib/validation.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { createLeagueSchema, replaceTeamsSchema, validateTeamsForMode } from './validation'

describe('createLeagueSchema', () => {
  it('accepts a valid payload', () => {
    const result = createLeagueSchema.safeParse({ name: 'My League', mode: 'random' })
    expect(result.success).toBe(true)
  })

  it('rejects an empty name', () => {
    const result = createLeagueSchema.safeParse({ name: '', mode: 'random' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid mode', () => {
    const result = createLeagueSchema.safeParse({ name: 'x', mode: 'weighted-ish' })
    expect(result.success).toBe(false)
  })
})

describe('replaceTeamsSchema', () => {
  it('rejects fewer than 6 teams', () => {
    const teams = Array.from({ length: 5 }, (_, i) => ({ name: `Team ${i}` }))
    const result = replaceTeamsSchema.safeParse({ teams })
    expect(result.success).toBe(false)
  })

  it('rejects more than 32 teams', () => {
    const teams = Array.from({ length: 33 }, (_, i) => ({ name: `Team ${i}` }))
    const result = replaceTeamsSchema.safeParse({ teams })
    expect(result.success).toBe(false)
  })

  it('accepts 6-32 teams with blank names rejected', () => {
    const teams = Array.from({ length: 6 }, (_, i) => ({ name: `Team ${i}` }))
    expect(replaceTeamsSchema.safeParse({ teams }).success).toBe(true)
    teams[0].name = ''
    expect(replaceTeamsSchema.safeParse({ teams }).success).toBe(false)
  })
})

describe('validateTeamsForMode', () => {
  const teams = [
    { name: 'A', weight: 5 },
    { name: 'B' }, // missing weight
  ]

  it('passes for random mode regardless of weights', () => {
    expect(validateTeamsForMode(teams, 'random').valid).toBe(true)
  })

  it('fails for weighted mode when any weight is missing', () => {
    expect(validateTeamsForMode(teams, 'weighted').valid).toBe(false)
  })

  it('fails for weighted mode when any weight is below the minimum', () => {
    const withZero = [{ name: 'A', weight: 0 }, { name: 'B', weight: 5 }]
    expect(validateTeamsForMode(withZero, 'weighted').valid).toBe(false)
  })

  it('passes for weighted mode when every weight is present and valid', () => {
    const valid = [{ name: 'A', weight: 5 }, { name: 'B', weight: 1 }]
    expect(validateTeamsForMode(valid, 'weighted').valid).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- validation`
Expected: FAIL — `Cannot find module './validation'`.

- [ ] **Step 3: Implement**

Create `lib/validation.ts`:
```typescript
import { z } from 'zod'
import { MIN_TEAMS, MAX_TEAMS, MIN_WEIGHT } from './constants'
import type { LotteryMode } from './types'

export const createLeagueSchema = z.object({
  name: z.string().trim().min(1).max(100),
  mode: z.enum(['random', 'weighted']),
})

export const teamInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  weight: z.number().min(0).optional(),
})

export const replaceTeamsSchema = z.object({
  teams: z.array(teamInputSchema).min(MIN_TEAMS).max(MAX_TEAMS),
})

export interface TeamModeValidation {
  valid: boolean
  error: string | null
}

export function validateTeamsForMode(
  teams: { name: string; weight?: number }[],
  mode: LotteryMode
): TeamModeValidation {
  if (mode === 'random') {
    return { valid: true, error: null }
  }

  const invalid = teams.some((t) => t.weight === undefined || t.weight < MIN_WEIGHT)
  if (invalid) {
    return { valid: false, error: `Every team needs a weight of at least ${MIN_WEIGHT} in weighted mode` }
  }

  return { valid: true, error: null }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test -- validation`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/validation.ts lib/validation.test.ts
git commit -m "feat: add Zod validation schemas for league and team input"
```

---

### Task 7: Repository interface and in-memory fake

**Files:**
- Create: `lib/repository.ts`
- Create: `lib/repository.memory.ts`
- Test: `lib/repository.memory.test.ts`

**Interfaces:**
- Consumes: `League`, `Team`, `DraftResult`, `LotteryMode` from `lib/types.ts`.
- Produces: `LeagueRepository` interface with methods `createLeague`, `getByCommissionerToken`, `getByViewerToken`, `replaceTeams`, `startDraft`, `revealNext`, `checkRateLimit`; `RevealConflictError` class; `MemoryLeagueRepository` class implementing it, used by every later service/route test.

The repository is the single seam between business logic and storage. `revealNext` takes an `expectedRevealedCount` and only advances if the stored count still matches — this is what makes the reveal atomic, whether backed by memory (tests) or Postgres conditional `UPDATE ... WHERE` (Task 11).

- [ ] **Step 1: Write failing tests**

Create `lib/repository.memory.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryLeagueRepository } from './repository.memory'
import { RevealConflictError } from './repository'

describe('MemoryLeagueRepository', () => {
  let repo: MemoryLeagueRepository

  beforeEach(() => {
    repo = new MemoryLeagueRepository()
  })

  it('creates a league in setup status with no teams', async () => {
    const league = await repo.createLeague({ name: 'Test League', mode: 'random' })
    expect(league.status).toBe('setup')
    expect(league.commissionerToken).toBeTruthy()
    expect(league.viewerToken).toBeTruthy()
    expect(league.commissionerToken).not.toBe(league.viewerToken)
  })

  it('finds a league by commissioner token', async () => {
    const created = await repo.createLeague({ name: 'Test', mode: 'random' })
    const found = await repo.getByCommissionerToken(created.commissionerToken)
    expect(found?.league.id).toBe(created.id)
    expect(found?.teams).toEqual([])
  })

  it('returns null for an unknown commissioner token', async () => {
    expect(await repo.getByCommissionerToken('nope')).toBeNull()
  })

  it('finds a league by viewer token', async () => {
    const created = await repo.createLeague({ name: 'Test', mode: 'random' })
    const found = await repo.getByViewerToken(created.viewerToken)
    expect(found?.league.id).toBe(created.id)
  })

  it('replaces the team list, generating fresh team ids', async () => {
    const league = await repo.createLeague({ name: 'Test', mode: 'random' })
    const teams = await repo.replaceTeams(league.commissionerToken, [
      { name: 'A' },
      { name: 'B' },
    ])
    expect(teams).toHaveLength(2)
    expect(teams[0].id).not.toBe(teams[1].id)

    const replaced = await repo.replaceTeams(league.commissionerToken, [{ name: 'C' }])
    expect(replaced).toHaveLength(1)
    expect(replaced[0].name).toBe('C')
  })

  it('starts the draft, storing reveal order and moving to live status', async () => {
    const league = await repo.createLeague({ name: 'Test', mode: 'random' })
    const updated = await repo.startDraft(league.commissionerToken, ['t1', 't2'])
    expect(updated.status).toBe('live')
    expect(updated.revealOrder).toEqual(['t1', 't2'])
    expect(updated.revealedCount).toBe(0)
  })

  it('reveals the next pick when the expected count matches', async () => {
    const league = await repo.createLeague({ name: 'Test', mode: 'random' })
    await repo.startDraft(league.commissionerToken, ['t1', 't2'])
    const result = await repo.revealNext(league.commissionerToken, 0)
    expect(result.revealedTeamId).toBe('t1')
    expect(result.league.revealedCount).toBe(1)
    expect(result.league.status).toBe('live')
  })

  it('marks the league complete after the final reveal', async () => {
    const league = await repo.createLeague({ name: 'Test', mode: 'random' })
    await repo.startDraft(league.commissionerToken, ['t1', 't2'])
    await repo.revealNext(league.commissionerToken, 0)
    const result = await repo.revealNext(league.commissionerToken, 1)
    expect(result.league.status).toBe('complete')
  })

  it('throws RevealConflictError when the expected count is stale', async () => {
    const league = await repo.createLeague({ name: 'Test', mode: 'random' })
    await repo.startDraft(league.commissionerToken, ['t1', 't2'])
    await repo.revealNext(league.commissionerToken, 0)
    await expect(repo.revealNext(league.commissionerToken, 0)).rejects.toBeInstanceOf(
      RevealConflictError
    )
  })

  it('tracks rate-limit counts per key within a window', async () => {
    const first = await repo.checkRateLimit('ip:/api/leagues', 2, 60_000, 1000)
    const second = await repo.checkRateLimit('ip:/api/leagues', 2, 60_000, 1000)
    const third = await repo.checkRateLimit('ip:/api/leagues', 2, 60_000, 1000)
    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(true)
    expect(third.allowed).toBe(false)
  })

  it('resets the rate-limit window after it expires', async () => {
    await repo.checkRateLimit('ip:/x', 1, 1000, 1000)
    const secondCallSameWindow = await repo.checkRateLimit('ip:/x', 1, 1000, 1500)
    expect(secondCallSameWindow.allowed).toBe(false)
    const afterWindow = await repo.checkRateLimit('ip:/x', 1, 1000, 3000)
    expect(afterWindow.allowed).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- repository.memory`
Expected: FAIL — `Cannot find module './repository.memory'`.

- [ ] **Step 3: Implement the interface**

Create `lib/repository.ts`:
```typescript
import type { League, LeagueWithTeams, Team, LotteryMode } from './types'

export class RevealConflictError extends Error {
  constructor() {
    super('The reveal state changed before this request completed')
    this.name = 'RevealConflictError'
  }
}

export interface RevealResult {
  league: League
  revealedTeamId: string
  slot: number
}

export interface RateLimitResult {
  allowed: boolean
}

export interface LeagueRepository {
  createLeague(input: { name: string; mode: LotteryMode }): Promise<League>
  getByCommissionerToken(token: string): Promise<LeagueWithTeams | null>
  getByViewerToken(token: string): Promise<LeagueWithTeams | null>
  replaceTeams(
    commissionerToken: string,
    teams: { name: string; weight?: number }[]
  ): Promise<Team[]>
  startDraft(commissionerToken: string, revealOrder: string[]): Promise<League>
  /** Throws RevealConflictError if revealedCount !== expectedRevealedCount. */
  revealNext(commissionerToken: string, expectedRevealedCount: number): Promise<RevealResult>
  checkRateLimit(
    key: string,
    maxRequests: number,
    windowMs: number,
    now: number
  ): Promise<RateLimitResult>
}
```

- [ ] **Step 4: Implement the in-memory fake**

Create `lib/repository.memory.ts`:
```typescript
import { generateToken } from './tokens'
import { RevealConflictError, type LeagueRepository, type RevealResult, type RateLimitResult } from './repository'
import type { League, LeagueWithTeams, Team, LotteryMode } from './types'

interface RateLimitEntry {
  windowStart: number
  count: number
}

export class MemoryLeagueRepository implements LeagueRepository {
  private leagues = new Map<string, League>()
  private teamsByLeagueId = new Map<string, Team[]>()
  private rateLimits = new Map<string, RateLimitEntry>()

  async createLeague(input: { name: string; mode: LotteryMode }): Promise<League> {
    const league: League = {
      id: generateToken(),
      commissionerToken: generateToken(),
      viewerToken: generateToken(),
      name: input.name,
      mode: input.mode,
      status: 'setup',
      revealOrder: null,
      revealedCount: 0,
    }
    this.leagues.set(league.id, league)
    this.teamsByLeagueId.set(league.id, [])
    return { ...league }
  }

  async getByCommissionerToken(token: string): Promise<LeagueWithTeams | null> {
    const league = [...this.leagues.values()].find((l) => l.commissionerToken === token)
    if (!league) return null
    return { league: { ...league }, teams: [...(this.teamsByLeagueId.get(league.id) ?? [])] }
  }

  async getByViewerToken(token: string): Promise<LeagueWithTeams | null> {
    const league = [...this.leagues.values()].find((l) => l.viewerToken === token)
    if (!league) return null
    return { league: { ...league }, teams: [...(this.teamsByLeagueId.get(league.id) ?? [])] }
  }

  async replaceTeams(
    commissionerToken: string,
    teams: { name: string; weight?: number }[]
  ): Promise<Team[]> {
    const league = [...this.leagues.values()].find((l) => l.commissionerToken === commissionerToken)
    if (!league) throw new Error('League not found')

    const newTeams: Team[] = teams.map((t) => ({
      id: generateToken(),
      leagueId: league.id,
      name: t.name,
      weight: t.weight ?? null,
    }))
    this.teamsByLeagueId.set(league.id, newTeams)
    return [...newTeams]
  }

  async startDraft(commissionerToken: string, revealOrder: string[]): Promise<League> {
    const league = [...this.leagues.values()].find((l) => l.commissionerToken === commissionerToken)
    if (!league) throw new Error('League not found')

    const updated: League = { ...league, status: 'live', revealOrder: [...revealOrder], revealedCount: 0 }
    this.leagues.set(league.id, updated)
    return { ...updated }
  }

  async revealNext(commissionerToken: string, expectedRevealedCount: number): Promise<RevealResult> {
    const league = [...this.leagues.values()].find((l) => l.commissionerToken === commissionerToken)
    if (!league) throw new Error('League not found')
    if (!league.revealOrder) throw new Error('Draft has not started')
    if (league.revealedCount !== expectedRevealedCount) throw new RevealConflictError()

    const revealedTeamId = league.revealOrder[expectedRevealedCount]
    const totalTeams = league.revealOrder.length
    const slot = totalTeams - expectedRevealedCount
    const newRevealedCount = expectedRevealedCount + 1

    const updated: League = {
      ...league,
      revealedCount: newRevealedCount,
      status: newRevealedCount === totalTeams ? 'complete' : 'live',
    }
    this.leagues.set(league.id, updated)

    return { league: { ...updated }, revealedTeamId, slot }
  }

  async checkRateLimit(
    key: string,
    maxRequests: number,
    windowMs: number,
    now: number
  ): Promise<RateLimitResult> {
    const existing = this.rateLimits.get(key)

    if (!existing || now - existing.windowStart >= windowMs) {
      this.rateLimits.set(key, { windowStart: now, count: 1 })
      return { allowed: true }
    }

    if (existing.count < maxRequests) {
      this.rateLimits.set(key, { ...existing, count: existing.count + 1 })
      return { allowed: true }
    }

    return { allowed: false }
  }
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm test -- repository.memory`
Expected: PASS (11 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/repository.ts lib/repository.memory.ts lib/repository.memory.test.ts
git commit -m "feat: add LeagueRepository interface and in-memory fake"
```

---

### Task 8: League service (business logic)

**Files:**
- Create: `lib/leagueService.ts`
- Test: `lib/leagueService.test.ts`

**Interfaces:**
- Consumes: `LeagueRepository` (Task 7), `MemoryLeagueRepository` (Task 7, for tests), `randomOrder`/`weightedOrder`/`toRevealSequence` (Task 5), `createLeagueSchema`/`replaceTeamsSchema`/`validateTeamsForMode` (Task 6), `ok`/`fail` (Task 3).
- Produces: `createLeague(repo, input)`, `replaceTeams(repo, commissionerToken, input)`, `startDraft(repo, commissionerToken)`, `revealNext(repo, commissionerToken, expectedRevealedCount)`, `getCommissionerView(repo, commissionerToken)`, `getViewerState(repo, viewerToken)` — every one returns `Promise<ApiResponse<...>>` and is called directly by the matching route handler in Tasks 9-14.

- [ ] **Step 1: Write failing tests**

Create `lib/leagueService.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryLeagueRepository } from './repository.memory'
import {
  createLeague,
  replaceTeams,
  startDraft,
  revealNext,
  getCommissionerView,
  getViewerState,
} from './leagueService'

describe('leagueService', () => {
  let repo: MemoryLeagueRepository

  beforeEach(() => {
    repo = new MemoryLeagueRepository()
  })

  it('creates a league from valid input', async () => {
    const result = await createLeague(repo, { name: 'My League', mode: 'random' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.league.name).toBe('My League')
    }
  })

  it('rejects an invalid create-league payload', async () => {
    const result = await createLeague(repo, { name: '', mode: 'random' })
    expect(result.success).toBe(false)
  })

  it('replaces teams when the payload is valid for the league mode', async () => {
    const created = await createLeague(repo, { name: 'L', mode: 'random' })
    if (!created.success) throw new Error('setup failed')
    const teams = Array.from({ length: 6 }, (_, i) => ({ name: `Team ${i}` }))

    const result = await replaceTeams(repo, created.data.league.commissionerToken, { teams })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toHaveLength(6)
  })

  it('rejects team replacement in weighted mode when weights are missing', async () => {
    const created = await createLeague(repo, { name: 'L', mode: 'weighted' })
    if (!created.success) throw new Error('setup failed')
    const teams = Array.from({ length: 6 }, (_, i) => ({ name: `Team ${i}` }))

    const result = await replaceTeams(repo, created.data.league.commissionerToken, { teams })
    expect(result.success).toBe(false)
  })

  it('starts the draft and computes a reveal order covering every team', async () => {
    const created = await createLeague(repo, { name: 'L', mode: 'random' })
    if (!created.success) throw new Error('setup failed')
    const token = created.data.league.commissionerToken
    const teams = Array.from({ length: 6 }, (_, i) => ({ name: `Team ${i}` }))
    await replaceTeams(repo, token, { teams })

    const result = await startDraft(repo, token)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.status).toBe('live')
  })

  it('refuses to start a draft with fewer than 6 teams', async () => {
    const created = await createLeague(repo, { name: 'L', mode: 'random' })
    if (!created.success) throw new Error('setup failed')
    const token = created.data.league.commissionerToken
    await replaceTeams(repo, token, { teams: [{ name: 'Only One' }] })
    // replaceTeams itself would reject <6 via schema; simulate a direct start attempt with none replaced.
    const result = await startDraft(repo, token)
    expect(result.success).toBe(false)
  })

  it('reveals picks bottom-up and reports the commissioner view', async () => {
    const created = await createLeague(repo, { name: 'L', mode: 'random' })
    if (!created.success) throw new Error('setup failed')
    const token = created.data.league.commissionerToken
    const teams = Array.from({ length: 6 }, (_, i) => ({ name: `Team ${i}` }))
    await replaceTeams(repo, token, { teams })
    await startDraft(repo, token)

    const first = await revealNext(repo, token, 0)
    expect(first.success).toBe(true)
    if (first.success) expect(first.data.slot).toBe(6)

    const view = await getCommissionerView(repo, token)
    expect(view.success).toBe(true)
    if (view.success) expect(view.data.league.revealedCount).toBe(1)
  })

  it('returns a failure result on a stale reveal request instead of throwing', async () => {
    const created = await createLeague(repo, { name: 'L', mode: 'random' })
    if (!created.success) throw new Error('setup failed')
    const token = created.data.league.commissionerToken
    const teams = Array.from({ length: 6 }, (_, i) => ({ name: `Team ${i}` }))
    await replaceTeams(repo, token, { teams })
    await startDraft(repo, token)
    await revealNext(repo, token, 0)

    const stale = await revealNext(repo, token, 0)
    expect(stale.success).toBe(false)
  })

  it('exposes only public-safe fields via the viewer token', async () => {
    const created = await createLeague(repo, { name: 'L', mode: 'random' })
    if (!created.success) throw new Error('setup failed')
    const token = created.data.league.commissionerToken
    const teams = Array.from({ length: 6 }, (_, i) => ({ name: `Team ${i}` }))
    await replaceTeams(repo, token, { teams })
    await startDraft(repo, token)
    await revealNext(repo, token, 0)

    const view = await getViewerState(repo, created.data.league.viewerToken)
    expect(view.success).toBe(true)
    if (view.success) {
      expect(view.data.revealed).toHaveLength(1)
      expect(view.data.status).toBe('live')
    }
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- leagueService`
Expected: FAIL — `Cannot find module './leagueService'`.

- [ ] **Step 3: Implement**

Create `lib/leagueService.ts`:
```typescript
import type { LeagueRepository } from './repository'
import { RevealConflictError } from './repository'
import { ok, fail, type ApiResponse } from './apiResponse'
import { createLeagueSchema, replaceTeamsSchema, validateTeamsForMode } from './validation'
import { randomOrder, weightedOrder, toRevealSequence } from './lottery'
import type { League, LeagueWithTeams, Team, PublicLeagueState } from './types'

export async function createLeague(
  repo: LeagueRepository,
  input: unknown
): Promise<ApiResponse<LeagueWithTeams>> {
  const parsed = createLeagueSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input')

  const league = await repo.createLeague(parsed.data)
  return ok({ league, teams: [] })
}

export async function replaceTeams(
  repo: LeagueRepository,
  commissionerToken: string,
  input: unknown
): Promise<ApiResponse<Team[]>> {
  const parsed = replaceTeamsSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input')

  const existing = await repo.getByCommissionerToken(commissionerToken)
  if (!existing) return fail('League not found')
  if (existing.league.status !== 'setup') return fail('Teams can only be edited before the draft starts')

  const modeCheck = validateTeamsForMode(parsed.data.teams, existing.league.mode)
  if (!modeCheck.valid) return fail(modeCheck.error ?? 'Invalid team weights')

  const teams = await repo.replaceTeams(commissionerToken, parsed.data.teams)
  return ok(teams)
}

export async function startDraft(
  repo: LeagueRepository,
  commissionerToken: string
): Promise<ApiResponse<League>> {
  const existing = await repo.getByCommissionerToken(commissionerToken)
  if (!existing) return fail('League not found')
  if (existing.league.status !== 'setup') return fail('Draft has already started')

  const modeCheck = validateTeamsForMode(existing.teams, existing.league.mode)
  if (!modeCheck.valid) return fail(modeCheck.error ?? 'Invalid team weights')

  const teamIds = existing.teams.map((t) => t.id)
  const slotOrder =
    existing.league.mode === 'weighted'
      ? weightedOrder(existing.teams.map((t) => ({ id: t.id, weight: t.weight ?? 0 })))
      : randomOrder(teamIds)

  const revealOrder = toRevealSequence(slotOrder)
  const updated = await repo.startDraft(commissionerToken, revealOrder)
  return ok(updated)
}

export async function revealNext(
  repo: LeagueRepository,
  commissionerToken: string,
  expectedRevealedCount: number
): Promise<ApiResponse<{ teamId: string; teamName: string; slot: number; status: League['status'] }>> {
  try {
    const result = await repo.revealNext(commissionerToken, expectedRevealedCount)
    const withTeams = await repo.getByCommissionerToken(commissionerToken)
    const teamName = withTeams?.teams.find((t) => t.id === result.revealedTeamId)?.name ?? 'Unknown team'
    return ok({ teamId: result.revealedTeamId, teamName, slot: result.slot, status: result.league.status })
  } catch (err) {
    if (err instanceof RevealConflictError) return fail('Someone else already revealed this pick')
    return fail(err instanceof Error ? err.message : 'Unable to reveal the next pick')
  }
}

export async function getCommissionerView(
  repo: LeagueRepository,
  commissionerToken: string
): Promise<ApiResponse<LeagueWithTeams>> {
  const existing = await repo.getByCommissionerToken(commissionerToken)
  if (!existing) return fail('League not found')
  return ok(existing)
}

export async function getViewerState(
  repo: LeagueRepository,
  viewerToken: string
): Promise<ApiResponse<PublicLeagueState>> {
  const existing = await repo.getByViewerToken(viewerToken)
  if (!existing) return fail('League not found')

  const teamsById = new Map(existing.teams.map((t) => [t.id, t]))
  const revealed = (existing.league.revealOrder ?? [])
    .slice(0, existing.league.revealedCount)
    .map((teamId, index) => {
      const totalTeams = existing.league.revealOrder!.length
      return {
        teamId,
        teamName: teamsById.get(teamId)?.name ?? 'Unknown team',
        slot: totalTeams - index,
      }
    })

  return ok({
    name: existing.league.name,
    mode: existing.league.mode,
    status: existing.league.status,
    teamCount: existing.teams.length,
    revealed,
  })
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test -- leagueService`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/leagueService.ts lib/leagueService.test.ts
git commit -m "feat: add league service business logic"
```

---

### Task 9: Rate limiter helper

**Files:**
- Create: `lib/rateLimit.ts`
- Test: `lib/rateLimit.test.ts`

**Interfaces:**
- Consumes: `LeagueRepository.checkRateLimit` (Task 7), `RATE_LIMIT_MAX_REQUESTS`/`RATE_LIMIT_WINDOW_MS` (Task 2).
- Produces: `enforceRateLimit(repo, key): Promise<ApiResponse<null> | null>` — returns a `fail(...)` envelope when the caller should be rejected with HTTP 429, or `null` when the request may proceed. Used by every route handler in Tasks 10-14.

- [ ] **Step 1: Write failing tests**

Create `lib/rateLimit.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryLeagueRepository } from './repository.memory'
import { enforceRateLimit } from './rateLimit'

describe('enforceRateLimit', () => {
  let repo: MemoryLeagueRepository

  beforeEach(() => {
    repo = new MemoryLeagueRepository()
  })

  it('allows requests under the limit', async () => {
    const result = await enforceRateLimit(repo, 'ip:/api/leagues')
    expect(result).toBeNull()
  })

  it('rejects requests once the limit is exceeded', async () => {
    for (let i = 0; i < 30; i++) {
      await enforceRateLimit(repo, 'ip:/api/leagues')
    }
    const result = await enforceRateLimit(repo, 'ip:/api/leagues')
    expect(result?.success).toBe(false)
  })

  it('tracks separate keys independently', async () => {
    for (let i = 0; i < 30; i++) {
      await enforceRateLimit(repo, 'ip:/api/leagues')
    }
    const otherKey = await enforceRateLimit(repo, 'ip:/api/other')
    expect(otherKey).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- rateLimit`
Expected: FAIL — `Cannot find module './rateLimit'`.

- [ ] **Step 3: Implement**

Create `lib/rateLimit.ts`:
```typescript
import type { LeagueRepository } from './repository'
import { fail, type ApiResponse } from './apiResponse'
import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from './constants'

export async function enforceRateLimit(
  repo: LeagueRepository,
  key: string
): Promise<ApiResponse<null> | null> {
  const result = await repo.checkRateLimit(key, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS, Date.now())
  if (!result.allowed) return fail('Too many requests, please slow down')
  return null
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test -- rateLimit`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/rateLimit.ts lib/rateLimit.test.ts
git commit -m "feat: add rate limiter helper"
```

---

### Task 10: Supabase project setup and schema migration

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `.env.local.example`
- Modify: `.gitignore` (ensure `.env.local` and `.superpowers/` are ignored)

**Interfaces:**
- Produces: the `leagues`, `teams`, `draft_results`, and `rate_limits` tables that `lib/repository.supabase.ts` (Task 11) reads and writes.

This task includes manual, one-time infrastructure setup (creating a Supabase project) that can't be expressed as an automated test — verification is a manual SQL check against the live project.

- [ ] **Step 1: Create a Supabase project**

Go to https://supabase.com, create a new project (any name/region), and note the **Project URL**, **anon public key**, and **service_role key** from Project Settings → API.

- [ ] **Step 2: Install the Supabase CLI and link the project**

Run:
```bash
npm install -D supabase
npx supabase login
npx supabase link --project-ref <your-project-ref>
```

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0001_init.sql`:
```sql
create table leagues (
  id uuid primary key default gen_random_uuid(),
  commissioner_token text not null unique,
  viewer_token text not null unique,
  name text not null,
  mode text not null check (mode in ('random', 'weighted')),
  status text not null default 'setup' check (status in ('setup', 'live', 'complete')),
  reveal_order jsonb,
  revealed_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  name text not null,
  weight integer
);

create table draft_results (
  league_id uuid not null references leagues(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  slot integer not null,
  primary key (league_id, team_id)
);

create table rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

create index teams_league_id_idx on teams(league_id);
create index draft_results_league_id_idx on draft_results(league_id);

-- All access goes through the Next.js server using the service_role key.
-- RLS is enabled with no policies, so the anon key (used only for realtime
-- subscriptions in the browser) cannot read or write these tables directly.
alter table leagues enable row level security;
alter table teams enable row level security;
alter table draft_results enable row level security;
alter table rate_limits enable row level security;
```

- [ ] **Step 4: Apply the migration**

Run:
```bash
npx supabase db push
```
Expected: CLI reports the migration applied successfully.

- [ ] **Step 5: Verify manually**

In the Supabase dashboard's SQL editor, run `select * from leagues;` (and the same for `teams`, `draft_results`, `rate_limits`).
Expected: each query succeeds and returns zero rows (tables exist, empty).

- [ ] **Step 6: Add environment variable example and gitignore entries**

Create `.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Confirm `.gitignore` (created by `create-next-app`) already contains `.env*.local` — if not, append it. Then append:
```
.superpowers/
```

- [ ] **Step 7: Create your local `.env.local`**

Copy `.env.local.example` to `.env.local` and fill in the three values from Step 1. This file is gitignored and never committed.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0001_init.sql .env.local.example .gitignore
git commit -m "feat: add Supabase schema migration"
```

---

### Task 11: Supabase-backed repository implementation

**Files:**
- Create: `lib/supabaseAdmin.ts`
- Create: `lib/repository.supabase.ts`
- Test: `lib/repository.supabase.integration.test.ts`
- Modify: `package.json` (add `test:integration` script)

**Interfaces:**
- Consumes: `LeagueRepository` interface (Task 7), Supabase project from Task 10.
- Produces: `supabaseAdmin` (server-only Supabase client using the service role key), `SupabaseLeagueRepository` implementing `LeagueRepository` against the real Postgres tables — this is what production route handlers (Tasks 12-16) use.

This is the one place with an **integration test** (per the project's testing requirements) — it talks to a real Supabase project rather than a fake, and is run separately from the fast unit suite since it needs network access and real credentials.

- [ ] **Step 1: Create the admin client**

Create `lib/supabaseAdmin.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  throw new Error('Missing Supabase server environment variables')
}

export const supabaseAdmin = createClient(url, serviceRoleKey)
```

- [ ] **Step 2: Write a failing integration test**

Create `lib/repository.supabase.integration.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { SupabaseLeagueRepository } from './repository.supabase'
import { RevealConflictError } from './repository'

// Run with: npm run test:integration
// Requires a real Supabase project configured via .env.local (Task 10).
describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)('SupabaseLeagueRepository', () => {
  let repo: SupabaseLeagueRepository

  beforeAll(() => {
    repo = new SupabaseLeagueRepository()
  })

  it('creates, starts, and reveals a full draft end to end', async () => {
    const league = await repo.createLeague({ name: 'Integration Test League', mode: 'random' })
    expect(league.status).toBe('setup')

    const teams = await repo.replaceTeams(
      league.commissionerToken,
      Array.from({ length: 6 }, (_, i) => ({ name: `Team ${i}` }))
    )
    expect(teams).toHaveLength(6)

    const started = await repo.startDraft(league.commissionerToken, teams.map((t) => t.id))
    expect(started.status).toBe('live')
    expect(started.revealOrder).toHaveLength(6)

    const revealed = await repo.revealNext(league.commissionerToken, 0)
    expect(revealed.slot).toBe(6)

    await expect(repo.revealNext(league.commissionerToken, 0)).rejects.toBeInstanceOf(
      RevealConflictError
    )
  })
})
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npm run test:integration`
Expected: FAIL — `Cannot find module './repository.supabase'`.

- [ ] **Step 4: Implement**

Create `lib/repository.supabase.ts`:
```typescript
import { supabaseAdmin } from './supabaseAdmin'
import { generateToken } from './tokens'
import { RevealConflictError, type LeagueRepository, type RevealResult, type RateLimitResult } from './repository'
import type { League, LeagueWithTeams, Team, LotteryMode, LeagueStatus } from './types'

function toLeague(row: any): League {
  return {
    id: row.id,
    commissionerToken: row.commissioner_token,
    viewerToken: row.viewer_token,
    name: row.name,
    mode: row.mode as LotteryMode,
    status: row.status as LeagueStatus,
    revealOrder: row.reveal_order,
    revealedCount: row.revealed_count,
  }
}

function toTeam(row: any): Team {
  return { id: row.id, leagueId: row.league_id, name: row.name, weight: row.weight }
}

export class SupabaseLeagueRepository implements LeagueRepository {
  async createLeague(input: { name: string; mode: LotteryMode }): Promise<League> {
    const { data, error } = await supabaseAdmin
      .from('leagues')
      .insert({
        commissioner_token: generateToken(),
        viewer_token: generateToken(),
        name: input.name,
        mode: input.mode,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return toLeague(data)
  }

  private async findLeagueRow(column: 'commissioner_token' | 'viewer_token', token: string) {
    const { data, error } = await supabaseAdmin.from('leagues').select().eq(column, token).maybeSingle()
    if (error) throw new Error(error.message)
    return data
  }

  private async withTeams(row: any): Promise<LeagueWithTeams> {
    const { data: teamRows, error } = await supabaseAdmin.from('teams').select().eq('league_id', row.id)
    if (error) throw new Error(error.message)
    return { league: toLeague(row), teams: (teamRows ?? []).map(toTeam) }
  }

  async getByCommissionerToken(token: string): Promise<LeagueWithTeams | null> {
    const row = await this.findLeagueRow('commissioner_token', token)
    return row ? this.withTeams(row) : null
  }

  async getByViewerToken(token: string): Promise<LeagueWithTeams | null> {
    const row = await this.findLeagueRow('viewer_token', token)
    return row ? this.withTeams(row) : null
  }

  async replaceTeams(
    commissionerToken: string,
    teams: { name: string; weight?: number }[]
  ): Promise<Team[]> {
    const row = await this.findLeagueRow('commissioner_token', commissionerToken)
    if (!row) throw new Error('League not found')

    const { error: deleteError } = await supabaseAdmin.from('teams').delete().eq('league_id', row.id)
    if (deleteError) throw new Error(deleteError.message)

    const { data, error } = await supabaseAdmin
      .from('teams')
      .insert(teams.map((t) => ({ league_id: row.id, name: t.name, weight: t.weight ?? null })))
      .select()

    if (error) throw new Error(error.message)
    return (data ?? []).map(toTeam)
  }

  async startDraft(commissionerToken: string, revealOrder: string[]): Promise<League> {
    const { data, error } = await supabaseAdmin
      .from('leagues')
      .update({ status: 'live', reveal_order: revealOrder, revealed_count: 0 })
      .eq('commissioner_token', commissionerToken)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return toLeague(data)
  }

  async revealNext(commissionerToken: string, expectedRevealedCount: number): Promise<RevealResult> {
    const row = await this.findLeagueRow('commissioner_token', commissionerToken)
    if (!row) throw new Error('League not found')
    if (!row.reveal_order) throw new Error('Draft has not started')

    const totalTeams = row.reveal_order.length
    const revealedTeamId = row.reveal_order[expectedRevealedCount]
    const slot = totalTeams - expectedRevealedCount
    const newRevealedCount = expectedRevealedCount + 1
    const newStatus = newRevealedCount === totalTeams ? 'complete' : 'live'

    // Conditional update: only succeeds if revealed_count still matches what
    // this request expected. If another request already advanced it, this
    // returns zero rows and we surface a RevealConflictError.
    const { data, error } = await supabaseAdmin
      .from('leagues')
      .update({ revealed_count: newRevealedCount, status: newStatus })
      .eq('commissioner_token', commissionerToken)
      .eq('revealed_count', expectedRevealedCount)
      .select()
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) throw new RevealConflictError()

    const { error: insertError } = await supabaseAdmin
      .from('draft_results')
      .insert({ league_id: row.id, team_id: revealedTeamId, slot })

    if (insertError) throw new Error(insertError.message)

    return { league: toLeague(data), revealedTeamId, slot }
  }

  async checkRateLimit(
    key: string,
    maxRequests: number,
    windowMs: number,
    now: number
  ): Promise<RateLimitResult> {
    const { data: existing, error: selectError } = await supabaseAdmin
      .from('rate_limits')
      .select()
      .eq('key', key)
      .maybeSingle()

    if (selectError) throw new Error(selectError.message)

    const nowIso = new Date(now).toISOString()

    if (!existing || now - new Date(existing.window_start).getTime() >= windowMs) {
      const { error } = await supabaseAdmin
        .from('rate_limits')
        .upsert({ key, window_start: nowIso, count: 1 })
      if (error) throw new Error(error.message)
      return { allowed: true }
    }

    if (existing.count < maxRequests) {
      const { error } = await supabaseAdmin
        .from('rate_limits')
        .update({ count: existing.count + 1 })
        .eq('key', key)
      if (error) throw new Error(error.message)
      return { allowed: true }
    }

    return { allowed: false }
  }
}
```

- [ ] **Step 5: Add the integration test script**

In `package.json`, add:
```json
"test:integration": "vitest run --config vitest.integration.config.ts"
```

Create `vitest.integration.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/*.integration.test.ts'],
    environment: 'node',
  },
})
```

Exclude integration tests from the default run by editing `vitest.config.ts`'s `test` block to add:
```typescript
    exclude: ['**/node_modules/**', '**/*.integration.test.ts'],
```

- [ ] **Step 6: Run the integration test, verify it passes**

Run: `npm run test:integration`
Expected: PASS (1 test) — requires `.env.local` from Task 10 to be populated.

- [ ] **Step 7: Run the unit suite, verify the integration test is excluded**

Run: `npm test`
Expected: all unit tests still pass; the integration test file is not among them.

- [ ] **Step 8: Commit**

```bash
git add lib/supabaseAdmin.ts lib/repository.supabase.ts lib/repository.supabase.integration.test.ts vitest.config.ts vitest.integration.config.ts package.json
git commit -m "feat: add Supabase-backed repository implementation"
```

---

### Task 12: Realtime broadcast helpers

**Files:**
- Create: `lib/realtime.ts`
- Create: `lib/supabaseBrowser.ts`
- Create: `lib/realtimeClient.ts`

**Interfaces:**
- Consumes: `supabaseAdmin` (Task 11).
- Produces: `broadcastReveal(leagueViewerToken, payload)` (server-side, called from the reveal route in Task 15), `subscribeToReveals(viewerToken, onReveal)` (browser-side, used by the viewer page in Task 20). Channel name = the league's `viewerToken` (already meant to be shared, so no new secret is introduced).

Both functions are thin wrappers around `@supabase/supabase-js`'s realtime channel API — there's no branching logic worth unit testing here; correctness is verified by the E2E test in Task 21, where a real browser actually receives a broadcast pick.

- [ ] **Step 1: Create the browser client**

Create `lib/supabaseBrowser.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase browser environment variables')
}

export const supabaseBrowser = createClient(url, anonKey)
```

- [ ] **Step 2: Create the server-side broadcast helper**

Create `lib/realtime.ts`:
```typescript
import { supabaseAdmin } from './supabaseAdmin'

export interface RevealBroadcastPayload {
  teamId: string
  teamName: string
  slot: number
  status: 'live' | 'complete'
}

export async function broadcastReveal(viewerToken: string, payload: RevealBroadcastPayload): Promise<void> {
  const channel = supabaseAdmin.channel(`league:${viewerToken}`)
  await channel.send({ type: 'broadcast', event: 'pick-revealed', payload })
}
```

- [ ] **Step 3: Create the browser-side subscribe helper**

Create `lib/realtimeClient.ts`:
```typescript
import { supabaseBrowser } from './supabaseBrowser'
import type { RevealBroadcastPayload } from './realtime'

export function subscribeToReveals(
  viewerToken: string,
  onReveal: (payload: RevealBroadcastPayload) => void
): () => void {
  const channel = supabaseBrowser
    .channel(`league:${viewerToken}`)
    .on('broadcast', { event: 'pick-revealed' }, ({ payload }) => onReveal(payload as RevealBroadcastPayload))
    .subscribe()

  return () => {
    supabaseBrowser.removeChannel(channel)
  }
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/realtime.ts lib/supabaseBrowser.ts lib/realtimeClient.ts
git commit -m "feat: add realtime broadcast helpers"
```

---

### Task 13: API routes — create league and commissioner view

**Files:**
- Create: `app/api/leagues/route.ts`
- Test: `app/api/leagues/route.test.ts`
- Create: `app/api/leagues/[commissionerToken]/route.ts`
- Test: `app/api/leagues/[commissionerToken]/route.test.ts`

**Interfaces:**
- Consumes: `createLeague`/`getCommissionerView` (Task 8), `enforceRateLimit` (Task 9), `SupabaseLeagueRepository` (Task 11).
- Produces: `POST /api/leagues`, `GET /api/leagues/[commissionerToken]` — consumed by the frontend in Tasks 17-18.

- [ ] **Step 1: Write failing tests for POST /api/leagues**

Create `app/api/leagues/route.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/repository.supabase', () => {
  const { MemoryLeagueRepository } = require('@/lib/repository.memory')
  return { SupabaseLeagueRepository: MemoryLeagueRepository }
})

import { POST } from './route'

describe('POST /api/leagues', () => {
  it('creates a league and returns tokens', async () => {
    const request = new NextRequest('http://localhost/api/leagues', {
      method: 'POST',
      body: JSON.stringify({ name: 'My League', mode: 'random' }),
    })
    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.league.commissionerToken).toBeTruthy()
    expect(body.data.league.viewerToken).toBeTruthy()
  })

  it('returns a 400 for invalid input', async () => {
    const request = new NextRequest('http://localhost/api/leagues', {
      method: 'POST',
      body: JSON.stringify({ name: '', mode: 'random' }),
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- app/api/leagues/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement POST /api/leagues**

Create `app/api/leagues/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createLeague } from '@/lib/leagueService'
import { enforceRateLimit } from '@/lib/rateLimit'
import { SupabaseLeagueRepository } from '@/lib/repository.supabase'

const repo = new SupabaseLeagueRepository()

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  const limited = await enforceRateLimit(repo, `${ip}:POST:/api/leagues`)
  if (limited) return NextResponse.json(limited, { status: 429 })

  const body = await request.json()
  const result = await createLeague(repo, body)
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- app/api/leagues/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write failing tests for GET /api/leagues/[commissionerToken]**

Create `app/api/leagues/[commissionerToken]/route.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/repository.supabase', () => {
  const { MemoryLeagueRepository } = require('@/lib/repository.memory')
  return { SupabaseLeagueRepository: MemoryLeagueRepository }
})

import { POST as createLeagueRoute } from '../route'
import { GET } from './route'

describe('GET /api/leagues/[commissionerToken]', () => {
  it('returns the league and teams for a valid commissioner token', async () => {
    const createResponse = await createLeagueRoute(
      new NextRequest('http://localhost/api/leagues', {
        method: 'POST',
        body: JSON.stringify({ name: 'My League', mode: 'random' }),
      })
    )
    const created = await createResponse.json()
    const token = created.data.league.commissionerToken

    const response = await GET(new NextRequest(`http://localhost/api/leagues/${token}`), {
      params: Promise.resolve({ commissionerToken: token }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.league.commissionerToken).toBe(token)
  })

  it('returns 404 for an unknown token', async () => {
    const response = await GET(new NextRequest('http://localhost/api/leagues/nope'), {
      params: Promise.resolve({ commissionerToken: 'nope' }),
    })
    expect(response.status).toBe(404)
  })
})
```

- [ ] **Step 6: Run test, verify it fails**

Run: `npm test -- "app/api/leagues/\[commissionerToken\]/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 7: Implement GET /api/leagues/[commissionerToken]**

Create `app/api/leagues/[commissionerToken]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getCommissionerView } from '@/lib/leagueService'
import { SupabaseLeagueRepository } from '@/lib/repository.supabase'

const repo = new SupabaseLeagueRepository()

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ commissionerToken: string }> }
) {
  const { commissionerToken } = await params
  const result = await getCommissionerView(repo, commissionerToken)
  return NextResponse.json(result, { status: result.success ? 200 : 404 })
}
```

- [ ] **Step 8: Run test, verify it passes**

Run: `npm test -- "app/api/leagues/\[commissionerToken\]/route.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add app/api/leagues/route.ts app/api/leagues/route.test.ts "app/api/leagues/[commissionerToken]/route.ts" "app/api/leagues/[commissionerToken]/route.test.ts"
git commit -m "feat: add create-league and commissioner-view API routes"
```

---

### Task 14: API route — replace teams

**Files:**
- Create: `app/api/leagues/[commissionerToken]/teams/route.ts`
- Test: `app/api/leagues/[commissionerToken]/teams/route.test.ts`

**Interfaces:**
- Consumes: `replaceTeams` (Task 8), `enforceRateLimit` (Task 9).
- Produces: `PUT /api/leagues/[commissionerToken]/teams` — consumed by the commissioner manage page (Task 18).

- [ ] **Step 1: Write failing tests**

Create `app/api/leagues/[commissionerToken]/teams/route.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/repository.supabase', () => {
  const { MemoryLeagueRepository } = require('@/lib/repository.memory')
  return { SupabaseLeagueRepository: MemoryLeagueRepository }
})

import { POST as createLeagueRoute } from '../../route'
import { PUT } from './route'

async function createTestLeague() {
  const response = await createLeagueRoute(
    new NextRequest('http://localhost/api/leagues', {
      method: 'POST',
      body: JSON.stringify({ name: 'My League', mode: 'random' }),
    })
  )
  const body = await response.json()
  return body.data.league.commissionerToken as string
}

describe('PUT /api/leagues/[commissionerToken]/teams', () => {
  it('replaces the team list', async () => {
    const token = await createTestLeague()
    const teams = Array.from({ length: 6 }, (_, i) => ({ name: `Team ${i}` }))

    const response = await PUT(
      new NextRequest(`http://localhost/api/leagues/${token}/teams`, {
        method: 'PUT',
        body: JSON.stringify({ teams }),
      }),
      { params: Promise.resolve({ commissionerToken: token }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveLength(6)
  })

  it('returns 400 for fewer than 6 teams', async () => {
    const token = await createTestLeague()
    const teams = [{ name: 'Only one' }]

    const response = await PUT(
      new NextRequest(`http://localhost/api/leagues/${token}/teams`, {
        method: 'PUT',
        body: JSON.stringify({ teams }),
      }),
      { params: Promise.resolve({ commissionerToken: token }) }
    )
    expect(response.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- "app/api/leagues/\[commissionerToken\]/teams/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement**

Create `app/api/leagues/[commissionerToken]/teams/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { replaceTeams } from '@/lib/leagueService'
import { enforceRateLimit } from '@/lib/rateLimit'
import { SupabaseLeagueRepository } from '@/lib/repository.supabase'

const repo = new SupabaseLeagueRepository()

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ commissionerToken: string }> }
) {
  const { commissionerToken } = await params
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  const limited = await enforceRateLimit(repo, `${ip}:PUT:/api/leagues/teams`)
  if (limited) return NextResponse.json(limited, { status: 429 })

  const body = await request.json()
  const result = await replaceTeams(repo, commissionerToken, body)
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- "app/api/leagues/\[commissionerToken\]/teams/route.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/leagues/[commissionerToken]/teams/route.ts" "app/api/leagues/[commissionerToken]/teams/route.test.ts"
git commit -m "feat: add replace-teams API route"
```

---

### Task 15: API routes — start draft and reveal next pick

**Files:**
- Create: `app/api/leagues/[commissionerToken]/start/route.ts`
- Test: `app/api/leagues/[commissionerToken]/start/route.test.ts`
- Create: `app/api/leagues/[commissionerToken]/reveal/route.ts`
- Test: `app/api/leagues/[commissionerToken]/reveal/route.test.ts`

**Interfaces:**
- Consumes: `startDraft`/`revealNext` (Task 8), `broadcastReveal` (Task 12), `enforceRateLimit` (Task 9).
- Produces: `POST /api/leagues/[commissionerToken]/start`, `POST /api/leagues/[commissionerToken]/reveal` — consumed by the commissioner manage page (Task 19).

- [ ] **Step 1: Write failing tests for the start route**

Create `app/api/leagues/[commissionerToken]/start/route.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/repository.supabase', () => {
  const { MemoryLeagueRepository } = require('@/lib/repository.memory')
  return { SupabaseLeagueRepository: MemoryLeagueRepository }
})
vi.mock('@/lib/realtime', () => ({ broadcastReveal: vi.fn() }))

import { POST as createLeagueRoute } from '../../route'
import { PUT as putTeams } from '../teams/route'
import { POST } from './route'

async function createReadyLeague() {
  const createResponse = await createLeagueRoute(
    new NextRequest('http://localhost/api/leagues', {
      method: 'POST',
      body: JSON.stringify({ name: 'My League', mode: 'random' }),
    })
  )
  const created = await (await createResponse.json())
  const token = created.data.league.commissionerToken

  await putTeams(
    new NextRequest(`http://localhost/api/leagues/${token}/teams`, {
      method: 'PUT',
      body: JSON.stringify({ teams: Array.from({ length: 6 }, (_, i) => ({ name: `Team ${i}` })) }),
    }),
    { params: Promise.resolve({ commissionerToken: token }) }
  )

  return token
}

describe('POST /api/leagues/[commissionerToken]/start', () => {
  it('starts the draft', async () => {
    const token = await createReadyLeague()
    const response = await POST(new NextRequest(`http://localhost/api/leagues/${token}/start`, { method: 'POST' }), {
      params: Promise.resolve({ commissionerToken: token }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.status).toBe('live')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- "app/api/leagues/\[commissionerToken\]/start/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement the start route**

Create `app/api/leagues/[commissionerToken]/start/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { startDraft } from '@/lib/leagueService'
import { enforceRateLimit } from '@/lib/rateLimit'
import { SupabaseLeagueRepository } from '@/lib/repository.supabase'

const repo = new SupabaseLeagueRepository()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ commissionerToken: string }> }
) {
  const { commissionerToken } = await params
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  const limited = await enforceRateLimit(repo, `${ip}:POST:/api/leagues/start`)
  if (limited) return NextResponse.json(limited, { status: 429 })

  const result = await startDraft(repo, commissionerToken)
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- "app/api/leagues/\[commissionerToken\]/start/route.test.ts"`
Expected: PASS (1 test).

- [ ] **Step 5: Write failing tests for the reveal route**

Create `app/api/leagues/[commissionerToken]/reveal/route.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/repository.supabase', () => {
  const { MemoryLeagueRepository } = require('@/lib/repository.memory')
  return { SupabaseLeagueRepository: MemoryLeagueRepository }
})
const broadcastReveal = vi.fn()
vi.mock('@/lib/realtime', () => ({ broadcastReveal }))

import { POST as createLeagueRoute } from '../../route'
import { PUT as putTeams } from '../teams/route'
import { POST as startRoute } from '../start/route'
import { POST } from './route'

async function createLiveLeague() {
  const createResponse = await createLeagueRoute(
    new NextRequest('http://localhost/api/leagues', {
      method: 'POST',
      body: JSON.stringify({ name: 'My League', mode: 'random' }),
    })
  )
  const created = await createResponse.json()
  const token = created.data.league.commissionerToken

  await putTeams(
    new NextRequest(`http://localhost/api/leagues/${token}/teams`, {
      method: 'PUT',
      body: JSON.stringify({ teams: Array.from({ length: 6 }, (_, i) => ({ name: `Team ${i}` })) }),
    }),
    { params: Promise.resolve({ commissionerToken: token }) }
  )
  await startRoute(new NextRequest(`http://localhost/api/leagues/${token}/start`, { method: 'POST' }), {
    params: Promise.resolve({ commissionerToken: token }),
  })

  return token
}

describe('POST /api/leagues/[commissionerToken]/reveal', () => {
  it('reveals the next pick and broadcasts it', async () => {
    const token = await createLiveLeague()
    const response = await POST(
      new NextRequest(`http://localhost/api/leagues/${token}/reveal`, {
        method: 'POST',
        body: JSON.stringify({ expectedRevealedCount: 0 }),
      }),
      { params: Promise.resolve({ commissionerToken: token }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.slot).toBe(6)
    expect(broadcastReveal).toHaveBeenCalledOnce()
  })

  it('returns 409 on a conflicting reveal', async () => {
    const token = await createLiveLeague()
    await POST(
      new NextRequest(`http://localhost/api/leagues/${token}/reveal`, {
        method: 'POST',
        body: JSON.stringify({ expectedRevealedCount: 0 }),
      }),
      { params: Promise.resolve({ commissionerToken: token }) }
    )
    const response = await POST(
      new NextRequest(`http://localhost/api/leagues/${token}/reveal`, {
        method: 'POST',
        body: JSON.stringify({ expectedRevealedCount: 0 }),
      }),
      { params: Promise.resolve({ commissionerToken: token }) }
    )
    expect(response.status).toBe(409)
  })
})
```

- [ ] **Step 6: Run test, verify it fails**

Run: `npm test -- "app/api/leagues/\[commissionerToken\]/reveal/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 7: Implement the reveal route**

Create `app/api/leagues/[commissionerToken]/reveal/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { revealNext, getCommissionerView } from '@/lib/leagueService'
import { enforceRateLimit } from '@/lib/rateLimit'
import { broadcastReveal } from '@/lib/realtime'
import { SupabaseLeagueRepository } from '@/lib/repository.supabase'

const repo = new SupabaseLeagueRepository()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ commissionerToken: string }> }
) {
  const { commissionerToken } = await params
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  const limited = await enforceRateLimit(repo, `${ip}:POST:/api/leagues/reveal`)
  if (limited) return NextResponse.json(limited, { status: 429 })

  const body = await request.json()
  const result = await revealNext(repo, commissionerToken, body.expectedRevealedCount)

  if (!result.success) {
    const status = result.error.includes('already revealed') ? 409 : 400
    return NextResponse.json(result, { status })
  }

  const view = await getCommissionerView(repo, commissionerToken)
  if (view.success) {
    await broadcastReveal(view.data.league.viewerToken, {
      teamId: result.data.teamId,
      teamName: result.data.teamName,
      slot: result.data.slot,
      status: result.data.status as 'live' | 'complete',
    })
  }

  return NextResponse.json(result, { status: 200 })
}
```

- [ ] **Step 8: Run test, verify it passes**

Run: `npm test -- "app/api/leagues/\[commissionerToken\]/reveal/route.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add "app/api/leagues/[commissionerToken]/start" "app/api/leagues/[commissionerToken]/reveal"
git commit -m "feat: add start-draft and reveal-next API routes"
```

---

### Task 16: API route — public viewer state

**Files:**
- Create: `app/api/view/[viewerToken]/route.ts`
- Test: `app/api/view/[viewerToken]/route.test.ts`

**Interfaces:**
- Consumes: `getViewerState` (Task 8), `enforceRateLimit` (Task 9).
- Produces: `GET /api/view/[viewerToken]` — consumed by the viewer page (Task 20).

- [ ] **Step 1: Write failing tests**

Create `app/api/view/[viewerToken]/route.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/repository.supabase', () => {
  const { MemoryLeagueRepository } = require('@/lib/repository.memory')
  return { SupabaseLeagueRepository: MemoryLeagueRepository }
})

import { POST as createLeagueRoute } from '../../leagues/route'
import { GET } from './route'

describe('GET /api/view/[viewerToken]', () => {
  it('returns public league state for a valid viewer token', async () => {
    const createResponse = await createLeagueRoute(
      new NextRequest('http://localhost/api/leagues', {
        method: 'POST',
        body: JSON.stringify({ name: 'My League', mode: 'random' }),
      })
    )
    const created = await createResponse.json()
    const viewerToken = created.data.league.viewerToken

    const response = await GET(new NextRequest(`http://localhost/api/view/${viewerToken}`), {
      params: Promise.resolve({ viewerToken }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.name).toBe('My League')
    expect(body.data.revealed).toEqual([])
  })

  it('returns 404 for an unknown viewer token', async () => {
    const response = await GET(new NextRequest('http://localhost/api/view/nope'), {
      params: Promise.resolve({ viewerToken: 'nope' }),
    })
    expect(response.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- "app/api/view/\[viewerToken\]/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement**

Create `app/api/view/[viewerToken]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getViewerState } from '@/lib/leagueService'
import { enforceRateLimit } from '@/lib/rateLimit'
import { SupabaseLeagueRepository } from '@/lib/repository.supabase'

const repo = new SupabaseLeagueRepository()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ viewerToken: string }> }
) {
  const { viewerToken } = await params
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  const limited = await enforceRateLimit(repo, `${ip}:GET:/api/view`)
  if (limited) return NextResponse.json(limited, { status: 429 })

  const result = await getViewerState(repo, viewerToken)
  return NextResponse.json(result, { status: result.success ? 200 : 404 })
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- "app/api/view/\[viewerToken\]/route.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full unit suite**

Run: `npm test`
Expected: all unit test files pass.

- [ ] **Step 6: Commit**

```bash
git add "app/api/view"
git commit -m "feat: add public viewer-state API route"
```

---

### Task 17: Frontend — create league page

**Files:**
- Modify: `app/page.tsx`
- Test: `app/page.test.tsx`

**Interfaces:**
- Consumes: `createLeagueSchema` (Task 6, for client-side field limits), `POST /api/leagues` (Task 13).
- Produces: the landing page — a form that, on submit, calls `POST /api/leagues` and redirects to `/league/{commissionerToken}/manage`.

- [ ] **Step 1: Write a failing component test**

Create `app/page.test.tsx`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Page from './page'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

describe('Home page', () => {
  beforeEach(() => {
    push.mockClear()
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: { league: { commissionerToken: 'commish-123' } },
      }),
    }) as unknown as typeof fetch
  })

  it('creates a league and redirects to the manage page', async () => {
    render(<Page />)

    fireEvent.change(screen.getByLabelText(/league name/i), { target: { value: 'My League' } })
    fireEvent.click(screen.getByRole('button', { name: /create league/i }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/league/commish-123/manage'))
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- app/page.test.tsx`
Expected: FAIL (either the default scaffolded page doesn't have the expected form, or the module errors).

- [ ] **Step 3: Implement**

Replace the contents of `app/page.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LotteryMode } from '@/lib/types'

export default function Page() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [mode, setMode] = useState<LotteryMode>('random')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const response = await fetch('/api/leagues', {
      method: 'POST',
      body: JSON.stringify({ name, mode }),
    })
    const body = await response.json()

    if (!body.success) {
      setError(body.error)
      return
    }

    router.push(`/league/${body.data.league.commissionerToken}/manage`)
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold">Fantasy Draft Lottery</h1>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          League name
          <input
            className="border rounded px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          Lottery mode
          <select
            className="border rounded px-3 py-2"
            value={mode}
            onChange={(e) => setMode(e.target.value as LotteryMode)}
          >
            <option value="random">Random — equal odds for everyone</option>
            <option value="weighted">Weighted — custom odds per team</option>
          </select>
        </label>
        {error && <p className="text-red-600">{error}</p>}
        <button type="submit" className="bg-black text-white rounded px-4 py-2">
          Create League
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- app/page.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/page.test.tsx
git commit -m "feat: add create-league landing page"
```

---

### Task 18: Frontend — commissioner manage page (setup view)

**Files:**
- Create: `app/league/[commissionerToken]/manage/page.tsx`
- Test: `app/league/[commissionerToken]/manage/page.test.tsx`

**Interfaces:**
- Consumes: `GET /api/leagues/[commissionerToken]` (Task 13), `PUT /api/leagues/[commissionerToken]/teams` (Task 14), `POST /api/leagues/[commissionerToken]/start` (Task 15).
- Produces: the commissioner control panel for `status === 'setup'` — an editable team/weight list and a "Start Draft" button. (The `'live'`/`'complete'` views are added in Task 19.)

- [ ] **Step 1: Write a failing component test**

Create `app/league/[commissionerToken]/manage/page.test.tsx`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Page from './page'

vi.mock('next/navigation', () => ({ useParams: () => ({ commissionerToken: 'commish-123' }) }))

describe('Commissioner manage page (setup)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (!init && url.includes('/api/leagues/')) {
        return Promise.resolve({
          json: async () => ({
            success: true,
            data: {
              league: {
                commissionerToken: 'commish-123',
                viewerToken: 'viewer-456',
                name: 'My League',
                mode: 'random',
                status: 'setup',
                revealedCount: 0,
              },
              teams: [],
            },
          }),
        })
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) })
    }) as unknown as typeof fetch
  })

  it('shows the viewer link for sharing', async () => {
    render(<Page />)
    await waitFor(() => expect(screen.getByText(/viewer-456/)).toBeInTheDocument())
  })

  it('warns the commissioner to bookmark this page', async () => {
    render(<Page />)
    await waitFor(() => expect(screen.getByText(/bookmark this page/i)).toBeInTheDocument())
  })

  it('adds a team row when "Add team" is clicked', async () => {
    render(<Page />)
    await waitFor(() => screen.getByRole('button', { name: /add team/i }))

    fireEvent.click(screen.getByRole('button', { name: /add team/i }))

    expect(screen.getAllByPlaceholderText(/team name/i)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- "app/league/\[commissionerToken\]/manage/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'`.

- [ ] **Step 3: Implement**

Create `app/league/[commissionerToken]/manage/page.tsx`:
```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import type { League, Team } from '@/lib/types'

interface TeamInput {
  name: string
  weight: string
}

export default function Page() {
  const { commissionerToken } = useParams<{ commissionerToken: string }>()
  const [league, setLeague] = useState<League | null>(null)
  const [teamInputs, setTeamInputs] = useState<TeamInput[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/leagues/${commissionerToken}`)
      .then((r) => r.json())
      .then((body) => {
        if (body.success) {
          setLeague(body.data.league)
          setTeamInputs(
            body.data.teams.map((t: Team) => ({ name: t.name, weight: t.weight?.toString() ?? '' }))
          )
        }
      })
  }, [commissionerToken])

  if (!league) return <main className="p-8">Loading...</main>

  function updateTeam(index: number, field: keyof TeamInput, value: string) {
    setTeamInputs((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)))
  }

  function addTeam() {
    setTeamInputs((prev) => [...prev, { name: '', weight: '' }])
  }

  async function saveTeams() {
    setError(null)
    const teams = teamInputs.map((t) => ({
      name: t.name,
      weight: t.weight ? Number(t.weight) : undefined,
    }))
    const response = await fetch(`/api/leagues/${commissionerToken}/teams`, {
      method: 'PUT',
      body: JSON.stringify({ teams }),
    })
    const body = await response.json()
    if (!body.success) setError(body.error)
  }

  async function startDraft() {
    setError(null)
    await saveTeams()
    const response = await fetch(`/api/leagues/${commissionerToken}/start`, { method: 'POST' })
    const body = await response.json()
    if (!body.success) {
      setError(body.error)
      return
    }
    setLeague(body.data)
  }

  if (league.status !== 'setup') {
    return <main className="p-8">Draft is {league.status}. Reveal controls load in the next task.</main>
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">{league.name}</h1>
      <p className="mt-2 text-sm font-semibold text-amber-700">
        Bookmark this page — it's your only way to manage this league. There's no login, so if you lose this link it can't be recovered.
      </p>
      <p className="mt-2 text-sm text-gray-600">
        Share this viewer link with your league: <code>/watch/{league.viewerToken}</code>
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {teamInputs.map((team, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="border rounded px-3 py-2 flex-1"
              placeholder="Team name"
              value={team.name}
              onChange={(e) => updateTeam(i, 'name', e.target.value)}
            />
            {league.mode === 'weighted' && (
              <input
                className="border rounded px-3 py-2 w-24"
                placeholder="Weight"
                type="number"
                min={1}
                value={team.weight}
                onChange={(e) => updateTeam(i, 'weight', e.target.value)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-3">
        <button onClick={addTeam} className="border rounded px-4 py-2">
          Add team
        </button>
        <button onClick={saveTeams} className="border rounded px-4 py-2">
          Save teams
        </button>
        <button onClick={startDraft} className="bg-black text-white rounded px-4 py-2">
          Start Draft
        </button>
      </div>

      {error && <p className="mt-3 text-red-600">{error}</p>}
    </main>
  )
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- "app/league/\[commissionerToken\]/manage/page.test.tsx"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/league"
git commit -m "feat: add commissioner manage page for league setup"
```

---

### Task 19: Frontend — commissioner manage page (live/complete view)

**Files:**
- Modify: `app/league/[commissionerToken]/manage/page.tsx`
- Modify: `app/league/[commissionerToken]/manage/page.test.tsx`

**Interfaces:**
- Consumes: `POST /api/leagues/[commissionerToken]/reveal` (Task 15).
- Produces: the "live" and "complete" branches of the manage page — a "Reveal Next Pick" button and the running bottom-up list, replacing the placeholder text from Task 18.

- [ ] **Step 1: Add failing tests for the live view**

Append to `app/league/[commissionerToken]/manage/page.test.tsx`:
```typescript
describe('Commissioner manage page (live)', () => {
  beforeEach(() => {
    let revealedCount = 0
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith(`/api/leagues/commish-123`) && !init) {
        return Promise.resolve({
          json: async () => ({
            success: true,
            data: {
              league: {
                commissionerToken: 'commish-123',
                viewerToken: 'viewer-456',
                name: 'My League',
                mode: 'random',
                status: 'live',
                revealedCount,
              },
              teams: [{ id: 't1', name: 'Team A' }],
            },
          }),
        })
      }
      if (url.endsWith('/reveal')) {
        revealedCount += 1
        return Promise.resolve({
          json: async () => ({
            success: true,
            data: { teamId: 't1', teamName: 'Team A', slot: 1, status: 'complete' },
          }),
        })
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) })
    }) as unknown as typeof fetch
  })

  it('reveals the next pick when clicked', async () => {
    render(<Page />)
    await waitFor(() => screen.getByRole('button', { name: /reveal next pick/i }))

    fireEvent.click(screen.getByRole('button', { name: /reveal next pick/i }))

    await waitFor(() => expect(screen.getByText(/slot 1/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- "app/league/\[commissionerToken\]/manage/page.test.tsx"`
Expected: FAIL — the placeholder text from Task 18 renders instead of a "Reveal Next Pick" button.

- [ ] **Step 3: Implement the live/complete branch**

In `app/league/[commissionerToken]/manage/page.tsx`, replace the placeholder block:
```tsx
  if (league.status !== 'setup') {
    return <main className="p-8">Draft is {league.status}. Reveal controls load in the next task.</main>
  }
```
with:
```tsx
  if (league.status === 'live' || league.status === 'complete') {
    return <LiveDraftView commissionerToken={commissionerToken} league={league} />
  }
```

Add below the `Page` component in the same file:
```tsx
function LiveDraftView({ commissionerToken, league }: { commissionerToken: string; league: League }) {
  const [revealed, setRevealed] = useState<{ teamId: string; teamName: string; slot: number }[]>([])
  const [status, setStatus] = useState(league.status)
  const [error, setError] = useState<string | null>(null)

  async function revealNext() {
    setError(null)
    const response = await fetch(`/api/leagues/${commissionerToken}/reveal`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevealedCount: revealed.length }),
    })
    const body = await response.json()
    if (!body.success) {
      setError(body.error)
      return
    }
    setRevealed((prev) => [
      ...prev,
      { teamId: body.data.teamId, teamName: body.data.teamName, slot: body.data.slot },
    ])
    setStatus(body.data.status)
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
      {status !== 'complete' && (
        <button onClick={revealNext} className="mt-4 bg-black text-white rounded px-4 py-2">
          Reveal Next Pick
        </button>
      )}
      {error && <p className="mt-3 text-red-600">{error}</p>}
    </main>
  )
}
```

Add `useState` import already present; ensure `League` type is imported (already imported in Task 18).

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- "app/league/\[commissionerToken\]/manage/page.test.tsx"`
Expected: PASS (4 tests total across both describe blocks).

- [ ] **Step 5: Commit**

```bash
git add "app/league/[commissionerToken]/manage/page.tsx" "app/league/[commissionerToken]/manage/page.test.tsx"
git commit -m "feat: add live reveal view to commissioner manage page"
```

---

### Task 20: Frontend — viewer page

**Files:**
- Create: `app/watch/[viewerToken]/page.tsx`
- Test: `app/watch/[viewerToken]/page.test.tsx`

**Interfaces:**
- Consumes: `GET /api/view/[viewerToken]` (Task 16), `subscribeToReveals` (Task 12).
- Produces: the public watch page — shows already-revealed picks on load (bottom-up list, matching the approved mockup), then appends new picks in real time as they're broadcast.

- [ ] **Step 1: Write failing tests**

Create `app/watch/[viewerToken]/page.test.tsx`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import Page from './page'

vi.mock('next/navigation', () => ({ useParams: () => ({ viewerToken: 'viewer-456' }) }))

let capturedOnReveal: ((payload: any) => void) | null = null
vi.mock('@/lib/realtimeClient', () => ({
  subscribeToReveals: (_token: string, onReveal: (payload: any) => void) => {
    capturedOnReveal = onReveal
    return () => {}
  },
}))

describe('Viewer page', () => {
  beforeEach(() => {
    capturedOnReveal = null
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: {
          name: 'My League',
          mode: 'random',
          status: 'live',
          teamCount: 6,
          revealed: [{ teamId: 't1', teamName: 'Team A', slot: 6 }],
        },
      }),
    }) as unknown as typeof fetch
  })

  it('shows already-revealed picks on load', async () => {
    render(<Page />)
    await waitFor(() => expect(screen.getByText(/Team A/)).toBeInTheDocument())
    expect(screen.getByText(/slot 6/i)).toBeInTheDocument()
  })

  it('appends a new pick when a realtime broadcast arrives', async () => {
    render(<Page />)
    await waitFor(() => expect(capturedOnReveal).not.toBeNull())

    act(() => {
      capturedOnReveal!({ teamId: 't2', teamName: 'Team B', slot: 5, status: 'live' })
    })

    await waitFor(() => expect(screen.getByText(/slot 5/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- "app/watch/\[viewerToken\]/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'`.

- [ ] **Step 3: Implement**

Create `app/watch/[viewerToken]/page.tsx`:
```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { subscribeToReveals } from '@/lib/realtimeClient'
import type { PublicLeagueState } from '@/lib/types'

export default function Page() {
  const { viewerToken } = useParams<{ viewerToken: string }>()
  const [state, setState] = useState<PublicLeagueState | null>(null)

  useEffect(() => {
    fetch(`/api/view/${viewerToken}`)
      .then((r) => r.json())
      .then((body) => {
        if (body.success) setState(body.data)
      })
  }, [viewerToken])

  useEffect(() => {
    if (!state || state.status === 'complete') return
    return subscribeToReveals(viewerToken, (payload) => {
      setState((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          status: payload.status,
          revealed: [...prev.revealed, { teamId: payload.teamId, teamName: payload.teamName, slot: payload.slot }],
        }
      })
    })
  }, [viewerToken, state?.status])

  if (!state) return <main className="p-8">Loading...</main>

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">{state.name}</h1>
      <p className="text-sm text-gray-600">{state.teamCount} teams &middot; {state.status}</p>
      <div className="mt-6 flex flex-col gap-2">
        {state.revealed.map((pick, i) => (
          <div key={i} className="border rounded px-4 py-2 animate-in fade-in">
            Slot {pick.slot} — {pick.teamName}
          </div>
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- "app/watch/\[viewerToken\]/page.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full unit test suite and check coverage**

Run:
```bash
npx vitest run --coverage
```
Expected: all tests pass; line coverage across `lib/` and `app/` is at least 80%. If below, add missing test cases for uncovered branches before proceeding.

- [ ] **Step 6: Commit**

```bash
git add "app/watch"
git commit -m "feat: add viewer page with realtime pick reveals"
```

---

### Task 21: End-to-end test — full draft flow

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/full-draft-flow.spec.ts`
- Modify: `package.json` (add `test:e2e` script)

**Interfaces:**
- Consumes: the full running app (all previous tasks) against a real Supabase project (Task 10/11).
- Produces: automated coverage of the spec's own "Manual/E2E pass" requirement — create league, set up 6 teams, start draft, reveal all picks, verify the viewer sees the same final order.

- [ ] **Step 1: Configure Playwright**

Create `playwright.config.ts`:
```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  use: { baseURL: 'http://localhost:3000' },
})
```

Add to `package.json` scripts: `"test:e2e": "playwright test"`.

- [ ] **Step 2: Write the E2E test**

Create `e2e/full-draft-flow.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test('commissioner runs a random-mode draft and the viewer sees the final order', async ({ page, context }) => {
  await page.goto('/')
  await page.getByLabel(/league name/i).fill('E2E Test League')
  await page.getByRole('button', { name: /create league/i }).click()

  await page.waitForURL(/\/league\/.+\/manage/)

  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: /add team/i }).click()
  }
  const nameInputs = page.getByPlaceholder(/team name/i)
  for (let i = 0; i < 6; i++) {
    await nameInputs.nth(i).fill(`Team ${i}`)
  }
  await page.getByRole('button', { name: /^save teams$/i }).click()
  await page.getByRole('button', { name: /start draft/i }).click()

  const viewerLinkText = await page.getByText(/\/watch\//).innerText()
  const viewerPath = viewerLinkText.match(/\/watch\/\S+/)?.[0]
  expect(viewerPath).toBeTruthy()

  const viewerPage = await context.newPage()
  await viewerPage.goto(viewerPath!)

  const commissionerPicks: string[] = []
  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: /reveal next pick/i }).click()
    await page.waitForTimeout(300) // allow the realtime broadcast to arrive
  }

  await expect(viewerPage.getByText(/slot 1/i)).toBeVisible()
  const revealedOnViewer = await viewerPage.locator('text=/Slot \\d+/').count()
  expect(revealedOnViewer).toBe(6)
})
```

- [ ] **Step 3: Run the E2E test**

Run:
```bash
npm run test:e2e
```
Expected: PASS (1 test). Requires `.env.local` (Task 10) to be populated, since this hits the real dev server and Supabase project.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts e2e/full-draft-flow.spec.ts package.json
git commit -m "test: add end-to-end draft flow test"
```

---

### Task 22: README and deployment notes

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: nothing — this documents the finished system for whoever deploys it.

- [ ] **Step 1: Write the README**

Create `README.md`:
```markdown
# Fantasy Draft Lottery

A link-based website for running a fantasy football draft-order lottery, with a live bottom-up reveal.

## Setup

1. `npm install`
2. Create a Supabase project and apply `supabase/migrations/0001_init.sql` (see `docs/superpowers/plans/2026-07-20-fantasy-draft-lottery.md`, Task 10, for exact steps).
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and deployment notes"
```
