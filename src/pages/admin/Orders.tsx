import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Menu, Order, OrderItem, OrderStatus } from '../../lib/types'
import { FULFILLMENT_LABELS } from '../../lib/types'
import { formatARS, formatDateOnly, waLink } from '../../lib/format'
import { Button, LoadingBlock, PageTitle } from '../../components/ui'
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import { NewOrderModal } from './NewOrderModal'

function timeAgo(isoDate: string): string {
  const mins = Math.floor((Date.now() - Date.parse(isoDate)) / 60_000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

interface ColDef {
  status: OrderStatus
  label: string
  colBg: string
  colBorder: string
  headerText: string
  dotColor: string
  accent: string
}

const COLUMNS: ColDef[] = [
  {
    status: 'pending',
    label: 'Pendientes',
    colBg: 'bg-amber-50',
    colBorder: 'border-amber-200',
    headerText: 'text-amber-700',
    dotColor: 'bg-amber-400',
    accent: 'border-l-amber-400',
  },
  {
    status: 'confirmed',
    label: 'Confirmados',
    colBg: 'bg-sky-50',
    colBorder: 'border-sky-200',
    headerText: 'text-sky-700',
    dotColor: 'bg-sky-400',
    accent: 'border-l-sky-400',
  },
  {
    status: 'ready',
    label: 'Listos',
    colBg: 'bg-emerald-50',
    colBorder: 'border-emerald-200',
    headerText: 'text-emerald-700',
    dotColor: 'bg-emerald-500',
    accent: 'border-l-emerald-500',
  },
  {
    status: 'delivered',
    label: 'Entregados',
    colBg: 'bg-slate-50',
    colBorder: 'border-slate-200',
    headerText: 'text-slate-500',
    dotColor: 'bg-slate-300',
    accent: 'border-l-slate-300',
  },
]

const NEXT_ACTION: Partial<Record<OrderStatus, { label: string; next: OrderStatus; cls: string }>> = {
  pending: { label: 'Confirmar',  next: 'confirmed', cls: 'bg-sky-600 text-white hover:bg-sky-700' },
  ready:   { label: 'Entregado', next: 'delivered', cls: 'bg-slate-600 text-white hover:bg-slate-700' },
}

interface CardProps {
  order: Order
  items: OrderItem[]
  col: ColDef
  onAdvance: (order: Order, next: OrderStatus) => void
}

function KanbanCard({ order, items, col, onAdvance }: CardProps) {
  const action = NEXT_ACTION[order.status]

  return (
    <div className={`rounded-lg border border-crema-200 border-l-4 ${col.accent} bg-white p-3 shadow-sm`}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-1 text-xs text-navy-400">
        <span className="font-bold text-navy-700">#{order.order_number}</span>
        <div className="flex items-center gap-1.5">
          <span title={FULFILLMENT_LABELS[order.fulfillment]}>
            {order.fulfillment === 'delivery' ? '🛵' : '🏠'}
          </span>
          <span>{timeAgo(order.created_at)}</span>
        </div>
      </div>

      {/* Customer */}
      <div className="mt-1.5">
        <p className="text-sm font-bold leading-tight text-navy-800">{order.customer_name}</p>
        <a
          href={waLink(
            order.customer_phone,
            `¡Hola ${order.customer_name}! Te escribimos de _il nonno Lalo_ por tu pedido #${order.order_number}.`,
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-emerald-700 hover:underline"
        >
          {order.customer_phone}
        </a>
      </div>

      {/* Items */}
      <div className="mt-2 space-y-0.5 border-t border-crema-100 pt-2">
        {items.map((item) => (
          <p key={item.id} className="text-xs text-navy-600">
            <span className="font-bold text-navy-700">{item.qty}×</span> {item.dish_name}
          </p>
        ))}
        {order.notes && (
          <p className="mt-1 text-xs italic text-navy-400">"{order.notes}"</p>
        )}
        {order.fulfillment === 'delivery' && order.address && (
          <p className="mt-1 text-xs text-navy-400">📍 {order.address}</p>
        )}
      </div>

      {/* Footer: total + actions */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-navy-800">{formatARS(order.total)}</span>
        <div className="flex items-center gap-1.5">
          {order.status === 'pending' ? (
            <>
              <button
                type="button"
                title="Cancelar"
                onClick={() => onAdvance(order, 'cancelled')}
                className="cursor-pointer rounded-full border-2 border-tomate-300 p-1 text-tomate-500 transition-colors hover:bg-tomate-50"
              >
                <X size={13} />
              </button>
              <button
                type="button"
                title="Confirmar"
                onClick={() => onAdvance(order, 'confirmed')}
                className="cursor-pointer rounded-full border-2 border-emerald-400 p-1 text-emerald-600 transition-colors hover:bg-emerald-50"
              >
                <Check size={13} />
              </button>
            </>
          ) : (
            <>
              {order.status === 'confirmed' && (
                <button
                  type="button"
                  title="Cancelar"
                  onClick={() => onAdvance(order, 'cancelled')}
                  className="cursor-pointer rounded-full border-2 border-tomate-300 p-1 text-tomate-500 transition-colors hover:bg-tomate-50"
                >
                  <X size={13} />
                </button>
              )}
              {action && (
                <button
                  type="button"
                  onClick={() => onAdvance(order, action.next)}
                  className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${action.cls}`}
                >
                  {action.label}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

type MenuInfo = Pick<Menu, 'id' | 'title' | 'delivery_date'>

function groupByMenu(
  colOrders: Order[],
  menuById: Map<string, MenuInfo>,
): { menuId: string; menu: MenuInfo | undefined; orders: Order[] }[] {
  const byMenu = new Map<string, Order[]>()
  for (const o of colOrders) {
    const list = byMenu.get(o.menu_id) ?? []
    list.push(o)
    byMenu.set(o.menu_id, list)
  }
  return [...byMenu.entries()]
    .map(([menuId, orders]) => ({ menuId, menu: menuById.get(menuId), orders }))
    .sort((a, b) => (a.menu?.delivery_date ?? '').localeCompare(b.menu?.delivery_date ?? ''))
}

export function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [itemsByOrder, setItemsByOrder] = useState<Map<string, OrderItem[]>>(new Map())
  const [menus, setMenus] = useState<MenuInfo[]>([])
  const [, setTick] = useState(0)
  const [showCancelled, setShowCancelled] = useState(false)
  const [newOrderOpen, setNewOrderOpen] = useState(false)

  // Force timeAgo update every minute
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const load = useCallback(async () => {
    const [{ data: orderRows }, { data: menuRows }] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('menus').select('id, title, delivery_date'),
    ])
    setMenus((menuRows ?? []) as MenuInfo[])
    const orderList = (orderRows ?? []) as Order[]
    setOrders(orderList)
    if (orderList.length === 0) { setItemsByOrder(new Map()); return }
    const { data: itemRows } = await supabase
      .from('order_items')
      .select('*')
      .in('order_id', orderList.map((o) => o.id))
    const grouped = new Map<string, OrderItem[]>()
    for (const item of (itemRows ?? []) as OrderItem[]) {
      const list = grouped.get(item.order_id) ?? []
      list.push(item)
      grouped.set(item.order_id, list)
    }
    setItemsByOrder(grouped)
  }, [])

  useEffect(() => { load() }, [load])

  async function advance(order: Order, next: OrderStatus) {
    if (next === 'cancelled' && !window.confirm(`¿Cancelar el pedido #${order.order_number}? Se liberan sus porciones.`)) return
    await supabase.from('orders').update({ status: next }).eq('id', order.id)
    load()
  }

  if (!orders) return <LoadingBlock />

  const today = new Date().toISOString().slice(0, 10)
  const active = orders.filter((o) => o.status !== 'cancelled')
  const cancelled = orders.filter((o) => o.status === 'cancelled')
  const todayOrders = active.filter((o) => o.created_at.slice(0, 10) === today)

  const menuById = new Map(menus.map((m) => [m.id, m]))

  const pendingCount = active.filter((o) => o.status === 'pending').length
  const readyCount   = active.filter((o) => o.status === 'ready').length
  const todayTotal     = todayOrders.reduce((s, o) => s + Number(o.total), 0)

  return (
    <div className="flex flex-col">
      <PageTitle
        title="Pedidos"
        action={<Button onClick={() => setNewOrderOpen(true)}>+ Nuevo pedido</Button>}
      />

      {/* Summary bar */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-center">
          <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
          <p className="text-xs font-semibold text-amber-700">Pendientes</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-center">
          <p className="text-2xl font-bold text-emerald-600">{readyCount}</p>
          <p className="text-xs font-semibold text-emerald-700">Listos</p>
        </div>
        <div className="rounded-xl border border-crema-200 bg-crema-50 px-3 py-2.5 text-center">
          <p className="text-2xl font-bold text-navy-700">{todayOrders.length}</p>
          <p className="text-xs font-semibold text-navy-500">Pedidos hoy</p>
        </div>
        <div className="rounded-xl border border-crema-200 bg-crema-50 px-3 py-2.5 text-center">
          <p className="text-xl font-bold text-navy-700">{formatARS(todayTotal)}</p>
          <p className="text-xs font-semibold text-navy-500">Total hoy</p>
        </div>
      </div>

      {/* Desktop / tablet Kanban */}
      <div className="hidden grid-cols-4 gap-2 md:grid">
        {COLUMNS.map((colDef) => {
          const colOrders = active.filter((o) => o.status === colDef.status)
          return (
            <div
              key={colDef.status}
              className={`flex min-w-0 flex-col rounded-xl border ${colDef.colBorder} ${colDef.colBg} max-h-[calc(100vh-18rem)]`}
            >
              <div className={`flex items-center gap-2 border-b ${colDef.colBorder} px-3 py-2.5`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${colDef.dotColor}`} />
                <span className={`text-xs font-bold uppercase tracking-wide ${colDef.headerText}`}>
                  {colDef.label}
                </span>
                <span className="ml-auto text-xs font-bold text-navy-400">{colOrders.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {colOrders.length === 0 ? (
                  <p className="py-6 text-center text-xs text-navy-300">Sin pedidos</p>
                ) : (
                  groupByMenu(colOrders, menuById).map(({ menuId, menu, orders: groupOrders }) => (
                    <div key={menuId} className="mb-3">
                      <p className="mb-1.5 truncate rounded bg-white/70 px-2 py-1 text-xs font-semibold text-navy-500">
                        {menu ? `${formatDateOnly(menu.delivery_date)} · ${menu.title}` : '–'}
                      </p>
                      <div className="space-y-2">
                        {groupOrders.map((o) => (
                          <KanbanCard
                            key={o.id}
                            order={o}
                            items={itemsByOrder.get(o.id) ?? []}
                            col={colDef}
                            onAdvance={advance}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Mobile: grouped list */}
      <div className="space-y-5 md:hidden">
        {COLUMNS.map((colDef) => {
          const colOrders = active.filter((o) => o.status === colDef.status)
          if (colOrders.length === 0) return null
          return (
            <div key={colDef.status}>
              <div className="mb-2 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${colDef.dotColor}`} />
                <h3 className={`text-xs font-bold uppercase tracking-wide ${colDef.headerText}`}>
                  {colDef.label} ({colOrders.length})
                </h3>
              </div>
              <div>
                {groupByMenu(colOrders, menuById).map(({ menuId, menu, orders: groupOrders }) => (
                  <div key={menuId} className="mb-3">
                    <p className="mb-1.5 truncate rounded bg-crema-100 px-2 py-1 text-xs font-semibold text-navy-500">
                      {menu ? `${formatDateOnly(menu.delivery_date)} · ${menu.title}` : '–'}
                    </p>
                    <div className="space-y-2">
                      {groupOrders.map((o) => (
                        <KanbanCard
                          key={o.id}
                          order={o}
                          items={itemsByOrder.get(o.id) ?? []}
                          col={colDef}
                          onAdvance={advance}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Cancelled (collapsed) */}
      {cancelled.length > 0 && (
        <div className="mt-4 border-t border-crema-200 pt-4">
          <button
            type="button"
            onClick={() => setShowCancelled((s) => !s)}
            className="flex cursor-pointer items-center gap-2 text-xs font-bold text-navy-400 hover:text-navy-600"
          >
            {showCancelled ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Cancelados ({cancelled.length})
          </button>
          {showCancelled && (
            <div className="mt-2 space-y-1.5">
              {cancelled.map((order) => {
                const items = itemsByOrder.get(order.id) ?? []
                return (
                  <div
                    key={order.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm opacity-60"
                  >
                    <span className="font-bold text-navy-600">#{order.order_number}</span>
                    <span className="text-navy-600">{order.customer_name}</span>
                    <span className="hidden text-xs text-navy-400 sm:block">
                      {items.map((i) => `${i.qty}× ${i.dish_name}`).join(', ')}
                    </span>
                    <span className="font-bold text-navy-700">{formatARS(order.total)}</span>
                    <button
                      type="button"
                      onClick={() => advance(order, 'pending')}
                      className="cursor-pointer rounded-md border border-navy-200 px-2 py-1 text-xs font-bold text-navy-500 hover:bg-navy-50"
                    >
                      Reactivar
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {newOrderOpen && (
        <NewOrderModal onClose={() => { setNewOrderOpen(false); load() }} />
      )}
    </div>
  )
}
