import { useState } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'
import { useToast } from './Toast'

interface TokenLinkModalProps {
  open: boolean
  onClose: () => void
  title: string
  description: string
  url: string | null
  expiresAt?: string | null
}

export function TokenLinkModal({
  open,
  onClose,
  title,
  description,
  url,
  expiresAt,
}: TokenLinkModalProps) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast('Link copied to clipboard', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Copy failed — select the link manually', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="flex flex-col gap-sp4">
        <p className="text-13 text-text-muted">{description}</p>
        {url ? (
          <>
            <div className="flex flex-col gap-sp2">
              <label htmlFor="token-url" className="text-12 text-text-muted">
                Share this link
              </label>
              <div className="flex gap-sp2">
                <input
                  id="token-url"
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 rounded-2 border border-paper-200 bg-surface-low px-sp3 py-sp2 text-12 text-text"
                />
                <Button onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
              </div>
            </div>
            {expiresAt ? (
              <p className="text-12 text-text-muted">
                Expires {new Date(expiresAt).toLocaleString()}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-13 text-text-muted">Generating link…</p>
        )}
      </div>
    </Modal>
  )
}
