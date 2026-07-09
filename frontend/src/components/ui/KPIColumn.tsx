import type { ReactNode } from 'react'

interface KPIColumnProps {
  label: string
  value: ReactNode
  delta?: { value: string; tone: 'up' | 'down' | 'flat' }
  hint?: string
}

const deltaToneClasses = {
  up: 'text-success-600',
  down: 'text-danger-500',
  flat: 'text-text-muted',
} as const

const deltaSymbol = { up: '▲', down: '▼', flat: '■' } as const

export function KPIColumn({ label, value, delta, hint }: KPIColumnProps) {
  return (
    <div className="flex flex-col gap-sp2 min-w-0">
      <span className="text-11 uppercase tracking-wide font-medium text-text-subtle">
        {label}
      </span>
      <span className="font-display text-32 leading-tight text-text">{value}</span>
      {delta ? (
        <span
          className={['text-12 font-medium', deltaToneClasses[delta.tone]].join(' ')}
          aria-label={`${delta.tone === 'up' ? 'increase' : delta.tone === 'down' ? 'decrease' : 'unchanged'} ${delta.value}`}
        >
          <span aria-hidden="true">{deltaSymbol[delta.tone]} </span>
          {delta.value}
        </span>
      ) : null}
      {hint ? <span className="text-12 text-text-muted">{hint}</span> : null}
    </div>
  )
}
