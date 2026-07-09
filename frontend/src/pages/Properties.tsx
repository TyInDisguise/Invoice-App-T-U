import { Link } from 'react-router-dom'
import { Button, Table, type Column } from '../components/ui'
import { useApi } from '../hooks/useApi'
import type { Property } from '../api/types'

const COLS: Column<Property>[] = [
  {
    key: 'name',
    header: 'Property',
    render: (p) => (
      <Link to={`/properties/${p.id}`} className="text-text hover:text-accent font-medium">
        {p.name}
      </Link>
    ),
  },
  {
    key: 'location',
    header: 'Location',
    render: (p) =>
      [p.city, p.state_region].filter(Boolean).join(', ') || '—',
  },
  { key: 'addr', header: 'Address', render: (p) => p.address_line1 ?? '—' },
]

export function Properties() {
  const { data, error, isLoading } = useApi<Property[]>('/properties')

  return (
    <section className="flex flex-col gap-sp7">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-40 font-light leading-none tracking-tight text-ink-700">
            Properties
          </h1>
          <p className="mt-sp3 text-14 text-text-muted">
            All properties your firm currently manages.
          </p>
        </div>
        <Button>New Property</Button>
      </header>

      {error ? (
        <p role="alert" className="text-13 text-danger-500">
          {error.message}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-13 text-text-muted">Loading…</p>
      ) : (
        <Table
          columns={COLS}
          rows={data ?? []}
          rowKey={(p) => p.id}
          caption="Properties"
          emptyState="No properties yet."
        />
      )}
    </section>
  )
}
