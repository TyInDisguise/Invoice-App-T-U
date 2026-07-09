import { Link, useParams } from 'react-router-dom'
import { StatusChip, Table, type Column, type StatusTone } from '../components/ui'
import { useApi } from '../hooks/useApi'
import type { Draw } from '../api/types'

// Aligned with DrawDetail's DRAW_STATUS_TONE.
const STATUS_TONE: Record<string, StatusTone> = {
  draft: 'neutral',
  submitted: 'info',
  approved: 'ready',
  under_lender_review: 'info',
  revision_requested: 'attention',
  funded: 'success',
  closed: 'neutral',
  cancelled: 'danger',
}

export function Draws() {
  const { propertyId } = useParams<{ propertyId: string }>()
  const { data, error, isLoading } = useApi<Draw[]>(
    propertyId ? `/properties/${propertyId}/draws` : null,
  )

  const cols: Column<Draw>[] = [
    {
      key: 'num',
      header: 'Draw',
      render: (d) => (
        <Link
          to={`/properties/${d.property_id}/draws/${d.id}`}
          className="text-text hover:text-accent font-medium"
        >
          #{d.draw_number}
        </Link>
      ),
    },
    { key: 'period', header: 'Period', render: (d) => `${d.period_start} → ${d.period_end}` },
    {
      key: 'status',
      header: 'Status',
      render: (d) => (
        <StatusChip tone={STATUS_TONE[d.status] ?? 'neutral'}>
          {d.status.replace(/_/g, ' ')}
        </StatusChip>
      ),
    },
    {
      key: 'rev',
      header: 'Revision',
      render: (d) => String(d.revision_number),
      align: 'right',
    },
  ]

  return (
    <section className="flex flex-col gap-sp7">
      <header>
        <h1 className="font-display text-40 font-light leading-none tracking-tight text-ink-700">
          Draws
        </h1>
        <p className="mt-sp3 text-14 text-text-muted">
          Compile, submit, and track draws through lender review.
        </p>
      </header>
      {error ? (
        <p role="alert" className="text-13 text-danger-500">{error.message}</p>
      ) : null}
      {isLoading ? (
        <p className="text-13 text-text-muted">Loading…</p>
      ) : (
        <Table
          columns={cols}
          rows={data ?? []}
          rowKey={(d) => d.id}
          emptyState="No draws yet."
        />
      )}
    </section>
  )
}
