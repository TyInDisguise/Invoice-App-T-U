import { useState } from 'react'
import { api } from '../api/client'
import { portalUrlForToken } from '../api/tokens'
import type { SignedTokenResponse, Vendor } from '../api/types'
import {
  Button,
  StatusChip,
  Table,
  TokenLinkModal,
  useToast,
  type Column,
} from '../components/ui'
import { useApi } from '../hooks/useApi'

interface ComplianceStatus {
  vendor_id: string
  vendor_name: string
  w9_status: string | null
  coi_status: string | null
  w9_expires_at: string | null
  coi_expires_at: string | null
  has_approaching_expiry: boolean
}

function complianceTone(
  status: string | null,
  expiresAt: string | null,
): { tone: 'success' | 'attention' | 'danger' | 'neutral'; label: string } {
  if (!status) return { tone: 'danger', label: 'missing' }
  if (status === 'expired') return { tone: 'danger', label: 'expired' }
  if (status === 'rejected') return { tone: 'danger', label: 'rejected' }
  if (status === 'approaching_expiry')
    return { tone: 'attention', label: 'expiring' }
  if (expiresAt) {
    const days = Math.round(
      (new Date(expiresAt).getTime() - Date.now()) / 86400000,
    )
    if (days < 0) return { tone: 'danger', label: 'expired' }
    if (days < 90) return { tone: 'attention', label: 'expiring' }
  }
  if (status === 'current' || status === 'active' || status === 'approved')
    return { tone: 'success', label: 'current' }
  return { tone: 'neutral', label: status }
}

export function Vendors() {
  const { data: vendors, isLoading } = useApi<Vendor[]>('/vendors')
  const { toast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [tokenModal, setTokenModal] = useState<{
    open: boolean
    vendorName: string
    docType: 'w9' | 'coi'
    url: string | null
    expiresAt: string | null
  }>({
    open: false,
    vendorName: '',
    docType: 'w9',
    url: null,
    expiresAt: null,
  })

  async function requestUpload(vendor: Vendor, docType: 'w9' | 'coi') {
    setBusy(`${vendor.id}-${docType}`)
    setTokenModal({
      open: true,
      vendorName: vendor.name,
      docType,
      url: null,
      expiresAt: null,
    })
    try {
      // The vendor router exposes the more specific endpoint; the generic
      // /auth/tokens/vendor is also wired but the vendor one records the
      // doc_type request context.
      const res = await api.post<SignedTokenResponse>(
        `/vendors/${vendor.id}/compliance-docs/request-upload?doc_type=${docType}`,
      )
      setTokenModal((s) => ({
        ...s,
        url: portalUrlForToken('vendor', res.token),
        expiresAt: res.expires_at,
      }))
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to issue link', 'danger')
      setTokenModal((s) => ({ ...s, open: false }))
    } finally {
      setBusy(null)
    }
  }

  const cols: Column<Vendor>[] = [
    { key: 'name', header: 'Vendor', render: (v) => v.name },
    {
      key: 'contact',
      header: 'Contact',
      render: (v) => (
        <span className="text-13 text-text-muted">
          {v.contact_email ?? '—'}
        </span>
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
    {
      key: 'compliance',
      header: 'Compliance',
      render: (v) => <VendorComplianceCell vendor={v} />,
    },
    {
      key: 'actions',
      header: '',
      render: (v) => (
        <div className="flex gap-sp2 justify-end">
          <Button
            size="sm"
            variant="ghost"
            loading={busy === `${v.id}-w9`}
            onClick={() => requestUpload(v, 'w9')}
          >
            Request W-9
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={busy === `${v.id}-coi`}
            onClick={() => requestUpload(v, 'coi')}
          >
            Request COI
          </Button>
        </div>
      ),
    },
  ]

  return (
    <section className="flex flex-col gap-sp5">
      <header>
        <h1 className="font-display text-40 font-light leading-none tracking-tight text-ink-700">
          Vendors
        </h1>
        <p className="mt-sp3 text-14 text-text-muted">
          Manage vendor records and request compliance documents via signed
          upload links.
        </p>
      </header>

      {isLoading ? (
        <p className="text-13 text-text-muted">Loading…</p>
      ) : (
        <Table
          columns={cols}
          rows={vendors ?? []}
          rowKey={(v) => v.id}
          caption="Vendors"
          emptyState="No vendors yet."
        />
      )}

      <TokenLinkModal
        open={tokenModal.open}
        onClose={() => setTokenModal((s) => ({ ...s, open: false }))}
        title={`Request ${tokenModal.docType.toUpperCase()} from ${tokenModal.vendorName}`}
        description="Share this single-use upload link with the vendor. They can upload the document without a firm account."
        url={tokenModal.url}
        expiresAt={tokenModal.expiresAt}
      />
    </section>
  )
}

function VendorComplianceCell({ vendor }: { vendor: Vendor }) {
  const { data } = useApi<ComplianceStatus>(
    `/vendors/${vendor.id}/compliance-status`,
  )
  if (!data) return <span className="text-text-muted">—</span>
  const w9 = complianceTone(data.w9_status, data.w9_expires_at)
  const coi = complianceTone(data.coi_status, data.coi_expires_at)
  return (
    <div className="flex gap-sp2">
      <StatusChip tone={w9.tone}>W-9 {w9.label}</StatusChip>
      <StatusChip tone={coi.tone}>COI {coi.label}</StatusChip>
    </div>
  )
}
