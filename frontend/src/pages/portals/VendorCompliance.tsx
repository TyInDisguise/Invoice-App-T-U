import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Brand } from '../../components/layout/Brand'
import { Button, Input, StatusChip } from '../../components/ui'

interface Preview {
  vendor_id: string
  vendor_name: string
  requested_doc_type: string
}

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export function VendorCompliance() {
  const { token } = useParams<{ token: string }>()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [effectiveAt, setEffectiveAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${BASE}/vendor/compliance/${token}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? `HTTP ${res.status}`)
      }
      setPreview((await res.json()) as Preview)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load')
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !fileRef.current?.files?.[0]) return
    setSubmitting(true)
    setError(null)
    const form = new FormData()
    form.append('file', fileRef.current.files[0])
    if (effectiveAt) form.append('effective_at', effectiveAt)
    if (expiresAt) form.append('expires_at', expiresAt)
    try {
      const res = await fetch(`${BASE}/vendor/compliance/${token}`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? `HTTP ${res.status}`)
      }
      setUploaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-sp5">
      <section className="w-full max-w-lg bg-surface-lowest rounded-3 shadow-glow p-sp8 flex flex-col gap-sp6">
        <header className="flex flex-col gap-sp3">
          <Brand to="#" />
          <h1 className="font-display text-40 font-light leading-none tracking-tight text-ink-700">
            Compliance Upload
          </h1>
        </header>

        {error ? (
          <p role="alert" className="text-13 text-danger-500">
            {error}
          </p>
        ) : null}

        {uploaded ? (
          <div className="flex flex-col gap-sp4">
            <StatusChip tone="success">Document received</StatusChip>
            <p className="text-14 text-text-muted">
              Thanks — the firm will review shortly. You can close this page.
            </p>
          </div>
        ) : preview ? (
          <form onSubmit={submit} className="flex flex-col gap-sp5">
            <p className="text-14 text-text-muted">
              Upload a <b className="text-ink-700">{preview.requested_doc_type.toUpperCase()}</b> for{' '}
              <b className="text-ink-700">{preview.vendor_name}</b>.
            </p>
            <label className="flex flex-col gap-sp2">
              <span className="text-13 font-medium text-text">PDF file</span>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                required
                className="text-13"
              />
            </label>
            <Input
              label="Effective date (optional)"
              type="date"
              value={effectiveAt}
              onChange={(e) => setEffectiveAt(e.target.value)}
            />
            <Input
              label="Expiry date (optional)"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <Button type="submit" loading={submitting}>
              Upload Document
            </Button>
            <p className="text-12 text-text-muted">
              Single-use link — refresh the request from the firm if you need to re-upload.
            </p>
          </form>
        ) : (
          <p className="text-13 text-text-muted">Loading…</p>
        )}
      </section>
    </div>
  )
}
