import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Icon } from './Icon'

export interface WidgetDef {
  id: string
  title: string
  /** Visual size hint — controls grid span. */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** If true, the widget is visible by default on first load. */
  defaultVisible?: boolean
  render: () => ReactNode
}

interface Layout {
  order: string[]
  hidden: string[]
}

interface WidgetGridProps {
  /** Unique storage key per page (e.g. 'overview-widgets'). */
  storageKey: string
  widgets: WidgetDef[]
}

const SIZE_CLASSES: Record<NonNullable<WidgetDef['size']>, string> = {
  sm: 'col-span-12 md:col-span-6 lg:col-span-3',
  md: 'col-span-12 md:col-span-6',
  lg: 'col-span-12 lg:col-span-8',
  xl: 'col-span-12',
}

function readLayout(key: string, defaults: Layout): Layout {
  if (typeof window === 'undefined') return defaults
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Layout
    if (!Array.isArray(parsed.order) || !Array.isArray(parsed.hidden)) return defaults
    return parsed
  } catch {
    return defaults
  }
}

function writeLayout(key: string, layout: Layout) {
  try {
    window.localStorage.setItem(key, JSON.stringify(layout))
  } catch {
    /* ignore quota errors */
  }
}

export function WidgetGrid({ storageKey, widgets }: WidgetGridProps) {
  const defaults: Layout = useMemo(
    () => ({
      order: widgets.map((w) => w.id),
      hidden: widgets.filter((w) => w.defaultVisible === false).map((w) => w.id),
    }),
    [widgets],
  )

  const [layout, setLayout] = useState<Layout>(() => readLayout(storageKey, defaults))
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    writeLayout(storageKey, layout)
  }, [storageKey, layout])

  // Reconcile new/removed widgets into saved layout
  useEffect(() => {
    const ids = new Set(widgets.map((w) => w.id))
    const orderNoMissing = layout.order.filter((id) => ids.has(id))
    const newIds = widgets.map((w) => w.id).filter((id) => !orderNoMissing.includes(id))
    if (newIds.length === 0 && orderNoMissing.length === layout.order.length) return
    setLayout({
      order: [...orderNoMissing, ...newIds],
      hidden: layout.hidden.filter((id) => ids.has(id)),
    })
  }, [widgets, layout])

  const widgetById = useMemo(() => {
    const m: Record<string, WidgetDef> = {}
    for (const w of widgets) m[w.id] = w
    return m
  }, [widgets])

  const visibleOrdered = layout.order.filter((id) => !layout.hidden.includes(id))

  function toggleHidden(id: string) {
    setLayout((l) => ({
      ...l,
      hidden: l.hidden.includes(id)
        ? l.hidden.filter((x) => x !== id)
        : [...l.hidden, id],
    }))
  }

  function move(id: string, dir: -1 | 1) {
    setLayout((l) => {
      const idx = l.order.indexOf(id)
      const nextIdx = idx + dir
      if (idx < 0 || nextIdx < 0 || nextIdx >= l.order.length) return l
      const order = [...l.order]
      ;[order[idx], order[nextIdx]] = [order[nextIdx]!, order[idx]!]
      return { ...l, order }
    })
  }

  function resetLayout() {
    setLayout(defaults)
  }

  return (
    <div className="flex flex-col gap-sp5">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant={editing ? 'secondary' : 'ghost'}
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? 'Done' : 'Customize'}
        </Button>
      </div>

      {editing ? (
        <div className="bg-surface-lowest border border-paper-300 rounded-3 p-sp5 flex flex-col gap-sp4">
          <div className="flex items-center justify-between">
            <h3 className="text-13 font-medium text-text">Customize layout</h3>
            <button
              type="button"
              onClick={resetLayout}
              className="text-12 text-text-muted hover:text-ink-700"
            >
              Reset to default
            </button>
          </div>
          <ul className="flex flex-col divide-y divide-paper-200">
            {layout.order.map((id, idx) => {
              const w = widgetById[id]
              if (!w) return null
              const hidden = layout.hidden.includes(id)
              return (
                <li
                  key={id}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-sp3 items-center py-sp3"
                >
                  <span className={['text-14', hidden ? 'text-text-subtle line-through' : 'text-text'].join(' ')}>
                    {w.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => move(id, -1)}
                    disabled={idx === 0}
                    aria-label={`Move ${w.title} up`}
                    className="p-sp2 rounded-2 text-text-muted hover:bg-surface-low disabled:opacity-30"
                  >
                    <Icon name="chevronDown" className="rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(id, 1)}
                    disabled={idx === layout.order.length - 1}
                    aria-label={`Move ${w.title} down`}
                    className="p-sp2 rounded-2 text-text-muted hover:bg-surface-low disabled:opacity-30"
                  >
                    <Icon name="chevronDown" />
                  </button>
                  <label className="flex items-center gap-sp2 text-12 text-text-muted select-none">
                    <input
                      type="checkbox"
                      checked={!hidden}
                      onChange={() => toggleHidden(id)}
                    />
                    Show
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {visibleOrdered.length === 0 ? (
        <div className="bg-empty-pattern border border-paper-200 rounded-3 p-sp9 text-center text-14 text-text-muted">
          All widgets are hidden. Open <b className="text-ink-700 font-medium">Customize</b> to show some.
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-sp5">
          {visibleOrdered.map((id) => {
            const w = widgetById[id]
            if (!w) return null
            return (
              <section
                key={id}
                className={[
                  'bg-surface-lowest border border-paper-200 rounded-3 overflow-hidden',
                  SIZE_CLASSES[w.size ?? 'xl'],
                ].join(' ')}
              >
                <header className="px-sp5 py-sp4 border-b border-paper-200 flex items-center justify-between">
                  <h3 className="font-display text-18 font-medium text-ink-700">
                    {w.title}
                  </h3>
                </header>
                <div className="p-sp5">{w.render()}</div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
