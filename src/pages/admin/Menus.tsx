import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Menu, MenuStatus } from '../../lib/types'
import { MENU_STATUS_LABELS } from '../../lib/types'
import { formatDateOnly, formatDateTime } from '../../lib/format'
import { Badge, Button, Card, EmptyState, LoadingBlock, PageTitle } from '../../components/ui'

const STATUS_TONES: Record<MenuStatus, 'gray' | 'green' | 'amber' | 'navy'> = {
  draft: 'gray',
  published: 'green',
  closed: 'amber',
  cooked: 'navy',
}

export function Menus() {
  const [menus, setMenus] = useState<Menu[] | null>(null)

  useEffect(() => {
    supabase
      .from('menus')
      .select('*')
      .order('delivery_date', { ascending: false })
      .then(({ data }) => setMenus((data ?? []) as Menu[]))
  }, [])

  if (!menus) return <LoadingBlock />

  return (
    <div>
      <PageTitle
        title="Menús"
        action={
          <Link to="/admin/menus/nuevo">
            <Button>+ Nuevo menú</Button>
          </Link>
        }
      />

      {menus.length === 0 ? (
        <EmptyState title="Todavía no hay menús">
          Creá tu primer menú para una fecha y publicalo para recibir encargos.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {menus.map((menu) => (
            <Link key={menu.id} to={`/admin/menus/${menu.id}`} className="block">
              <Card className="transition-colors hover:border-tomate-300">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-script text-2xl font-bold text-navy-800">{menu.title}</p>
                    <p className="text-sm text-navy-600">
                      Entrega: {formatDateOnly(menu.delivery_date)}
                      {menu.order_deadline ? ` · Cierre: ${formatDateTime(menu.order_deadline)}` : ' · Hasta agotar stock'}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONES[menu.status]}>{MENU_STATUS_LABELS[menu.status]}</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
