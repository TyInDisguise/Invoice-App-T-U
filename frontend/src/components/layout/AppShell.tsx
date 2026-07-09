import { Outlet } from 'react-router-dom'
import { GlobalCommands } from './GlobalCommands'
import { TopBar } from './TopBar'

export function AppShell() {
  return (
    <div className="min-h-screen flex flex-col">
      <GlobalCommands />
      <TopBar />
      <main className="flex-1 max-w-doc w-full mx-auto px-sp7 py-sp7" role="main">
        <Outlet />
      </main>
    </div>
  )
}
