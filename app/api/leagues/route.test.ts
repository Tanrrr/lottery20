import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/repository.supabase', async () => {
  const { MemoryLeagueRepository } = await import('@/lib/repository.memory')
  return { SupabaseLeagueRepository: MemoryLeagueRepository }
})

import { POST } from './route'

describe('POST /api/leagues', () => {
  it('creates a league and returns tokens', async () => {
    const request = new NextRequest('http://localhost/api/leagues', {
      method: 'POST',
      body: JSON.stringify({ name: 'My League', mode: 'random' }),
    })
    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.league.commissionerToken).toBeTruthy()
    expect(body.data.league.viewerToken).toBeTruthy()
  })

  it('returns a 400 for invalid input', async () => {
    const request = new NextRequest('http://localhost/api/leagues', {
      method: 'POST',
      body: JSON.stringify({ name: '', mode: 'random' }),
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
