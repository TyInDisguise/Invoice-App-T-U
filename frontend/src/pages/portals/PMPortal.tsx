import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Input, StatusChip, Table, type Column } from '../../components/ui'
import { Brand } from '../../components/layout/Brand'
import { api } from '../../api/client'

interface PMSession {
  pm_pin_id: string
  firm_id: string
  property_id: string
}

interface Draw {
  id: string
  draw_number: number
  period_start: string
  period_end: string
  status: string
}

interface PMPayment {
  id: string
  draw_id: string
  status: string
  from_status: string | null
  transitioned_at: string
  check_number: string | null
  notes: string | null
}

const PM_NEXT: Record<string, string> = {
  package_received: 'payment_pending',
  payment_pending: 'payment_scheduled',
  payment_scheduled: 'payment_released',
  payment_released: 'check_sent',
}

const STATUS_LABEL: Record<string, string> = {
  package_received: 'Package received',
  payment_pending: 'Payment pending',
  payment_scheduled: 'Payment scheduled',
  payment_released: 'Payment released',
  check_sent: 'Check sent',
}

export function PMPortal() {
  const { propertyId } = useParams<{ propertyId: string }>()
  const [session, setSession] = useState<PMSession | null>(null)
  const [loading, setLoading] = useState(true)

  const loadSession = useCallback(async () => {
    try {
      const me = await api.get<PMSession>('/pm/me')
      setSession(me)
    } catch {
      setSession(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  if (loading) return <p className="p-sp7 text-13 text-text-muted">Loading…</p>

  if (!session) {
    return <PMLogin propertyId={propertyId ?? ''} onAuthed={() => void loadSession()} />
  }

  return <PMDashboard />
}

function PMLogin({ propertyId, onAuthed }: { propertyId: string; onAuthed: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/auth/pm/${propertyId}/verify`, { pin })
      onAuthed()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid PIN')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-sp5 bg-canvas">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm flex flex-col gap-sp5 p-sp8 bg-surface-lowest rounded-3 shadow-glow"
      >
        <header className="flex flex-col gap-sp3">
          <Brand to={`/portal/pm/${propertyId}`} />
          <h1 className="font-display text-40 font-light leading-none tracking-tight text-ink-700">
            PM Portal
          </h1>
          <p className="text-13 text-text-muted">Enter your 6-digit PIN to continue.</p>
        </header>
        <Input
          label="PIN"
          type="password"
          autoComplete="one-time-code"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
        />
        {error ? (
          <p role="alert" className="text-13 text-danger-500">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={submitting}>
          Sign In
        </Button>
      </form>
    </div>
  )
}

function PMDashboard() {
  const [draws, setDraws] = useState<Draw[]>([])
  const [payments, setPayments] = useState<PMPayment[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [d, p] = await Promise.all([
        api.get<Draw[]>('/pm/draws'),
        api.get<PMPayment[]>('/pm/payments'),
      ])
      setDraws(d)
      setPayments(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function advance(payment: PMPayment) {
    const next = PM_NEXT[payment.status]
    if (!next) return
    setBusy(payment.id)
    try {
      const body: Record<string, string> = { to_status: next }
      if (next === 'check_sent') {
        const ck = window.prompt('Check number?')
        if (!ck) {
          setBusy(null)
          return
        }
        body.check_number = ck
      }
      await api.post(`/pm/payments/${payment.id}/transition`, body)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transition failed')
    } finally {
      setBusy(null)
    }
  }

  const drawCols: Column<Draw>[] = [
    { key: 'num', header: 'Draw', render: (d) => `#${d.draw_number}` },
    { key: 'per', header: 'Period', render: (d) => `${d.period_start} → ${d.period_end}` },
    {
      key: 'st',
      header: 'Status',
      render: (d) => <StatusChip tone="info">{d.status.replace(/_/g, ' ')}</StatusChip>,
    },
  ]

  return (
    <div className="min-h-screen bg-canvas">
      <header className="h-topbar bg-surface-lowest border-b border-paper-200 sticky top-0 z-10">
        <div className="max-w-doc mx-auto h-full px-sp7 flex items-center justify-between">
          <Brand />
          <span className="text-12 text-text-muted">PM Portal</span>
        </div>
      </header>

      <main className="max-w-doc w-full mx-auto px-sp7 py-sp7 flex flex-col gap-sp7">
        <header>
          <h1 className="font-display text-40 font-light leading-none tracking-tight text-ink-700">
            Payments
          </h1>
          <p className="mt-sp3 text-14 text-text-muted">
            Track draw packages and advance payments through issuance.
          </p>
        </header>

        {error ? (
          <p role="alert" className="text-13 text-danger-500">
            {error}
          </p>
        ) : null}

        <section className="flex flex-col gap-sp3">
          <h2 className="text-16 font-medium text-ink-700">Draws</h2>
          <Table
            columns={drawCols}
            rows={draws}
            rowKey={(d) => d.id}
            emptyState="No draws assigned to this property yet."
          />
        </section>

        <section className="flex flex-col gap-sp3">
          <h2 className="text-16 font-medium text-ink-700">Payments</h2>
          {payments.length === 0 ? (
            <p className="text-13 text-text-muted">
              No payments queued. Your firm will push a payment request here.
            </p>
          ) : (
            <ul className="flex flex-col gap-sp4">
              {payments.map((p) => {
                const next = PM_NEXT[p.status]
                return (
                  <li
                    key={p.id}
                    className="bg-surface-lowest border border-paper-200 rounded-3 p-sp5 flex items-center justify-between gap-sp5"
                  >
                    <div className="flex flex-col gap-sp2">
                      <div className="text-14 font-medium text-ink-700">
                        Draw #{draws.find((d) => d.id === p.draw_id)?.draw_number ?? '?'}
                      </div>
                      <StatusChip
                        tone={
                          p.status === 'check_sent'
                            ? 'success'
                            : p.status === 'payment_released'
                              ? 'info'
                              : 'neutral'
                        }
                      >
                        {STATUS_LABEL[p.status] ?? p.status}
                      </StatusChip>
                      {p.check_number ? (
                        <span className="text-12 text-text-muted">
                          Check #{p.check_number}
                        </span>
                      ) : null}
                    </div>
                    {next ? (
                      <Button
                        loading={busy === p.id}
                        onClick={() => advance(p)}
                        size="sm"
                      >
                        Advance to {STATUS_LABEL[next]}
                      </Button>
                    ) : (
                      <span className="text-13 text-text-subtle">Terminal</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
