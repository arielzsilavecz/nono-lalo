import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Menu, MenuItem, MenuStatus } from '../../lib/types'
import { MENU_STATUS_LABELS } from '../../lib/types'
import { formatARS, formatDateOnly, formatDateTime } from '../../lib/format'
import { Badge, Button, Card, EmptyState, LoadingBlock, PageTitle } from '../../components/ui'

const STATUS_TONES: Record<MenuStatus, 'gray' | 'green' | 'amber' | 'navy'> = {
  draft: 'gray',
  published: 'green',
  closed: 'amber',
  cooked: 'navy',
}

interface Publication {
  menu: Menu
  item: MenuItem | null
}

export function Publications() {
  const [publications, setPublications] = useState<Publication[] | null>(null)

  useEffect(() => {
    async function load() {
      const { data: menuRows } = await supabase
        .from('menus')
        .select('*')
        .order('delivery_date', { ascending: false })

      const menus = (menuRows ?? []) as Menu[]
      if (menus.length === 0) {
        setPublications([])
        return
      }

      const { data: itemRows } = await supabase
        .from('menu_items')
        .select('*')
        .in('menu_id', menus.map((m) => m.id))

      const itemByMenu = new Map((itemRows ?? []).map((i) => [i.menu_id as string, i as MenuItem]))
      setPublications(menus.map((menu) => ({ menu, item: itemByMenu.get(menu.id) ?? null })))
    }
    load()
  }, [])

  if (!publications) return <LoadingBlock />

  return (
    <div>
      <PageTitle
        title="Publicaciones"
        action={
          <Link to="/admin/publicaciones/nueva">
            <Button>+ Nueva publicación</Button>
          </Link>
        }
      />

      {publications.length === 0 ? (
        <EmptyState title="Todavía no hay publicaciones">
          Publicá un plato para una fecha y tus clientes ya pueden encargar.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {publications.map(({ menu, item }) => (
            <Link key={menu.id} to={`/admin/publicaciones/${menu.id}`} className="block">
              <Card className="transition-colors hover:border-tomate-300">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wide text-tomate-600">
                      {formatDateOnly(menu.delivery_date)}
                    </p>
                    <p className="font-script text-2xl font-bold text-navy-800">
                      {item ? item.dish_name : menu.title}
                    </p>
                    <p className="text-sm text-navy-500">
                      {menu.order_deadline ? `Cierre: ${formatDateTime(menu.order_deadline)}` : 'Hasta agotar stock'}
                      {item && (
                        <>
                          {' · '}
                          <span className="font-semibold text-navy-700">{formatARS(item.unit_price)}</span>
                          {item.max_portions !== null && (
                            <> · {item.reserved_portions}/{item.max_portions} porciones</>
                          )}
                          {item.max_portions === null && item.reserved_portions > 0 && (
                            <> · {item.reserved_portions} encargadas</>
                          )}
                        </>
                      )}
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
