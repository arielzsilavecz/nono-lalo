import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Logo } from '../components/Logo'

const NAV_ITEMS = [
  { to: '/admin', label: 'Resumen', end: true },
  { to: '/admin/publicaciones', label: 'Publicaciones' },
  { to: '/admin/pedidos', label: 'Pedidos' },
  { to: '/admin/clientes', label: 'Clientes' },
  { to: '/admin/compras', label: 'Compras' },
  { to: '/admin/platos', label: 'Platos' },
  { to: '/admin/ingredientes', label: 'Ingredientes' },
  { to: '/admin/despensa', label: 'Despensa' },
  { to: '/admin/ajustes', label: 'Ajustes' },
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <NavLink to="/admin" className="flex items-center gap-2">
            <span className="font-script text-2xl font-bold text-crema-50">
              il nonno <span className="text-tomate-300">Lalo</span>
            </span>
            <span className="rounded-full bg-navy-600 px-2 py-0.5 text-xs font-bold">cocina</span>
          </NavLink>
          <button
            type="button"
            onClick={signOut}
            className="cursor-pointer rounded-full px-3 py-1 text-sm text-navy-100 hover:bg-navy-700"
          >
            Cerrar sesión
          </button>
        </div>
        <nav className="mx-auto max-w-6xl overflow-x-auto px-4">
          <div className="flex gap-1 pb-2">
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
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>

      <div className="hidden print:block print:px-4 print:text-center">
        <Logo className="text-2xl" />
      </div>
    </div>
  )
}
