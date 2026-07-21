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
