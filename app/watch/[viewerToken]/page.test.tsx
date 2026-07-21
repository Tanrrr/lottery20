import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import Page from './page'
import type { RevealBroadcastPayload } from '@/lib/realtime'

vi.mock('next/navigation', () => ({ useParams: () => ({ viewerToken: 'viewer-456' }) }))

let capturedOnReveal: ((payload: RevealBroadcastPayload) => void) | null = null
vi.mock('@/lib/realtimeClient', () => ({
  subscribeToReveals: (_token: string, onReveal: (payload: RevealBroadcastPayload) => void) => {
    capturedOnReveal = onReveal
    return () => {}
  },
}))

describe('Viewer page', () => {
  beforeEach(() => {
    capturedOnReveal = null
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: {
          name: 'My League',
          mode: 'random',
          status: 'live',
          teamCount: 6,
          revealed: [{ teamId: 't1', teamName: 'Team A', slot: 6 }],
        },
      }),
    }) as unknown as typeof fetch
  })

  it('shows already-revealed picks on load', async () => {
    render(<Page />)
    await waitFor(() => expect(screen.getByText(/Team A/)).toBeInTheDocument())
    expect(screen.getByText(/slot 6/i)).toBeInTheDocument()
  })

  it('appends a new pick when a realtime broadcast arrives', async () => {
    render(<Page />)
    await waitFor(() => expect(capturedOnReveal).not.toBeNull())

    act(() => {
      capturedOnReveal!({ teamId: 't2', teamName: 'Team B', slot: 5, status: 'live' })
    })

    await waitFor(() => expect(screen.getByText(/slot 5/i)).toBeInTheDocument())
  })
})
