import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/repository.supabase', async () => {
  const { MemoryLeagueRepository } = await import('@/lib/repository.memory')
  const globalState = globalThis as unknown as { __test_shared_repo__?: InstanceType<typeof MemoryLeagueRepository> }
  if (!globalState.__test_shared_repo__) {
    globalState.__test_shared_repo__ = new MemoryLeagueRepository()
  }
  const sharedInstance = globalState.__test_shared_repo__
  return {
    SupabaseLeagueRepository: class {
      constructor() { return sharedInstance }
    },
  }
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
