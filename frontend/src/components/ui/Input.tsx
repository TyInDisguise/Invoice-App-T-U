import { forwardRef, useId, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, className = '', ...rest },
  ref,
) {
  const reactId = useId()
  const inputId = id ?? `input-${reactId}`
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined

  return (
    <div className="flex flex-col gap-sp2">
      {label ? (
        <label htmlFor={inputId} className="text-13 font-medium text-text">
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? 'true' : undefined}
        className={[
          'h-10 px-sp4 text-14',
          'bg-surface-lowest text-text placeholder:text-text-subtle',
          'border rounded-2 transition-colors duration-2 ease-standard',
          error
            ? 'border-danger-500 focus:border-danger-500'
            : 'border-paper-300 focus:border-accent',
          'disabled:bg-surface-low disabled:text-text-subtle disabled:cursor-not-allowed',
          className,
        ].join(' ')}
        {...rest}
      />
      {hint && !error ? (
        <p id={hintId} className="text-12 text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-12 text-danger-500">
          {error}
        </p>
      ) : null}
    </div>
  )
})
