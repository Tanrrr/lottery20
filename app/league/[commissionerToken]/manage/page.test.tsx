import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import Page from './page'

vi.mock('next/navigation', () => ({ useParams: () => ({ commissionerToken: 'commish-123' }) }))

describe('Commissioner manage page (setup)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (!init && url.includes('/api/leagues/')) {
        return Promise.resolve({
          json: async () => ({
            success: true,
            data: {
              league: {
                commissionerToken: 'commish-123',
                viewerToken: 'viewer-456',
                name: 'My League',
                mode: 'random',
                status: 'setup',
                revealedCount: 0,
              },
              teams: [],
            },
          }),
        })
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) })
    }) as unknown as typeof fetch
  })

  it('shows the viewer link for sharing', async () => {
    render(<Page />)
    await waitFor(() => expect(screen.getByText(/viewer-456/)).toBeDefined())
  })

  it('warns the commissioner to bookmark this page', async () => {
    render(<Page />)
    await waitFor(() => expect(screen.getByText(/bookmark this page/i)).toBeDefined())
  })

  it('adds a team row when "Add team" is clicked', async () => {
    render(<Page />)
    await waitFor(() => screen.getByRole('button', { name: /add team/i }))

    fireEvent.click(screen.getByRole('button', { name: /add team/i }))

    expect(screen.getAllByPlaceholderText(/team name/i)).toHaveLength(1)
  })

  it('shows error message instead of loading when initial GET fails', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (!init && url.includes('/api/leagues/')) {
        return Promise.resolve({
          json: async () => ({
            success: false,
            error: 'League not found',
          }),
        })
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) })
    }) as unknown as typeof fetch

    render(<Page />)
    await waitFor(() => expect(screen.getByText(/league not found/i)).toBeDefined())
  })

  it('does not call POST /start if PUT /teams fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (!init && url.includes('/api/leagues/')) {
        return Promise.resolve({
          json: async () => ({
            success: true,
            data: {
              league: {
                commissionerToken: 'commish-123',
                viewerToken: 'viewer-456',
                name: 'My League',
                mode: 'random',
                status: 'setup',
                revealedCount: 0,
              },
              teams: [],
            },
          }),
        })
      }
      if (init?.method === 'PUT' && url.includes('/teams')) {
        return Promise.resolve({
          json: async () => ({
            success: false,
            error: 'Invalid team data',
          }),
        })
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) })
    }) as unknown as typeof fetch
    global.fetch = fetchMock

    render(<Page />)
    await waitFor(() => screen.getByRole('button', { name: /start draft/i }))

    fireEvent.click(screen.getByRole('button', { name: /start draft/i }))

    await waitFor(() => expect(screen.getByText(/invalid team data/i)).toBeDefined())
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/start'),
      expect.anything()
    )
  })

  it('disables Save teams, Start Draft, and Add team while a save is in flight', async () => {
    let resolvePut: (value: { json: () => Promise<unknown> }) => void = () => {}
    const putPromise = new Promise<{ json: () => Promise<unknown> }>((resolve) => {
      resolvePut = resolve
    })
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (!init && url.includes('/api/leagues/')) {
        return Promise.resolve({
          json: async () => ({
            success: true,
            data: {
              league: {
                commissionerToken: 'commish-123',
                viewerToken: 'viewer-456',
                name: 'My League',
                mode: 'random',
                status: 'setup',
                revealedCount: 0,
              },
              teams: [],
            },
          }),
        })
      }
      if (init?.method === 'PUT' && url.includes('/teams')) {
        return putPromise
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) })
    }) as unknown as typeof fetch
    global.fetch = fetchMock

    render(<Page />)
    await waitFor(() => screen.getByRole('button', { name: /save teams/i }))

    expect(screen.getByRole('button', { name: /save teams/i })).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /save teams/i }))

    await waitFor(() => expect(screen.getByRole('button', { name: /save teams/i })).toBeDisabled())
    expect(screen.getByRole('button', { name: /start draft/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /add team/i })).toBeDisabled()

    resolvePut({ json: async () => ({ success: true, data: [] }) })

    await waitFor(() => expect(screen.getByRole('button', { name: /save teams/i })).not.toBeDisabled())
    expect(screen.getByRole('button', { name: /start draft/i })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /add team/i })).not.toBeDisabled()
  })
})

describe('Commissioner manage page (weighted mode)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (!init && url.includes('/api/leagues/')) {
        return Promise.resolve({
          json: async () => ({
            success: true,
            data: {
              league: {
                commissionerToken: 'commish-123',
                viewerToken: 'viewer-456',
                name: 'My League',
                mode: 'weighted',
                status: 'setup',
                revealedCount: 0,
              },
              teams: [
                { id: 't1', name: 'Team A', weight: null },
                { id: 't2', name: 'Team B', weight: 2 },
              ],
            },
          }),
        })
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) })
    }) as unknown as typeof fetch
  })

  it('disables Start Draft when a team has no weight', async () => {
    render(<Page />)
    await waitFor(() => screen.getByRole('button', { name: /start draft/i }))

    expect(screen.getByRole('button', { name: /start draft/i })).toBeDisabled()
  })

  it('disables Start Draft when a team has a zero weight', async () => {
    render(<Page />)
    const weightInputs = await waitFor(() => screen.getAllByPlaceholderText(/weight/i))

    fireEvent.change(weightInputs[0], { target: { value: '0' } })

    expect(screen.getByRole('button', { name: /start draft/i })).toBeDisabled()
  })

  it('enables Start Draft once every team has a valid weight', async () => {
    render(<Page />)
    const weightInputs = await waitFor(() => screen.getAllByPlaceholderText(/weight/i))

    expect(screen.getByRole('button', { name: /start draft/i })).toBeDisabled()

    fireEvent.change(weightInputs[0], { target: { value: '1' } })

    await waitFor(() => expect(screen.getByRole('button', { name: /start draft/i })).not.toBeDisabled())
  })
})

describe('Commissioner manage page (live)', () => {
  beforeEach(() => {
    let revealedCount = 0
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith(`/api/leagues/commish-123`) && !init) {
        return Promise.resolve({
          json: async () => ({
            success: true,
            data: {
              league: {
                commissionerToken: 'commish-123',
                viewerToken: 'viewer-456',
                name: 'My League',
                mode: 'random',
                status: 'live',
                revealedCount,
              },
              teams: [{ id: 't1', name: 'Team A' }],
            },
          }),
        })
      }
      if (url.endsWith('/reveal')) {
        revealedCount += 1
        return Promise.resolve({
          json: async () => ({
            success: true,
            data: { teamId: 't1', teamName: 'Team A', slot: 1, status: 'complete' },
          }),
        })
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) })
    }) as unknown as typeof fetch
  })

  it('reveals the next pick when clicked', async () => {
    render(<Page />)
    await waitFor(() => screen.getByRole('button', { name: /reveal next pick/i }))

    fireEvent.click(screen.getByRole('button', { name: /reveal next pick/i }))

    await waitFor(() => expect(screen.getByText(/slot 1/i)).toBeDefined())
  })

  it('reconstructs already-revealed picks on mount', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith(`/api/leagues/commish-123`) && !init) {
        return Promise.resolve({
          json: async () => ({
            success: true,
            data: {
              league: {
                commissionerToken: 'commish-123',
                viewerToken: 'viewer-456',
                name: 'My League',
                mode: 'random',
                status: 'live',
                revealedCount: 2,
                revealOrder: ['t1', 't2', 't3'],
              },
              teams: [
                { id: 't1', name: 'Team A' },
                { id: 't2', name: 'Team B' },
                { id: 't3', name: 'Team C' },
              ],
            },
          }),
        })
      }
      if (url.endsWith('/reveal')) {
        return Promise.resolve({
          json: async () => ({
            success: true,
            data: { teamId: 't3', teamName: 'Team C', slot: 1, status: 'complete' },
          }),
        })
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) })
    }) as unknown as typeof fetch

    render(<Page />)
    await waitFor(() => expect(screen.getByText(/slot 3/i)).toBeDefined())
    await waitFor(() => expect(screen.getByText(/slot 2/i)).toBeDefined())
  })

  it('sends correct expectedRevealedCount when revealing after reconstruction', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith(`/api/leagues/commish-123`) && !init) {
        return Promise.resolve({
          json: async () => ({
            success: true,
            data: {
              league: {
                commissionerToken: 'commish-123',
                viewerToken: 'viewer-456',
                name: 'My League',
                mode: 'random',
                status: 'live',
                revealedCount: 2,
                revealOrder: ['t1', 't2', 't3'],
              },
              teams: [
                { id: 't1', name: 'Team A' },
                { id: 't2', name: 'Team B' },
                { id: 't3', name: 'Team C' },
              ],
            },
          }),
        })
      }
      if (url.endsWith('/reveal')) {
        return Promise.resolve({
          json: async () => ({
            success: true,
            data: { teamId: 't3', teamName: 'Team C', slot: 1, status: 'complete' },
          }),
        })
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) })
    }) as unknown as typeof fetch
    global.fetch = fetchMock

    render(<Page />)
    await waitFor(() => screen.getByRole('button', { name: /reveal next pick/i }))

    fireEvent.click(screen.getByRole('button', { name: /reveal next pick/i }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/reveal'),
        expect.objectContaining({
          body: expect.stringContaining('"expectedRevealedCount":2'),
        })
      )
    )
  })

  it('disables Reveal Next Pick while the reveal animation is playing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    render(<Page />)
    await waitFor(() => screen.getByRole('button', { name: /reveal next pick/i }))

    fireEvent.click(screen.getByRole('button', { name: /reveal next pick/i }))

    await waitFor(() => expect(screen.getByRole('button', { name: /reveal next pick/i })).toBeDisabled())

    vi.advanceTimersByTime(3000)

    // Status resolves to 'complete' in this fixture, so the button disappears
    // entirely once the animation finishes rather than re-enabling.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /reveal next pick/i })).not.toBeInTheDocument()
    )

    vi.useRealTimers()
  })

  it('disables Reveal Next Pick immediately while the reveal fetch is in flight (prevents double-click)', async () => {
    let resolveReveal: (value: { json: () => Promise<unknown> }) => void = () => {}
    const revealPromise = new Promise<{ json: () => Promise<unknown> }>((resolve) => {
      resolveReveal = resolve
    })
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith(`/api/leagues/commish-123`) && !init) {
        return Promise.resolve({
          json: async () => ({
            success: true,
            data: {
              league: {
                commissionerToken: 'commish-123',
                viewerToken: 'viewer-456',
                name: 'My League',
                mode: 'random',
                status: 'live',
                revealedCount: 0,
              },
              teams: [{ id: 't1', name: 'Team A' }],
            },
          }),
        })
      }
      if (url.endsWith('/reveal')) {
        return revealPromise
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) })
    }) as unknown as typeof fetch
    global.fetch = fetchMock

    render(<Page />)
    await waitFor(() => screen.getByRole('button', { name: /reveal next pick/i }))

    expect(screen.getByRole('button', { name: /reveal next pick/i })).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /reveal next pick/i }))

    // Button should be disabled immediately while fetch is in flight (isRevealing = true)
    await waitFor(() => expect(screen.getByRole('button', { name: /reveal next pick/i })).toBeDisabled())

    // Resolve the pending fetch
    resolveReveal({
      json: async () => ({
        success: true,
        data: { teamId: 't1', teamName: 'Team A', slot: 1, status: 'complete' },
      }),
    })

    // Button stays disabled after fetch completes due to animation (pendingPick !== null)
    await waitFor(() => expect(screen.getByRole('button', { name: /reveal next pick/i })).toBeDisabled())
  })
})
