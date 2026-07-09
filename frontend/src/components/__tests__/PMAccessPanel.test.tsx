import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PMAccessPanel } from '../PMAccessPanel'
import { ToastProvider } from '../ui'

// Stub the tokens + useApi modules so the component renders without network.
vi.mock('../../api/tokens', () => ({
  createPmPin: vi.fn(),
  revokePmPin: vi.fn(),
}))
vi.mock('../../hooks/useApi', () => ({
  useApi: vi.fn(),
}))
vi.mock('swr', async () => {
  const actual = await vi.importActual<typeof import('swr')>('swr')
  return { ...actual, mutate: vi.fn() }
})

import { createPmPin, revokePmPin } from '../../api/tokens'
import { useApi } from '../../hooks/useApi'

const mockUseApi = useApi as unknown as ReturnType<typeof vi.fn>
const mockCreate = createPmPin as unknown as ReturnType<typeof vi.fn>
const mockRevoke = revokePmPin as unknown as ReturnType<typeof vi.fn>

function mount() {
  return render(
    <ToastProvider>
      <PMAccessPanel propertyId="prop-1" />
    </ToastProvider>,
  )
}

const activePin = {
  id: 'pin-1',
  firm_id: 'firm',
  property_id: 'prop-1',
  pm_name: 'Jordan Rivera',
  pm_email: 'jordan@example.com',
  is_active: true,
  last_used_at: null,
}

describe('PMAccessPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseApi.mockReturnValue({ data: [activePin], isLoading: false, error: null })
  })

  it('renders existing active PINs with a Revoke action', () => {
    mount()
    expect(screen.getByText('Jordan Rivera')).toBeInTheDocument()
    expect(screen.getByText('jordan@example.com')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeInTheDocument()
  })

  it('shows an empty state when no PINs exist', () => {
    mockUseApi.mockReturnValue({ data: [], isLoading: false, error: null })
    mount()
    expect(screen.getByText('No PM PINs issued yet.')).toBeInTheDocument()
  })

  it('issues a new PIN and surfaces it exactly once in the confirm modal', async () => {
    mockCreate.mockResolvedValue(undefined)
    mount()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Issue new PIN' }))

    // fireEvent.change is more reliable than userEvent.type for controlled
    // inputs inside an autoFocus'd modal — no char-by-char flush races.
    fireEvent.change(screen.getByLabelText(/Property manager name/), {
      target: { value: 'Sam Cooper' },
    })
    fireEvent.change(screen.getByLabelText(/^PIN/), {
      target: { value: '4321' },
    })

    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith('prop-1', {
        pm_name: 'Sam Cooper',
        pm_email: null,
        pin: '4321',
      }),
    )

    // Confirm modal shows the PIN once — critical: we can't retrieve it again.
    await waitFor(() => {
      expect(screen.getByText('PIN issued')).toBeInTheDocument()
      expect(screen.getByText('4321')).toBeInTheDocument()
    })
  })

  it('keeps the Create button disabled until name + 4-char PIN are provided', async () => {
    mount()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Issue new PIN' }))
    const createBtn = screen.getByRole('button', { name: 'Create' })
    expect(createBtn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Property manager name/), {
      target: { value: 'Sam' },
    })
    expect(createBtn).toBeDisabled() // pin still empty

    fireEvent.change(screen.getByLabelText(/^PIN/), {
      target: { value: '123' },
    })
    expect(createBtn).toBeDisabled() // <4 chars

    fireEvent.change(screen.getByLabelText(/^PIN/), {
      target: { value: '1234' },
    })
    expect(createBtn).not.toBeDisabled()
  })

  it('calls revokePmPin when Revoke is confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockRevoke.mockResolvedValue(undefined)
    mount()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Revoke' }))
    await waitFor(() =>
      expect(mockRevoke).toHaveBeenCalledWith('prop-1', 'pin-1'),
    )
  })

  it('does nothing when Revoke is cancelled in the native confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    mount()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Revoke' }))
    expect(mockRevoke).not.toHaveBeenCalled()
  })
})
