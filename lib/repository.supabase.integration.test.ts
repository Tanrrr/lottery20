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
