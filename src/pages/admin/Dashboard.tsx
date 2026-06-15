import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { DishIngredient, Ingredient, Menu, MenuItem } from '../../lib/types'
import { formatARS, formatCookingTime, formatDateOnly, formatQty, todayDateValue } from '../../lib/format'
import { Button, Card, LoadingBlock, PageTitle } from '../../components/ui'
import { AlertTriangle, BookOpen, Calendar, Check, ChevronDown, ChevronUp, Clock, MapPin, Pencil, Users } from 'lucide-react'

type DateFilter = 'week' | 'month' | 'custom'

interface OrderDetail {
  id: string
  order_number: number
  customer_name: string
  customer_phone: string
  fulfillment: string
  address: string | null
  status: string
  total: number
}

interface TopDish { name: string; qty: number }
interface LowStockAlert { name: string; stock: number; needed: number; unit: string }

interface Stats {
  nextMenu: Menu | null
  nextMenuItem: MenuItem | null
  nextMenuOrders: number
  nextMenuRevenue: number
  nextMenuPortions: number
  nextMenuMaxPortions: number | null
  nextMenuPickup: number
  nextMenuDelivery: number
  pendingOrders: number
  totalDishes: number
  totalIngredients: number
  historicalRevenue: number
  ticketAvg: number
  topDishes: TopDish[]
  periodTotalCustomers: number
  periodNewCustomers: number
  periodReturningCustomers: number
  nextMenuNewCustomers: number
  nextMenuReturningCustomers: number
  lowStock: LowStockAlert[]
  nextMenuIngredientCount: number
  upcomingMenus: Menu[]
}

function getRange(filter: DateFilter, customFrom: string, customTo: string): { from: string; to: string } | null {
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const today = new Date()
  if (filter === 'week') {
    const day = today.getDay()
    const diff = day === 0 ? 6 : day - 1
    const monday = new Date(today)
    monday.setDate(today.getDate() - diff)
    return { from: fmt(monday), to: fmt(today) }
  }
  if (filter === 'month') {
    return { from: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`, to: fmt(today) }
  }
  if (customFrom && customTo) return { from: customFrom, to: customTo }
  return null
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [dateFilter, setDateFilter] = useState<DateFilter>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [showPeriodRevenue, setShowPeriodRevenue] = useState(false)
  const [periodOrders, setPeriodOrders] = useState<{ id: string; order_number: number; customer_name: string; total: number }[]>([])
  const [orderDetails, setOrderDetails] = useState<OrderDetail[] | null>(null)
  const [countdown, setCountdown] = useState<string | null>(null)

  async function load() {
    const { data: nextMenuRow } = await supabase
      .from('menus')
      .select('*')
      .in('status', ['published', 'closed'])
      .gte('delivery_date', todayDateValue())
      .order('delivery_date', { ascending: true })
      .limit(1)
      .maybeSingle()

    const nextMenu = (nextMenuRow as Menu) ?? null
    let nextMenuItem: MenuItem | null = null
    let nextMenuPortions = 0
    let nextMenuMaxPortions: number | null = null

    if (nextMenu) {
      const { data: miRow } = await supabase
        .from('menu_items').select('*').eq('menu_id', nextMenu.id).maybeSingle()
      nextMenuItem = (miRow as MenuItem) ?? null
      nextMenuMaxPortions = nextMenuItem?.max_portions ?? null
      if (nextMenuItem) nextMenuPortions = nextMenuItem.reserved_portions
    }

    const [
      { data: allOrderRows },
      { data: orderItemRows },
      { data: pantryRows },
      pendingRes,
      dishesRes,
      ingredientsRes,
    ] = await Promise.all([
      supabase.from('orders').select('id, order_number, menu_id, fulfillment, status, total, customer_phone, customer_name, created_at').neq('status', 'cancelled'),
      supabase.from('order_items').select('order_id, dish_name, qty'),
      supabase.from('pantry_movements').select('ingredient_id, qty'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('dishes').select('id', { count: 'exact', head: true }),
      supabase.from('ingredients').select('id', { count: 'exact', head: true }),
    ])

    // Pedidos del próximo menú (sin filtro de fecha)
    const nextMenuOrdersArr = (allOrderRows ?? []).filter((o) => o.menu_id === nextMenu?.id)
    const nextMenuOrders = nextMenuOrdersArr.length
    const nextMenuRevenue = nextMenuOrdersArr.reduce((s, o) => s + Number(o.total), 0)
    const nextMenuPickup = nextMenuOrdersArr.filter((o) => o.fulfillment === 'pickup').length
    const nextMenuDelivery = nextMenuOrdersArr.filter((o) => o.fulfillment === 'delivery').length
    const ticketAvg = nextMenuOrders > 0 ? nextMenuRevenue / nextMenuOrders : 0

    // Datos históricos filtrados por período
    const range = getRange(dateFilter, customFrom, customTo)
    const filteredOrders = range
      ? (allOrderRows ?? []).filter((o) => {
          const d = o.created_at.slice(0, 10)
          return d >= range.from && d <= range.to
        })
      : (allOrderRows ?? [])
    const filteredOrderIds = new Set(filteredOrders.map((o) => o.id))

    const historicalRevenue = filteredOrders.reduce((s, o) => s + Number(o.total), 0)

    setPeriodOrders(
      [...filteredOrders]
        .sort((a, b) => Number(b.total) - Number(a.total))
        .map((o) => ({
          id: String(o.id),
          order_number: Number(o.order_number),
          customer_name: String((o as Record<string, unknown>).customer_name ?? ''),
          total: Number(o.total),
        }))
    )

    // Top platos (filtrado)
    const dishCounts = new Map<string, number>()
    for (const row of orderItemRows ?? []) {
      if (!filteredOrderIds.has(row.order_id)) continue
      dishCounts.set(row.dish_name, (dishCounts.get(row.dish_name) ?? 0) + row.qty)
    }
    const topDishes = [...dishCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ name, qty }))

    // Clientes del período: nuevos (primera vez en el sistema) vs recurrentes
    const periodPhones = new Set(filteredOrders.map((o) => o.customer_phone))
    const beforePeriodPhones = range
      ? new Set((allOrderRows ?? []).filter((o) => o.created_at.slice(0, 10) < range.from).map((o) => o.customer_phone))
      : new Set<string>()
    let periodNewCustomers = 0
    let periodReturningCustomers = 0
    for (const phone of periodPhones) {
      if (beforePeriodPhones.has(phone)) periodReturningCustomers++
      else periodNewCustomers++
    }
    const periodTotalCustomers = periodPhones.size

    // Clientes nuevos vs recurrentes del próximo menú (para el desplegable)
    let nextMenuNewCustomers = 0
    let nextMenuReturningCustomers = 0
    if (nextMenu) {
      const nextPhones = new Set(nextMenuOrdersArr.map((o) => o.customer_phone))
      const otherPhones = new Set((allOrderRows ?? []).filter((o) => o.menu_id !== nextMenu.id).map((o) => o.customer_phone))
      for (const phone of nextPhones) {
        if (otherPhones.has(phone)) nextMenuReturningCustomers++
        else nextMenuNewCustomers++
      }
    }

    // Alertas de stock bajo
    let lowStock: LowStockAlert[] = []
    let nextMenuIngredientCount = 0
    if (nextMenuItem && nextMenuPortions > 0) {
      const { data: diRows } = await supabase
        .from('dish_ingredients')
        .select('ingredient_id, qty_per_portion, ingredients(name, unit)')
        .eq('dish_id', nextMenuItem.dish_id)

      nextMenuIngredientCount = diRows?.length ?? 0

      const stockMap = new Map<string, number>()
      for (const row of pantryRows ?? []) {
        stockMap.set(row.ingredient_id, (stockMap.get(row.ingredient_id) ?? 0) + Number(row.qty))
      }
      for (const di of diRows ?? []) {
        const needed = di.qty_per_portion * nextMenuPortions
        const available = stockMap.get(di.ingredient_id) ?? 0
        const ingRaw = di.ingredients
        const ing: { name: string; unit: string } | null =
          Array.isArray(ingRaw) ? (ingRaw[0] ?? null) : (ingRaw ?? null)
        if (available < needed && ing) {
          lowStock.push({ name: ing.name, stock: available, needed, unit: ing.unit })
        }
      }
    }

    // Próximos menúes (después del siguiente, sin contar cocinados)
    const upcomingMenusQuery = nextMenu
      ? supabase
          .from('menus')
          .select('*')
          .in('status', ['published', 'closed'])
          .gt('delivery_date', nextMenu.delivery_date)
          .order('delivery_date', { ascending: true })
          .limit(5)
      : supabase
          .from('menus')
          .select('*')
          .in('status', ['published', 'closed'])
          .gte('delivery_date', todayDateValue())
          .order('delivery_date', { ascending: true })
          .limit(5)

    const { data: upcomingMenuRows } = await upcomingMenusQuery
    const upcomingMenus = (upcomingMenuRows ?? []) as Menu[]

    setStats({
      nextMenu, nextMenuItem, nextMenuOrders, nextMenuRevenue,
      nextMenuPortions, nextMenuMaxPortions, nextMenuPickup, nextMenuDelivery,
      pendingOrders: pendingRes.count ?? 0,
      totalDishes: dishesRes.count ?? 0,
      totalIngredients: ingredientsRes.count ?? 0,
      historicalRevenue, ticketAvg, topDishes,
      periodTotalCustomers, periodNewCustomers, periodReturningCustomers,
      nextMenuNewCustomers, nextMenuReturningCustomers, lowStock,
      nextMenuIngredientCount, upcomingMenus,
    })
  }

  useEffect(() => {
    if (dateFilter === 'custom' && (!customFrom || !customTo)) return
    setStats(null)
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, customFrom, customTo])

  useEffect(() => {
    if (stats?.nextMenu?.status === 'closed') { setCountdown('cerrado'); return }
    const deadline = stats?.nextMenu?.order_deadline
    if (!deadline) { setCountdown(null); return }
    const dl: string = deadline
    function update() {
      const diff = Date.parse(dl) - Date.now()
      if (diff <= 0) { setCountdown('cerrado'); return }
      const totalSecs = Math.floor(diff / 1000)
      const days = Math.floor(totalSecs / 86400)
      const hours = Math.floor((totalSecs % 86400) / 3600)
      const mins = Math.floor((totalSecs % 3600) / 60)
      if (days >= 2) setCountdown(`${days} días`)
      else if (days === 1) setCountdown(`1 día ${hours}h`)
      else if (hours > 0) setCountdown(`${hours}h ${mins}m`)
      else setCountdown(`${mins}m`)
    }
    update()
    const id = setInterval(update, 60000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats?.nextMenu?.order_deadline, stats?.nextMenu?.status])

  async function markCooked() {
    if (!stats?.nextMenu || !stats?.nextMenuItem) return
    const menuId = stats.nextMenu.id
    const mi = stats.nextMenuItem

    const { data: recipeRows } = await supabase.from('dish_ingredients').select('*').eq('dish_id', mi.dish_id)
    const { data: ingRows } = await supabase.from('ingredients').select('*')
    const ingById = new Map(((ingRows ?? []) as Ingredient[]).map((i) => [i.id, i]))

    const totalPortions = stats.nextMenuPortions
    const usage = ((recipeRows ?? []) as DishIngredient[])
      .map((r) => ({ ingredient_id: r.ingredient_id, qty: totalPortions * r.qty_per_portion, ing: ingById.get(r.ingredient_id) }))
      .filter((u) => u.qty > 0)

    const summary = usage.map((u) => `• ${u.ing?.name ?? '?'}: ${formatQty(u.qty)} ${u.ing?.unit ?? ''}`).join('\n')
    const msg = usage.length > 0
      ? `Se va a descontar de la despensa:\n${summary}\n\n¿Marcar como cocinado?`
      : '¿Marcar esta publicación como cocinada?'
    if (!window.confirm(msg)) return

    if (usage.length > 0) {
      await supabase.from('pantry_movements').insert(
        usage.map((u) => ({
          ingredient_id: u.ingredient_id, qty: -u.qty, reason: 'cooking',
          menu_id: menuId, notes: `Cocina: ${mi.dish_name}`,
        }))
      )
    }
    await supabase.from('menus').update({ status: 'cooked' }).eq('id', menuId)
    await supabase.from('orders').update({ status: 'ready' }).eq('menu_id', menuId).eq('status', 'confirmed')
    setOrderDetails(null)
    setExpanded(false)
    load()
  }

  async function loadOrderDetails() {
    if (!stats?.nextMenu) return
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, customer_phone, fulfillment, address, status, total')
      .eq('menu_id', stats.nextMenu.id)
      .neq('status', 'cancelled')
      .order('fulfillment')
    setOrderDetails((data ?? []) as OrderDetail[])
  }

  async function markDelivered(order: OrderDetail) {
    const newStatus = order.status === 'delivered' ? 'confirmed' : 'delivered'
    await supabase.from('orders').update({ status: newStatus }).eq('id', order.id)
    setOrderDetails((prev) =>
      (prev ?? []).map((o) => o.id === order.id ? { ...o, status: newStatus } : o)
    )
  }

  function toggleExpanded() {
    const next = !expanded
    setExpanded(next)
    if (next && !orderDetails) loadOrderDetails()
  }

  if (!stats) return <LoadingBlock />

  const portionsPct =
    stats.nextMenuMaxPortions && stats.nextMenuMaxPortions > 0
      ? Math.min(100, Math.round((stats.nextMenuPortions / stats.nextMenuMaxPortions) * 100))
      : null

  const pickupList = (orderDetails ?? []).filter((o) => o.fulfillment === 'pickup')
  const deliveryList = (orderDetails ?? []).filter((o) => o.fulfillment === 'delivery')

  const stockPct = stats.nextMenuIngredientCount > 0
    ? Math.round((stats.nextMenuIngredientCount - stats.lowStock.length) / stats.nextMenuIngredientCount * 100)
    : 100

  const filterLabel: Record<DateFilter, string> = {
    week: 'Esta semana',
    month: 'Este mes',
    custom: 'Personalizado',
  }

  return (
    <div>
      <PageTitle title="¿Qué cocinamos hoy?" />

      {/* Filtro de período */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-navy-400">Período:</span>
        {(['week', 'month', 'custom'] as DateFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setDateFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${
              dateFilter === f ? 'bg-navy-700 text-crema-50' : 'bg-crema-200 text-navy-700 hover:bg-crema-300'
            }`}
          >
            {filterLabel[f]}
          </button>
        ))}
        {dateFilter === 'custom' && (
          <>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-crema-200 px-2 py-1 text-xs text-navy-700"
            />
            <span className="text-xs text-navy-400">—</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-crema-200 px-2 py-1 text-xs text-navy-700"
            />
          </>
        )}
      </div>

      {/* Barra superior */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Link to="/admin/pedidos">
          <Card className="text-center transition-colors hover:border-tomate-300">
            <p className="text-sm font-semibold text-navy-600">Pedidos pendientes</p>
            <p className="mt-1 text-3xl font-bold text-tomate-600">{stats.pendingOrders}</p>
          </Card>
        </Link>
        <Card className="text-center">
          <p className="text-sm font-semibold text-navy-600">Ingresos</p>
          <button
            type="button"
            onClick={() => setShowPeriodRevenue((v) => !v)}
            className="mt-1 flex w-full cursor-pointer items-center justify-center gap-1 text-2xl font-bold text-navy-700 hover:text-navy-900"
          >
            {formatARS(stats.historicalRevenue)}
            {showPeriodRevenue ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {showPeriodRevenue && (
            <div className="mt-3 border-t border-crema-200 pt-3 text-left">
              {periodOrders.length === 0 ? (
                <p className="text-xs text-navy-400">Sin pedidos en el período.</p>
              ) : (
                <ul className="space-y-1">
                  {periodOrders.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-navy-700">#{o.order_number} {o.customer_name}</span>
                      <span className="shrink-0 font-bold text-navy-600">{formatARS(o.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
        <Link to="/admin/platos">
          <Card className="text-center transition-colors hover:border-tomate-300">
            <p className="text-sm font-semibold text-navy-600">Platos en recetario</p>
            <p className="mt-1 text-3xl font-bold text-navy-700">{stats.totalDishes}</p>
          </Card>
        </Link>
        <Link to="/admin/ingredientes">
          <Card className="text-center transition-colors hover:border-tomate-300">
            <p className="text-sm font-semibold text-navy-600">Ingredientes cargados</p>
            <p className="mt-1 text-3xl font-bold text-navy-700">{stats.totalIngredients}</p>
          </Card>
        </Link>
      </div>

      {/* Próximo menú */}
      <div className="mt-4">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-navy-500">Próximo menú</h2>
            {stats.nextMenu && (
              <div className="flex items-center gap-2">
                <Link to="/admin/publicaciones" title="Editar publicación">
                  <Button variant="secondary"><Pencil size={14} /></Button>
                </Link>
                <Link to={`/admin/compras?menu=${stats.nextMenu.id}`} title="Lista de compras">
                  <Button variant="secondary"><BookOpen size={14} /></Button>
                </Link>
                {(stats.nextMenu.status === 'published' || stats.nextMenu.status === 'closed') && (
                  <button
                    type="button"
                    onClick={markCooked}
                    className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-navy-400 hover:text-navy-700"
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded border-2 border-navy-300" />
                    Cocinado
                  </button>
                )}
              </div>
            )}
          </div>
          {stats.nextMenu ? (
            <div className="mt-2">
              {/* Título + fecha + temporizador de cierre en una sola línea */}
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="font-script text-3xl font-bold text-navy-800">{stats.nextMenu.title}</p>
                <span className="flex items-center gap-1 text-sm font-semibold text-navy-500">
                  <Calendar size={13} />
                  {formatDateOnly(stats.nextMenu.delivery_date)}
                </span>
                {countdown !== null && (
                  <span className={`flex items-center gap-1 text-sm font-semibold ${countdown === 'cerrado' ? 'text-navy-400' : 'text-tomate-600'}`}>
                    <Clock size={13} />
                    {countdown === 'cerrado' ? 'Cerrado' : `Cierra en ${countdown}`}
                  </span>
                )}
              </div>

              {/* Barra de porciones */}
              {portionsPct !== null ? (
                <div className="mt-3">
                  <div className="h-2 w-full rounded-full bg-crema-200">
                    <div
                      className={`h-2 rounded-full transition-all ${portionsPct >= 90 ? 'bg-tomate-500' : portionsPct >= 60 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                      style={{ width: `${portionsPct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs font-semibold text-navy-500">
                    {stats.nextMenuPortions}/{stats.nextMenuMaxPortions} porciones reservadas
                  </p>
                </div>
              ) : stats.nextMenuPortions > 0 ? (
                <p className="mt-2 text-xs font-semibold text-navy-500">{stats.nextMenuPortions} porciones reservadas</p>
              ) : null}

              {/* Tiempo de cocción */}
              {stats.nextMenu.cooking_time && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  <Clock size={12} />
                  {formatCookingTime(stats.nextMenu.cooking_time)} de cocción
                </div>
              )}

              {/* Pedidos */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-navy-600">
                <span className="text-xl font-bold text-tomate-600">{stats.nextMenuOrders}</span>
                <span className="text-xl font-semibold">pedidos</span>
                {(stats.nextMenuNewCustomers > 0 || stats.nextMenuReturningCustomers > 0) && (
                  <span>
                    ({[
                      stats.nextMenuNewCustomers > 0 ? `${stats.nextMenuNewCustomers} nuevos` : '',
                      stats.nextMenuReturningCustomers > 0 ? `${stats.nextMenuReturningCustomers} recurrentes` : '',
                    ].filter(Boolean).join(' / ')})
                  </span>
                )}
                {stats.ticketAvg > 0 && (
                  <>
                    <span className="text-navy-300">|</span>
                    <span>ticket promedio <span className="font-bold text-navy-700">{formatARS(stats.ticketAvg)}</span></span>
                  </>
                )}
                {stats.nextMenuOrders > 0 && (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-full bg-navy-100 px-2.5 py-0.5 text-xs font-bold text-navy-700">
                      🏠 {stats.nextMenuPickup} retiran
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-tomate-100 px-2.5 py-0.5 text-xs font-bold text-tomate-800">
                      🛵 {stats.nextMenuDelivery} delivery
                    </span>
                  </>
                )}
              </div>

              {/* Ver detalle */}
              {stats.nextMenuOrders > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={toggleExpanded}
                    className="flex cursor-pointer items-center gap-1 text-sm font-bold text-navy-500 hover:text-navy-700"
                  >
                    {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    {expanded ? 'Ocultar detalle' : 'Ver detalle'}
                  </button>
                </div>
              )}

              {/* Detalle expandible */}
              {expanded && (
                <div className="mt-4 border-t border-crema-200 pt-4">
                  {/* 3 columnas: retiran | delivery | stock */}
                  <div className="grid gap-6 sm:grid-cols-3">
                    {/* Retiran */}
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-navy-500">
                        🏠 Pasan a retirar ({pickupList.length})
                      </p>
                      {orderDetails === null ? (
                        <p className="text-sm text-navy-400">Cargando…</p>
                      ) : pickupList.length === 0 ? (
                        <p className="text-sm text-navy-400">Ninguno.</p>
                      ) : (
                        <ul className="space-y-1">
                          {pickupList.map((o) => (
                            <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                              <span className={`min-w-0 ${o.status === 'delivered' ? 'opacity-40 line-through' : 'text-navy-700'}`}>
                                <span className="font-semibold">{o.customer_name}</span>
                                <span className="ml-2 text-navy-400">{o.customer_phone}</span>
                              </span>
                              <span className="shrink-0 text-xs font-bold text-navy-600">{formatARS(o.total)}</span>
                              <button
                                type="button"
                                title={o.status === 'delivered' ? 'Desmarcar entregado' : 'Marcar como entregado'}
                                onClick={() => markDelivered(o)}
                                className={`shrink-0 cursor-pointer rounded border p-0.5 transition-colors ${
                                  o.status === 'delivered'
                                    ? 'border-emerald-500 bg-emerald-500 text-white hover:border-tomate-500 hover:bg-tomate-500'
                                    : 'border-navy-200 text-navy-300 hover:border-emerald-500 hover:text-emerald-600'
                                }`}
                              >
                                <Check size={11} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Delivery */}
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-navy-500">
                        🛵 Delivery ({deliveryList.length})
                      </p>
                      {orderDetails === null ? (
                        <p className="text-sm text-navy-400">Cargando…</p>
                      ) : deliveryList.length === 0 ? (
                        <p className="text-sm text-navy-400">Ninguno.</p>
                      ) : (
                        <ul className="space-y-2">
                          {deliveryList.map((o) => (
                            <li key={o.id}>
                              <div className="flex items-center justify-between gap-2 text-sm">
                                <span className={`min-w-0 ${o.status === 'delivered' ? 'opacity-40 line-through text-navy-700' : 'text-navy-700'}`}>
                                  <span className="font-semibold">{o.customer_name}</span>
                                  <span className="ml-2 text-navy-400">{o.customer_phone}</span>
                                </span>
                                <span className="shrink-0 text-xs font-bold text-navy-600">{formatARS(o.total)}</span>
                                <button
                                  type="button"
                                  title={o.status === 'delivered' ? 'Desmarcar entregado' : 'Marcar como entregado'}
                                  onClick={() => markDelivered(o)}
                                  className={`shrink-0 cursor-pointer rounded border p-0.5 transition-colors ${
                                    o.status === 'delivered'
                                      ? 'border-emerald-500 bg-emerald-500 text-white hover:border-tomate-500 hover:bg-tomate-500'
                                      : 'border-navy-200 text-navy-300 hover:border-emerald-500 hover:text-emerald-600'
                                  }`}
                                >
                                  <Check size={11} />
                                </button>
                              </div>
                              {o.address && (
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-0.5 flex items-center gap-1 text-xs text-navy-500 hover:text-tomate-600"
                                >
                                  <MapPin size={11} />
                                  {o.address}
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Stock */}
                    {stats.nextMenuItem && (
                      <div>
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-navy-500">Stock para el menú</p>
                        {stats.nextMenuPortions === 0 ? (
                          <p className="text-sm text-navy-400">Sin porciones reservadas aún.</p>
                        ) : (
                          <>
                            {stats.nextMenuIngredientCount > 0 && (
                              <div className="mb-3">
                                <div className="h-2 w-full rounded-full bg-crema-200">
                                  <div
                                    className={`h-2 rounded-full transition-all ${stockPct === 100 ? 'bg-emerald-500' : stockPct >= 50 ? 'bg-amber-400' : 'bg-tomate-500'}`}
                                    style={{ width: `${stockPct}%` }}
                                  />
                                </div>
                                <p className={`mt-1 text-xs font-semibold ${stockPct === 100 ? 'text-emerald-600' : 'text-navy-500'}`}>
                                  {stockPct}% completo
                                </p>
                              </div>
                            )}
                            {stats.lowStock.length === 0 ? (
                              <p className="text-sm font-semibold text-emerald-600">Stock suficiente.</p>
                            ) : (
                              <ul className="space-y-1.5">
                                {stats.lowStock.map((a) => (
                                  <li key={a.name} className="flex items-start gap-1.5">
                                    <AlertTriangle size={13} className="mt-0.5 shrink-0 text-tomate-500" />
                                    <div className="text-xs">
                                      <span className="font-semibold text-navy-700">{a.name}</span>
                                      <span className="text-navy-500">
                                        {' '}— {formatQty(a.stock)}/{formatQty(a.needed)} {a.unit}
                                      </span>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-navy-500">
              No hay menúes publicados próximos.{' '}
              <Link to="/admin/publicaciones" className="font-bold underline">Creá uno</Link>{' '}
              para que tus clientes puedan encargar.
            </p>
          )}
        </Card>
      </div>

      {/* Fila inferior */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Top platos */}
        <Card>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wide text-navy-500">Top platos</h3>
            <span className="text-xs font-bold uppercase tracking-wide text-navy-500">Porciones</span>
          </div>
          {stats.topDishes.length === 0 ? (
            <p className="mt-2 text-sm text-navy-400">Sin pedidos en el período.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {stats.topDishes.map((d, i) => (
                <li key={d.name} className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="w-4 shrink-0 text-xs font-bold text-navy-400">{i + 1}</span>
                    <span className="truncate text-sm font-semibold text-navy-700">{d.name}</span>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-tomate-600">{d.qty}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* Clientes del período */}
        <Card>
          <h3 className="text-sm font-bold uppercase tracking-wide text-navy-500">Clientes</h3>
          {stats.periodTotalCustomers === 0 ? (
            <p className="mt-2 text-sm text-navy-400">Sin pedidos en el período.</p>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-navy-600">
                  <Users size={14} className="text-emerald-500" />
                  Clientes nuevos
                </div>
                <span className="text-2xl font-bold text-emerald-600">{stats.periodNewCustomers}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-navy-600">
                  <Users size={14} className="text-navy-500" />
                  Recurrentes
                </div>
                <span className="text-2xl font-bold text-navy-700">{stats.periodReturningCustomers}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-crema-200">
                <div
                  className="h-2 rounded-full bg-emerald-400"
                  style={{ width: `${Math.round(stats.periodNewCustomers / stats.periodTotalCustomers * 100)}%` }}
                />
              </div>
              <p className="text-xs text-navy-400">
                {Math.round(stats.periodNewCustomers / stats.periodTotalCustomers * 100)}% son clientes nuevos · {stats.periodTotalCustomers} en total
              </p>
            </div>
          )}
        </Card>

        {/* Próximos menúes */}
        <Card>
          <h3 className="text-sm font-bold uppercase tracking-wide text-navy-500">Próximos menúes</h3>
          {stats.upcomingMenus.length === 0 ? (
            <p className="mt-2 text-sm text-navy-400">No hay más menúes programados.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {stats.upcomingMenus.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-navy-700">{m.title}</p>
                    <p className="text-xs text-navy-400">{formatDateOnly(m.delivery_date)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                    m.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-crema-200 text-navy-500'
                  }`}>
                    {m.status === 'published' ? 'publicado' : 'cerrado'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
