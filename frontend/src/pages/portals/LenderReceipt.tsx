import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../api/client'
import { Brand } from '../../components/layout/Brand'
import { Button, StatusChip } from '../../components/ui'

interface Preview {
  draw_id: string
  draw_number: number
  property_name: string
  lender_name: string
  period_start: string
  period_end: string
  status: string
}

export function LenderReceipt() {
  const { token } = useParams<{ token: string }>()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    try {
      const p = await api.get<Preview>(`/lender/receipt/${token}`)
      setPreview(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load')
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  async function confirm() {
    if (!token) return
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/lender/receipt/${token}`)
      setConfirmed(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirmation failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-sp5">
      <section className="w-full max-w-lg bg-surface-lowest rounded-3 shadow-glow p-sp8 flex flex-col gap-sp6">
        <header className="flex flex-col gap-sp3">
          <Brand to="#" />
          <h1 className="font-display text-40 font-light leading-none tracking-tight text-ink-700">
            Lender Receipt
          </h1>
          <p className="text-13 text-text-muted">
            Confirm delivery of the attached draw package.
          </p>
        </header>

        {error ? (
          <p role="alert" className="text-13 text-danger-500">
            {error}
          </p>
        ) : null}

        {confirmed ? (
          <div className="flex flex-col gap-sp4">
            <StatusChip tone="success">Receipt confirmed</StatusChip>
            <p className="text-14 text-text-muted">
              Thanks — the firm has been notified. You can close this page.
            </p>
          </div>
        ) : preview ? (
          <>
            <dl className="grid grid-cols-[140px_1fr] gap-x-sp5 gap-y-sp3 text-14">
              <dt className="text-text-muted">Property</dt>
              <dd className="text-ink-700">{preview.property_name}</dd>
              <dt className="text-text-muted">Lender</dt>
              <dd className="text-ink-700">{preview.lender_name}</dd>
              <dt className="text-text-muted">Draw</dt>
              <dd className="text-ink-700">#{preview.draw_number}</dd>
              <dt className="text-text-muted">Period</dt>
              <dd className="text-ink-700 tabular-nums">
                {preview.period_start} → {preview.period_end}
              </dd>
              <dt className="text-text-muted">Status</dt>
              <dd>
                <StatusChip tone="info">{preview.status.replace(/_/g, ' ')}</StatusChip>
              </dd>
            </dl>
            <p className="text-12 text-text-muted">
              Clicking Confirm marks this link as used — single-use, 7-day expiry.
              A new link can be reissued by the firm on expiry.
            </p>
            <Button onClick={confirm} loading={submitting}>
              Confirm Receipt
            </Button>
          </>
        ) : (
          <p className="text-13 text-text-muted">Loading…</p>
        )}
      </section>
    </div>
  )
}
