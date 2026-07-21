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
