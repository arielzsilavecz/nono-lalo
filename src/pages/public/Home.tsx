import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Menu, MenuItem } from '../../lib/types'
import { formatARS, formatDateOnly, formatDateTime, todayDateValue } from '../../lib/format'
import logoImg from '/logo.png'
import { Card, EmptyState, LoadingBlock } from '../../components/ui'

export function Home() {
  const [menus, setMenus] = useState<Menu[]>([])
  const [itemsByMenu, setItemsByMenu] = useState<Map<string, MenuItem[]>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: menuRows } = await supabase
        .from('menus')
        .select('*')
        .eq('status', 'published')
        .gte('delivery_date', todayDateValue())
        .order('delivery_date', { ascending: true })

      const menuList = (menuRows ?? []) as Menu[]
      setMenus(menuList)

      if (menuList.length > 0) {
        const { data: itemRows } = await supabase
          .from('menu_items')
          .select('*')
          .in('menu_id', menuList.map((m) => m.id))
        const grouped = new Map<string, MenuItem[]>()
        for (const item of (itemRows ?? []) as MenuItem[]) {
          const list = grouped.get(item.menu_id) ?? []
          list.push(item)
          grouped.set(item.menu_id, list)
        }
        setItemsByMenu(grouped)
      }
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div>
      {/* Hero estilo pizarra */}
      <section className="mb-10 rounded-3xl border-4 border-navy-800 bg-crema-100 px-6 py-10 text-center shadow-md">
        <div className="flex flex-col items-center gap-4">
          <img src={logoImg} alt="il nonno Lalo" className="h-40 w-40 object-contain drop-shadow-md" />
          <h1 className="font-script text-5xl font-bold text-navy-800 sm:text-6xl">
            Cocina casera con alma de familia
          </h1>
          <p className="max-w-xl text-navy-700">
            Elaboración de pastas y comidas 100% caseras, con ingredientes frescos.
            Porque lo que servimos no es solo comida: <strong>es el sabor de casa</strong>.
          </p>
        </div>
      </section>

      <h2 className="mb-4 font-script text-4xl font-bold text-navy-800">Próximos menús</h2>

      {loading ? (
        <LoadingBlock />
      ) : menus.length === 0 ? (
        <EmptyState title="Todavía no hay menús publicados">
          ¡Volvé pronto! El nonno está pensando qué cocinar.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {menus.map((menu) => {
            const items = itemsByMenu.get(menu.id) ?? []
            const open = Date.parse(menu.order_deadline) > Date.now()
            return (
              <Card key={menu.id} className="flex flex-col">
                <p className="text-sm font-bold uppercase tracking-wide text-tomate-600">
                  {formatDateOnly(menu.delivery_date)}
                </p>
                <h3 className="mt-1 font-script text-3xl font-bold text-navy-800">{menu.title}</h3>
                <ul className="mt-3 flex-1 space-y-1 text-sm text-navy-700">
                  {items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-2">
                      <span>{item.dish_name}</span>
                      <span className="font-bold">{formatARS(item.unit_price)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-navy-500">
                  {open
                    ? `Encargá hasta: ${formatDateTime(menu.order_deadline)}`
                    : 'Encargos cerrados'}
                </p>
                <Link
                  to={`/menu/${menu.id}`}
                  className={`mt-3 inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                    open
                      ? 'bg-tomate-500 text-white hover:bg-tomate-600'
                      : 'bg-crema-200 text-navy-600 hover:bg-crema-300'
                  }`}
                >
                  {open ? 'Ver menú y encargar' : 'Ver menú'}
                </Link>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
