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
  const created = await createResponse.json()
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
