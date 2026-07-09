import { Link, useParams } from 'react-router-dom'
import { KPIColumn, StatusChip, Table, type Column } from '../components/ui'
import { PMAccessPanel } from '../components/PMAccessPanel'
import { useApi } from '../hooks/useApi'
import type { PropertyDashboard as Dashboard } from '../api/types'

type Loan = Dashboard['active_loans'][number]

const LOAN_COLS: Column<Loan>[] = [
  { key: 'lender', header: 'Lender', render: (l) => l.lender_name },
  { key: 'bal', header: 'Balance', render: (l) => formatMoney(l.current_balance), align: 'right' },
  { key: 'status', header: 'Status', render: (l) => <StatusChip tone="success">{l.status}</StatusChip> },
]

function formatMoney(v: string): string {
  const n = Number(v)
  if (Number.isNaN(n)) return v
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function PropertyDashboard() {
  const { propertyId } = useParams<{ propertyId: string }>()
  const { data, error, isLoading } = useApi<Dashboard>(
    propertyId ? `/properties/${propertyId}/dashboard` : null,
  )

  if (isLoading) return <p className="text-13 text-text-muted">Loading…</p>
  if (error) return <p role="alert" className="text-13 text-danger-500">{error.message}</p>
  if (!data) return null

  const p = data.property
  return (
    <section className="flex flex-col gap-sp7">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-40 font-light leading-none tracking-tight text-ink-700">
            {p.name}
          </h1>
          <p className="mt-sp3 text-14 text-text-muted">
            {[p.address_line1, p.city, p.state_region].filter(Boolean).join(' · ')}
          </p>
        </div>
        <nav aria-label="Property tabs" className="flex gap-sp5 text-13 text-text-muted">
          <Link to={`/properties/${p.id}/invoices`} className="hover:text-text">
            Invoices
          </Link>
          <Link to={`/properties/${p.id}/draws`} className="hover:text-text">
            Draws
          </Link>
          <Link to={`/properties/${p.id}/pay-app`} className="hover:text-text">
            Pay App
          </Link>
        </nav>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-sp7 bg-surface-lowest border border-paper-200 rounded-3 p-sp7">
        <KPIColumn label="Active loans" value={String(data.active_loans.length)} />
        <KPIColumn
          label="Budget total"
          value={formatMoney(data.budget_summary.total_amount)}
          hint={`${data.budget_summary.active_count} active`}
        />
        <KPIColumn label="Draws" value={String(data.draw_count)} />
      </div>

      <div className="flex flex-col gap-sp3">
        <h2 className="text-16 font-semi text-text">Active loans</h2>
        <Table
          columns={LOAN_COLS}
          rows={data.active_loans}
          rowKey={(l) => l.id}
          caption="Active loans"
          emptyState="No active loans."
        />
      </div>

      <PMAccessPanel propertyId={p.id} />
    </section>
  )
}
