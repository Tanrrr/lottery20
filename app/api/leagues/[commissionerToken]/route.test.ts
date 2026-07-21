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
      constructor() {
        return sharedInstance
      }
    },
  }
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
