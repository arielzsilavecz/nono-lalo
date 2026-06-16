import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Logo } from '../components/Logo'
import { BugReportsModal } from '../components/BugReportsModal'
import { Bug, LogOut, Menu, Settings } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/admin', label: 'Resumen', end: true },
  { to: '/admin/publicaciones', label: 'Publicaciones' },
  { to: '/admin/pedidos', label: 'Pedidos' },
  { to: '/admin/clientes', label: 'Clientes' },
  { to: '/admin/platos', label: 'Platos' },
  { to: '/admin/despensa', label: 'Despensa' },
  { to: '/admin/compras', label: 'Compras' },
]

export function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [showBugReports, setShowBugReports] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setDrawerOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/admin/login')
  }

  return (
    <div className="min-h-screen">
      <header className="no-print bg-navy-800 text-crema-50">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <NavLink to="/admin" className="flex shrink-0 items-center gap-2">
            <img src="/sorrentino_cocina.png" alt="il nonno Lalo" className="h-12 w-auto object-contain" />
            <img src="/tipografia-header.svg" alt="" className="h-12 w-auto" />
          </NavLink>

          {/* Desktop nav */}
          <nav className="hidden min-w-0 flex-1 md:flex">
            <div className="flex gap-1">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${
                      isActive ? 'bg-tomate-500 text-white' : 'text-navy-100 hover:bg-navy-700'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>

          {/* Desktop icons */}
          <div className="hidden shrink-0 items-center gap-1 md:flex">
            <button
              type="button"
              onClick={() => setShowBugReports(true)}
              title="Reportar problema"
              className="cursor-pointer rounded-full p-2 text-navy-100 transition-colors hover:bg-navy-700"
            >
              <Bug size={18} />
            </button>
            <NavLink
              to="/admin/ajustes"
              title="Configuración"
              className={({ isActive }) =>
                `cursor-pointer rounded-full p-2 transition-colors ${
                  isActive ? 'bg-tomate-500 text-white' : 'text-navy-100 hover:bg-navy-700'
                }`
              }
            >
              <Settings size={18} />
            </NavLink>
            <button
              type="button"
              onClick={signOut}
              title="Cerrar sesión"
              className="cursor-pointer rounded-full p-2 text-navy-100 transition-colors hover:bg-navy-700"
            >
              <LogOut size={18} />
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="ml-auto cursor-pointer rounded-full p-2 text-navy-100 transition-colors hover:bg-navy-700 md:hidden"
            aria-label="Abrir menú"
          >
            <Menu size={22} />
          </button>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-navy-800 text-crema-50 shadow-2xl transition-transform duration-300 ease-in-out md:hidden ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `block rounded-xl px-4 py-3 text-base font-bold transition-colors ${
                    isActive ? 'bg-tomate-500 text-white' : 'text-navy-100 hover:bg-navy-700'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Drawer footer */}
        <div className="border-t border-navy-700 px-3 py-4 space-y-1">
          <button
            type="button"
            onClick={() => { setDrawerOpen(false); setShowBugReports(true) }}
            className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-base font-bold text-navy-100 transition-colors hover:bg-navy-700"
          >
            <Bug size={18} /> Reportar problema
          </button>
          <NavLink
            to="/admin/ajustes"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-4 py-3 text-base font-bold transition-colors ${
                isActive ? 'bg-tomate-500 text-white' : 'text-navy-100 hover:bg-navy-700'
              }`
            }
          >
            <Settings size={18} /> Configuración
          </NavLink>
          <button
            type="button"
            onClick={signOut}
            className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-base font-bold text-navy-100 transition-colors hover:bg-navy-700"
          >
            <LogOut size={18} /> Cerrar sesión
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>

      <div className="hidden print:block print:px-4 print:text-center">
        <Logo height="h-7" />
      </div>

      {showBugReports && <BugReportsModal onClose={() => setShowBugReports(false)} />}
    </div>
  )
}
