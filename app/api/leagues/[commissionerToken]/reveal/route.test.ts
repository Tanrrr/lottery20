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
import { POST as startRoute } from '../start/route'
import { POST } from './route'
import { broadcastReveal } from '@/lib/realtime'

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
