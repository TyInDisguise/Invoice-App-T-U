import { Navigate, Outlet, createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { CommandPaletteProvider, ToastProvider } from './components/ui'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Properties } from './pages/Properties'
import { PropertyDashboard } from './pages/PropertyDashboard'
import { Invoices } from './pages/Invoices'
import { InvoiceDetail } from './pages/InvoiceDetail'
import { InvoiceReview } from './pages/InvoiceReview'
import { Placeholder } from './pages/Placeholder'
import { Vendors } from './pages/Vendors'

function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) return <p className="p-sp7 text-13 text-text-muted">Loading…</p>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        path: '',
        element: <AppShell />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'invoices', element: <InvoiceReview /> },
          { path: 'properties', element: <Properties /> },
          { path: 'properties/:propertyId', element: <PropertyDashboard /> },
          { path: 'properties/:propertyId/invoices', element: <Invoices /> },
          {
            path: 'properties/:propertyId/invoices/:invoiceId',
            element: <InvoiceDetail />,
          },
          { path: 'vendors', element: <Vendors /> },
          { path: '*', element: <Placeholder title="Not Found" /> },
        ],
      },
    ],
  },
])

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <CommandPaletteProvider>
          <RouterProvider router={router} />
        </CommandPaletteProvider>
      </ToastProvider>
    </AuthProvider>
  )
}
