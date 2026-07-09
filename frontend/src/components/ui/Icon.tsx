import type { SVGProps } from 'react'

/** Icon registry — name → SVG path data. Add icons here as workspaces need them. */
const ICONS = {
  check: 'M5 13l4 4L19 7',
  close: 'M6 6l12 12M6 18L18 6',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  search: 'M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z',
  plus: 'M12 5v14M5 12h14',
  alert: 'M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  doc: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6',
} as const

export type IconName = keyof typeof ICONS

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  name: IconName
  size?: number
  /** Accessible label. If not provided, the icon is treated as decorative. */
  label?: string
}

export function Icon({ name, size = 16, label, className = '', ...rest }: IconProps) {
  const decorative = !label
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={decorative ? 'presentation' : 'img'}
      aria-hidden={decorative ? 'true' : undefined}
      aria-label={label}
      className={['shrink-0', className].join(' ')}
      {...rest}
    >
      <path d={ICONS[name]} />
    </svg>
  )
}
