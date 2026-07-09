import { Link, useParams } from 'react-router-dom'
import { KPIColumn } from '../components/ui'
import { useApi } from '../hooks/useApi'
import type { PropertyDashboard as Dashboard } from '../api/types'

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
        </nav>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-sp7 bg-surface-lowest border border-paper-200 rounded-3 p-sp7">
        <KPIColumn label="Open for review" value={String(data.open_review_count)} />
        <KPIColumn label="Approved" value={String(data.approved_count)} />
      </div>
    </section>
  )
}
