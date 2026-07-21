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
})
