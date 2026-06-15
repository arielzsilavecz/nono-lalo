import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Logo } from '../components/Logo'
import { LogOut, Settings } from 'lucide-react'

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

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/admin/login')
  }

  return (
    <div className="min-h-screen">
      <header className="no-print bg-navy-800 text-crema-50">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <NavLink to="/admin" className="flex shrink-0 items-center gap-2">
            <img src="/sorrentino_cocina.png" alt="" className="h-12 w-auto object-contain" />
            <img src="/tipografia-header.svg" alt="il nonno Lalo" className="h-12 w-auto" />
          </NavLink>
          <nav className="flex min-w-0 flex-1 overflow-x-auto">
            <div className="flex gap-1">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${
                      isActive
                        ? 'bg-tomate-500 text-white'
                        : 'text-navy-100 hover:bg-navy-700'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
          <div className="flex shrink-0 items-center gap-1">
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
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>

      <div className="hidden print:block print:px-4 print:text-center">
        <Logo height="h-7" />
      </div>
    </div>
  )
}
