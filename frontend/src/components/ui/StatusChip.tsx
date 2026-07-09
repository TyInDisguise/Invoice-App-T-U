import type { ReactNode } from 'react'

export type StatusTone =
  | 'ready'
  | 'success'
  | 'attention'
  | 'danger'
  | 'waiting'
  | 'ai'
  | 'info'
  | 'neutral'

interface StatusChipProps {
  tone: StatusTone
  children: ReactNode
}

// Text + solid dot. No pill background, no border. Darker tones (700 / 600)
// so the label reads without a container around it.
const TONE_CLASSES: Record<StatusTone, { text: string; dot: string }> = {
  ready: { text: 'text-sage-700', dot: 'bg-sage-700' },
  success: { text: 'text-sage-700', dot: 'bg-sage-700' },
  attention: { text: 'text-warn-600', dot: 'bg-warn-600' },
  danger: { text: 'text-danger-600', dot: 'bg-danger-600' },
  waiting: { text: 'text-ai-600', dot: 'bg-ai-600' },
  ai: { text: 'text-ai-600', dot: 'bg-ai-600' },
  info: { text: 'text-info-500', dot: 'bg-info-500' },
  neutral: { text: 'text-text-muted', dot: 'bg-paper-500' },
}

export function StatusChip({ tone, children }: StatusChipProps) {
  const t = TONE_CLASSES[tone]
  return (
    <span
      role="status"
      className={[
        'inline-flex items-center gap-[6px]',
        'font-mono text-11 uppercase tracking-[0.1em] font-semi whitespace-nowrap',
        t.text,
      ].join(' ')}
    >
      <span className={['w-[7px] h-[7px] rounded-full', t.dot].join(' ')} />
      {children}
    </span>
  )
}
