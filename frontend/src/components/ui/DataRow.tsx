import type { ReactNode } from 'react'

interface DataRowProps {
  label: string
  value: ReactNode
  hint?: string
}

/** A label/value pair used across detail panels. Mobile-stacked by default. */
export function DataRow({ label, value, hint }: DataRowProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-sp2 sm:gap-sp5 py-sp4 border-b border-paper-200">
      <dt className="text-12 font-medium uppercase tracking-wide text-text-subtle sm:w-48 sm:flex-none">
        {label}
      </dt>
      <dd className="text-14 text-text flex-1 min-w-0">
        {value}
        {hint ? <span className="block text-12 text-text-muted mt-sp1">{hint}</span> : null}
      </dd>
    </div>
  )
}
