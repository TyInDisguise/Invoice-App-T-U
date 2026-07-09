import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { mutate } from 'swr'
import { Button, StatusChip, Table, useToast, type Column, type StatusTone } from '../components/ui'
import { useApi } from '../hooks/useApi'
import type { Invoice } from '../api/types'

const STATUS_TONE: Record<string, StatusTone> = {
  extraction_review: 'ai',
  pending_approval: 'ready',
  approved: 'success',
  on_hold: 'attention',
  rejected: 'danger',
  in_draw: 'info',
  paid: 'success',
}

function money(v: string | null): string {
  if (v == null) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return v
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export function Invoices() {
  const { propertyId } = useParams<{ propertyId: string }>()
  const listPath = propertyId ? `/properties/${propertyId}/invoices` : null
  const { data, error, isLoading } = useApi<Invoice[]>(listPath)
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0 || !propertyId) return
    setUploading(true)
    let ok = 0
    let dup = 0
    let err = 0
    for (const file of Array.from(files)) {
      const form = new FormData()
      form.append('file', file)
      form.append('source_label', file.name)
      try {
        const res = await fetch(
          `${BASE}/properties/${propertyId}/invoices/upload`,
          { method: 'POST', credentials: 'include', body: form },
        )
        if (!res.ok) {
          err += 1
          continue
        }
        const body = (await res.json()) as { duplicate: boolean }
        if (body.duplicate) dup += 1
        else ok += 1
      } catch {
        err += 1
      }
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    toast(`Uploaded ${ok} · duplicates ${dup} · errors ${err}`, err ? 'warn' : 'success')
    if (listPath) await mutate(listPath)
  }

  const cols: Column<Invoice>[] = [
    {
      key: 'num',
      header: 'Invoice',
      render: (i) => (
        <Link
          to={`/properties/${i.property_id}/invoices/${i.id}`}
          className="text-text hover:text-accent font-medium"
        >
          {i.invoice_number ?? '(no number)'}
        </Link>
      ),
    },
    { key: 'date', header: 'Date', render: (i) => i.invoice_date ?? '—' },
    { key: 'amt', header: 'Amount', render: (i) => money(i.total_amount), align: 'right' },
    {
      key: 'status',
      header: 'Status',
      render: (i) => (
        <StatusChip tone={STATUS_TONE[i.status] ?? 'neutral'}>
          {i.status.replace(/_/g, ' ')}
        </StatusChip>
      ),
    },
  ]

  return (
    <section className="flex flex-col gap-sp7">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-40 font-light leading-none tracking-tight text-ink-700">
            Invoices
          </h1>
          <p className="mt-sp3 text-14 text-text-muted">
            Upload PDFs to route them through extraction review and approval.
          </p>
        </div>
        <div className="flex gap-sp3">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            multiple
            onChange={onPick}
            className="hidden"
            aria-label="Upload invoice PDFs"
          />
          <Button onClick={() => fileRef.current?.click()} loading={uploading}>
            Upload PDFs
          </Button>
        </div>
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
          rowKey={(i) => i.id}
          emptyState="No invoices yet — click Upload PDFs to add one."
        />
      )}
    </section>
  )
}
