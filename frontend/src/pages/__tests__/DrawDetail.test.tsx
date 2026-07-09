import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DrawDetail } from '../DrawDetail'
import { ToastProvider } from '../../components/ui'

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn() }))
vi.mock('../../api/client', () => ({ api: { post: vi.fn() } }))
vi.mock('../../api/tokens', () => ({
  issueLenderToken: vi.fn(),
  portalUrlForToken: vi.fn((_: string, t: string) => `http://test/portal/${t}`),
}))

import { useApi } from '../../hooks/useApi'
const mockUseApi = useApi as unknown as ReturnType<typeof vi.fn>

const DRAW = {
  id: 'd1',
  firm_id: 'f',
  property_id: 'prop-1',
  loan_id: 'loan-1',
  budget_id: null,
  draw_number: 4,
  period_start: '2026-03-21',
  period_end: '2026-04-20',
  status: 'submitted',
  revision_number: 0,
  submitted_at: '2026-04-19T12:00:00Z',
  funded_at: null,
  revision_requested_at: null,
  revision_feedback: null,
}

const ITEM_A = {
  id: 'item-a',
  draw_id: 'd1',
  invoice_id: 'inv-a',
  invoice_line_item_id: null,
  allocated_amount: '55000.00',
  excluded_for_period: false,
  deferred_to_next_draw: false,
  deferral_reason: null,
}

const ITEM_B = {
  id: 'item-b',
  draw_id: 'd1',
  invoice_id: 'inv-b',
  invoice_line_item_id: null,
  allocated_amount: '41000.00',
  excluded_for_period: false,
  deferred_to_next_draw: false,
  deferral_reason: null,
}

const EXCLUDED = {
  ...ITEM_A,
  id: 'item-x',
  invoice_id: 'inv-x',
  allocated_amount: '1200.00',
  excluded_for_period: true,
}

const INV_A = {
  id: 'inv-a',
  firm_id: 'f',
  property_id: 'prop-1',
  vendor_id: null,
  invoice_number: 'INV-A',
  invoice_date: '2026-04-08',
  due_date: null,
  total_amount: '55000.00',
  currency: 'USD',
  status: 'approved',
  on_hold_reason: null,
  rejected_reason: null,
  payment_method: null,
  paid_at: null,
  expense_classification: 'standard',
  intake_source: 'manual',
  intake_received_at: '2026-04-08T00:00:00Z',
}

function setData({
  draw = DRAW,
  items = [ITEM_A, ITEM_B],
  packages = [],
  invoices = [INV_A, { ...INV_A, id: 'inv-b', invoice_number: 'INV-B' }],
}: {
  draw?: typeof DRAW
  items?: typeof ITEM_A[]
  packages?: unknown[]
  invoices?: unknown[]
}) {
  mockUseApi.mockImplementation((path: string) => {
    if (path === `/properties/prop-1/draws/d1`) return { data: draw }
    if (path === `/properties/prop-1/draws/d1/packages`) return { data: packages }
    if (path === `/properties/prop-1/draws/d1/items`) return { data: items }
    if (path === `/properties/prop-1/invoices`) return { data: invoices }
    return { data: null }
  })
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/properties/prop-1/draws/d1']}>
      <ToastProvider>
        <Routes>
          <Route
            path="/properties/:propertyId/draws/:drawId"
            element={<DrawDetail />}
          />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('DrawDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows Loading when the draw query has no data', () => {
    mockUseApi.mockReturnValue({ data: null })
    mount()
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
  })

  it('renders cycle banner, draw number, and status chip', () => {
    setData({})
    mount()
    expect(screen.getByText('draw cycle')).toBeInTheDocument()
    // The draw number appears in both the cycle banner and the top bar;
    // verify both without coupling to layout specifics.
    expect(screen.getAllByText(/Draw #4/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('submitted')).toBeInTheDocument()
  })

  it('groups items into in-draw and excluded sections with formatted totals', () => {
    setData({ items: [ITEM_A, ITEM_B, EXCLUDED] })
    mount()
    // Section labels render as split spans; match on the title span alone.
    expect(screen.getByText('IN DRAW · 2 invoices')).toBeInTheDocument()
    expect(screen.getByText('EXCLUDED · 1')).toBeInTheDocument()
    // In-draw total (55k + 41k = 96k) formatted with commas — appears in both
    // the section label and the bottom "Draw total" row.
    expect(screen.getAllByText('$96,000.00').length).toBeGreaterThanOrEqual(2)
  })

  it('shows the "no packages" empty state when packages array is empty', () => {
    setData({ packages: [] })
    mount()
    expect(screen.getByText(/No packages compiled yet/)).toBeInTheDocument()
  })

  it('renders a package card with PDF + XLSX download links when a package exists', () => {
    const pkg = {
      id: 'pkg-1',
      draw_id: 'd1',
      version: 2,
      lender_template_id: null,
      pdf_attachment_ref: 'firm/draw/1/x.pdf',
      excel_attachment_ref: 'firm/draw/1/x.xlsx',
      generated_at: '2026-04-19T12:00:00Z',
      sent_at: null,
    }
    setData({ packages: [pkg] })
    mount()
    const aside = screen.getByText(/v2/).closest('aside')
    expect(aside).not.toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const w = within(aside!)
    expect(w.getByRole('link', { name: 'PDF' })).toBeInTheDocument()
    expect(w.getByRole('link', { name: 'XLSX' })).toBeInTheDocument()
    expect(
      w.getByRole('button', { name: 'Issue receipt link' }),
    ).toBeInTheDocument()
  })

  it('renders the 4-button action bar with keyboard hints', () => {
    setData({})
    mount()
    expect(screen.getByRole('button', { name: /Submit to lender/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Generate PDF \+ XLSX/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Owner sign-off/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Discard draft/ })).toBeInTheDocument()
  })
})
