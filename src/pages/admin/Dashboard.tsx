import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { DishIngredient, Ingredient, Menu, MenuItem } from '../../lib/types'
import { formatARS, formatCookingTime, formatDateOnly, formatDateTime, todayDateValue } from '../../lib/format'
import { Button, Card, LoadingBlock, PageTitle } from '../../components/ui'
import { Clock, Pencil } from 'lucide-react'

interface Stats {
  nextMenu: Menu | null
  nextMenuItem: MenuItem | null
  nextMenuOrders: number
  nextMenuRevenue: number
  nextMenuPortions: number
  pendingOrders: number
  activeDishes: number
  ingredients: number
}


export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)

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
    let nextMenuOrders = 0
    let nextMenuRevenue = 0
    let nextMenuPortions = 0

    if (nextMenu) {
      const { data: miRow } = await supabase
        .from('menu_items')
        .select('*')
        .eq('menu_id', nextMenu.id)
        .maybeSingle()
      nextMenuItem = (miRow as MenuItem) ?? null

      const { data: orderRows } = await supabase
        .from('orders')
        .select('total, status')
        .eq('menu_id', nextMenu.id)
        .neq('status', 'cancelled')
      nextMenuOrders = orderRows?.length ?? 0
      nextMenuRevenue = (orderRows ?? []).reduce((sum, o) => sum + Number(o.total), 0)

      if (nextMenuItem) {
        nextMenuPortions = nextMenuItem.reserved_portions
      }
    }

    const [pending, dishes, ingredients] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('dishes').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('ingredients').select('id', { count: 'exact', head: true }),
    ])

    setStats({
      nextMenu,
      nextMenuItem,
      nextMenuOrders,
      nextMenuRevenue,
      nextMenuPortions,
      pendingOrders: pending.count ?? 0,
      activeDishes: dishes.count ?? 0,
      ingredients: ingredients.count ?? 0,
    })
  }

  useEffect(() => { load() }, [])

  async function markCooked() {
    if (!stats?.nextMenu || !stats?.nextMenuItem) return
    const menuId = stats.nextMenu.id
    const mi = stats.nextMenuItem

    const { data: recipeRows } = await supabase
      .from('dish_ingredients').select('*').eq('dish_id', mi.dish_id)
    const { data: ingRows } = await supabase.from('ingredients').select('*')
    const ingById = new Map(((ingRows ?? []) as Ingredient[]).map((i) => [i.id, i]))

    const totalPortions = stats.nextMenuPortions
    const usage = ((recipeRows ?? []) as DishIngredient[])
      .map((r) => ({ ingredient_id: r.ingredient_id, qty: totalPortions * r.qty_per_portion, ing: ingById.get(r.ingredient_id) }))
      .filter((u) => u.qty > 0)

    const summary = usage.map((u) => `• ${u.ing?.name ?? '?'}: ${u.qty.toFixed(2)} ${u.ing?.unit ?? ''}`).join('\n')
    const msg = usage.length > 0
      ? `Se va a descontar de la despensa:\n${summary}\n\n¿Marcar como cocinado?`
      : '¿Marcar esta publicación como cocinada?'
    if (!window.confirm(msg)) return

    if (usage.length > 0) {
      await supabase.from('pantry_movements').insert(
        usage.map((u) => ({
          ingredient_id: u.ingredient_id,
          qty: -u.qty,
          reason: 'cooking',
          menu_id: menuId,
          notes: `Cocina: ${mi.dish_name}`,
        }))
      )
    }
    await supabase.from('menus').update({ status: 'cooked' }).eq('id', menuId)
    load()
  }

  if (!stats) return <LoadingBlock />

  return (
    <div>
      <PageTitle
        title="¿Qué cocinamos hoy?"
        action={
          <Link to="/admin/publicaciones">
            <Button>+ Nueva publicación</Button>
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-navy-500">Próximo menú</h2>
          {stats.nextMenu ? (
            <div className="mt-2">
              <p className="font-script text-3xl font-bold text-navy-800">{stats.nextMenu.title}</p>
              <p className="mt-1 text-sm text-navy-600">
                Entrega: <strong>{formatDateOnly(stats.nextMenu.delivery_date)}</strong>
              </p>
              <p className="text-sm text-navy-600">
                {stats.nextMenu.order_deadline
                  ? `Cierre de encargos: ${formatDateTime(stats.nextMenu.order_deadline)}`
                  : 'Disponible hasta agotar stock'}
              </p>

              {stats.nextMenu.cooking_time && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                  <Clock size={15} />
                  Tiempo de cocción estimado: <strong>{formatCookingTime(stats.nextMenu.cooking_time)}</strong>
                  {stats.nextMenuPortions > 0 && (
                    <span className="text-amber-600">para {stats.nextMenuPortions} porciones</span>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-6">
                <div>
                  <p className="text-3xl font-bold text-tomate-600">{stats.nextMenuOrders}</p>
                  <p className="text-xs font-semibold text-navy-500">pedidos</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-tomate-600">{formatARS(stats.nextMenuRevenue)}</p>
                  <p className="text-xs font-semibold text-navy-500">ingresos estimados</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/admin/publicaciones">
                  <Button variant="secondary" title="Editar publicación"><Pencil size={14} /></Button>
                </Link>
                <Link to={`/admin/compras?menu=${stats.nextMenu.id}`}>
                  <Button variant="ghost">Lista de compras</Button>
                </Link>
                {(stats.nextMenu.status === 'published' || stats.nextMenu.status === 'closed') && (
                  <Button variant="ghost" onClick={markCooked}>
                    Marcar como cocinado
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-navy-500">
              No hay menús publicados próximos.{' '}
              <Link to="/admin/publicaciones" className="font-bold underline">
                Creá uno
              </Link>{' '}
              para que tus clientes puedan encargar.
            </p>
          )}
        </Card>

        <div className="grid content-start gap-4">
          <Link to="/admin/pedidos">
            <Card className="transition-colors hover:border-tomate-300">
              <p className="text-3xl font-bold text-tomate-600">{stats.pendingOrders}</p>
              <p className="text-sm font-semibold text-navy-600">pedidos pendientes de confirmar</p>
            </Card>
          </Link>
          <Link to="/admin/platos">
            <Card className="transition-colors hover:border-tomate-300">
              <p className="text-3xl font-bold text-navy-700">{stats.activeDishes}</p>
              <p className="text-sm font-semibold text-navy-600">platos activos en el recetario</p>
            </Card>
          </Link>
          <Link to="/admin/ingredientes">
            <Card className="transition-colors hover:border-tomate-300">
              <p className="text-3xl font-bold text-navy-700">{stats.ingredients}</p>
              <p className="text-sm font-semibold text-navy-600">ingredientes cargados</p>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  )
}
