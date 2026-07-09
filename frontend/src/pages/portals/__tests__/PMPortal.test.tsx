import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PMPortal } from '../PMPortal'

vi.mock('../../../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))
import { api } from '../../../api/client'
const mockGet = api.get as unknown as ReturnType<typeof vi.fn>
const mockPost = api.post as unknown as ReturnType<typeof vi.fn>

function mount() {
  return render(
    <MemoryRouter initialEntries={['/portal/pm/prop-1']}>
      <Routes>
        <Route path="/portal/pm/:propertyId" element={<PMPortal />} />
      </Routes>
    </MemoryRouter>,
  )
}

const SESSION = {
  pm_pin_id: 'pin-1',
  firm_id: 'f',
  property_id: 'prop-1',
}

describe('PMPortal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the PIN login form when session check 401s', async () => {
    mockGet.mockRejectedValue(new Error('unauthorized'))
    mount()
    expect(await screen.findByRole('heading', { name: 'PM Portal' })).toBeInTheDocument()
    expect(screen.getByLabelText('PIN')).toBeInTheDocument()
  })

  it('submits PIN + propertyId when the login form is submitted', async () => {
    // First /pm/me fails → login shows. Every subsequent GET returns []
    // (session, draws, payments) so the dashboard renders cleanly post-verify.
    let firstCall = true
    mockGet.mockImplementation((path: string) => {
      if (path === '/pm/me' && firstCall) {
        firstCall = false
        return Promise.reject(new Error('unauthorized'))
      }
      if (path === '/pm/me') return Promise.resolve(SESSION)
      return Promise.resolve([])
    })
    mockPost.mockResolvedValue({})

    mount()
    await screen.findByRole('heading', { name: 'PM Portal' })

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('PIN'), '123456')
    await user.click(screen.getByRole('button', { name: /Continue|Sign|Submit|Enter/i }))

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/auth/pm/prop-1/verify', {
        pin: '123456',
      }),
    )
  })

  it('shows an error on invalid PIN', async () => {
    mockGet.mockRejectedValue(new Error('unauthorized'))
    mockPost.mockRejectedValue(new Error('Invalid PIN'))
    mount()
    await screen.findByRole('heading', { name: 'PM Portal' })
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('PIN'), '000000')
    await user.click(screen.getByRole('button', { name: /Continue|Sign|Submit|Enter/i }))
    expect(await screen.findByText('Invalid PIN')).toBeInTheDocument()
  })

  it('renders the dashboard directly when /pm/me succeeds', async () => {
    // Dashboard uses length on both draws + payments, so stub both as [].
    mockGet.mockImplementation((path: string) => {
      if (path === '/pm/me') return Promise.resolve(SESSION)
      // Everything else the dashboard fetches (draws, payments, etc.) → [].
      return Promise.resolve([])
    })
    mount()
    // Dashboard doesn't show the PIN login heading.
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'PM Portal' }),
      ).not.toBeInTheDocument(),
    )
  })
})
