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
import { Draws } from './pages/Draws'
import { DrawDetail } from './pages/DrawDetail'
import { PayApp } from './pages/PayApp'
import { Placeholder } from './pages/Placeholder'
import { Vendors } from './pages/Vendors'
import { LenderReceipt } from './pages/portals/LenderReceipt'
import { PMPortal } from './pages/portals/PMPortal'
import { VendorCompliance } from './pages/portals/VendorCompliance'

function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) return <p className="p-sp7 text-13 text-text-muted">Loading…</p>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  // External portals — no firm-user auth gate; each has its own credential flow
  { path: '/portal/pm/:propertyId', element: <PMPortal /> },
  { path: '/portal/lender/:token', element: <LenderReceipt /> },
  { path: '/portal/vendor/:token', element: <VendorCompliance /> },
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
          { path: 'properties/:propertyId/draws', element: <Draws /> },
          {
            path: 'properties/:propertyId/draws/:drawId',
            element: <DrawDetail />,
          },
          { path: 'properties/:propertyId/pay-app', element: <PayApp /> },
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
