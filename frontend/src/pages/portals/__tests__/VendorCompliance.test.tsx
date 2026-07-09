import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { VendorCompliance } from '../VendorCompliance'

function mount() {
  return render(
    <MemoryRouter initialEntries={['/portal/vendor/tok-v1']}>
      <Routes>
        <Route path="/portal/vendor/:token" element={<VendorCompliance />} />
      </Routes>
    </MemoryRouter>,
  )
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response
}

describe('VendorCompliance portal', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads preview and shows the vendor name + doc type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        vendor_id: 'v1',
        vendor_name: 'Acme Roofing',
        requested_doc_type: 'w9',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    mount()

    expect(await screen.findByText('Acme Roofing')).toBeInTheDocument()
    expect(screen.getByText('W9')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/vendor/compliance/tok-v1'),
    )
  })

  it('surfaces the server-provided detail when preview fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ detail: 'token expired' }, false, 410),
        ),
    )
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('token expired')
  })

  it('renders the upload form with file input + date fields + submit button', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        vendor_id: 'v1',
        vendor_name: 'Acme Roofing',
        requested_doc_type: 'coi',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    mount()

    await screen.findByText('Acme Roofing')
    const fileInput = screen.getByLabelText('PDF file') as HTMLInputElement
    expect(fileInput).toHaveAttribute('type', 'file')
    expect(fileInput).toHaveAttribute('accept', 'application/pdf')
    expect(fileInput).toBeRequired()
    expect(screen.getByLabelText(/Effective date/)).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText(/Expiry date/)).toHaveAttribute('type', 'date')
    expect(
      screen.getByRole('button', { name: /Upload Document/ }),
    ).toBeInTheDocument()
  })

  it('submitting without a selected file is blocked (HTML5 required)', async () => {
    // The submit handler also bails early if no file is attached — here we
    // assert the HTML5 required attribute is present, which prevents the
    // browser from firing submit at all. Combined with the early-return in
    // submit(), this covers the "forgot to attach" path.
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        vendor_id: 'v1',
        vendor_name: 'Acme Roofing',
        requested_doc_type: 'w9',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    mount()
    await screen.findByText('Acme Roofing')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Upload Document/ }))
    // Only the preview call; the submit is blocked by required validation.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
