import { useParams } from 'react-router-dom'
import { Table, type Column } from '../components/ui'
import { useApi } from '../hooks/useApi'
import type { Budget, BudgetLineItem } from '../api/types'

interface G703Row {
  item: string
  description: string
  scheduled: number
  retainage: number
}

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function PayApp() {
  const { propertyId } = useParams<{ propertyId: string }>()
  const { data: budgets } = useApi<Budget[]>(
    propertyId ? `/properties/${propertyId}/budgets` : null,
  )
  const activeBudget = budgets?.[0]
  const { data: items } = useApi<BudgetLineItem[]>(
    activeBudget
      ? `/properties/${propertyId}/budgets/${activeBudget.id}/line-items`
      : null,
  )

  const rows: G703Row[] = (items ?? []).map((li) => ({
    item: li.code,
    description: li.description,
    scheduled: Number(li.original_amount),
    retainage: Number(li.retainage_percent ?? '0'),
  }))

  const cols: Column<G703Row>[] = [
    { key: 'item', header: 'Item', render: (r) => r.item },
    { key: 'desc', header: 'Description', render: (r) => r.description },
    {
      key: 'sch',
      header: 'Scheduled Value',
      render: (r) => money(r.scheduled),
      align: 'right',
    },
    { key: 'prior', header: 'Prior Periods', render: () => money(0), align: 'right' },
    { key: 'this', header: 'This Period', render: () => money(0), align: 'right' },
    { key: 'stored', header: 'Materials Stored', render: () => money(0), align: 'right' },
    {
      key: 'total',
      header: 'Total to Date',
      render: () => money(0),
      align: 'right',
    },
    {
      key: 'pct',
      header: '% Complete',
      render: () => '0.00%',
      align: 'right',
    },
    {
      key: 'bal',
      header: 'Balance to Finish',
      render: (r) => money(r.scheduled),
      align: 'right',
    },
    {
      key: 'ret',
      header: 'Retainage',
      render: (r) => `${r.retainage}%`,
      align: 'right',
    },
  ]

  return (
    <section className="flex flex-col gap-sp7">
      <header>
        <h1 className="font-display text-32 text-text">Pay App (G703)</h1>
        <p className="mt-sp2 text-14 text-text-muted">
          Per-line-item historical spend matching the Excel export layout.
        </p>
      </header>
      {!activeBudget ? (
        <p className="text-13 text-text-muted">No active budget.</p>
      ) : (
        <Table
          columns={cols}
          rows={rows}
          rowKey={(r) => r.item}
          emptyState="No line items in the active budget yet."
        />
      )}
    </section>
  )
}
