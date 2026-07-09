import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRegisterCommands } from '../ui'

/** Register cross-app navigation commands in the palette. Screen-scoped
 *  commands (Approve invoice, Stage to draw) are registered by those screens
 *  via `useRegisterCommands`. */
export function GlobalCommands() {
  const navigate = useNavigate()

  const items = useMemo(
    () => [
      {
        id: 'go-dashboard',
        label: 'Go to Dashboard',
        section: 'Navigate',
        kbd: 'G D',
        keywords: 'home',
        run: () => navigate('/'),
      },
      {
        id: 'go-invoices',
        label: 'Go to Invoices',
        section: 'Navigate',
        kbd: 'G I',
        run: () => navigate('/invoices'),
      },
      {
        id: 'go-properties',
        label: 'Go to Properties',
        section: 'Navigate',
        kbd: 'G P',
        run: () => navigate('/properties'),
      },
      {
        id: 'go-vendors',
        label: 'Go to Vendors',
        section: 'Navigate',
        kbd: 'G V',
        run: () => navigate('/vendors'),
      },
    ],
    [navigate],
  )

  useRegisterCommands(items)
  return null
}
