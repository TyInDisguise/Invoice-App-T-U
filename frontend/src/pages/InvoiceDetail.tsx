import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { mutate } from 'swr'
import { Button, Input, StatusChip, type StatusTone, useToast } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { api } from '../api/client'
import type { FabricPayload } from '../components/AnnotationCanvas'
import type { Invoice, InvoiceAttachment, InvoiceExtraction } from '../api/types'

// Lazy-load the annotation canvas: it pulls in pdfjs-dist + fabric (~700KB
// minified) which shouldn't be in the main bundle. Users only pay for it
// when they open an invoice detail page.
const AnnotationCanvas = lazy(() =>
  import('../components/AnnotationCanvas').then((m) => ({
    default: m.AnnotationCanvas,
  })),
)

// Status → StatusChip tone. Keeps the Hi-Fi earth-tone palette over wireframe placeholders.
// Keep in sync with Invoices.tsx + InvoiceReview.tsx. `pending_approval`
// reads as "ready for the approver to act" — matches the sage-green chip
// users already know from the review workspace.
const STATUS_TONE: Record<string, StatusTone> = {
  extraction_review: 'ai',
  pending_approval: 'ready',
  approved: 'success',
  on_hold: 'attention',
  rejected: 'danger',
  paid: 'success',
  in_draw: 'info',
}

function toneFor(status: string): StatusTone {
  return STATUS_TONE[status] ?? 'neutral'
}

function ConfidenceBar({ level }: { level: 'hi' | 'md' | 'lo' }) {
  const width = level === 'hi' ? '90%' : level === 'md' ? '60%' : '25%'
  const color =
    level === 'hi' ? 'bg-sage-600' : level === 'md' ? 'bg-warn-500' : 'bg-danger-500'
  return (
    <span
      className="inline-block relative w-[44px] h-[6px] bg-paper-200 border border-paper-300"
      aria-label={`confidence ${level}`}
    >
      <span className={`absolute inset-y-0 left-0 ${color}`} style={{ width }} />
    </span>
  )
}

function confidenceFromScore(score: number | null): 'hi' | 'md' | 'lo' {
  if (score === null) return 'md'
  if (score >= 0.8) return 'hi'
  if (score >= 0.5) return 'md'
  return 'lo'
}

interface AiField {
  label: string
  value: string
  confidence: 'hi' | 'md' | 'lo'
  confirmed: boolean
}

function buildFields(invoice: Invoice, extraction: InvoiceExtraction | undefined): AiField[] {
  const conf = confidenceFromScore(
    extraction?.ai_confidence_score ? Number(extraction.ai_confidence_score) : null,
  )
  const status = (key: string) => extraction?.ai_field_status?.[key]
  const isConfirmed = (key: string) => status(key) === 'confirmed'

  return [
    {
      label: 'amount',
      value: invoice.total_amount
        ? `$${Number(invoice.total_amount).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`
        : '—',
      confidence: conf,
      confirmed: isConfirmed('total_amount'),
    },
    {
      label: 'invoice #',
      value: invoice.invoice_number ?? '—',
      confidence: conf,
      confirmed: isConfirmed('invoice_number'),
    },
    {
      label: 'date',
      value: invoice.invoice_date ?? '—',
      confidence: conf,
      confirmed: isConfirmed('invoice_date'),
    },
    {
      label: 'vendor',
      value: invoice.vendor_id ? 'matched' : 'unmatched',
      confidence: conf,
      confirmed: Boolean(invoice.vendor_id),
    },
    {
      label: 'classification',
      value: invoice.expense_classification,
      confidence: 'md',
      confirmed: true,
    },
  ]
}

export function InvoiceDetail() {
  const { propertyId, invoiceId } = useParams<{ propertyId: string; invoiceId: string }>()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()

  const invoicePath = `/properties/${propertyId}/invoices/${invoiceId}`
  const extractionPath = `${invoicePath}/extraction`
  const attachmentsPath = `${invoicePath}/attachments`

  const { data: invoice } = useApi<Invoice>(invoiceId ? invoicePath : null)
  const { data: extraction } = useApi<InvoiceExtraction>(
    invoiceId ? extractionPath : null,
  )
  const { data: attachments } = useApi<InvoiceAttachment[]>(
    invoiceId ? attachmentsPath : null,
  )

  const [holdReason, setHoldReason] = useState('')
  const [reasonOpen, setReasonOpen] = useState<'hold' | 'reject' | null>(null)

  // View selector: standard | payapp. Auto-enables pay-app when the invoice
  // carries more than one attachment (proxy for multi-vendor packet) or when
  // classification is capital_expenditure. ?view=payapp forces it.
  const forcedView = searchParams.get('view')
  const autoPayApp =
    (attachments?.length ?? 0) > 1 ||
    invoice?.expense_classification === 'capital_expenditure'
  const isPayApp = forcedView === 'payapp' || (forcedView !== 'standard' && autoPayApp)

  async function transition(toStatus: string, reason?: string) {
    try {
      await api.post(`${invoicePath}/transition`, {
        to_status: toStatus,
        reason,
        payment_method: toStatus === 'paid' ? 'check' : undefined,
      })
      toast(`Moved to ${toStatus.replace(/_/g, ' ')}`, 'success')
      setReasonOpen(null)
      setHoldReason('')
      await mutate(invoicePath)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Transition failed', 'danger')
    }
  }

  async function promoteExtraction() {
    try {
      await api.post(`${invoicePath}/promote-extraction`)
      toast('Moved to pending approval', 'success')
      await mutate(invoicePath)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Promote failed', 'danger')
    }
  }

  async function onBurn(payload: FabricPayload) {
    const original = attachments?.find((a) => a.attachment_type === 'original')
    if (!original) {
      toast('No original PDF to annotate', 'danger')
      return
    }
    try {
      await api.post(`${invoicePath}/annotations/burn`, {
        attachment_id: original.id,
        fabric_payload: payload,
      })
      toast('Annotated PDF created', 'success')
      await mutate(attachmentsPath)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Burn failed', 'danger')
    }
  }

  // Keyboard shortcuts (A/R/H/E/Enter) — only bind when an invoice is loaded
  // and no modal reason input is focused.
  useEffect(() => {
    if (!invoice) return
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 'a' && invoice.status === 'pending_approval') {
        e.preventDefault()
        void transition('approved')
      } else if (key === 'h' && invoice.status === 'pending_approval') {
        e.preventDefault()
        setReasonOpen('hold')
      } else if (key === 'r' && invoice.status === 'pending_approval') {
        e.preventDefault()
        setReasonOpen('reject')
      } else if (key === 'enter' && invoice.status === 'extraction_review') {
        e.preventDefault()
        void promoteExtraction()
      } else if (key === 'escape') {
        setReasonOpen(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // `transition` and `promoteExtraction` are recreated every render;
    // binding on them would rewire the listener on every keystroke. We
    // intentionally key on the invoice identity + status only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id, invoice?.status])

  const fields = useMemo(
    () => (invoice ? buildFields(invoice, extraction) : []),
    [invoice, extraction],
  )

  if (!invoice || !propertyId || !invoiceId) {
    return <p className="p-sp7 text-13 text-text-muted">Loading…</p>
  }

  const original = attachments?.find((a) => a.attachment_type === 'original')
  const pdfUrl = original
    ? `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'}/artifacts/${original.attachment_ref}`
    : null

  return (
    <div className="flex flex-col bg-paper-0 min-h-[720px] border border-paper-200">
      <TopBar
        invoice={invoice}
        propertyId={propertyId}
        isPayApp={isPayApp}
      />

      {isPayApp ? (
        <PayAppLayout
          invoice={invoice}
          attachments={attachments ?? []}
          pdfUrl={pdfUrl}
          fields={fields}
          onBurn={onBurn}
          onApprove={() => transition('approved')}
          onHold={() => setReasonOpen('hold')}
          onReject={() => setReasonOpen('reject')}
          onPromote={promoteExtraction}
        />
      ) : (
        <StandardLayout
          invoice={invoice}
          attachments={attachments ?? []}
          pdfUrl={pdfUrl}
          fields={fields}
          onBurn={onBurn}
          onApprove={() => transition('approved')}
          onHold={() => setReasonOpen('hold')}
          onReject={() => setReasonOpen('reject')}
          onPromote={promoteExtraction}
        />
      )}

      {reasonOpen ? (
        <ReasonBar
          kind={reasonOpen}
          value={holdReason}
          onChange={setHoldReason}
          onCancel={() => {
            setReasonOpen(null)
            setHoldReason('')
          }}
          onSubmit={() =>
            transition(reasonOpen === 'hold' ? 'on_hold' : 'rejected', holdReason)
          }
        />
      ) : null}
    </div>
  )
}

function TopBar({
  invoice,
  propertyId,
  isPayApp,
}: {
  invoice: Invoice
  propertyId: string
  isPayApp: boolean
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-sp6 px-sp6 py-sp3 border-b border-paper-200 bg-paper-50">
      <Link
        to={`/properties/${propertyId}/invoices`}
        className="font-mono text-11 text-text-muted hover:text-text uppercase tracking-[0.1em]"
      >
        ← list
      </Link>
      <div className="flex items-baseline gap-sp3 min-w-0">
        <span className="font-sans text-16 font-semi text-text truncate">
          {invoice.vendor_id ? 'Invoice' : 'Unmatched vendor'}
        </span>
        <span className="font-mono text-11 text-text-subtle">
          {invoice.invoice_number ?? '—'}
        </span>
        {invoice.invoice_date ? (
          <span className="font-mono text-11 text-text-subtle">
            · {invoice.invoice_date}
          </span>
        ) : null}
        {invoice.total_amount ? (
          <span className="font-sans text-13 text-text tabular-nums">
            · $
            {Number(invoice.total_amount).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        ) : null}
        {isPayApp ? (
          <span className="font-mono text-10 uppercase tracking-[0.1em] text-ai-500 ml-sp2">
            · pay-app
          </span>
        ) : null}
      </div>
      <span className="font-mono text-10 text-text-subtle uppercase tracking-[0.1em]">
        {invoice.intake_source}
      </span>
      <StatusChip tone={toneFor(invoice.status)}>
        {invoice.status.replace(/_/g, ' ')}
      </StatusChip>
    </div>
  )
}

function StandardLayout(props: LayoutProps) {
  const { pdfUrl, fields, onBurn, invoice } = props
  return (
    <div className="grid grid-cols-[60px_minmax(0,1fr)_380px] min-h-[720px]">
      <ThumbRail pages={1} />
      <div className="bg-paper-50 p-sp5 overflow-auto">
        {pdfUrl ? (
          <Suspense fallback={<PdfLoading />}>
            <AnnotationCanvas pdfUrl={pdfUrl} onBurn={onBurn} />
          </Suspense>
        ) : (
          <EmptyPdf />
        )}
      </div>
      <AICard {...props} fields={fields} invoice={invoice} />
    </div>
  )
}

function PayAppLayout(props: LayoutProps) {
  const { pdfUrl, attachments, fields, onBurn, invoice } = props
  const [activeIndex, setActiveIndex] = useState(0)
  const subItems = attachments.length > 0 ? attachments : []

  return (
    <div className="grid grid-cols-[220px_105px_minmax(0,1fr)_360px] min-h-[720px] bg-paper-0">
      <SubInvoiceList
        items={subItems}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        total={invoice.total_amount}
      />
      <SectionedRail count={attachments.length} />
      <div className="bg-paper-50 p-sp5 overflow-auto border-r border-paper-200">
        {pdfUrl ? (
          <Suspense fallback={<PdfLoading />}>
            <AnnotationCanvas pdfUrl={pdfUrl} onBurn={onBurn} />
          </Suspense>
        ) : (
          <EmptyPdf />
        )}
      </div>
      <AICard {...props} fields={fields} invoice={invoice} packetLevel />
    </div>
  )
}

interface LayoutProps {
  invoice: Invoice
  attachments: InvoiceAttachment[]
  pdfUrl: string | null
  fields: AiField[]
  onBurn: (payload: FabricPayload) => Promise<void>
  onApprove: () => void
  onHold: () => void
  onReject: () => void
  onPromote: () => void
}

function ThumbRail({ pages }: { pages: number }) {
  return (
    <aside className="bg-paper-100 border-r border-paper-200 p-sp2 flex flex-col gap-sp1">
      {Array.from({ length: pages }).map((_, i) => (
        <div
          key={i}
          className={[
            'aspect-[8.5/11] grid place-items-center',
            'font-mono text-10 text-text-subtle',
            'bg-paper-0',
            i === 0 ? 'border-2 border-ink-700' : 'border border-paper-300',
          ].join(' ')}
        >
          {i + 1}
        </div>
      ))}
    </aside>
  )
}

function SectionedRail({ count }: { count: number }) {
  const groups = [
    { label: 'cover', border: 'border-ink-700', pages: 3 },
    { label: 'sub', border: 'border-ai-500', pages: Math.max(count, 1) },
    { label: 'lien', border: 'border-sage-600', pages: 2 },
    { label: 'coi', border: 'border-warn-500', pages: 1 },
  ]
  let pageNum = 1
  return (
    <aside className="bg-paper-100 border-r border-paper-200 p-sp2 overflow-y-auto">
      <div className="flex flex-col gap-sp3 font-mono text-9">
        {groups.map((g) => (
          <div key={g.label} className={`pl-sp2 border-l-[3px] ${g.border}`}>
            <div className="font-mono text-10 uppercase tracking-[0.1em] text-text-subtle mb-sp1">
              {g.label}
            </div>
            <div className="flex flex-wrap gap-sp1">
              {Array.from({ length: g.pages }).map((_, i) => {
                const n = pageNum++
                return (
                  <span
                    key={i}
                    className="w-[18px] h-[22px] grid place-items-center bg-paper-0 border border-paper-300 text-10 text-text-subtle"
                  >
                    {n}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}

function SubInvoiceList({
  items,
  activeIndex,
  onSelect,
  total,
}: {
  items: InvoiceAttachment[]
  activeIndex: number
  onSelect: (i: number) => void
  total: string | null
}) {
  return (
    <aside className="bg-paper-100 border-r border-paper-200 p-sp3 flex flex-col gap-sp2">
      <div className="font-mono text-10 uppercase tracking-[0.1em] text-text-subtle">
        Contents · {items.length}
      </div>
      <p className="text-12 italic text-text-subtle -mt-sp1">auto-classified at ingest</p>
      <ul className="flex flex-col gap-sp1">
        {items.map((att, i) => (
          <li key={att.id}>
            <button
              onClick={() => onSelect(i)}
              className={[
                'w-full grid grid-cols-[1fr_auto] gap-sp2 items-baseline',
                'px-sp2 py-sp1 text-left font-mono text-11 border',
                i === activeIndex
                  ? 'bg-paper-0 border-ink-700'
                  : 'bg-paper-0 border-paper-200 hover:border-paper-300',
              ].join(' ')}
            >
              <span className="truncate text-text">
                {att.attachment_type.replace(/_/g, ' ')}
              </span>
              <span className="text-text-subtle text-10">{att.upload_source}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex justify-between items-baseline border-t border-paper-200 pt-sp2 mt-sp2 font-mono text-11">
        <span className="text-text-subtle uppercase tracking-[0.08em]">total</span>
        <span className="text-text tabular-nums">{total ?? '—'}</span>
      </div>
    </aside>
  )
}

function AICard({
  invoice,
  fields,
  onApprove,
  onHold,
  onReject,
  onPromote,
  packetLevel,
}: LayoutProps & { packetLevel?: boolean }) {
  const canApprove = invoice.status === 'pending_approval'
  const canPromote = invoice.status === 'extraction_review'

  return (
    <aside className="border-l border-paper-200 bg-paper-0 p-sp5 flex flex-col gap-sp4 overflow-y-auto">
      <header>
        <h2 className="font-display text-18 text-text font-semi">
          {packetLevel ? 'Sub-invoice summary' : 'Invoice summary'}
        </h2>
      </header>

      <div className="bg-ai-50 border-l-[3px] border-ai-500 p-sp3 text-13 text-text">
        {invoice.total_amount ? `$${invoice.total_amount} ` : ''}
        {invoice.vendor_id ? 'from matched vendor' : 'vendor unmatched'}
        {invoice.invoice_date ? ` · ${invoice.invoice_date}` : ''}.
        {invoice.on_hold_reason ? (
          <>
            {' '}
            <span className="text-danger-600 font-semi">Blocked:</span>{' '}
            {invoice.on_hold_reason}
          </>
        ) : null}
      </div>

      <section>
        <div className="font-mono text-10 uppercase tracking-[0.1em] text-text-subtle mb-sp2">
          Key fields
        </div>
        <dl className="flex flex-col">
          {fields.map((f) => (
            <div
              key={f.label}
              className="grid grid-cols-[92px_minmax(0,1fr)_auto] gap-sp2 py-sp1 border-b border-dotted border-paper-200 items-baseline"
            >
              <dt className="font-mono text-11 text-text-subtle">{f.label}</dt>
              <dd
                className={[
                  'font-mono text-12 tabular-nums',
                  f.confirmed ? 'text-text' : 'text-ai-500 italic',
                ].join(' ')}
              >
                {f.confirmed ? '✓ ' : '◇ '}
                {f.value}
              </dd>
              {f.confirmed ? (
                <span className="font-mono text-10 text-sage-600">✓</span>
              ) : (
                <ConfidenceBar level={f.confidence} />
              )}
            </div>
          ))}
        </dl>
      </section>

      {canPromote ? (
        <Button onClick={onPromote} className="w-full">
          Promote to approval queue ⏎
        </Button>
      ) : null}

      {canApprove ? (
        <>
          <div className="grid grid-cols-3 gap-sp1">
            <ActionButton tone="success" label="Approve" kbd="A" onClick={onApprove} />
            <ActionButton tone="warn" label="Hold" kbd="H" onClick={onHold} />
            <ActionButton tone="danger" label="Reject" kbd="R" onClick={onReject} />
          </div>
          {packetLevel ? (
            <div className="font-mono text-10 text-text-subtle p-sp2 border border-dashed border-paper-300 bg-paper-50">
              <span className="text-text-muted font-semi">packet-level</span>
              <br />⌘+A approves whole packet — enabled when every sub is cleared
            </div>
          ) : null}
        </>
      ) : null}
    </aside>
  )
}

function ActionButton({
  tone,
  label,
  kbd,
  onClick,
}: {
  tone: 'success' | 'warn' | 'danger'
  label: string
  kbd: string
  onClick: () => void
}) {
  const cls: Record<string, string> = {
    success: 'border-sage-600 text-sage-700 hover:bg-sage-50 font-semi',
    warn: 'border-warn-500 text-warn-600 hover:bg-warn-50',
    danger: 'border-danger-500 text-danger-600 hover:bg-danger-50',
  }
  return (
    <button
      onClick={onClick}
      className={[
        'py-sp2 text-center border font-sans text-13 transition-colors duration-2',
        cls[tone],
      ].join(' ')}
    >
      {label}
      <span className="block font-mono text-10 text-text-subtle mt-sp1">{kbd}</span>
    </button>
  )
}

function ReasonBar({
  kind,
  value,
  onChange,
  onCancel,
  onSubmit,
}: {
  kind: 'hold' | 'reject'
  value: string
  onChange: (v: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div className="border-t border-paper-200 bg-paper-50 p-sp4 flex gap-sp3 items-end">
      <div className="flex-1">
        <Input
          label={`${kind === 'hold' ? 'Hold' : 'Reject'} reason`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
      </div>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        variant={kind === 'reject' ? 'danger' : 'primary'}
        onClick={onSubmit}
        disabled={!value.trim()}
      >
        Confirm {kind}
      </Button>
    </div>
  )
}

function PdfLoading() {
  return (
    <div className="aspect-[8.5/11] max-w-[720px] mx-auto border border-paper-200 bg-paper-50 grid place-items-center text-13 text-text-subtle">
      Loading viewer…
    </div>
  )
}

function EmptyPdf() {
  return (
    <div className="aspect-[8.5/11] max-w-[720px] mx-auto border border-paper-300 bg-paper-0 bg-empty-pattern grid place-items-center text-13 text-text-subtle">
      No original PDF attached
    </div>
  )
}
