import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    dialogRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-40 flex items-center justify-center px-sp5"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-ink-900/40"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative w-full max-w-lg bg-surface-lowest rounded-3 shadow-overlay outline-none"
      >
        <div className="flex items-center justify-between px-sp6 py-sp4 border-b border-paper-200">
          <h2 id="modal-title" className="font-display text-20 text-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-sp2 rounded-2 hover:bg-surface-low transition-colors duration-2 ease-standard"
          >
            <Icon name="close" label="Close" />
          </button>
        </div>
        <div className="px-sp6 py-sp5 text-14 text-text">{children}</div>
        {footer ? (
          <div className="px-sp6 py-sp4 border-t border-paper-200 flex justify-end gap-sp3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
