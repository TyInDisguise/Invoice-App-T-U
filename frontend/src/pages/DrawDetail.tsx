import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { mutate } from 'swr'
import {
  Button,
  StatusChip,
  TokenLinkModal,
  type StatusTone,
  useToast,
} from '../components/ui'
import { useApi } from '../hooks/useApi'
import { api } from '../api/client'
import { issueLenderToken, portalUrlForToken } from '../api/tokens'
import type {
  Draw,
  DrawItem,
  DrawPackage,
  DrawPreflight,
  Invoice,
} from '../api/types'

const DRAW_STATUS_TONE: Record<string, StatusTone> = {
  draft: 'neutral',
  submitted: 'info',
  approved: 'ready',
  funded: 'success',
  revision_requested: 'attention',
  cancelled: 'danger',
}

function toneFor(status: string): StatusTone {
  return DRAW_STATUS_TONE[status] ?? 'neutral'
}

export function DrawDetail() {
  const { propertyId, drawId } = useParams<{ propertyId: string; drawId: string }>()
  const { toast } = useToast()
  const drawPath = `/properties/${propertyId}/draws/${drawId}`
  const packagesPath = `${drawPath}/packages`
  const itemsPath = `${drawPath}/items`
  const invoicesPath = `/properties/${propertyId}/invoices`

  const { data: draw } = useApi<Draw>(drawId ? drawPath : null)
  const { data: packages } = useApi<DrawPackage[]>(drawId ? packagesPath : null)
  const { data: items } = useApi<DrawItem[]>(drawId ? itemsPath : null)
  const { data: invoices } = useApi<Invoice[]>(propertyId ? invoicesPath : null)

  const [preflight, setPreflight] = useState<DrawPreflight | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [lenderLink, setLenderLink] = useState<
    { url: string; expiresAt: string } | null
  >(null)
  const [lenderModalOpen, setLenderModalOpen] = useState(false)
  const [activePackageId, setActivePackageId] = useState<string | null>(null)

  async function run<T>(
    label: string,
    fn: () => Promise<T>,
    successMsg: string,
  ): Promise<T | void> {
    setBusy(label)
    try {
      const out = await fn()
      toast(successMsg, 'success')
      return out
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'danger')
    } finally {
      setBusy(null)
    }
  }

  async function issueLenderLink(packageId: string) {
    setBusy(`lender-${packageId}`)
    setLenderLink(null)
    setLenderModalOpen(true)
    try {
      const res = await issueLenderToken('draw_package', packageId)
      setLenderLink({
        url: portalUrlForToken('lender', res.token),
        expiresAt: res.expires_at,
      })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to issue link', 'danger')
      setLenderModalOpen(false)
    } finally {
      setBusy(null)
    }
  }

  const invoiceById = useMemo(() => {
    const m = new Map<string, Invoice>()
    for (const inv of invoices ?? []) m.set(inv.id, inv)
    return m
  }, [invoices])

  // Split items into in-draw vs excluded for display grouping (matches wireframe).
  const { inDraw, excluded } = useMemo(() => {
    const ok: DrawItem[] = []
    const x: DrawItem[] = []
    for (const it of items ?? []) {
      if (it.excluded_for_period || it.deferred_to_next_draw) x.push(it)
      else ok.push(it)
    }
    return { inDraw: ok, excluded: x }
  }, [items])

  const drawTotal = useMemo(
    () =>
      inDraw.reduce((sum, i) => sum + Number(i.allocated_amount ?? 0), 0),
    [inDraw],
  )

  if (!draw || !propertyId || !drawId) {
    return <p className="p-sp7 text-13 text-text-muted">Loading…</p>
  }

  return (
    <div className="flex flex-col bg-paper-0 border border-paper-200 min-h-[720px]">
      <CycleBanner draw={draw} />
      <TopBar draw={draw} propertyId={propertyId} />

      <div className="grid grid-cols-[280px_minmax(0,1fr)_340px] min-h-[600px]">
        <LeftRail
          draw={draw}
          preflight={preflight}
          busy={busy}
          onPreflight={() =>
            run(
              'preflight',
              () =>
                api.post<DrawPreflight>(
                  `${drawPath}/preflight`,
                ),
              'Pre-flight complete',
            ).then((res) => {
              if (res) setPreflight(res)
            })
          }
        />

        <CenterTable
          inDraw={inDraw}
          excluded={excluded}
          invoiceById={invoiceById}
          total={drawTotal}
          preflight={preflight}
        />

        <RightRail
          packages={packages ?? []}
          activePackageId={activePackageId}
          onSelectPackage={setActivePackageId}
          onIssueLender={issueLenderLink}
          busy={busy}
          propertyId={propertyId}
          drawId={drawId}
        />
      </div>

      <ActionsBar
        draw={draw}
        busy={busy}
        onSubmit={() =>
          run(
            'submit',
            () =>
              api.post(`${drawPath}/transition`, { to_status: 'submitted' }),
            'Draw submitted',
          ).then(() => mutate(drawPath))
        }
        onCompile={() =>
          run(
            'compile',
            () =>
              api.post(`${drawPath}/packages/compile`, { background: false }),
            'Package compiled',
          ).then(() => mutate(packagesPath))
        }
      />

      <TokenLinkModal
        open={lenderModalOpen}
        onClose={() => setLenderModalOpen(false)}
        title="Lender receipt link"
        description="Share this single-use link with the lender. They'll preview the package and confirm receipt in one click."
        url={lenderLink?.url ?? null}
        expiresAt={lenderLink?.expiresAt ?? null}
      />
    </div>
  )
}

function CycleBanner({ draw }: { draw: Draw }) {
  // Wireframe shows parent-entity cycle tabs (sibling loans under a portfolio).
  // Backend doesn't yet surface portfolio-level cycle groupings; show the
  // single-loan cycle metadata we have until that ships.
  const periodLabel = `${draw.period_start} → ${draw.period_end}`
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-sp5 px-sp6 py-sp3 bg-sage-50 border-b border-paper-200">
      <span className="font-mono text-10 uppercase tracking-[0.12em] text-text-subtle">
        draw cycle
      </span>
      <div className="flex items-baseline gap-sp4 min-w-0">
        <span className="font-sans text-15 font-semi text-text">
          Draw #{draw.draw_number}
        </span>
        <span className="font-mono text-11 text-text-subtle">{periodLabel}</span>
      </div>
    </div>
  )
}

function TopBar({ draw, propertyId }: { draw: Draw; propertyId: string }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-sp6 px-sp6 py-sp3 border-b border-paper-200 bg-paper-50">
      <Link
        to={`/properties/${propertyId}/draws`}
        className="font-mono text-11 text-text-muted hover:text-text uppercase tracking-[0.1em]"
      >
        ← draws
      </Link>
      <div className="flex items-baseline gap-sp3 min-w-0">
        <span className="font-sans text-16 font-semi text-text">
          Draw #{draw.draw_number}
        </span>
        <span className="font-mono text-11 text-text-subtle">
          · rev {draw.revision_number}
        </span>
        {draw.submitted_at ? (
          <span className="font-mono text-11 text-text-subtle truncate">
            · submitted {draw.submitted_at.slice(0, 10)}
          </span>
        ) : null}
      </div>
      <StatusChip tone={toneFor(draw.status)}>
        {draw.status.replace(/_/g, ' ')}
      </StatusChip>
    </div>
  )
}

function LeftRail({
  draw,
  preflight,
  busy,
  onPreflight,
}: {
  draw: Draw
  preflight: DrawPreflight | null
  busy: string | null
  onPreflight: () => void
}) {
  const steps = buildTimeline(draw)
  return (
    <aside className="border-r border-paper-200 bg-paper-50 p-sp4 flex flex-col gap-sp5 overflow-y-auto">
      <section>
        <RailHeading>Draw timeline</RailHeading>
        <ol className="flex flex-col gap-sp2">
          {steps.map((s) => (
            <li
              key={s.label}
              className={[
                'grid grid-cols-[20px_1fr_auto] items-center gap-sp2',
                'text-13',
                s.state === 'done'
                  ? 'text-text'
                  : s.state === 'active'
                    ? 'text-text font-semi'
                    : 'text-text-subtle',
              ].join(' ')}
            >
              <span
                className={[
                  'w-[20px] h-[20px] grid place-items-center rounded-full text-10 font-mono',
                  s.state === 'done'
                    ? 'bg-sage-600 text-paper-0'
                    : s.state === 'active'
                      ? 'bg-ink-700 text-paper-0'
                      : 'bg-paper-200 text-text-subtle',
                ].join(' ')}
              >
                {s.state === 'done' ? '✓' : s.n}
              </span>
              <span>{s.label}</span>
              <span className="font-mono text-10 text-text-subtle">{s.meta}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <RailHeading>Pre-flight</RailHeading>
        <Button
          variant="secondary"
          loading={busy === 'preflight'}
          onClick={onPreflight}
          className="w-full"
        >
          Run checks
        </Button>
        {preflight ? (
          <div className="mt-sp3">
            {preflight.ready ? (
              <StatusChip tone="success">All clear</StatusChip>
            ) : (
              <>
                <StatusChip tone="danger">
                  Blocked · {preflight.blocking_issues.length}
                </StatusChip>
                <ul className="flex flex-col gap-sp1 mt-sp2">
                  {preflight.blocking_issues.map((issue, idx) => (
                    <li
                      key={`${issue.vendor_id}-${idx}`}
                      className="text-12 text-text-muted"
                    >
                      <span className="font-mono text-10 text-danger-600">●</span>{' '}
                      {issue.reason}
                      <span className="font-mono text-10 text-text-subtle">
                        {' '}
                        · {issue.vendor_id.slice(0, 8)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : null}
      </section>

      {draw.revision_feedback ? (
        <section>
          <RailHeading>Revision notes</RailHeading>
          <p className="text-13 text-text-muted leading-snug">
            {draw.revision_feedback}
          </p>
        </section>
      ) : null}
    </aside>
  )
}

function RailHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono text-10 uppercase tracking-[0.12em] text-text-subtle mb-sp2">
      {children}
    </h3>
  )
}

function buildTimeline(draw: Draw) {
  const status = draw.status
  const order = ['draft', 'submitted', 'approved', 'funded']
  const idx = order.indexOf(status)
  const revisionActive = status === 'revision_requested'

  const labels: Array<{ n: string; label: string; meta: string }> = [
    { n: '1', label: 'Assemble packet', meta: 'invoices + G703' },
    { n: '2', label: 'Submit to lender', meta: '' },
    { n: '3', label: 'Lender approval', meta: '' },
    { n: '4', label: 'Funded · reconcile', meta: '' },
  ]

  return labels.map((l, i) => {
    const state: 'done' | 'active' | 'pending' =
      revisionActive && i === 1
        ? 'active'
        : i < idx
          ? 'done'
          : i === idx
            ? 'active'
            : 'pending'
    return { ...l, state }
  })
}

function CenterTable({
  inDraw,
  excluded,
  invoiceById,
  total,
  preflight,
}: {
  inDraw: DrawItem[]
  excluded: DrawItem[]
  invoiceById: Map<string, Invoice>
  total: number
  preflight: DrawPreflight | null
}) {
  return (
    <section className="flex flex-col overflow-y-auto">
      <TableHeader />

      <SectionLabel
        dot="●"
        title={`IN DRAW · ${inDraw.length} invoices`}
        amount={total}
        hint="allocated — funding source driven per invoice"
      />
      {inDraw.length === 0 ? (
        <EmptyRow>No items added to this draw yet.</EmptyRow>
      ) : (
        inDraw.map((item) => (
          <ItemRow key={item.id} item={item} invoice={invoiceById.get(item.invoice_id)} />
        ))
      )}

      {excluded.length > 0 ? (
        <>
          <SectionLabel
            dot="⚑"
            title={`EXCLUDED · ${excluded.length}`}
            hint="deferred or held — visible for context"
          />
          {excluded.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              invoice={invoiceById.get(item.invoice_id)}
              muted
            />
          ))}
        </>
      ) : null}

      <div className="grid grid-cols-[1fr_auto] items-baseline px-sp5 py-sp3 border-t border-ink-700 bg-paper-100">
        <div>
          <span className="font-mono text-10 uppercase tracking-[0.12em] text-text-muted">
            Draw total (in-draw)
          </span>
        </div>
        <span className="font-sans text-18 font-semi text-text tabular-nums">
          ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      {preflight && !preflight.ready ? (
        <div className="mx-sp5 my-sp4 border border-danger-500 bg-danger-50 p-sp3">
          <div className="font-mono text-10 uppercase tracking-[0.12em] text-danger-600 mb-sp1">
            Flags · {preflight.blocking_issues.length}
          </div>
          <ul className="flex flex-col gap-sp1 text-13 text-text">
            {preflight.blocking_issues.map((issue, i) => (
              <li key={i}>
                <span className="text-text-muted">{issue.vendor_id.slice(0, 8)}:</span>{' '}
                {issue.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function TableHeader() {
  return (
    <div className="grid grid-cols-[1fr_120px_80px_90px] gap-sp3 px-sp5 py-sp2 border-b border-paper-200 bg-paper-100 font-mono text-10 uppercase tracking-[0.1em] text-text-subtle">
      <span>invoice · vendor</span>
      <span className="text-right">date</span>
      <span className="text-right">amount</span>
      <span className="text-right">status</span>
    </div>
  )
}

function SectionLabel({
  dot,
  title,
  amount,
  hint,
}: {
  dot: string
  title: string
  amount?: number
  hint?: string
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-baseline gap-sp3 px-sp5 py-sp2 bg-paper-50 border-b border-paper-200 font-mono text-11 text-text-muted">
      <span className="text-text">{dot}</span>
      <span className="flex gap-sp3 items-baseline">
        <span className="uppercase tracking-[0.1em] text-text font-semi">
          {title}
        </span>
        {hint ? <span className="italic">{hint}</span> : null}
      </span>
      {amount !== undefined ? (
        <span className="text-text tabular-nums">
          $
          {amount.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      ) : null}
    </div>
  )
}

function ItemRow({
  item,
  invoice,
  muted,
}: {
  item: DrawItem
  invoice: Invoice | undefined
  muted?: boolean
}) {
  const vendorLabel = invoice?.vendor_id ? 'Vendor' : 'Unmatched'
  const invNumber = invoice?.invoice_number ?? '—'
  const date = invoice?.invoice_date ?? '—'
  return (
    <div
      className={[
        'grid grid-cols-[1fr_120px_80px_90px] gap-sp3 px-sp5 py-sp2',
        'border-b border-paper-200 items-baseline',
        muted ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex gap-sp2 items-baseline min-w-0">
        <span className="font-sans text-13 text-text truncate">{vendorLabel}</span>
        <span className="font-mono text-11 text-text-subtle">· {invNumber}</span>
      </div>
      <span className="font-mono text-11 text-text-muted text-right">{date}</span>
      <span className="font-mono text-13 text-text text-right tabular-nums">
        $
        {Number(item.allocated_amount).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
      <span className="text-right">
        {item.deferred_to_next_draw ? (
          <StatusChip tone="waiting">deferred</StatusChip>
        ) : item.excluded_for_period ? (
          <StatusChip tone="attention">held</StatusChip>
        ) : (
          <StatusChip tone="success">allocated</StatusChip>
        )}
      </span>
    </div>
  )
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-sp5 py-sp5 text-13 text-text-subtle italic border-b border-paper-200 bg-empty-pattern">
      {children}
    </div>
  )
}

function RightRail({
  packages,
  activePackageId,
  onSelectPackage,
  onIssueLender,
  busy,
  propertyId,
  drawId,
}: {
  packages: DrawPackage[]
  activePackageId: string | null
  onSelectPackage: (id: string) => void
  onIssueLender: (id: string) => void
  busy: string | null
  propertyId: string
  drawId: string
}) {
  const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

  return (
    <aside className="border-l border-paper-200 bg-paper-50 flex flex-col overflow-y-auto">
      <header className="px-sp4 py-sp3 border-b border-paper-200">
        <div className="font-mono text-10 uppercase tracking-[0.12em] text-text-subtle">
          Packet preview
        </div>
        <h3 className="font-sans text-15 font-semi text-text mt-sp1">
          Generated packages
        </h3>
        <p className="text-12 text-text-subtle mt-sp1">
          PDF + XLSX export · lender-ready
        </p>
      </header>

      <div className="flex flex-col gap-sp2 p-sp3">
        {packages.length === 0 ? (
          <p className="text-13 text-text-subtle italic">
            No packages compiled yet. Use <span className="font-mono">Generate</span> below.
          </p>
        ) : (
          packages.map((p) => {
            const active = activePackageId === p.id
            return (
              <article
                key={p.id}
                onClick={() => onSelectPackage(p.id)}
                className={[
                  'border p-sp3 bg-paper-0 cursor-pointer',
                  active ? 'border-ink-700' : 'border-paper-200 hover:border-paper-300',
                ].join(' ')}
              >
                <div className="flex justify-between items-baseline mb-sp2">
                  <span className="font-sans text-13 font-semi text-text">
                    v{p.version}
                  </span>
                  <span className="font-mono text-10 text-text-subtle">
                    {new Date(p.generated_at).toLocaleString()}
                  </span>
                </div>
                <div className="flex gap-sp3 text-12">
                  {p.pdf_attachment_ref ? (
                    <a
                      className="text-text hover:text-accent underline"
                      href={`${base}/properties/${propertyId}/draws/${drawId}/packages/${p.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      PDF
                    </a>
                  ) : (
                    <span className="text-text-subtle">no PDF</span>
                  )}
                  {p.excel_attachment_ref ? (
                    <a
                      className="text-text hover:text-accent underline"
                      href={`${base}/properties/${propertyId}/draws/${drawId}/packages/${p.id}/excel`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      XLSX
                    </a>
                  ) : (
                    <span className="text-text-subtle">no XLSX</span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy === `lender-${p.id}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onIssueLender(p.id)
                  }}
                  className="mt-sp2 w-full"
                >
                  Issue receipt link
                </Button>
              </article>
            )
          })
        )}
      </div>
    </aside>
  )
}

function ActionsBar({
  draw,
  busy,
  onSubmit,
  onCompile,
}: {
  draw: Draw
  busy: string | null
  onSubmit: () => void
  onCompile: () => void
}) {
  const canSubmit = draw.status === 'draft'
  return (
    <div className="grid grid-cols-4 border-t border-paper-200 bg-paper-50">
      <ActionCell
        tone="ok"
        label="Submit to lender"
        kbd="⏎"
        disabled={!canSubmit || busy === 'submit'}
        onClick={onSubmit}
      />
      <ActionCell
        tone="neutral"
        label="Generate PDF + XLSX"
        kbd="G"
        disabled={busy === 'compile'}
        onClick={onCompile}
      />
      <ActionCell
        tone="neutral"
        label="Owner sign-off"
        kbd="O"
        disabled
        onClick={() => {}}
      />
      <ActionCell
        tone="danger"
        label="Discard draft"
        kbd="⌫"
        disabled
        onClick={() => {}}
      />
    </div>
  )
}

function ActionCell({
  tone,
  label,
  kbd,
  disabled,
  onClick,
}: {
  tone: 'ok' | 'neutral' | 'danger'
  label: string
  kbd: string
  disabled: boolean
  onClick: () => void
}) {
  const toneCls: Record<string, string> = {
    ok: 'text-sage-700 font-semi',
    neutral: 'text-text',
    danger: 'text-danger-600',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'py-sp4 text-center border-r border-paper-200 last:border-r-0',
        'transition-colors duration-2 font-sans text-14',
        'hover:bg-paper-100 disabled:opacity-50 disabled:cursor-not-allowed',
        toneCls[tone],
      ].join(' ')}
    >
      {label}
      <span className="block font-mono text-10 text-text-subtle mt-sp1">{kbd}</span>
    </button>
  )
}
