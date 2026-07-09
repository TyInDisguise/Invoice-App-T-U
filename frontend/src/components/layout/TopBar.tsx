import { NavLink, useNavigate } from 'react-router-dom'
import { Button, CommandPaletteTrigger } from '../ui'
import { useAuth } from '../../auth/AuthContext'
import { Brand } from './Brand'

interface NavItem {
  to: string
  label: string
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Overview', end: true },
  { to: '/invoices', label: 'Invoices' },
  { to: '/properties', label: 'Properties' },
  { to: '/vendors', label: 'Vendors' },
]

export function TopBar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <header
      className="h-topbar bg-surface-lowest border-b border-paper-200 sticky top-0 z-20"
      role="banner"
    >
      <div className="max-w-doc mx-auto h-full px-sp7 flex items-center justify-between">
        <Brand />
        <nav aria-label="Primary" className="flex items-center gap-sp1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'h-9 px-sp4 inline-flex items-center text-13 font-medium rounded-2',
                  'transition-colors duration-2 ease-standard',
                  isActive
                    ? 'bg-surface-low text-text'
                    : 'text-text-muted hover:text-text hover:bg-surface-low',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-sp4">
          <CommandPaletteTrigger />
          <span className="text-12 text-text-muted">{user?.email}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await logout()
              navigate('/login')
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  )
}
