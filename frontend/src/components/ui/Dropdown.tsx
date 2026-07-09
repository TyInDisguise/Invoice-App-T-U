import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

export interface DropdownItem {
  value: string
  label: ReactNode
  disabled?: boolean
}

interface DropdownProps {
  label: string
  items: DropdownItem[]
  value: string | null
  onChange: (value: string) => void
  placeholder?: string
}

export function Dropdown({
  label,
  items,
  value,
  onChange,
  placeholder = 'Select…',
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selected = items.find((i) => i.value === value) ?? null

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[activeIdx]
      if (item && !item.disabled) {
        onChange(item.value)
        setOpen(false)
      }
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block min-w-[12rem]">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        className={[
          'flex items-center justify-between gap-sp3 w-full',
          'h-10 px-sp4 text-14',
          'bg-surface-lowest text-text',
          'border border-paper-300 rounded-2',
          'hover:bg-surface-low transition-colors duration-2 ease-standard',
        ].join(' ')}
      >
        <span className={selected ? '' : 'text-text-subtle'}>
          {selected ? selected.label : placeholder}
        </span>
        <Icon name="chevronDown" />
      </button>
      {open ? (
        <ul
          ref={listRef}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className={[
            'absolute z-30 mt-sp1 w-full',
            'bg-surface-lowest border border-paper-300 rounded-2',
            'shadow-overlay max-h-60 overflow-y-auto',
          ].join(' ')}
        >
          {items.map((item, idx) => (
            <li
              key={item.value}
              role="option"
              aria-selected={item.value === value}
              aria-disabled={item.disabled || undefined}
              onMouseEnter={() => setActiveIdx(idx)}
              onClick={() => {
                if (item.disabled) return
                onChange(item.value)
                setOpen(false)
              }}
              className={[
                'px-sp4 py-sp3 text-14 cursor-pointer',
                idx === activeIdx ? 'bg-surface-low' : '',
                item.disabled ? 'text-text-subtle cursor-not-allowed' : 'text-text',
              ].join(' ')}
            >
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
