import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
})
