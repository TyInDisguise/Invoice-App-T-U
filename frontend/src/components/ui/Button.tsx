import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-accent text-text-invert hover:bg-accent-hover disabled:bg-paper-300 disabled:text-text-subtle',
  secondary:
    'bg-surface-lowest text-text border border-paper-300 hover:bg-surface-low disabled:opacity-60',
  ghost: 'bg-transparent text-text hover:bg-surface-low disabled:opacity-60',
  danger:
    'bg-danger-500 text-text-invert hover:bg-danger-600 disabled:bg-paper-300 disabled:text-text-subtle',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-sp4 text-13',
  md: 'h-10 px-sp5 text-14',
  lg: 'h-12 px-sp6 text-16',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled,
    className = '',
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center gap-sp3 font-medium',
        'rounded-2 transition-colors duration-2 ease-standard',
        'disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? <span aria-hidden="true">…</span> : null}
      {children}
    </button>
  )
})
