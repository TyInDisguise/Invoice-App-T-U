import type { ReactNode } from 'react'

type Tone = 'neutral' | 'success' | 'warn' | 'danger' | 'info' | 'ai'

interface BadgeProps {
  tone?: Tone
  children: ReactNode
  /** Optional accessible label override; if not set, children must be readable text. */
  ariaLabel?: string
}

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-surface-low text-text border-paper-300',
  success: 'bg-success-50 text-success-700 border-success-500/40',
  warn: 'bg-warn-50 text-warn-600 border-warn-500/40',
  danger: 'bg-danger-50 text-danger-600 border-danger-500/40',
  info: 'bg-info-50 text-info-500 border-info-500/40',
  ai: 'bg-ai-50 text-ai-500 border-ai-500/40',
}

export function Badge({ tone = 'neutral', children, ariaLabel }: BadgeProps) {
  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={[
        'inline-flex items-center gap-sp2',
        'h-6 px-sp3 text-11 font-medium',
        'border rounded-pill',
        toneClasses[tone],
      ].join(' ')}
    >
      {children}
    </span>
  )
}
