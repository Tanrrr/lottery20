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

  // Regression test for the data-integrity bug found during Task 21 E2E
  // testing: replaceTeams() used to run a separate DELETE then INSERT
  // (two round-trips, no transaction), so two overlapping PUT requests for
  // the same league (e.g. a double-clicked "Save teams" button) could both
  // run their DELETE before either INSERT landed, duplicating every team
  // row (12 rows instead of 6, in the reproduction). replaceTeams() now
  // calls the replace_league_teams() Postgres function (see
  // supabase/migrations/0002_atomic_replace_teams.sql), which wraps the
  // delete+insert in a single transaction so concurrent calls serialize at
  // the database level instead of racing.
  it('keeps exactly one set of teams when replaceTeams is called concurrently', async () => {
    const league = await repo.createLeague({ name: 'Concurrency Test League', mode: 'random' })

    const teamInputs = Array.from({ length: 6 }, (_, i) => ({ name: `Concurrent Team ${i}` }))

    const [first, second] = await Promise.all([
      repo.replaceTeams(league.commissionerToken, teamInputs),
      repo.replaceTeams(league.commissionerToken, teamInputs),
    ])

    // Each call's own response should reflect a clean replace (6 rows), not
    // a partial or duplicated set.
    expect(first).toHaveLength(6)
    expect(second).toHaveLength(6)

    const finalState = await repo.getByCommissionerToken(league.commissionerToken)
    expect(finalState?.teams).toHaveLength(6)
  })
})
