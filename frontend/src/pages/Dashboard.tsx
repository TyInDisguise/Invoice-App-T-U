import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  KPIColumn,
  StatusChip,
  Table,
  WidgetGrid,
  type Column,
  type WidgetDef,
} from '../components/ui'
import { useApi } from '../hooks/useApi'
import type { Invoice, Property } from '../api/types'

function money(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

export function Dashboard() {
  const { data: properties } = useApi<Property[]>('/properties')
  const { data: invoices } = useApi<Invoice[]>('/invoices')

  const invoicesByProperty = useMemo(() => {
    const m: Record<string, Invoice[]> = {}
    for (const i of invoices ?? []) {
      m[i.property_id] = m[i.property_id] ?? []
      m[i.property_id]!.push(i)
    }
    return m
  }, [invoices])

  const totals = useMemo(() => {
    const all = invoices ?? []
    const pending = all.filter((i) => i.status === 'pending_approval')
    const review = all.filter((i) => i.status === 'extraction_review')
    const attention = all.filter((i) => i.status === 'on_hold' || i.status === 'rejected')
    const pendingAmount = pending.reduce(
      (acc, i) => acc + (i.total_amount ? Number(i.total_amount) : 0),
      0,
    )
    return {
      propertyCount: (properties ?? []).length,
      invoiceCount: all.length,
      pendingCount: pending.length,
      reviewCount: review.length,
      attentionCount: attention.length,
      pendingAmount,
    }
  }, [properties, invoices])

  interface PropertyRow extends Property {
    invoiceCount: number
    pendingAmount: number
  }

  const propertyRows: PropertyRow[] = (properties ?? []).map((p) => {
    const list = invoicesByProperty[p.id] ?? []
    return {
      ...p,
      invoiceCount: list.length,
      pendingAmount: list
        .filter((i) => i.status === 'pending_approval')
        .reduce((acc, i) => acc + (i.total_amount ? Number(i.total_amount) : 0), 0),
    }
  })

  const propertyCols: Column<PropertyRow>[] = useMemo(() => [
    {
      key: 'name',
      header: 'Property',
      render: (p) => (
        <Link
          to={`/properties/${p.id}`}
          className="text-ink-700 font-medium hover:text-accent"
        >
          {p.name}
        </Link>
      ),
    },
    {
      key: 'location',
      header: 'Location',
      render: (p) => [p.city, p.state_region].filter(Boolean).join(', ') || '—',
    },
    {
      key: 'invoices',
      header: 'Invoices',
      render: (p) => String(p.invoiceCount),
      align: 'right',
    },
    {
      key: 'pending',
      header: 'Pending',
      render: (p) => money(p.pendingAmount),
      align: 'right',
    },
  ], [])

  interface AttentionRow {
    id: string
    invoice_number: string | null
    property: string
    amount: string | null
    status: string
  }

  const attentionRows: AttentionRow[] = (invoices ?? [])
    .filter((i) => i.status === 'on_hold' || i.status === 'rejected' || i.status === 'extraction_review')
    .slice(0, 10)
    .map((i) => ({
      id: i.id,
      invoice_number: i.invoice_number,
      property:
        (properties ?? []).find((p) => p.id === i.property_id)?.name ?? '—',
      amount: i.total_amount,
      status: i.status,
    }))

  const attentionCols: Column<AttentionRow>[] = useMemo(() => [
    { key: 'num', header: 'Invoice', render: (r) => r.invoice_number ?? '—' },
    { key: 'prop', header: 'Property', render: (r) => r.property },
    {
      key: 'amt',
      header: 'Amount',
      align: 'right',
      render: (r) => (r.amount == null ? '—' : money(Number(r.amount))),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <StatusChip
          tone={
            r.status === 'extraction_review'
              ? 'ai'
              : r.status === 'on_hold'
                ? 'attention'
                : 'danger'
          }
        >
          {r.status.replace(/_/g, ' ')}
        </StatusChip>
      ),
    },
  ], [])

  const widgets: WidgetDef[] = useMemo(
    () => [
      {
        id: 'kpis',
        title: 'Summary',
        size: 'xl',
        render: () => (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-sp7">
            <KPIColumn label="Properties" value={String(totals.propertyCount)} />
            <KPIColumn label="Invoices" value={String(totals.invoiceCount)} />
            <KPIColumn
              label="Pending"
              value={money(totals.pendingAmount)}
              hint={`${totals.pendingCount} ready for approval`}
            />
            <KPIColumn
              label="Attention"
              value={String(totals.attentionCount + totals.reviewCount)}
              delta={
                totals.attentionCount > 0
                  ? { value: `${totals.attentionCount} blocked`, tone: 'down' }
                  : undefined
              }
            />
          </div>
        ),
      },
      {
        id: 'properties',
        title: 'Properties',
        size: 'xl',
        render: () => (
          <Table
            columns={propertyCols}
            rows={propertyRows}
            rowKey={(p) => p.id}
            emptyState="No properties yet."
          />
        ),
      },
      {
        id: 'attention',
        title: 'Needs attention',
        size: 'xl',
        render: () =>
          attentionRows.length === 0 ? (
            <p className="text-13 text-text-muted">
              Nothing blocked. All invoices are either ready or already approved.
            </p>
          ) : (
            <Table
              columns={attentionCols}
              rows={attentionRows}
              rowKey={(r) => r.id}
            />
          ),
      },
    ],
    [totals, propertyRows, propertyCols, attentionRows, attentionCols],
  )

  return (
    <section className="flex flex-col gap-sp7">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-40 font-light leading-none tracking-tight text-ink-700">
            Overview
          </h1>
          <p className="mt-sp3 text-14 text-text-muted">
            Portfolio health at a glance — customize the layout to match how you work.
          </p>
        </div>
      </header>

      <WidgetGrid storageKey="overview.widgets.v1" widgets={widgets} />
    </section>
  )
}
