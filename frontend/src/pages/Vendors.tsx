import type { Vendor } from '../api/types'
import { Table, type Column } from '../components/ui'
import { useApi } from '../hooks/useApi'

const COLS: Column<Vendor>[] = [
  { key: 'name', header: 'Vendor', render: (v) => v.name },
  {
    key: 'contact',
    header: 'Contact',
    render: (v) => (
      <span className="text-13 text-text-muted">{v.contact_email ?? '—'}</span>
    ),
  },
  {
    key: 'location',
    header: 'Location',
    render: (v) => (
      <span className="text-13 text-text-muted">
        {[v.city, v.state_region].filter(Boolean).join(', ') || '—'}
      </span>
    ),
  },
]

export function Vendors() {
  const { data: vendors, isLoading } = useApi<Vendor[]>('/vendors')

  return (
    <section className="flex flex-col gap-sp5">
      <header>
        <h1 className="font-display text-40 font-light leading-none tracking-tight text-ink-700">
          Vendors
        </h1>
        <p className="mt-sp3 text-14 text-text-muted">
          Vendor records used to match incoming invoices.
        </p>
      </header>

      {isLoading ? (
        <p className="text-13 text-text-muted">Loading…</p>
      ) : (
        <Table
          columns={COLS}
          rows={vendors ?? []}
          rowKey={(v) => v.id}
          caption="Vendors"
          emptyState="No vendors yet."
        />
      )}
    </section>
  )
}
