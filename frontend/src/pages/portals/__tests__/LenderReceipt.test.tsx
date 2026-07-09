import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LenderReceipt } from '../LenderReceipt'

vi.mock('../../../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))
import { api } from '../../../api/client'
const mockGet = api.get as unknown as ReturnType<typeof vi.fn>
const mockPost = api.post as unknown as ReturnType<typeof vi.fn>

function mount() {
  return render(
    <MemoryRouter initialEntries={['/portal/lender/tok-xyz']}>
      <Routes>
        <Route path="/portal/lender/:token" element={<LenderReceipt />} />
      </Routes>
    </MemoryRouter>,
  )
}

const PREVIEW = {
  draw_id: 'd1',
  draw_number: 4,
  property_name: 'Willow Ridge',
  lender_name: 'Citizens Bank',
  period_start: '2026-03-21',
  period_end: '2026-04-20',
  status: 'submitted',
}

describe('LenderReceipt portal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads preview via GET and shows draw metadata', async () => {
    mockGet.mockResolvedValue(PREVIEW)
    mount()
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith('/lender/receipt/tok-xyz'),
    )
    expect(await screen.findByText('Willow Ridge')).toBeInTheDocument()
    expect(screen.getByText('Citizens Bank')).toBeInTheDocument()
    expect(screen.getByText('#4')).toBeInTheDocument()
    expect(screen.getByText(/2026-03-21 → 2026-04-20/)).toBeInTheDocument()
  })

  it('shows an error when preview fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('expired'))
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('expired')
  })

  it('confirms receipt via POST and surfaces success state', async () => {
    mockGet.mockResolvedValue(PREVIEW)
    mockPost.mockResolvedValue({})
    mount()
    await screen.findByText('Willow Ridge')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Confirm Receipt/ }))

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/lender/receipt/tok-xyz'),
    )
    expect(await screen.findByText('Receipt confirmed')).toBeInTheDocument()
  })

  it('surfaces confirm errors without flipping to confirmed', async () => {
    mockGet.mockResolvedValue(PREVIEW)
    mockPost.mockRejectedValue(new Error('token used'))
    mount()
    await screen.findByText('Willow Ridge')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Confirm Receipt/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('token used')
    expect(screen.queryByText('Receipt confirmed')).not.toBeInTheDocument()
  })
})
