import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../../lib/supabase'
import type { Fulfillment } from '../../lib/types'
import { formatARS, formatDayMonth, roundDeliveryCost } from '../../lib/format'
import { geocode, haversineKm } from '../../lib/geo'
import { Button, Card, ErrorText, Field, Input, Textarea } from '../../components/ui'
import { MapPin } from 'lucide-react'
import { useCart, type CartItem } from '../../lib/CartContext'

const ERROR_MESSAGES: Record<string, string> = {
  MENU_NOT_AVAILABLE: 'Uno de los menúes ya no está disponible para encargos.',
  DEADLINE_PASSED: 'Los encargos de uno de los menúes se cerraron.',
  ITEM_NOT_FOUND: 'Algún plato ya no está disponible. Actualizá la página.',
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

export function Cart() {
  const navigate = useNavigate()
  const { items, setItemQty, clearCart, subtotal } = useCart()

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [fulfillment, setFulfillment] = useState<Fulfillment>('pickup')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [deliverySettings, setDeliverySettings] = useState<DeliverySettings | null>(null)
  const [deliveryCost, setDeliveryCost] = useState<number | null>(null)
  const [deliveryKm, setDeliveryKm] = useState<number | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [cooldown, setCooldown] = useState(false)

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

  useEffect(() => {
    setDeliveryCost(null)
    setDeliveryKm(null)
  }, [fulfillment, address])

  if (items.length === 0) return <Navigate to="/" replace />

  const allDeliveryFree = items.every((i) => i.deliveryIncluded)
  const total = subtotal + (fulfillment === 'delivery' && !allDeliveryFree && deliveryCost !== null ? deliveryCost : 0)

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

  async function submitOrders(e: React.FormEvent) {
    e.preventDefault()
    if (items.length === 0) return
    setSubmitting(true)
    setError('')

    const byMenu = new Map<string, CartItem[]>()
    for (const item of items) {
      const list = byMenu.get(item.menuId) ?? []
      list.push(item)
      byMenu.set(item.menuId, list)
    }
    const menuEntries = [...byMenu.entries()]

    try {
      const orderResults: {
        orderNumber: number
        menuTitle: string
        deliveryDate: string
        menuItems: CartItem[]
      }[] = []
      let deliveryAssigned = false

      for (const [menuId, menuItems] of menuEntries) {
        const menuAllFree = menuItems.every((i) => i.deliveryIncluded)
        let thisCost = 0
        if (fulfillment === 'delivery' && !allDeliveryFree && !menuAllFree && !deliveryAssigned) {
          thisCost = deliveryCost ?? 0
          deliveryAssigned = true
        }

        const res = await fetch(`${SUPABASE_URL}/functions/v1/place-order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            menu_id: menuId,
            customer_name: customerName,
            customer_phone: customerPhone,
            fulfillment,
            address: fulfillment === 'delivery' ? address : undefined,
            notes,
            items: menuItems.map((i) => ({ menu_item_id: i.menuItemId, qty: i.qty })),
            delivery_cost: thisCost,
          }),
        })
        const body = await res.json()
        if (!res.ok) {
          if (body.error === 'SOLD_OUT') {
            setError(`¡Se agotó "${body.dish}" mientras armabas el pedido! Ajustá las cantidades.`)
          } else {
            setError(ERROR_MESSAGES[body.error as string] ?? 'No pudimos registrar el pedido. Probá de nuevo.')
          }
          return
        }
        orderResults.push({
          orderNumber: body.order_number,
          menuTitle: menuItems[0].menuTitle,
          deliveryDate: menuItems[0].deliveryDate,
          menuItems,
        })
      }

      clearCart()
      navigate('/pedido-confirmado', {
        state: {
          orderNumbers: orderResults.map((r) => r.orderNumber),
          total,
          fulfillment,
          entries: orderResults.map((r) => ({
            menuTitle: r.menuTitle,
            deliveryDate: r.deliveryDate,
            items: r.menuItems.map((i) => ({ name: i.dishName, qty: i.qty, price: i.unitPrice })),
          })),
        },
      })
    } catch {
      setError('No pudimos conectar con la cocina. Revisá tu conexión y probá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-script text-5xl font-bold text-navy-800">Tu pedido</h1>

      <Card className="mt-5">
        <ul className="divide-y divide-crema-100">
          {items.map((item) => {
            const remaining = item.maxPortions !== null
              ? Math.max(0, item.maxPortions - item.reservedPortions)
              : null
            const max = remaining === null ? 50 : remaining
            const { qty, ...meta } = item
            return (
              <li key={item.menuItemId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy-800">{item.dishName}</p>
                  <p className="text-xs text-navy-500">
                    {item.menuTitle} · {formatDayMonth(item.deliveryDate)}
                  </p>
                  {item.deliveryIncluded && (
                    <span className="text-xs font-bold text-emerald-700">Envío gratis</span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setItemQty(meta, qty - 1)}
                    className="h-8 w-8 cursor-pointer rounded-full bg-crema-200 text-lg font-bold text-navy-800 hover:bg-crema-300"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-bold">{qty}</span>
                  <button
                    type="button"
                    disabled={qty >= max}
                    onClick={() => setItemQty(meta, qty + 1)}
                    className="h-8 w-8 cursor-pointer rounded-full bg-tomate-500 text-lg font-bold text-white hover:bg-tomate-600 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
                <span className="w-20 shrink-0 text-right font-bold text-navy-900">
                  {formatARS(item.unitPrice * qty)}
                </span>
              </li>
            )
          })}
        </ul>

        <div className="mt-4 border-t border-crema-200 pt-3 space-y-1 text-sm text-navy-700">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="font-bold">{formatARS(subtotal)}</span>
          </div>
          {fulfillment === 'delivery' && (
            <div className="flex justify-between">
              <span className="flex items-center gap-1"><MapPin size={12} /> Envío</span>
              <span className="font-bold">
                {allDeliveryFree ? 'Sin cargo' : deliveryCost !== null ? formatARS(deliveryCost) : '–'}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-crema-200 pt-2 text-base font-bold text-navy-900">
            <span>Total</span>
            <span>{formatARS(total)}</span>
          </div>
        </div>
      </Card>

      <form onSubmit={submitOrders} className="mt-5">
        <Card>
          <h2 className="font-script text-3xl font-bold text-navy-800">Tus datos</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
              {allDeliveryFree ? (
                <p className="flex items-center gap-1 text-sm font-bold text-emerald-700">
                  <MapPin size={13} /> Envío sin cargo para todos los productos del pedido
                </p>
              ) : (
                <div className="flex items-center gap-1.5 text-sm font-bold text-navy-600">
                  <button
                    type="button"
                    onClick={calcDeliveryCost}
                    disabled={!address.trim() || geocoding || cooldown}
                    className="flex items-center gap-1 hover:text-navy-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <MapPin size={13} />
                    {geocoding ? 'Calculando…' : 'Calcular costo de envío'}
                  </button>
                  {!geocoding && deliveryCost !== null && (
                    <>
                      <span className="text-navy-400">›</span>
                      <span className="text-tomate-600">{formatARS(deliveryCost)}</span>
                      {deliveryKm !== null && (
                        <span className="font-semibold text-navy-500">
                          ({deliveryKm.toFixed(1).replace('.', ',')} km)
                        </span>
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
            disabled={submitting}
            className="mt-5 w-full py-3 text-base"
          >
            {submitting ? 'Enviando…' : `Confirmar pedido · ${formatARS(total)}`}
          </Button>
          <p className="mt-2 text-center text-xs text-navy-500">
            Es una reserva: pagás al recibir tu pedido, en efectivo o transferencia.
          </p>
        </Card>
      </form>

      <div className="mt-5 text-center">
        <Link to="/" className="text-sm font-bold text-navy-600 underline hover:text-navy-800">
          ← Volver a los menúes
        </Link>
      </div>
    </div>
  )
}
