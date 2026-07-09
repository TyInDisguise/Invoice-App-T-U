import { useState } from 'react'
import { mutate } from 'swr'
import { Button, Modal, StatusChip, Table, useToast, type Column } from './ui'
import { useApi } from '../hooks/useApi'
import { createPmPin, revokePmPin } from '../api/tokens'
import type { PMPin } from '../api/types'

interface PMAccessPanelProps {
  propertyId: string
}

export function PMAccessPanel({ propertyId }: PMAccessPanelProps) {
  const path = `/properties/${propertyId}/pm-pins`
  const { data: pins, isLoading } = useApi<PMPin[]>(path)
  const { toast } = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [showPinConfirm, setShowPinConfirm] = useState<{
    name: string
    pin: string
  } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [draft, setDraft] = useState({ pm_name: '', pm_email: '', pin: '' })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.pm_name.trim() || draft.pin.length < 4) return
    setBusy('create')
    try {
      await createPmPin(propertyId, {
        pm_name: draft.pm_name.trim(),
        pm_email: draft.pm_email.trim() || null,
        pin: draft.pin,
      })
      // Show the PIN once as a confirmation — we don't retrieve it from the server
      setShowPinConfirm({ name: draft.pm_name, pin: draft.pin })
      setShowCreate(false)
      setDraft({ pm_name: '', pm_email: '', pin: '' })
      await mutate(path)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create PIN', 'danger')
    } finally {
      setBusy(null)
    }
  }

  async function handleRevoke(pinId: string) {
    if (!window.confirm('Revoke this PM PIN? The PM will lose access immediately.'))
      return
    setBusy(pinId)
    try {
      await revokePmPin(propertyId, pinId)
      toast('PIN revoked', 'success')
      await mutate(path)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Revoke failed', 'danger')
    } finally {
      setBusy(null)
    }
  }

  const cols: Column<PMPin>[] = [
    { key: 'name', header: 'PM name', render: (p) => p.pm_name },
    {
      key: 'email',
      header: 'Email',
      render: (p) => p.pm_email ?? <span className="text-text-muted">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) =>
        p.is_active ? (
          <StatusChip tone="success">Active</StatusChip>
        ) : (
          <StatusChip tone="neutral">Revoked</StatusChip>
        ),
    },
    {
      key: 'last_used',
      header: 'Last used',
      render: (p) =>
        p.last_used_at ? (
          new Date(p.last_used_at).toLocaleDateString()
        ) : (
          <span className="text-text-muted">never</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (p) =>
        p.is_active ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleRevoke(p.id)}
            disabled={busy === p.id}
          >
            Revoke
          </Button>
        ) : null,
    },
  ]

  return (
    <section className="flex flex-col gap-sp3">
      <header className="flex items-center justify-between">
        <h2 className="text-16 font-semi text-text">PM portal access</h2>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          Issue new PIN
        </Button>
      </header>

      {isLoading ? (
        <p className="text-13 text-text-muted">Loading…</p>
      ) : (
        <Table
          columns={cols}
          rows={pins ?? []}
          rowKey={(p) => p.id}
          caption="PM PIN access grants"
          emptyState="No PM PINs issued yet."
        />
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Issue PM PIN"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={(e) => handleCreate(e as unknown as React.FormEvent)}
              loading={busy === 'create'}
              disabled={!draft.pm_name.trim() || draft.pin.length < 4}
            >
              Create
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-sp4">
          <label className="flex flex-col gap-sp2 text-13">
            <span className="text-text-muted">Property manager name</span>
            <input
              autoFocus
              required
              className="rounded-2 border border-paper-300 px-sp3 py-sp2 text-14"
              value={draft.pm_name}
              onChange={(e) => setDraft({ ...draft, pm_name: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-sp2 text-13">
            <span className="text-text-muted">Email (optional)</span>
            <input
              type="email"
              className="rounded-2 border border-paper-300 px-sp3 py-sp2 text-14"
              value={draft.pm_email}
              onChange={(e) => setDraft({ ...draft, pm_email: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-sp2 text-13">
            <span className="text-text-muted">
              PIN (4–20 characters; share with PM out-of-band)
            </span>
            <input
              required
              minLength={4}
              maxLength={20}
              inputMode="numeric"
              className="rounded-2 border border-paper-300 px-sp3 py-sp2 text-14 font-mono"
              value={draft.pin}
              onChange={(e) => setDraft({ ...draft, pin: e.target.value })}
            />
          </label>
          <p className="text-12 text-text-muted">
            The PIN will be shown once after creation. It is stored as a bcrypt
            hash — neither you nor we can retrieve it later.
          </p>
        </form>
      </Modal>

      <Modal
        open={Boolean(showPinConfirm)}
        onClose={() => setShowPinConfirm(null)}
        title="PIN issued"
        footer={
          <Button onClick={() => setShowPinConfirm(null)}>Done</Button>
        }
      >
        {showPinConfirm ? (
          <div className="flex flex-col gap-sp3">
            <p className="text-13">
              Share this PIN with <strong>{showPinConfirm.name}</strong> through a
              secure channel. It is only shown once.
            </p>
            <div className="rounded-2 border border-paper-200 bg-surface-low px-sp4 py-sp4 text-center font-mono text-24 tracking-wider">
              {showPinConfirm.pin}
            </div>
            <p className="text-12 text-text-muted">
              Portal URL:{' '}
              <code>
                {window.location.origin}/portal/pm/{propertyId}
              </code>
            </p>
          </div>
        ) : null}
      </Modal>
    </section>
  )
}
