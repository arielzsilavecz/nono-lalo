import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Customer, Menu, MenuItem, MenuStatus } from '../../lib/types'
import { MENU_STATUS_LABELS } from '../../lib/types'
import { formatARS, formatCookingTime, formatDateOnly, formatDateTime, roundDeliveryCost } from '../../lib/format'
import { geocode, haversineKm } from '../../lib/geo'
import { Badge, Button, Card, EmptyState, ErrorText, Field, Input, LoadingBlock, PageTitle, Textarea } from '../../components/ui'
import { ModalOverlay } from '../../components/ModalOverlay'
import { PublicationEditor } from './PublicationEditor'
import { CalendarPlus, Check, Clock, MapPin, UserPlus } from 'lucide-react'

interface DeliverySettings {
  pickupAddress: string
  mapsApiKey: string
  basePrice: number
  pricePerKm: number
  fixedPrice: boolean
}

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

// ─── Modal de reserva ─────────────────────────────────────────────────────────

function ReservationModal({
  menu,
  item,
  onClose,
}: {
  menu: Menu
  item: MenuItem
  onClose: () => void
}) {
  const [customers, setCustomers] = useState<Customer[] | null>(null)
  const [deliverySettings, setDeliverySettings] = useState<DeliverySettings | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Customer | null>(null)

  // formulario nuevo cliente
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')

  // envío
  const [withDelivery, setWithDelivery] = useState(false)
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryCost, setDeliveryCost] = useState<number | null>(null)
  const [deliveryKm, setDeliveryKm] = useState<number | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [cooldown, setCooldown] = useState(false)

  const [qty, setQty] = useState('1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('app_settings').select('*'),
    ]).then(([{ data: custData }, { data: settingsData }]) => {
      setCustomers((custData ?? []) as Customer[])
      const s: Record<string, string> = {}
      for (const row of settingsData ?? []) s[row.key] = row.value
      setDeliverySettings({
        pickupAddress: s['pickup_address'] ?? '',
        mapsApiKey: s['google_maps_api_key'] ?? '',
        basePrice: parseFloat(s['delivery_base_price'] ?? '0') || 0,
        pricePerKm: parseFloat(s['delivery_price_per_km'] ?? '0') || 0,
        fixedPrice: s['delivery_fixed_price'] === 'true',
      })
    })
  }, [])

  useEffect(() => {
    setDeliveryCost(null)
    setDeliveryKm(null)
  }, [withDelivery, deliveryAddress])

  async function calcDeliveryCost() {
    if (!deliverySettings || !deliveryAddress.trim() || cooldown || geocoding) return

    if (deliverySettings.fixedPrice) {
      setDeliveryCost(roundDeliveryCost(deliverySettings.basePrice))
      setDeliveryKm(null)
      return
    }

    if (!deliverySettings.mapsApiKey || !deliverySettings.pickupAddress) return

    setGeocoding(true)
    const [origin, dest] = await Promise.all([
      geocode(deliverySettings.pickupAddress, deliverySettings.mapsApiKey),
      geocode(deliveryAddress.trim() + ', Argentina', deliverySettings.mapsApiKey),
    ])
    setGeocoding(false)
    if (!origin || !dest) return
    const km = haversineKm(origin.lat, origin.lng, dest.lat, dest.lng)
    setDeliveryKm(km)
    setDeliveryCost(roundDeliveryCost(deliverySettings.basePrice + km * deliverySettings.pricePerKm))
    setCooldown(true)
    setTimeout(() => setCooldown(false), 5000)
  }

  const filtered = (customers ?? []).filter((c) => {
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.phone.includes(q)
  })

  function selectCustomer(c: Customer) {
    setSelected(c)
    setShowNew(false)
    setWithDelivery(!!c.address)
    setDeliveryAddress(c.address ?? '')
  }

  function openNew() {
    setSelected(null)
    setShowNew(true)
    setSearch('')
  }

  async function confirm() {
    setError('')
    const qtyNum = parseInt(qty, 10)
    if (!qtyNum || qtyNum < 1) { setError('Cantidad inválida.'); return }

    const available = item.max_portions !== null ? item.max_portions - item.reserved_portions : Infinity
    if (qtyNum > available) {
      setError(`Solo quedan ${available} porciones disponibles.`)
      return
    }

    let customer = selected
    setSaving(true)

    if (withDelivery && !deliveryAddress.trim()) {
      setError('Ingresá la dirección de entrega.')
      setSaving(false)
      return
    }

    if (showNew) {
      if (!newName.trim() || !newPhone.trim()) { setError('Nombre y teléfono son requeridos.'); setSaving(false); return }
      const { data: custRow, error: custErr } = await supabase
        .from('customers')
        .upsert({
          phone: newPhone.trim(),
          name: newName.trim(),
          address: withDelivery ? deliveryAddress.trim() : null,
        }, { onConflict: 'phone' })
        .select('*')
        .maybeSingle()
      if (custErr || !custRow) { setError('No se pudo registrar el cliente.'); setSaving(false); return }
      customer = custRow as Customer
    }

    if (!customer) { setError('Seleccioná un cliente.'); setSaving(false); return }

    const { data: orderRow, error: orderErr } = await supabase
      .from('orders')
      .insert({
        menu_id: menu.id,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone,
        fulfillment: withDelivery ? 'delivery' : 'pickup',
        address: withDelivery ? deliveryAddress.trim() : null,
        notes: '',
        status: 'confirmed',
        total: item.unit_price * qtyNum + (withDelivery && deliveryCost !== null ? Math.round(deliveryCost) : 0),
      })
      .select('id')
      .maybeSingle()
    if (orderErr || !orderRow) { setError('No se pudo crear el pedido.'); setSaving(false); return }

    await supabase.from('order_items').insert({
      order_id: (orderRow as { id: string }).id,
      menu_item_id: item.id,
      dish_name: item.dish_name,
      unit_price: item.unit_price,
      qty: qtyNum,
    })

    await supabase.from('menu_items')
      .update({ reserved_portions: item.reserved_portions + qtyNum })
      .eq('id', item.id)

    setDone(true)
    setSaving(false)
    setTimeout(onClose, 1200)
  }

  const canConfirm = (selected !== null || showNew) && !done

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-script text-3xl font-bold text-navy-800">Nueva reserva</h2>
        <p className="mt-0.5 text-sm text-navy-500">
          {item.dish_name} · {formatARS(item.unit_price)} · {formatDateOnly(menu.delivery_date)}
        </p>
      </div>

      {/* Selección de cliente */}
      {!showNew ? (
        <div className="space-y-2">
          <Input
            placeholder="Buscar cliente por nombre o teléfono…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />

          {customers === null ? (
            <LoadingBlock />
          ) : (
            <div className="max-h-52 overflow-y-auto rounded-xl border border-crema-200 bg-white">
              {filtered.length === 0 && (
                <p className="px-4 py-3 text-sm text-navy-400">Sin resultados.</p>
              )}
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectCustomer(c)}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-crema-50 ${selected?.id === c.id ? 'bg-crema-100 font-semibold text-navy-800' : 'text-navy-700'}`}
                >
                  <span>
                    <span className="font-semibold">{c.name}</span>
                    <span className="ml-2 text-navy-400">{c.phone}</span>
                    {c.address && <span className="ml-2 text-xs text-navy-300">{c.address}</span>}
                  </span>
                  {selected?.id === c.id && <Check size={14} className="shrink-0 text-tomate-500" />}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-1.5 text-sm font-bold text-navy-600 hover:text-navy-800"
          >
            <UserPlus size={14} /> Nuevo cliente
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-crema-200 bg-crema-50 p-4">
          <p className="text-sm font-bold text-navy-700">Nuevo cliente</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="María García" autoFocus />
            </Field>
            <Field label="Teléfono">
              <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="1123456789" />
            </Field>
          </div>
          <button type="button" onClick={() => setShowNew(false)} className="text-sm text-navy-400 hover:text-navy-600">
            ← Volver a la lista
          </button>
        </div>
      )}

      {/* Envío */}
      {(selected !== null || showNew) && (
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-navy-700">
            <input
              type="checkbox"
              checked={withDelivery}
              onChange={(e) => setWithDelivery(e.target.checked)}
              className="h-4 w-4 accent-tomate-500"
            />
            Con envío
          </label>
          {withDelivery && (
            <>
              <Textarea
                rows={2}
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Dirección de entrega…"
              />
              <button
                type="button"
                onClick={calcDeliveryCost}
                disabled={!deliveryAddress.trim() || geocoding || cooldown}
                className="flex items-center gap-1.5 text-sm font-bold text-navy-600 hover:text-navy-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <MapPin size={13} />
                {geocoding ? 'Calculando…' : cooldown ? 'Calculado ✓' : 'Calcular costo de envío'}
              </button>
              {!geocoding && deliveryCost !== null && (
                <p className="flex items-center gap-1.5 text-sm font-semibold text-navy-700">
                  <MapPin size={13} className="text-tomate-500 shrink-0" />
                  {deliveryKm !== null && <span>{deliveryKm.toFixed(1)} km · </span>}
                  Envío: <span className="text-tomate-600">{formatARS(deliveryCost)}</span>
                </p>
              )}
              {!deliverySettings?.mapsApiKey && !deliverySettings?.fixedPrice && (
                <p className="text-xs text-amber-600">Configurá la clave de Google Maps en Ajustes para ver el costo estimado.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Cantidad + confirmar */}
      <div className="flex items-end gap-3">
        <Field label="Porciones">
          <Input
            type="number"
            min="1"
            step="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-24!"
          />
        </Field>
        <Button onClick={confirm} disabled={!canConfirm || saving}>
          {done ? <><Check size={14} /> Reservado</> : saving ? 'Reservando…' : 'Confirmar'}
        </Button>
      </div>

      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}

// ─── Lista de publicaciones ───────────────────────────────────────────────────

export function Publications() {
  const [publications, setPublications] = useState<Publication[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [reserveFor, setReserveFor] = useState<Publication | null>(null)

  async function load() {
    const { data: menuRows } = await supabase
      .from('menus')
      .select('*')
      .order('delivery_date', { ascending: false })

    const menus = (menuRows ?? []) as Menu[]
    if (menus.length === 0) { setPublications([]); return }

    const { data: itemRows } = await supabase
      .from('menu_items')
      .select('*')
      .in('menu_id', menus.map((m) => m.id))

    const itemByMenu = new Map((itemRows ?? []).map((i) => [i.menu_id as string, i as MenuItem]))
    setPublications(menus.map((menu) => ({ menu, item: itemByMenu.get(menu.id) ?? null })))
  }

  useEffect(() => { load() }, [])

  function closeModal() { setOpenId(null); load() }
  function closeReserve() { setReserveFor(null); load() }

  if (!publications) return <LoadingBlock />

  return (
    <div>
      <PageTitle
        title="Publicaciones"
        action={<Button onClick={() => setOpenId('nueva')}>+ Nueva publicación</Button>}
      />

      {publications.length === 0 ? (
        <EmptyState title="Todavía no hay publicaciones">
          Publicá un plato para una fecha y tus clientes ya pueden encargar.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {publications.map(({ menu, item }) => (
            <Card key={menu.id} className="transition-colors hover:border-tomate-300">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setOpenId(menu.id)}
                >
                  <p className="text-sm font-bold uppercase tracking-wide text-tomate-600">
                    {formatDateOnly(menu.delivery_date)}
                  </p>
                  <p className="font-script text-2xl font-bold text-navy-800">
                    {item ? item.dish_name : menu.title}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-navy-500">
                    <span>{menu.order_deadline ? `Cierre: ${formatDateTime(menu.order_deadline)}` : 'Hasta agotar stock'}</span>
                    {menu.cooking_time && (
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                        <Clock size={13} /> {formatCookingTime(menu.cooking_time)}
                      </span>
                    )}
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
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  {item && (menu.status === 'published' || menu.status === 'closed') && (
                    <button
                      type="button"
                      title="Nueva reserva"
                      onClick={() => setReserveFor({ menu, item })}
                      className="cursor-pointer rounded-full p-2 text-navy-400 transition-colors hover:bg-navy-100 hover:text-navy-700"
                    >
                      <CalendarPlus size={18} />
                    </button>
                  )}
                  <Badge tone={STATUS_TONES[menu.status]}>{MENU_STATUS_LABELS[menu.status]}</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {openId && (
        <ModalOverlay onClose={closeModal}>
          <PublicationEditor embeddedId={openId} onClose={closeModal} />
        </ModalOverlay>
      )}

      {reserveFor?.item && (
        <ModalOverlay onClose={closeReserve} maxWidth="max-w-md">
          <ReservationModal
            menu={reserveFor.menu}
            item={reserveFor.item}
            onClose={closeReserve}
          />
        </ModalOverlay>
      )}
    </div>
  )
}
