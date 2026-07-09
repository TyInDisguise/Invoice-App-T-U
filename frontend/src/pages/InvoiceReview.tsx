import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, StatusChip, useRegisterCommands, type StatusTone } from '../components/ui'
import { useApi } from '../hooks/useApi'
import type { Invoice, Property } from '../api/types'

/** Master invoice dashboard — firm-wide list with property filter. */

type SegmentKey = 'all' | 'attention' | 'waiting' | 'approved'

const SEGMENT_MATCHERS: Record<SegmentKey, (status: string) => boolean> = {
  all: () => true,
  attention: (s) => s === 'on_hold' || s === 'rejected',
  waiting: (s) => s === 'extraction_review',
  approved: (s) => s === 'approved',
}

const STATUS_TONE: Record<string, { label: string; tone: StatusTone }> = {
  extraction_review: { label: 'AI review', tone: 'ai' },
  approved: { label: 'Approved', tone: 'success' },
  on_hold: { label: 'Hold', tone: 'attention' },
  rejected: { label: 'Rejected', tone: 'danger' },
}

function money(v: string | null): string {
  if (v == null) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return v
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Column template — `auto` sizes to content, `1fr` takes the slack. */
const GRID_COLS =
  'grid-cols-[auto_minmax(160px,1fr)_minmax(160px,1fr)_auto_auto_auto_auto]'

export function InvoiceReview() {
  const navigate = useNavigate()
  const { data: invoices, isLoading, error } = useApi<Invoice[]>('/invoices')
  const { data: properties } = useApi<Property[]>('/properties')

  const [segment, setSegment] = useState<SegmentKey>('all')
  const [propertyFilter, setPropertyFilter] = useState<string>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const propertyById = useMemo(() => {
    const m: Record<string, Property> = {}
    for (const p of properties ?? []) m[p.id] = p
    return m
  }, [properties])

  const filtered = useMemo(() => {
    const list = invoices ?? []
    return list.filter((i) => {
      if (!SEGMENT_MATCHERS[segment](i.status)) return false
      if (propertyFilter && i.property_id !== propertyFilter) return false
      return true
    })
  }, [invoices, segment, propertyFilter])

  const kpis = useMemo(() => {
    const all = invoices ?? []
    const open = all.filter((i) => i.status !== 'rejected')
    const attention = all.filter((i) => SEGMENT_MATCHERS.attention(i.status))
    const pendingSum = open.reduce(
      (acc, i) => acc + (i.total_amount ? Number(i.total_amount) : 0),
      0,
    )
    return { pending: pendingSum, open: open.length, attention: attention.length }
  }, [invoices])

  const segments: Array<{ key: SegmentKey; label: string; count: number }> = useMemo(() => {
    const all = invoices ?? []
    return [
      { key: 'all', label: 'All', count: all.length },
      { key: 'attention', label: 'Attention', count: all.filter((i) => SEGMENT_MATCHERS.attention(i.status)).length },
      { key: 'waiting', label: 'Waiting', count: all.filter((i) => SEGMENT_MATCHERS.waiting(i.status)).length },
      { key: 'approved', label: 'Approved', count: all.filter((i) => SEGMENT_MATCHERS.approved(i.status)).length },
    ]
  }, [invoices])

  const selected = filtered.find((i) => i.id === selectedId) ?? filtered[0] ?? null

  // Register palette commands for the current selection
  const screenCommands = useMemo(() => {
    if (!selected) return []
    const openDetail = () =>
      navigate(`/properties/${selected.property_id}/invoices/${selected.id}`)
    return [
      {
        id: `inv-open-${selected.id}`,
        label: `Open ${selected.invoice_number ?? 'invoice'}`,
        section: 'Invoice',
        kbd: '→',
        keywords: 'detail view',
        run: openDetail,
      },
    ]
  }, [selected, navigate])
  useRegisterCommands(screenCommands)

  // Keyboard nav: j/↓ next · k/↑ prev · →/Enter open detail
  useEffect(() => {
    if (filtered.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const idx = selected ? filtered.findIndex((i) => i.id === selected.id) : 0
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        const next = filtered[Math.min(idx + 1, filtered.length - 1)]
        if (next) setSelectedId(next.id)
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = filtered[Math.max(idx - 1, 0)]
        if (prev) setSelectedId(prev.id)
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (!selected) return
        e.preventDefault()
        navigate(`/properties/${selected.property_id}/invoices/${selected.id}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered, selected, navigate])

  return (
    <section className="flex flex-col gap-sp5 -mx-sp7 -my-sp7">
      {/* PAGE HEAD */}
      <header className="grid grid-cols-[1fr_auto] gap-sp5 items-end px-sp8 pt-sp8 pb-sp5 border-b border-paper-200 bg-canvas">
        <div>
          <div className="text-12 uppercase tracking-[0.14em] text-text-muted mb-sp3">
            Invoices · Master
          </div>
          <h1 className="font-display text-40 font-light tracking-tight leading-none text-ink-700">
            Invoices
          </h1>
          <p className="mt-sp3 text-14 text-text-muted">
            Firm-wide review queue across{' '}
            <b className="text-ink-700 font-medium">
              {(properties ?? []).length} properties
            </b>{' '}
            · {kpis.attention} need attention
          </p>
        </div>
        <div className="flex items-stretch gap-0">
          <KPI label="Pending" value={`$${money(String(kpis.pending))}`} />
          <KPI label="Open" value={String(kpis.open)} />
          <KPI label="Attention" value={String(kpis.attention)} warn />
        </div>
      </header>

      {/* TOOLBAR */}
      <div className="grid grid-cols-[1fr_auto] gap-sp5 px-sp8 pb-sp4 border-b border-paper-200 bg-canvas items-center -mt-sp5 pt-sp5">
        <div className="flex items-center gap-sp5 flex-wrap">
          <div className="inline-flex gap-[2px] p-[2px] bg-surface-low rounded-2">
            {segments.map((s) => (
              <button
                key={s.key}
                onClick={() => setSegment(s.key)}
                className={[
                  'px-sp4 py-[5px] text-12 font-medium rounded-1 tracking-tight',
                  'transition-colors duration-2 ease-standard',
                  s.key === segment
                    ? 'bg-surface-lowest text-ink-700 shadow-sm'
                    : 'text-text-muted hover:text-ink-700',
                ].join(' ')}
              >
                {s.label}
                <span
                  className={[
                    'ml-sp2 font-mono text-10 tracking-wide',
                    s.key === 'attention' && s.count > 0
                      ? 'text-danger-500'
                      : 'text-text-subtle',
                  ].join(' ')}
                >
                  {s.count}
                </span>
              </button>
            ))}
          </div>

          <label className="flex items-center gap-sp3 text-13 font-medium text-text-muted">
            Property
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="h-8 px-sp3 text-13 bg-surface-lowest border border-paper-300 rounded-2"
              aria-label="Filter by property"
            >
              <option value="">All properties</option>
              {(properties ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-sp3">
          <Button variant="secondary" size="sm">Export</Button>
        </div>
      </div>

      {/* WORKSPACE */}
      <div className="grid grid-cols-[1fr_420px] min-h-[calc(100vh-280px)] border-t border-paper-300">
        {/* LIST */}
        <div className="border-r-2 border-paper-300 bg-canvas flex flex-col">
          {/* Column header — same size + font (Geist) as row content */}
          <div
            className={[
              'grid',
              GRID_COLS,
              'gap-sp5 px-sp8 h-11 items-center',
              'font-sans text-14 font-medium text-text-muted',
              'border-b border-paper-300 bg-canvas sticky top-0 z-[1]',
            ].join(' ')}
          >
            <span>Invoice</span>
            <span>Vendor</span>
            <span className="text-center">Property</span>
            <span>Category</span>
            <span>Submitted</span>
            <span className="text-right">Amount</span>
            <span>Status</span>
          </div>

          {isLoading ? (
            <div className="p-sp8 text-13 text-text-muted">Loading invoices…</div>
          ) : error ? (
            <div className="p-sp8 text-13 text-danger-500" role="alert">
              {error.message}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-sp9 text-center text-13 text-text-muted bg-empty-pattern flex-1">
              No invoices match these filters.
            </div>
          ) : (
            <ul className="flex-1">
              {filtered.map((inv) => {
                const prop = inv.property_id ? propertyById[inv.property_id] : undefined
                const tone = STATUS_TONE[inv.status] ?? { label: inv.status, tone: 'neutral' as StatusTone }
                const isSelected = selected?.id === inv.id
                return (
                  <li key={inv.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(inv.id)}
                      onDoubleClick={() =>
                        navigate(`/properties/${inv.property_id}/invoices/${inv.id}`)
                      }
                      className={[
                        'w-full text-left grid',
                        GRID_COLS,
                        'gap-sp5 px-sp8 h-11 items-center border-b border-paper-200',
                        'transition-colors duration-2 ease-standard hover:bg-surface-low',
                        isSelected ? 'bg-surface-low relative' : '',
                      ].join(' ')}
                    >
                      {isSelected ? (
                        <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-ink-700" />
                      ) : null}
                      <span className="text-14 text-text-muted tabular-nums whitespace-nowrap">
                        {inv.invoice_number ?? '—'}
                      </span>
                      <span className="text-14 text-ink-700 truncate">
                        {inv.vendor_id ? `#${inv.vendor_id.slice(0, 8)}` : 'Unmatched'}
                      </span>
                      <span className="text-14 text-ink-700 text-center truncate">
                        {prop?.name ?? '—'}
                      </span>
                      <span className="text-14 text-text-muted whitespace-nowrap">
                        {inv.category ? inv.category.replace(/_/g, ' ') : '—'}
                      </span>
                      <span className="text-14 text-text-muted tabular-nums whitespace-nowrap">
                        {inv.invoice_date ?? '—'}
                      </span>
                      <span className="text-14 text-ink-700 font-medium text-right tabular-nums whitespace-nowrap">
                        {money(inv.total_amount)}
                      </span>
                      <StatusChip tone={tone.tone}>{tone.label}</StatusChip>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* DETAIL PANE */}
        <aside className="bg-surface-lowest overflow-y-auto">
          {selected ? (
            <InvoiceDetailPane
              invoice={selected}
              property={selected.property_id ? propertyById[selected.property_id] : undefined}
            />
          ) : (
            <div className="p-sp8 text-13 text-text-muted">
              Select an invoice to view details.
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}

function KPI({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="px-sp7 border-l border-paper-200 text-right first:border-l-0">
      <div className="text-11 uppercase tracking-[0.14em] text-text-muted font-medium mb-sp1">
        {label}
      </div>
      <div
        className={[
          'font-display text-28 leading-none tracking-tight tabular-nums',
          warn ? 'text-danger-500' : 'text-ink-700',
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  )
}

function InvoiceDetailPane({
  invoice,
  property,
}: {
  invoice: Invoice
  property: Property | undefined
}) {
  const navigate = useNavigate()
  const tone = STATUS_TONE[invoice.status] ?? { label: invoice.status, tone: 'neutral' as StatusTone }
  const vendorDisplay = invoice.vendor_id
    ? `Vendor #${invoice.vendor_id.slice(0, 8)}`
    : 'Unmatched vendor'

  return (
    <div className="flex flex-col">
      {/* HEADER — constrained type scale: meta line (13 mono) + amount (24 display) */}
      <div className="px-sp8 pt-sp7 pb-sp6 border-b border-paper-200 flex flex-col gap-sp3">
        <div className="text-14 text-ink-700 flex flex-wrap items-center gap-x-sp3">
          <span className="font-medium">{invoice.invoice_number ?? '—'}</span>
          <span className="text-paper-300">·</span>
          <span>{vendorDisplay}</span>
          <span className="text-paper-300">·</span>
          <span>{property?.name ?? 'Unassigned property'}</span>
        </div>

        <div className="font-display text-24 font-normal leading-tight text-ink-700 tabular-nums">
          ${money(invoice.total_amount)}{' '}
          <span className="text-13 text-text-subtle align-baseline">
            {invoice.currency}
          </span>
        </div>

        <StatusChip tone={tone.tone}>{tone.label}</StatusChip>
      </div>

      {/* DETAILS */}
      <dl className="px-sp8 py-sp6 grid grid-cols-[120px_1fr] gap-x-sp5 gap-y-sp3 text-13 border-b border-paper-200">
        <dt className="text-13 text-text-muted">Property</dt>
        <dd className="text-ink-700">{property?.name ?? '—'}</dd>
        <dt className="text-13 text-text-muted">Vendor</dt>
        <dd className="text-ink-700">{vendorDisplay}</dd>
        <dt className="text-13 text-text-muted">Invoice #</dt>
        <dd className="text-ink-700 tabular-nums">{invoice.invoice_number ?? '—'}</dd>
        <dt className="text-13 text-text-muted">Amount</dt>
        <dd className="text-ink-700 tabular-nums">
          ${money(invoice.total_amount)} {invoice.currency}
        </dd>
        <dt className="text-13 text-text-muted">Date</dt>
        <dd className="text-ink-700 tabular-nums">{invoice.invoice_date ?? '—'}</dd>
        <dt className="text-13 text-text-muted">Due</dt>
        <dd className="text-ink-700 tabular-nums">{invoice.due_date ?? '—'}</dd>
        <dt className="text-13 text-text-muted">Category</dt>
        <dd className="text-ink-700">{invoice.category?.replace(/_/g, ' ') ?? '—'}</dd>
        <dt className="text-13 text-text-muted">Intake</dt>
        <dd className="text-text-muted">{invoice.intake_source.replace(/_/g, ' ')}</dd>
      </dl>

      <div className="mt-auto sticky bottom-0 bg-surface-lowest border-t-2 border-paper-300 px-sp8 py-sp4 flex items-center justify-end gap-sp3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/properties/${invoice.property_id}/invoices/${invoice.id}`)}
        >
          Open full detail →
        </Button>
      </div>
    </div>
  )
}
