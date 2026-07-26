import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
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

  it('shows a tap-to-enable-sound prompt before the first interaction', async () => {
    render(<Page />)
    await waitFor(() => expect(screen.getByRole('button', { name: /enable sound/i })).toBeInTheDocument())
  })

  it('hides the sound prompt and does not block the reveal animation after tapping it', async () => {
    render(<Page />)
    const enableButton = await waitFor(() => screen.getByRole('button', { name: /enable sound/i }))

    fireEvent.click(enableButton)

    await waitFor(() => expect(screen.queryByRole('button', { name: /enable sound/i })).not.toBeInTheDocument())
  })

  it('does not duplicate a pick between its animation and the settled list', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Page />)
    await waitFor(() => expect(capturedOnReveal).not.toBeNull())

    act(() => {
      capturedOnReveal!({ teamId: 't2', teamName: 'Team B', slot: 5, status: 'live' })
    })

    // While the animation plays, exactly one "Slot 5 — Team B" node exists
    // (rendered by RevealAnimation) — not a second one from the settled list.
    await waitFor(() => expect(screen.getAllByText(/^Slot 5 —.*Team B/)).toHaveLength(1))

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    // After the animation completes and unmounts, still exactly one — now
    // rendered by the settled list instead.
    await waitFor(() => expect(screen.getAllByText(/^Slot 5 —.*Team B/)).toHaveLength(1))

    vi.useRealTimers()
  })
})
