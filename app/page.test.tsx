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
})
