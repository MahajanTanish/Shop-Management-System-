// src/app/Layout.tsx
import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import {
  LayoutDashboard,
  Package,
  Layers,
  ShoppingCart,
  TruckIcon,
  Users,
  Building2,
  CreditCard,
  BarChart3,
  UserCog,
  Settings,
  ClipboardList,
  LogOut,
  Menu,
  X,
  Bike,
  ChevronRight,
  Bell,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  permission?: boolean
}

export default function Layout() {
  const { profile, role, updateRole, signOut, canViewReports, canManageUsers, canViewAuditLog, canManageSettings } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const navItems: NavItem[] = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: true },
    { to: '/products', label: 'Products', icon: Package, permission: true },
    { to: '/inventory', label: 'Inventory', icon: Layers, permission: true },
    { to: '/sales', label: 'Sales & Billing', icon: ShoppingCart, permission: true },
    { to: '/purchases', label: 'Purchases', icon: TruckIcon, permission: true },
    { to: '/customers', label: 'Customers', icon: Users, permission: true },
    { to: '/suppliers', label: 'Suppliers', icon: Building2, permission: true },
    { to: '/payments', label: 'Payments & Credit', icon: CreditCard, permission: true },
    { to: '/reports', label: 'Reports', icon: BarChart3, permission: canViewReports },
    { to: '/users', label: 'User Settings', icon: UserCog, permission: true },
    { to: '/settings', label: 'Business Settings', icon: Settings, permission: true },
    { to: '/audit', label: 'Audit Log', icon: ClipboardList, permission: canViewAuditLog },
  ]

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const NavItems = () => (
    <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
      {navItems
        .filter((item) => item.permission !== false)
        .map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )
            }
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        ))}
    </nav>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 ease-in-out',
          'lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-200">
          <div className="flex-shrink-0 w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
            <Bike className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">BikeParts Smart AI</p>
            <p className="text-xs text-gray-500 truncate">Ved Scooter Works</p>
          </div>
          <button
            className="ml-auto lg:hidden text-gray-400 hover:text-gray-600"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <NavItems />

        {/* User section */}
        <div className="border-t border-gray-200 p-3">
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {profile?.full_name ?? 'User'}
                </p>
                <p className="text-xs text-gray-500 truncate capitalize">
                  {profile?.role?.replace('_', ' ')}
                </p>
              </div>
              <ChevronRight className={cn(
                'w-4 h-4 text-gray-400 transition-transform',
                userMenuOpen && 'rotate-90'
              )} />
            </button>

            {userMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-xl shadow-xl py-2 z-50 text-xs divide-y divide-gray-100 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 pb-2">
                  <p className="font-semibold text-gray-900 truncate">{profile?.full_name ?? 'User'}</p>
                  <p className="text-gray-500 text-[11px] mt-0.5 flex items-center gap-1.5">
                    <span>Role:</span>
                    <span className="font-semibold text-blue-600 capitalize bg-blue-50 px-1.5 py-0.5 rounded text-[10px]">
                      {role?.replace('_', ' ') || 'Owner'}
                    </span>
                  </p>
                </div>

                <div className="py-1 px-1">
                  <NavLink
                    to="/users"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors font-medium"
                  >
                    <UserCog className="w-3.5 h-3.5 text-gray-500" />
                    User Settings
                  </NavLink>
                  <NavLink
                    to="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors font-medium"
                  >
                    <Settings className="w-3.5 h-3.5 text-gray-500" />
                    Business Settings
                  </NavLink>
                </div>

                <div className="pt-1 px-1">
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button
            className="lg:hidden text-gray-500 hover:text-gray-700"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <Bell className="w-5 h-5" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
