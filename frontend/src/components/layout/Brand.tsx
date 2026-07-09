import { Link } from 'react-router-dom'

/**
 * Placeholder logo + product name — "Ledger" with a monospace square mark.
 * Replace `PRODUCT_NAME` / `LOGO_LETTER` when real branding lands.
 */
const PRODUCT_NAME = 'Ledger'
const LOGO_LETTER = 'L'

interface BrandProps {
  to?: string
}

export function Brand({ to = '/' }: BrandProps) {
  return (
    <Link
      to={to}
      className="flex items-center gap-sp3 font-display text-20 font-normal tracking-tight text-ink-700"
      aria-label={`${PRODUCT_NAME} — home`}
    >
      <span
        aria-hidden="true"
        className="grid place-items-center w-[22px] h-[22px] bg-ink-700 text-paper-50 font-mono text-11 font-semi rounded-1"
      >
        {LOGO_LETTER}
      </span>
      {PRODUCT_NAME}
    </Link>
  )
}
