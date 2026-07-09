import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  width?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  caption?: string
  emptyState?: ReactNode
}

const alignClasses = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const

export function Table<T>({ columns, rows, rowKey, caption, emptyState }: TableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return (
      <div
        role="region"
        aria-label={caption ?? 'Empty table'}
        className="bg-empty-pattern border border-paper-200 rounded-3 p-sp8 text-center text-14 text-text-muted"
      >
        {emptyState}
      </div>
    )
  }
  return (
    <div className="overflow-x-auto border border-paper-200 rounded-3">
      <table className="w-full border-collapse text-14">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="bg-surface-low">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={[
                  'px-sp4 py-sp3 text-12 font-semi uppercase tracking-wide',
                  'text-text-muted border-b border-paper-300',
                  alignClasses[col.align ?? 'left'],
                ].join(' ')}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="hover:bg-surface-low transition-colors duration-1 ease-standard"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={[
                    'px-sp4 py-sp3 border-b border-paper-200',
                    alignClasses[col.align ?? 'left'],
                  ].join(' ')}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
