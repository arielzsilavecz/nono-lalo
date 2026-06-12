import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Menu, Order, OrderItem, OrderStatus } from '../../lib/types'
import { FULFILLMENT_LABELS, ORDER_STATUS_LABELS } from '../../lib/types'
import { formatARS, formatShortDateTime, waLink } from '../../lib/format'
import { Badge, Button, Card, EmptyState, LoadingBlock, PageTitle, Select } from '../../components/ui'

const STATUS_TONES: Record<OrderStatus, 'amber' | 'green' | 'navy' | 'red'> = {
  pending: 'amber',
  confirmed: 'green',
  delivered: 'navy',
  cancelled: 'red',
}

const STATUS_FILTERS: (OrderStatus | 'all')[] = ['all', 'pending', 'confirmed', 'delivered', 'cancelled']

export function Orders() {
  const [menus, setMenus] = useState<Menu[]>([])
  const [menuFilter, setMenuFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [itemsByOrder, setItemsByOrder] = useState<Map<string, OrderItem[]>>(new Map())

  useEffect(() => {
    supabase
      .from('menus')
      .select('*')
      .order('delivery_date', { ascending: false })
      .limit(30)
      .then(({ data }) => setMenus((data ?? []) as Menu[]))
  }, [])

  const load = useCallback(async () => {
    let query = supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(300)
    if (menuFilter !== 'all') query = query.eq('menu_id', menuFilter)
    const { data: orderRows } = await query
    const orderList = (orderRows ?? []) as Order[]
    setOrders(orderList)

    if (orderList.length > 0) {
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
    } else {
      setItemsByOrder(new Map())
    }
  }, [menuFilter])

  useEffect(() => {
    load()
  }, [load])

  async function setOrderStatus(order: Order, status: OrderStatus) {
    if (status === 'cancelled' && !window.confirm(`¿Cancelar el pedido #${order.order_number}? Se liberan sus porciones.`)) {
      return
    }
    await supabase.from('orders').update({ status }).eq('id', order.id)
    load()
  }

  if (!orders) return <LoadingBlock />

  const visible = statusFilter === 'all' ? orders : orders.filter((o) => o.status === statusFilter)
  const menuById = new Map(menus.map((m) => [m.id, m]))

  return (
    <div>
      <PageTitle title="Pedidos" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          className="w-auto!"
          value={menuFilter}
          onChange={(e) => setMenuFilter(e.target.value)}
        >
          <option value="all">Todos los menús</option>
          {menus.map((menu) => (
            <option key={menu.id} value={menu.id}>
              {menu.title} ({menu.delivery_date})
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`cursor-pointer rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                statusFilter === filter
                  ? 'bg-navy-700 text-crema-50'
                  : 'bg-crema-200 text-navy-700 hover:bg-crema-300'
              }`}
            >
              {filter === 'all' ? 'Todos' : ORDER_STATUS_LABELS[filter]}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Sin pedidos por acá">
          Cuando tus clientes encarguen desde la carta, los vas a ver en esta bandeja.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {visible.map((order) => {
            const items = itemsByOrder.get(order.id) ?? []
            const menu = menuById.get(order.menu_id)
            return (
              <Card key={order.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold text-navy-900">#{order.order_number}</span>
                      <Badge tone={STATUS_TONES[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                      <Badge tone="gray">{FULFILLMENT_LABELS[order.fulfillment]}</Badge>
                    </div>
                    <p className="mt-1 font-semibold text-navy-800">
                      {order.customer_name}{' '}
                      <a
                        href={waLink(order.customer_phone, `¡Hola ${order.customer_name}! Te escribimos de il nonno Lalo por tu pedido #${order.order_number}.`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-bold text-emerald-700 underline"
                      >
                        {order.customer_phone}
                      </a>
                    </p>
                    {order.address && <p className="text-sm text-navy-600">📍 {order.address}</p>}
                    {order.notes && <p className="text-sm italic text-navy-500">“{order.notes}”</p>}
                    <p className="mt-1 text-xs text-navy-400">
                      {menu ? `${menu.title} · ` : ''}
                      {formatShortDateTime(order.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <ul className="space-y-0.5 text-sm text-navy-700">
                      {items.map((item) => (
                        <li key={item.id}>
                          {item.qty} × {item.dish_name}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-lg font-bold text-navy-900">{formatARS(order.total)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {order.status === 'pending' && (
                    <Button variant="secondary" onClick={() => setOrderStatus(order, 'confirmed')}>
                      Confirmar
                    </Button>
                  )}
                  {order.status === 'confirmed' && (
                    <Button variant="secondary" onClick={() => setOrderStatus(order, 'delivered')}>
                      Marcar entregado
                    </Button>
                  )}
                  {(order.status === 'pending' || order.status === 'confirmed') && (
                    <Button variant="danger" onClick={() => setOrderStatus(order, 'cancelled')}>
                      Cancelar
                    </Button>
                  )}
                  {order.status === 'cancelled' && (
                    <Button variant="ghost" onClick={() => setOrderStatus(order, 'pending')}>
                      Reactivar
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
