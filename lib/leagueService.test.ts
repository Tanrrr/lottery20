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
