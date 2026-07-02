import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../../lib/supabase'
import type { Fulfillment, Menu, MenuItem } from '../../lib/types'
import { formatARS, formatDateOnly, formatDateTime, roundDeliveryCost } from '../../lib/format'
import { imageFitStyle } from '../../lib/imageStyle'
import { geocode, haversineKm } from '../../lib/geo'
import { Button, Card, EmptyState, ErrorText, Field, Input, LoadingBlock, Textarea } from '../../components/ui'
import { MapPin } from 'lucide-react'

const ERROR_MESSAGES: Record<string, string> = {
  MENU_NOT_AVAILABLE: 'Este menú ya no está disponible para encargos.',
  DEADLINE_PASSED: 'Uy, justo se cerraron los encargos de este menú.',
  ITEM_NOT_FOUND: 'Alguno de los platos ya no está disponible. Actualizá la página.',
  ADDRESS_REQUIRED: 'Necesitamos tu dirección para el delivery.',
  INVALID_PHONE: 'Revisá el teléfono: necesitamos un número para coordinar la entrega.',
}

interface DeliverySettings {
  pickupAddress: string
  mapsApiKey: string
  basePrice: number
  pricePerKm: number
  fixedPrice: boolean
}

export function PublicMenu() {
  const { menuId } = useParams()
  const navigate = useNavigate()

  const [menu, setMenu] = useState<Menu | null>(null)
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [fulfillment, setFulfillment] = useState<Fulfillment>('pickup')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // envío
  const [deliverySettings, setDeliverySettings] = useState<DeliverySettings | null>(null)
  const [deliveryCost, setDeliveryCost] = useState<number | null>(null)
  const [deliveryKm, setDeliveryKm] = useState<number | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [cooldown, setCooldown] = useState(false)

  const load = useCallback(async () => {
    if (!menuId) return
    const [{ data: menuRow }, { data: itemRows }] = await Promise.all([
      supabase.from('menus').select('*').eq('id', menuId).maybeSingle(),
      supabase.from('menu_items').select('*').eq('menu_id', menuId).order('dish_name'),
    ])
    setMenu((menuRow as Menu) ?? null)
    setItems((itemRows ?? []) as MenuItem[])
    setLoading(false)
  }, [menuId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    supabase.from('app_settings').select('*').then(({ data }) => {
      const s: Record<string, string> = {}
      for (const row of data ?? []) s[row.key] = row.value
      setDeliverySettings({
        pickupAddress: s['pickup_address'] ?? '',
        mapsApiKey: s['google_maps_api_key'] ?? '',
        basePrice: parseFloat(s['delivery_base_price'] ?? '0') || 0,
        pricePerKm: parseFloat(s['delivery_price_per_km'] ?? '0') || 0,
        fixedPrice: s['delivery_fixed_price'] === 'true',
      })
    })
  }, [])

  // resetear cuando cambia la dirección o el tipo de entrega
  useEffect(() => {
    setDeliveryCost(null)
    setDeliveryKm(null)
  }, [fulfillment, address])

  async function calcDeliveryCost() {
    if (!deliverySettings || !address.trim() || cooldown || geocoding) return

    if (deliverySettings.fixedPrice) {
      setDeliveryCost(roundDeliveryCost(deliverySettings.basePrice))
      return
    }

    if (!deliverySettings.mapsApiKey || !deliverySettings.pickupAddress) return

    setGeocoding(true)
    const [origin, dest] = await Promise.all([
      geocode(deliverySettings.pickupAddress, deliverySettings.mapsApiKey),
      geocode(address.trim() + ', Argentina', deliverySettings.mapsApiKey),
    ])
    setGeocoding(false)
    if (!origin || !dest) return
    const km = haversineKm(origin.lat, origin.lng, dest.lat, dest.lng)
    setDeliveryKm(km)
    setDeliveryCost(roundDeliveryCost(deliverySettings.basePrice + km * deliverySettings.pricePerKm))
    setCooldown(true)
    setTimeout(() => setCooldown(false), 5000)
  }

  const open = menu !== null && menu.status === 'published' &&
    (menu.order_deadline === null || Date.parse(menu.order_deadline) > Date.now())

  const cart = useMemo(
    () =>
      items
        .map((item) => ({ item, qty: quantities[item.id] ?? 0 }))
        .filter((entry) => entry.qty > 0),
    [items, quantities],
  )
  const deliveryFree = menu?.delivery_included ?? false
  const subtotal = cart.reduce((sum, { item, qty }) => sum + item.unit_price * qty, 0)
  const total = subtotal + (fulfillment === 'delivery' && !deliveryFree && deliveryCost !== null ? deliveryCost : 0)

  function remainingFor(item: MenuItem): number | null {
    if (item.max_portions === null) return null
    return Math.max(0, item.max_portions - item.reserved_portions)
  }

  function setQty(item: MenuItem, qty: number) {
    const remaining = remainingFor(item)
    const max = remaining === null ? 50 : Math.min(50, remaining)
    setQuantities((prev) => ({ ...prev, [item.id]: Math.max(0, Math.min(max, qty)) }))
  }

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault()
    if (!menu || cart.length === 0) return
    setSubmitting(true)
    setError('')

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/place-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          menu_id: menu.id,
          customer_name: customerName,
          customer_phone: customerPhone,
          fulfillment,
          address: fulfillment === 'delivery' ? address : undefined,
          notes,
          items: cart.map(({ item, qty }) => ({ menu_item_id: item.id, qty })),
          delivery_cost: fulfillment === 'delivery' && !deliveryFree && deliveryCost !== null ? deliveryCost : 0,
        }),
      })
      const body = await response.json()

      if (!response.ok) {
        if (body.error === 'SOLD_OUT') {
          setError(`¡Se agotó "${body.dish}" mientras armabas el pedido! Ajustá las cantidades.`)
          await load()
        } else {
          setError(ERROR_MESSAGES[body.error as string] ?? 'No pudimos registrar el pedido. Probá de nuevo.')
        }
        return
      }

      navigate('/pedido-confirmado', {
        state: {
          orderNumbers: [body.order_number],
          total: body.total,
          fulfillment,
          entries: [{
            menuTitle: menu.title,
            deliveryDate: menu.delivery_date,
            items: cart.map(({ item, qty }) => ({ name: item.dish_name, qty, price: item.unit_price })),
          }],
        },
      })
    } catch {
      setError('No pudimos conectar con la cocina. Revisá tu conexión y probá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingBlock />

  if (!menu) {
    return <EmptyState title="Menú no encontrado">Volvé al inicio para ver los menúes disponibles.</EmptyState>
  }

  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-wide text-tomate-600">
        Entrega: {formatDateOnly(menu.delivery_date)}
      </p>
      <h1 className="mt-1 font-script text-5xl font-bold text-navy-800">{menu.title}</h1>
      {menu.notes && <p className="mt-2 text-navy-700">{menu.notes}</p>}
      <p className="mt-2 text-sm text-navy-500">
        {open
          ? (menu.order_deadline ? `Encargá hasta: ${formatDateTime(menu.order_deadline)}` : 'Disponible hasta agotar stock')
          : 'Los encargos de este menú están cerrados.'}
      </p>

      <div className="mt-6 space-y-3">
        {items.map((item) => {
          const remaining = remainingFor(item)
          const soldOut = remaining !== null && remaining <= 0
          const qty = quantities[item.id] ?? 0
          return (
            <Card key={item.id} className={`overflow-hidden p-0! ${soldOut ? 'opacity-60' : ''}`}>
              {item.image_url && (
                <img
                  src={item.image_url}
                  alt={item.dish_name}
                  className="aspect-2/1 w-full object-cover"
                  style={imageFitStyle(item.image_position, item.image_zoom)}
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold text-navy-800">{item.dish_name}</h3>
                  {item.dish_description && (
                    <p className="text-sm text-navy-600">{item.dish_description}</p>
                  )}
                  <p className="mt-1 font-bold text-tomate-600">
                    {formatARS(item.unit_price)} <span className="text-xs font-semibold text-navy-500">por porción</span>
                  </p>
                  {remaining !== null && (
                    <p className="text-xs font-semibold text-navy-500">
                      {soldOut ? '¡Agotado!' : `Quedan ${remaining} porciones`}
                    </p>
                  )}
                </div>
                {open && !soldOut && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQty(item, qty - 1)}
                      className="h-9 w-9 cursor-pointer rounded-full bg-crema-200 text-lg font-bold text-navy-800 hover:bg-crema-300"
                      aria-label={`Quitar una porción de ${item.dish_name}`}
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-lg font-bold">{qty}</span>
                    <button
                      type="button"
                      onClick={() => setQty(item, qty + 1)}
                      className="h-9 w-9 cursor-pointer rounded-full bg-tomate-500 text-lg font-bold text-white hover:bg-tomate-600"
                      aria-label={`Agregar una porción de ${item.dish_name}`}
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {open && (
        <form onSubmit={submitOrder} className="mt-8">
          <Card>
            <h2 className="font-script text-3xl font-bold text-navy-800">Tu encargo</h2>

            {cart.length === 0 ? (
              <p className="mt-2 text-sm text-navy-500">Elegí cuántas porciones querés de cada plato.</p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm text-navy-700">
                {cart.map(({ item, qty }) => (
                  <li key={item.id} className="flex justify-between">
                    <span>{qty} × {item.dish_name}</span>
                    <span className="font-bold">{formatARS(item.unit_price * qty)}</span>
                  </li>
                ))}
                {fulfillment === 'delivery' && (
                  <li className="flex justify-between text-navy-600">
                    <span className="flex items-center gap-1"><MapPin size={12} /> Envío</span>
                    <span className="font-bold">
                      {deliveryFree ? 'Sin cargo' : deliveryCost !== null ? formatARS(deliveryCost) : '–'}
                    </span>
                  </li>
                )}
                <li className="flex justify-between border-t border-crema-200 pt-2 text-base font-bold text-navy-900">
                  <span>Total</span>
                  <span>{formatARS(total)}</span>
                </li>
              </ul>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Tu nombre">
                <Input
                  required
                  maxLength={80}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ej: María González"
                />
              </Field>
              <Field label="Tu teléfono (WhatsApp)" hint="Con código de área, sin 0 ni 15. Ej: 3516812128">
                <Input
                  required
                  type="tel"
                  maxLength={20}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Ej: 3516812128"
                />
              </Field>
            </div>

            <div className="mt-4">
              <span className="mb-1 block text-sm font-bold text-navy-700">¿Cómo lo recibís?</span>
              <div className="flex gap-2">
                {(['pickup', 'delivery'] as Fulfillment[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setFulfillment(option)}
                    className={`cursor-pointer rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                      fulfillment === option
                        ? 'bg-navy-700 text-crema-50'
                        : 'bg-crema-200 text-navy-700 hover:bg-crema-300'
                    }`}
                  >
                    {option === 'pickup' ? 'Paso a retirar' : 'Delivery'}
                  </button>
                ))}
              </div>
            </div>

            {fulfillment === 'delivery' && (
              <div className="mt-4 space-y-2">
                <Field label="Dirección de entrega">
                  <Input
                    required
                    maxLength={200}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Calle 123, Barrio"
                  />
                </Field>
                {deliveryFree ? (
                  <p className="flex items-center gap-1 text-sm font-bold text-emerald-700">
                    <MapPin size={13} /> Envío sin cargo para este menú
                  </p>
                ) : (
                  <div className="flex items-center gap-1.5 text-sm font-bold text-navy-600">
                    <button
                      type="button"
                      onClick={calcDeliveryCost}
                      disabled={!address.trim() || geocoding || cooldown}
                      className="flex items-center gap-1 hover:text-navy-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <MapPin size={13} />
                      {geocoding ? 'Calculando…' : 'Calcular costo de envío'}
                    </button>
                    {!geocoding && deliveryCost !== null && (
                      <>
                        <span className="text-navy-400">›</span>
                        <span className="text-tomate-600">{formatARS(deliveryCost)}</span>
                        {deliveryKm !== null && (
                          <span className="font-semibold text-navy-500">({deliveryKm.toFixed(1).replace('.', ',')} km)</span>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="mt-4">
              <Field label="Aclaraciones (opcional)">
                <Textarea
                  rows={2}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej: sin queso, entregar después de las 20hs…"
                />
              </Field>
            </div>

            {error && <div className="mt-4"><ErrorText>{error}</ErrorText></div>}

            <Button
              type="submit"
              disabled={cart.length === 0 || submitting}
              className="mt-5 w-full py-3 text-base"
            >
              {submitting ? 'Enviando…' : `Encargar ${total > 0 ? formatARS(total) : ''}`}
            </Button>
            <p className="mt-2 text-center text-xs text-navy-500">
              Es una reserva: pagás al recibir tu pedido, en efectivo o transferencia.
            </p>
          </Card>
        </form>
      )}
    </div>
  )
}
