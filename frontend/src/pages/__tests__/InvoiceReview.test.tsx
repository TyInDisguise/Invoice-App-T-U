import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { InvoiceReview } from '../InvoiceReview'
import { CommandPaletteProvider, ToastProvider } from '../../components/ui'

vi.mock('../../hooks/useApi', () => ({
  useApi: vi.fn(),
}))
import { useApi } from '../../hooks/useApi'
const mockUseApi = useApi as unknown as ReturnType<typeof vi.fn>

const PROPS = [
  { id: 'p1', firm_id: 'f', portfolio_id: null, name: 'Riverside', address_line1: null, city: null, state_region: null },
  { id: 'p2', firm_id: 'f', portfolio_id: null, name: 'Oak Park', address_line1: null, city: null, state_region: null },
]

function invoice(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? 'i1',
    firm_id: 'f',
    property_id: overrides.property_id ?? 'p1',
    proposed_property_id: null,
    property_match_signal: null,
    vendor_id: null,
    proposed_vendor_id: null,
    vendor_name: null,
    bill_to_entity: null,
    invoice_number: overrides.invoice_number ?? 'INV-1',
    invoice_date: '2026-04-01',
    due_date: null,
    tax_amount: null,
    total_amount: overrides.total_amount ?? '1000.00',
    currency: 'USD',
    category: 'operating',
    status: overrides.status ?? 'extraction_review',
    on_hold_reason: null,
    rejected_reason: null,
    extraction_status: 'completed',
    extraction_attempts: 1,
    extraction_failure_reason: null,
    page_count: 1,
    pages_extracted: 1,
    validation_flags: null,
    duplicate_of_invoice_id: null,
    intake_source: 'manual_upload',
    intake_received_at: '2026-04-01T00:00:00Z',
    ai_confidence_score: null,
    ai_provider: null,
    ai_model_id: null,
    ...overrides,
  }
}

// Route URL map: /invoices → InvoiceReview data, /properties → list
function setData(invoices: unknown[]) {
  mockUseApi.mockImplementation((path: string) => {
    if (path === '/invoices') return { data: invoices, isLoading: false, error: null }
    if (path === '/properties') return { data: PROPS, isLoading: false, error: null }
    return { data: null, isLoading: false, error: null }
  })
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/invoices']}>
      <ToastProvider>
        <CommandPaletteProvider>
          <InvoiceReview />
        </CommandPaletteProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('InvoiceReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state when no invoices match filters', () => {
    setData([])
    mount()
    expect(screen.getByText('No invoices match these filters.')).toBeInTheDocument()
  })

  // Helpers — invoice number appears in both the list row AND the detail
  // pane (detail mirrors the selected row), so scope queries to the list
  // (the <ul>) to count list-row presence only.
  const listRows = () => screen.getByRole('list').children

  it('renders invoices and summary counts', () => {
    setData([
      invoice({ id: 'a', status: 'approved', invoice_number: 'INV-A' }),
      invoice({ id: 'b', status: 'on_hold', invoice_number: 'INV-B' }),
      invoice({ id: 'c', status: 'extraction_review', invoice_number: 'INV-C' }),
    ])
    mount()
    expect(listRows()).toHaveLength(3)
    // "X need attention" copy (b is on_hold)
    expect(screen.getByText(/need attention/)).toBeInTheDocument()
  })

  it('filters to attention segment when clicked', async () => {
    setData([
      invoice({ id: 'a', status: 'approved', invoice_number: 'INV-A' }),
      invoice({ id: 'b', status: 'on_hold', invoice_number: 'INV-B' }),
    ])
    mount()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Attention/ }))
    expect(listRows()).toHaveLength(1)
    const list = screen.getByRole('list')
    expect(within(list).getByText('INV-B')).toBeInTheDocument()
  })

  it('filters by property selection', async () => {
    setData([
      invoice({ id: 'a', property_id: 'p1', invoice_number: 'INV-A' }),
      invoice({ id: 'b', property_id: 'p2', invoice_number: 'INV-B' }),
    ])
    mount()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Filter by property'), 'p2')
    expect(listRows()).toHaveLength(1)
    const list = screen.getByRole('list')
    expect(within(list).getByText('INV-B')).toBeInTheDocument()
  })

  it('shows the selected invoice in the detail pane', () => {
    setData([
      invoice({ id: 'a', invoice_number: 'INV-A', total_amount: '2500.00' }),
    ])
    mount()
    const openButton = screen.getByRole('button', { name: /Open full detail/ })
    const pane = openButton.closest('aside')
    expect(pane).not.toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(within(pane!).getAllByText(/2,500\.00/).length).toBeGreaterThan(0)
  })
})
