import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Icon } from './Icon'

interface CommandItem {
  id: string
  label: string
  section: string
  kbd?: string
  keywords?: string
  run: () => void
}

interface Ctx {
  open: boolean
  setOpen: (v: boolean) => void
  register: (items: CommandItem[]) => () => void
}

const CommandContext = createContext<Ctx | null>(null)

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<CommandItem[]>([])

  const register = useCallback((next: CommandItem[]) => {
    setItems((prev) => [...prev, ...next])
    return () => {
      setItems((prev) => prev.filter((x) => !next.find((n) => n.id === x.id)))
    }
  }, [])

  // Global ⌘K / Ctrl-K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mac = e.metaKey
      const win = e.ctrlKey
      if ((mac || win) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape' && open) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const value = useMemo(() => ({ open, setOpen, register }), [open, register])
  return (
    <CommandContext.Provider value={value}>
      {children}
      {open ? <Palette items={items} onClose={() => setOpen(false)} /> : null}
    </CommandContext.Provider>
  )
}

export function useCommandPalette(): Ctx {
  const ctx = useContext(CommandContext)
  if (!ctx) throw new Error('useCommandPalette must be used within <CommandPaletteProvider>')
  return ctx
}

/** Register a batch of commands. Array identity must be stable across renders. */
export function useRegisterCommands(items: CommandItem[]): void {
  const { register } = useCommandPalette()
  useEffect(() => {
    return register(items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])
}

/** Render the ⌘K trigger button used in the topbar. */
export function CommandPaletteTrigger() {
  const { setOpen } = useCommandPalette()
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open command palette"
      className={[
        'flex items-center gap-sp3 px-sp4 h-8',
        'bg-surface-low hover:bg-paper-150',
        'rounded-2 font-mono text-12 text-text-subtle',
        'transition-colors duration-2 ease-standard',
        'min-w-[280px] cursor-text',
      ].join(' ')}
    >
      <Icon name="search" size={14} />
      <span className="flex-1 text-left tracking-tight">
        Search invoices, vendors, GL codes…
      </span>
      <span className="ml-auto text-11 text-text-subtle px-sp2 py-[1px] rounded-1 bg-surface-lowest border border-paper-200">
        {isMac ? '⌘K' : 'Ctrl K'}
      </span>
    </button>
  )
}

function Palette({ items, onClose }: { items: CommandItem[]; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(needle) ||
        (i.keywords ?? '').toLowerCase().includes(needle),
    )
  }, [items, q])

  const bySection = useMemo(() => {
    const m: Record<string, CommandItem[]> = {}
    for (const it of filtered) {
      m[it.section] = m[it.section] ?? []
      m[it.section]!.push(it)
    }
    return m
  }, [filtered])

  useEffect(() => {
    setActiveIdx(0)
  }, [q])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[activeIdx]
      if (item) {
        item.run()
        onClose()
      }
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[50] grid place-items-start justify-center pt-[15vh] px-sp5 bg-ink-900/25 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-[90vw] bg-surface-lowest rounded-2 shadow-overlay overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-sp3 px-sp6 py-sp5 border-b border-paper-200">
          <Icon name="search" size={16} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type a command or search…"
            className="flex-1 outline-none border-none bg-transparent text-16 text-ink-700 placeholder:text-text-subtle"
          />
        </div>

        {Object.keys(bySection).length === 0 ? (
          <div className="px-sp6 py-sp7 text-13 text-text-muted">No matches.</div>
        ) : (
          <div>
            {Object.entries(bySection).map(([section, list]) => (
              <div key={section} className="py-sp4 border-b border-paper-200 last:border-b-0">
                <div className="px-sp6 pb-sp2 font-mono text-10 uppercase tracking-[0.14em] font-medium text-text-subtle">
                  {section}
                </div>
                {list.map((item) => {
                  const globalIdx = filtered.indexOf(item)
                  const isActive = globalIdx === activeIdx
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActiveIdx(globalIdx)}
                      onClick={() => {
                        item.run()
                        onClose()
                      }}
                      className={[
                        'w-full grid grid-cols-[1fr_auto] gap-sp4 px-sp6 py-sp3 items-center text-left',
                        isActive ? 'bg-surface-low' : 'hover:bg-surface-low',
                      ].join(' ')}
                    >
                      <span className="text-14 text-ink-700">{item.label}</span>
                      {item.kbd ? (
                        <span className="font-mono text-11 text-text-subtle px-sp2 py-[1px] rounded-1 bg-surface-low">
                          {item.kbd}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
