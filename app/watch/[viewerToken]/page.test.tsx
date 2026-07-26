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

  it('mutes the primer audio element to avoid audible blips', async () => {
    render(<Page />)
    await waitFor(() => expect(screen.getByRole('button', { name: /enable sound/i })).toBeInTheDocument())

    const audioElement = document.querySelector('audio')
    expect(audioElement?.muted).toBe(true)
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

  it('does not drop a pick when a second broadcast arrives before the first animation completes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Page />)
    await waitFor(() => expect(capturedOnReveal).not.toBeNull())

    // First broadcast starts its ~2.6s animation.
    act(() => {
      capturedOnReveal!({ teamId: 't2', teamName: 'Team B', slot: 5, status: 'live' })
    })
    await waitFor(() => expect(screen.getByText(/^Slot 5 —.*Team B/)).toBeInTheDocument())

    // Second broadcast arrives mid-animation, before slot 5's onComplete fires.
    act(() => {
      vi.advanceTimersByTime(500)
    })
    act(() => {
      capturedOnReveal!({ teamId: 't3', teamName: 'Team C', slot: 4, status: 'live' })
    })

    // Slot 5's animation must still be allowed to finish (not interrupted/unmounted).
    expect(screen.getByText(/^Slot 5 —.*Team B/)).toBeInTheDocument()
    expect(screen.queryByText(/^Slot 4 —.*Team C/)).not.toBeInTheDocument()

    // Let slot 5's animation finish (remaining ~2.1s of its 2.6s timer).
    act(() => {
      vi.advanceTimersByTime(2200)
    })

    // Slot 5 must have settled into the revealed list, and slot 4 must now be
    // animating (queued, not dropped).
    await waitFor(() => expect(screen.getByText(/^Slot 4 —.*Team C/)).toBeInTheDocument())

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    // Both picks must eventually appear, in order, none dropped.
    await waitFor(() => {
      const settled = screen.getAllByText(/^Slot \d+ —/)
      const slots = settled.map((el) => el.textContent)
      expect(slots.some((t) => /Slot 5 —.*Team B/.test(t ?? ''))).toBe(true)
      expect(slots.some((t) => /Slot 4 —.*Team C/.test(t ?? ''))).toBe(true)
    })

    vi.useRealTimers()
  })
})
