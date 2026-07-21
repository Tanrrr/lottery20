import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Page from './page'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

describe('Home page', () => {
  beforeEach(() => {
    push.mockClear()
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: { league: { commissionerToken: 'commish-123' } },
      }),
    }) as unknown as typeof fetch
  })

  it('creates a league and redirects to the manage page', async () => {
    render(<Page />)

    fireEvent.change(screen.getByLabelText(/league name/i), { target: { value: 'My League' } })
    fireEvent.click(screen.getByRole('button', { name: /create league/i }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/league/commish-123/manage'))
  })

  it('rejects a league name that exceeds 100 characters', async () => {
    render(<Page />)

    const longName = 'a'.repeat(101)
    fireEvent.change(screen.getByLabelText(/league name/i), { target: { value: longName } })
    fireEvent.click(screen.getByRole('button', { name: /create league/i }))

    await waitFor(() => {
      expect(screen.getByText(/league name must be between 1 and 100 characters/i)).toBeDefined()
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('shows an error when fetch fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'))
    global.fetch = fetchMock as unknown as typeof fetch

    render(<Page />)

    fireEvent.change(screen.getByLabelText(/league name/i), { target: { value: 'My League' } })
    fireEvent.click(screen.getByRole('button', { name: /create league/i }))

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeDefined()
    })
    expect(push).not.toHaveBeenCalled()
  })

  it('shows an error when response.json() fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => {
        throw new Error('Invalid JSON')
      },
    })
    global.fetch = fetchMock as unknown as typeof fetch

    render(<Page />)

    fireEvent.change(screen.getByLabelText(/league name/i), { target: { value: 'My League' } })
    fireEvent.click(screen.getByRole('button', { name: /create league/i }))

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeDefined()
    })
    expect(push).not.toHaveBeenCalled()
  })
})
