import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { Vendors } from '../Vendors'
import { ToastProvider } from '../../components/ui'

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn() }))

import { useApi } from '../../hooks/useApi'
const mockUseApi = useApi as unknown as ReturnType<typeof vi.fn>

const VENDOR = {
  id: 'v1',
  firm_id: 'f',
  name: 'Acme Roofing',
  contact_email: 'billing@acme.test',
  contact_phone: null,
  address_line1: null,
  address_line2: null,
  city: 'Oakland',
  state_region: 'CA',
  postal_code: null,
  country: null,
  notes: null,
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
    return { data: null, isLoading: false, error: null }
  })
}

describe('Vendors page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders vendors with contact + location', () => {
    setData([VENDOR])
    mount()
    expect(screen.getByText('Acme Roofing')).toBeInTheDocument()
    expect(screen.getByText('billing@acme.test')).toBeInTheDocument()
    expect(screen.getByText('Oakland, CA')).toBeInTheDocument()
  })

  it('shows the empty state when there are no vendors', () => {
    setData([])
    mount()
    expect(screen.getByText('No vendors yet.')).toBeInTheDocument()
  })
})
