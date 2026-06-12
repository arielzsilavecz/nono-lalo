import { Link, Outlet } from 'react-router-dom'
import { Logo } from '../components/Logo'
import logoImg from '/logo.png'

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-crema-200 bg-crema-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/" aria-label="Ir al inicio" className="flex items-center gap-2">
            <img src={logoImg} alt="il nonno Lalo" className="h-10 w-10 object-contain" />
            <Logo className="text-3xl" />
          </Link>
          <span className="hidden font-script text-xl text-navy-600 sm:block">
            Cocina casera con alma de familia
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-crema-200 bg-crema-100">
        <div className="mx-auto max-w-4xl px-4 py-6 text-center text-sm text-navy-600">
          <p className="font-script text-2xl text-navy-700">
            Porque lo que servimos no es solo comida, es el sabor de casa.
          </p>
          <p className="mt-2">
            il nonno Lalo · comidas 100% caseras ·{' '}
            <Link to="/admin" className="underline hover:text-navy-800">
              acceso cocina
            </Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
