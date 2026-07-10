import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Menu, MenuItem } from '../../lib/types'
import { formatARS, formatDateOnly, formatDateTime, todayDateValue } from '../../lib/format'
import { Card, EmptyState, LoadingBlock } from '../../components/ui'
import { useCart } from '../../lib/CartContext'
import { DishImage } from '../../components/DishImage'

export function Home() {
  const [menus, setMenus] = useState<Menu[]>([])
  const [itemsByMenu, setItemsByMenu] = useState<Map<string, MenuItem[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const { getQty, setItemQty, totalItems, subtotal } = useCart()

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
    <div className={totalItems > 0 ? 'pb-20' : ''}>
      <h2 className="mb-4 font-script text-4xl font-bold text-navy-800">Próximos menúes</h2>

      {loading ? (
        <LoadingBlock />
      ) : menus.length === 0 ? (
        <EmptyState title="Todavía no hay menúes publicados">
          ¡Volvé pronto! El nonno está pensando qué cocinar.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {menus.map((menu) => {
            const items = itemsByMenu.get(menu.id) ?? []
            const open = menu.order_deadline === null || Date.parse(menu.order_deadline) > Date.now()
            const coverItem = items.find((i) => i.image_url)
            const coverImage = coverItem?.image_url ?? null
            const coverPosition = coverItem?.image_position ?? 'center center'
            const coverZoom = coverItem?.image_zoom ?? 1
            const soldOut = items[0] !== undefined
              && items[0].max_portions !== null
              && items[0].reserved_portions >= items[0].max_portions

            // Single-item inline cart: only when there's exactly 1 item and menu is open
            const singleItem = items.length === 1 ? items[0] : null
            const qty = singleItem ? getQty(singleItem.id) : 0
            const remaining = singleItem?.max_portions != null
              ? Math.max(0, singleItem.max_portions - singleItem.reserved_portions)
              : null
            const maxQty = remaining === null ? 50 : remaining

            function handleQtyChange(newQty: number) {
              if (!singleItem) return
              const clamped = Math.max(0, Math.min(maxQty, newQty))
              setItemQty({
                menuId: menu.id,
                menuItemId: singleItem.id,
                menuTitle: menu.title,
                deliveryDate: menu.delivery_date,
                dishName: singleItem.dish_name,
                unitPrice: singleItem.unit_price,
                deliveryIncluded: menu.delivery_included,
                maxPortions: singleItem.max_portions,
                reservedPortions: singleItem.reserved_portions,
              }, clamped)
            }

            return (
              <Card key={menu.id} className="relative flex flex-col overflow-hidden p-0!">
                {coverImage && (
                  <DishImage
                    imageUrl={coverImage}
                    position={coverPosition}
                    zoom={coverZoom}
                    alt={menu.title}
                    className="aspect-2/1 w-full"
                  />
                )}
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold uppercase tracking-wide text-tomate-600">
                      {formatDateOnly(menu.delivery_date)}
                    </p>
                    {menu.delivery_included && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                        Envío gratis
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <h3 className="font-script text-3xl font-bold text-navy-800">{menu.title}</h3>
                    {items[0] && (
                      <span className="font-script text-3xl font-bold text-navy-800 shrink-0">
                        {formatARS(items[0].unit_price)}
                      </span>
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

                  {/* Action area */}
                  {soldOut ? (
                    <span className="mt-3 inline-flex items-center justify-center rounded-full bg-crema-200 px-4 py-2 text-sm font-bold text-navy-400">
                      Sin stock
                    </span>
                  ) : singleItem && open ? (
                    // Inline +/- cart controls
                    qty === 0 ? (
                      <button
                        type="button"
                        onClick={() => handleQtyChange(1)}
                        className="mt-3 cursor-pointer rounded-full bg-tomate-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-tomate-600"
                      >
                        Agregar al carrito
                      </button>
                    ) : (
                      <div className="mt-3 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleQtyChange(qty - 1)}
                          className="h-9 w-9 cursor-pointer rounded-full bg-crema-200 text-lg font-bold text-navy-800 hover:bg-crema-300"
                          aria-label="Quitar uno"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-lg font-bold text-navy-900">{qty}</span>
                        <button
                          type="button"
                          onClick={() => handleQtyChange(qty + 1)}
                          disabled={qty >= maxQty}
                          className="h-9 w-9 cursor-pointer rounded-full bg-tomate-500 text-lg font-bold text-white hover:bg-tomate-600 disabled:opacity-40"
                          aria-label="Agregar uno"
                        >
                          +
                        </button>
                        <span className="ml-auto font-bold text-navy-900">
                          {formatARS(singleItem.unit_price * qty)}
                        </span>
                      </div>
                    )
                  ) : (
                    // Multi-item menu or closed: link to menu page
                    <Link
                      to={`/menu/${menu.id}`}
                      className={`mt-3 inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                        open
                          ? 'bg-tomate-500 text-white hover:bg-tomate-600'
                          : 'bg-crema-200 text-navy-600 hover:bg-crema-300'
                      }`}
                    >
                      {open ? 'Reservar porción' : 'Ver menú'}
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

      {/* Sticky cart bar */}
      {totalItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-navy-800 px-4 py-3 shadow-2xl">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 pr-20 sm:pr-0">
            <div>
              <p className="font-bold text-crema-50">
                {totalItems} {totalItems === 1 ? 'ítem' : 'ítems'}
              </p>
              <p className="text-sm text-crema-300">{formatARS(subtotal)}</p>
            </div>
            <Link
              to="/carrito"
              className="rounded-full bg-tomate-500 px-6 py-2.5 font-bold text-white transition-colors hover:bg-tomate-600"
            >
              Ver pedido →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
