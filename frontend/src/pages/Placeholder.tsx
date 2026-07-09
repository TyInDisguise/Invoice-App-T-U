import type { ReactNode } from 'react'

interface PlaceholderProps {
  title: string
  description?: string
  actions?: ReactNode
}

/** Phase 9 placeholder — replaced by real workspace screens in Phase 10. */
export function Placeholder({ title, description, actions }: PlaceholderProps) {
  return (
    <section className="flex flex-col gap-sp5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-40 font-light leading-none tracking-tight text-ink-700">
            {title}
          </h1>
          {description ? (
            <p className="mt-sp3 text-14 text-text-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex gap-sp3">{actions}</div> : null}
      </header>
      <div className="bg-empty-pattern border border-paper-200 rounded-3 p-sp9 text-center text-14 text-text-muted">
        Workspace lands in Phase 10.
      </div>
    </section>
  )
}
