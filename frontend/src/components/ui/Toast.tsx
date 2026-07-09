import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type ToastTone = 'info' | 'success' | 'warn' | 'danger'

interface Toast {
  id: string
  tone: ToastTone
  message: string
}

interface ToastContextValue {
  toast: (msg: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const toneClasses: Record<ToastTone, string> = {
  info: 'bg-info-50 text-info-500 border-info-500/40',
  success: 'bg-success-50 text-success-700 border-success-500/40',
  warn: 'bg-warn-50 text-warn-600 border-warn-500/40',
  danger: 'bg-danger-50 text-danger-600 border-danger-500/40',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setToasts((prev) => [...prev, { id, tone, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="fixed bottom-sp7 right-sp7 z-50 flex flex-col gap-sp3 max-w-sm"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className={[
              'border rounded-3 shadow-overlay',
              'px-sp5 py-sp4 text-13 font-medium',
              toneClasses[t.tone],
            ].join(' ')}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}
