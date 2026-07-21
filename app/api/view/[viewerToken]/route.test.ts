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
