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
      <section className="mb-10 rounded-3xl border-4 border-navy-800 bg-crema-100 px-6 py-4 text-center shadow-md">
        <div className="flex flex-col items-center gap-2">
          <img src={logoImg} alt="il nonno Lalo" className="h-56 w-56 object-contain drop-shadow-md" />
          <p className="max-w-xl font-script text-2xl text-navy-700 sm:text-3xl">
            Elaboración de pastas y comidas 100% caseras, con ingredientes frescos.
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
            const open = menu.order_deadline === null || Date.parse(menu.order_deadline) > Date.now()
            const coverImage = items.find((i) => i.image_url)?.image_url ?? null
            const soldOut = items[0] !== undefined
              && items[0].max_portions !== null
              && items[0].reserved_portions >= items[0].max_portions
            return (
              <Card key={menu.id} className="relative flex flex-col overflow-hidden p-0!">
                {coverImage && (
                  <img src={coverImage} alt={menu.title} className="h-48 w-full object-cover" />
                )}
                <div className="flex flex-1 flex-col p-5">
                <p className="text-sm font-bold uppercase tracking-wide text-tomate-600">
                  {formatDateOnly(menu.delivery_date)}
                </p>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <h3 className="font-script text-3xl font-bold text-navy-800">{menu.title}</h3>
                  {items[0] && (
                    <span className="font-script text-3xl font-bold text-navy-800 shrink-0">{formatARS(items[0].unit_price)}</span>
                  )}
                </div>
                <div className="mt-3 flex-1 space-y-1 text-sm text-navy-700">
                  {items.map((item) => (
                    <div key={item.id}>
                      {item.dish_description && (
                        <p className="text-navy-600">{item.dish_description}</p>
                      )}
                    </div>
                  ))}
                  {menu.notes && (
                    <p className="mt-1 text-xs italic text-navy-500">{menu.notes}</p>
                  )}
                </div>
                <p className="mt-3 text-xs text-navy-500">
                  {open
                    ? (menu.order_deadline ? `Encargá hasta: ${formatDateTime(menu.order_deadline)}` : 'Disponible hasta agotar stock')
                    : 'Encargos cerrados'}
                </p>
                {soldOut ? (
                  <span className="mt-3 inline-flex items-center justify-center rounded-full bg-crema-200 px-4 py-2 text-sm font-bold text-navy-400">
                    Sin stock
                  </span>
                ) : (
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
                )}
                </div>

              {soldOut && (
                <div className="absolute inset-0 overflow-hidden rounded-2xl cursor-not-allowed">
                  <div className="absolute inset-0 bg-gray-400/50" />
                  <div className="absolute inset-x-[-30%] top-1/2 -translate-y-1/2 rotate-[-35deg] bg-gray-700/80 py-3 text-center text-2xl font-black tracking-[0.6em] text-white/90 shadow-lg">
                    AGOTADO
                  </div>
                </div>
              )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
