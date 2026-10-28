// src/app/Router.tsx
import { createBrowserRouter, RouterProvider, Navigate, useRouteError } from 'react-router-dom'
import React, { Suspense, lazy } from 'react'
import Layout from './Layout'
import ProtectedRoute from '@/features/auth/ProtectedRoute'
import LoginPage from '@/features/auth/LoginPage'
import SignupPage from '@/features/auth/SignupPage'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'

import DashboardPage from '@/features/reports/DashboardPage'
import ProductsPage from '@/features/products/ProductsPage'
import ProductFormPage from '@/features/products/ProductFormPage'
import InventoryPage from '@/features/inventory/InventoryPage'
import SalesPage from '@/features/sales/SalesPage'
import NewInvoicePage from '@/features/sales/NewInvoicePage'
import InvoiceDetailPage from '@/features/sales/InvoiceDetailPage'
import PurchasesPage from '@/features/purchases/PurchasesPage'
import NewPurchasePage from '@/features/purchases/NewPurchasePage'
import CustomersPage from '@/features/customers/CustomersPage'
import CustomerDetailPage from '@/features/customers/CustomerDetailPage'
import SuppliersPage from '@/features/suppliers/SuppliersPage'
import PaymentsPage from '@/features/payments/PaymentsPage'
import ReportsPage from '@/features/reports/ReportsPage'
import UsersPage from '@/features/users/UsersPage'
import SettingsPage from '@/features/users/SettingsPage'
import AuditPage from '@/features/users/AuditPage'

// User-friendly error boundary for route transitions
function RouteErrorBoundary() {
  const error = useRouteError() as any
  const errorMessage = error?.message || (typeof error === 'string' ? error : 'An unexpected error occurred.')
  const errorStack = error?.stack || ''
  const isChunkError =
    errorMessage.includes('dynamically imported module') ||
    errorMessage.includes('Loading chunk')

  const handleReload = () => {
    try {
      sessionStorage.clear()
    } catch (_) {}
    window.location.reload()
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="p-3 bg-red-100 text-red-600 rounded-2xl mb-4 shadow-sm">
        <AlertCircle className="w-8 h-8" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">
        {isChunkError ? 'New Update Available' : 'Something went wrong'}
      </h2>
      <p className="text-sm text-gray-600 max-w-md mb-6">
        {isChunkError
          ? 'The application files have been updated. Click reload to refresh with the latest version.'
          : errorMessage}
      </p>
      <div className="flex gap-3 justify-center mb-6">
        <button
          onClick={handleReload}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition shadow-xs cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" /> Reload Page
        </button>
        <button
          onClick={() => {
            try {
              sessionStorage.clear()
            } catch (_) {}
            window.location.href = '/dashboard'
          }}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition cursor-pointer"
        >
          <Home className="w-4 h-4" /> Go to Dashboard
        </button>
      </div>

      {!isChunkError && (
        <details className="w-full max-w-lg text-left bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-700">
          <summary className="font-semibold cursor-pointer text-gray-800 hover:text-blue-600">
            Technical Error Details
          </summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-red-600 bg-red-50/50 p-2 rounded border border-red-100 overflow-x-auto">
            {errorMessage}
            {errorStack ? `\n\n${errorStack}` : ''}
          </pre>
        </details>
      )}
    </div>
  )
}

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
  </div>
)

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/signup',
    element: <SignupPage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: 'dashboard',
        element: <Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>,
      },
      {
        path: 'products',
        element: <Suspense fallback={<PageLoader />}><ProductsPage /></Suspense>,
      },
      {
        path: 'products/new',
        element: <Suspense fallback={<PageLoader />}><ProductFormPage /></Suspense>,
      },
      {
        path: 'products/:id/edit',
        element: <Suspense fallback={<PageLoader />}><ProductFormPage /></Suspense>,
      },
      {
        path: 'inventory',
        element: <Suspense fallback={<PageLoader />}><InventoryPage /></Suspense>,
      },
      {
        path: 'sales',
        element: <Suspense fallback={<PageLoader />}><SalesPage /></Suspense>,
      },
      {
        path: 'sales/new',
        element: <Suspense fallback={<PageLoader />}><NewInvoicePage /></Suspense>,
      },
      {
        path: 'sales/:id',
        element: <Suspense fallback={<PageLoader />}><InvoiceDetailPage /></Suspense>,
      },
      {
        path: 'purchases',
        element: <Suspense fallback={<PageLoader />}><PurchasesPage /></Suspense>,
      },
      {
        path: 'purchases/new',
        element: <Suspense fallback={<PageLoader />}><NewPurchasePage /></Suspense>,
      },
      {
        path: 'customers',
        element: <Suspense fallback={<PageLoader />}><CustomersPage /></Suspense>,
      },
      {
        path: 'customers/:id',
        element: <Suspense fallback={<PageLoader />}><CustomerDetailPage /></Suspense>,
      },
      {
        path: 'suppliers',
        element: <Suspense fallback={<PageLoader />}><SuppliersPage /></Suspense>,
      },
      {
        path: 'payments',
        element: <Suspense fallback={<PageLoader />}><PaymentsPage /></Suspense>,
      },
      {
        path: 'reports',
        element: (
          <ProtectedRoute allowedRoles={['owner', 'manager']}>
            <Suspense fallback={<PageLoader />}><ReportsPage /></Suspense>
          </ProtectedRoute>
        ),
      },
      {
        path: 'users',
        element: (
          <Suspense fallback={<PageLoader />}><UsersPage /></Suspense>
        ),
      },
      {
        path: 'settings',
        element: (
          <Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>
        ),
      },
      {
        path: 'audit',
        element: (
          <ProtectedRoute allowedRoles={['owner', 'manager']}>
            <Suspense fallback={<PageLoader />}><AuditPage /></Suspense>
          </ProtectedRoute>
        ),
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
])

export default function AppRouter() {
  return <RouterProvider router={router} />
}
