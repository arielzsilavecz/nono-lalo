import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Menu } from '../../lib/types'
import { formatARS, formatDateOnly, formatDateTime, todayDateValue } from '../../lib/format'
import { Button, Card, LoadingBlock, PageTitle } from '../../components/ui'

interface Stats {
  nextMenu: Menu | null
  nextMenuOrders: number
  nextMenuRevenue: number
  pendingOrders: number
  activeDishes: number
  ingredients: number
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
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
      let nextMenuOrders = 0
      let nextMenuRevenue = 0
      if (nextMenu) {
        const { data: orderRows } = await supabase
          .from('orders')
          .select('total, status')
          .eq('menu_id', nextMenu.id)
          .neq('status', 'cancelled')
        nextMenuOrders = orderRows?.length ?? 0
        nextMenuRevenue = (orderRows ?? []).reduce((sum, o) => sum + Number(o.total), 0)
      }

      const [pending, dishes, ingredients] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('dishes').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('ingredients').select('id', { count: 'exact', head: true }),
      ])

      setStats({
        nextMenu,
        nextMenuOrders,
        nextMenuRevenue,
        pendingOrders: pending.count ?? 0,
        activeDishes: dishes.count ?? 0,
        ingredients: ingredients.count ?? 0,
      })
    }
    load()
  }, [])

  if (!stats) return <LoadingBlock />

  return (
    <div>
      <PageTitle
        title="¿Qué cocinamos hoy?"
        action={
          <Link to="/admin/publicaciones/nueva">
            <Button>+ Nuevo menú</Button>
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
                <Link to={`/admin/publicaciones/${stats.nextMenu.id}`}>
                  <Button variant="secondary">Editar publicación</Button>
                </Link>
                <Link to={`/admin/compras?menu=${stats.nextMenu.id}`}>
                  <Button variant="ghost">Lista de compras</Button>
                </Link>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-navy-500">
              No hay menús publicados próximos.{' '}
              <Link to="/admin/menus/nuevo" className="font-bold underline">
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
