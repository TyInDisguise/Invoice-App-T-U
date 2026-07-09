import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Vendors } from '../Vendors'
import { ToastProvider } from '../../components/ui'

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn() }))
vi.mock('../../api/client', () => ({
  api: { post: vi.fn() },
}))

import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'

const mockUseApi = useApi as unknown as ReturnType<typeof vi.fn>
const mockPost = api.post as unknown as ReturnType<typeof vi.fn>

const VENDOR = {
  id: 'v1',
  firm_id: 'f',
  name: 'Acme Roofing',
  contact_email: 'billing@acme.test',
  city: 'Oakland',
  state_region: 'CA',
  is_active: true,
}

function mount() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <Vendors />
      </ToastProvider>
    </MemoryRouter>,
  )
}

function setData(vendors: unknown[]) {
  mockUseApi.mockImplementation((path: string) => {
    if (path === '/vendors') return { data: vendors, isLoading: false, error: null }
    // Compliance-status endpoint is hit per-vendor; return null so the cell stays
    // in the "—" placeholder state and doesn't blow up the test surface.
    return { data: null, isLoading: false, error: null }
  })
}

describe('Vendors page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders vendors with contact + location + request buttons', () => {
    setData([VENDOR])
    mount()
    expect(screen.getByText('Acme Roofing')).toBeInTheDocument()
    expect(screen.getByText('billing@acme.test')).toBeInTheDocument()
    expect(screen.getByText('Oakland, CA')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request W-9' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request COI' })).toBeInTheDocument()
  })

  it('issues a W-9 upload link and shows it in the TokenLinkModal', async () => {
    setData([VENDOR])
    mockPost.mockResolvedValue({
      token: 'tok-abc',
      jti: 'jti-1',
      expires_at: '2026-05-01T00:00:00Z',
    })
    mount()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Request W-9' }))

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/vendors/v1/compliance-docs/request-upload?doc_type=w9',
      ),
    )
    await waitFor(() =>
      expect(
        screen.getByText(/Request W9 from Acme Roofing/i),
      ).toBeInTheDocument(),
    )
    const input = screen.getByLabelText('Share this link') as HTMLInputElement
    expect(input.value).toContain('/portal/vendor/tok-abc')
  })

  it('issues a COI link via the doc_type=coi query param', async () => {
    setData([VENDOR])
    mockPost.mockResolvedValue({
      token: 'tok-coi',
      jti: 'jti-2',
      expires_at: '2026-05-01T00:00:00Z',
    })
    mount()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Request COI' }))

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/vendors/v1/compliance-docs/request-upload?doc_type=coi',
      ),
    )
  })

  it('surfaces a toast error when token issuance fails', async () => {
    setData([VENDOR])
    mockPost.mockRejectedValue(new Error('network down'))
    mount()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Request W-9' }))

    await waitFor(() => {
      const notifications = screen.getByRole('region', { name: 'Notifications' })
      expect(within(notifications).getByText('network down')).toBeInTheDocument()
    })
  })
})
