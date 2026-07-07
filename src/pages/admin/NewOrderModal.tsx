import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Customer, Fulfillment, Menu, MenuItem } from '../../lib/types'
import { MENU_STATUS_LABELS } from '../../lib/types'
import { formatARS, formatDayMonth } from '../../lib/format'
import { Button, ErrorText, Field, Input, Modal, Select, Textarea } from '../../components/ui'

interface Props {
  onClose: () => void
}

const ERROR_MESSAGES: Record<string, string> = {
  MENU_NOT_AVAILABLE: 'Ese menú ya no existe.',
  ITEM_NOT_FOUND: 'Alguno de los platos ya no está disponible. Volvé a elegir el menú.',
  ADDRESS_REQUIRED: 'Cargá una dirección para el delivery.',
  INVALID_CUSTOMER: 'Cargá el nombre y teléfono del cliente.',
  INVALID_FULFILLMENT: 'Elegí retiro o delivery.',
  EMPTY_ORDER: 'Elegí al menos un plato.',
  INVALID_QTY: 'Alguna cantidad no es válida.',
}

export function NewOrderModal({ onClose }: Props) {
  const [menus, setMenus] = useState<Menu[]>([])
  const [menuId, setMenuId] = useState('')
  const [items, setItems] = useState<MenuItem[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [loadingItems, setLoadingItems] = useState(false)

  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [fulfillment, setFulfillment] = useState<Fulfillment>('pickup')
  const [address, setAddress] = useState('')
  const [deliveryCost, setDeliveryCost] = useState('')
  const [notes, setNotes] = useState('')

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('menus').select('*').order('delivery_date', { ascending: false }).limit(30)
      .then(({ data }) => {
        const list = (data ?? []) as Menu[]
        setMenus(list)
        if (list.length > 0) setMenuId(list[0].id)
      })
  }, [])

  useEffect(() => {
    if (!menuId) { setItems([]); return }
    setLoadingItems(true)
    setQuantities({})
    supabase.from('menu_items').select('*').eq('menu_id', menuId).order('dish_name')
      .then(({ data }) => {
        setItems((data ?? []) as MenuItem[])
        setLoadingItems(false)
      })
  }, [menuId])

  useEffect(() => {
    if (customerSearch.trim().length < 2) { setCustomerResults([]); return }
    const q = customerSearch.trim()
    const handle = setTimeout(() => {
      supabase.from('customers').select('*')
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
        .order('name').limit(6)
        .then(({ data }) => setCustomerResults((data ?? []) as Customer[]))
    }, 250)
    return () => clearTimeout(handle)
  }, [customerSearch])

  function pickCustomer(c: Customer) {
    setCustomerName(c.name)
    setCustomerPhone(c.phone)
    if (c.address) setAddress(c.address)
    setCustomerSearch('')
    setCustomerResults([])
  }

  function remainingFor(item: MenuItem): number | null {
    if (item.max_portions === null) return null
    return Math.max(0, item.max_portions - item.reserved_portions)
  }

  function setQty(item: MenuItem, qty: number) {
    const remaining = remainingFor(item)
    const max = remaining === null ? 100 : Math.min(100, remaining)
    setQuantities((prev) => ({ ...prev, [item.id]: Math.max(0, Math.min(max, qty)) }))
  }

  const cart = items
    .map((item) => ({ item, qty: quantities[item.id] ?? 0 }))
    .filter((entry) => entry.qty > 0)
  const subtotal = cart.reduce((sum, { item, qty }) => sum + item.unit_price * qty, 0)
  const total = subtotal + (fulfillment === 'delivery' ? Number(deliveryCost) || 0 : 0)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!menuId) { setError('Elegí un menú.'); return }
    if (cart.length === 0) { setError('Elegí al menos un plato.'); return }
    if (!customerName.trim() || !customerPhone.trim()) { setError('Cargá el nombre y teléfono del cliente.'); return }
    if (fulfillment === 'delivery' && !address.trim()) { setError('Cargá una dirección para el delivery.'); return }

    setSaving(true)
    const { error: rpcError } = await supabase.rpc('place_order_admin', {
      p_menu_id: menuId,
      p_customer_name: customerName.trim(),
      p_customer_phone: customerPhone.trim(),
      p_fulfillment: fulfillment,
      p_address: fulfillment === 'delivery' ? address.trim() : null,
      p_notes: notes.trim(),
      p_items: cart.map(({ item, qty }) => ({ menu_item_id: item.id, qty })),
      p_delivery_cost: fulfillment === 'delivery' ? (Number(deliveryCost) || 0) : 0,
    })

    if (rpcError) {
      const message = rpcError.message ?? ''
      if (message.startsWith('SOLD_OUT')) {
        setError(`Ya no queda stock de "${message.slice('SOLD_OUT:'.length)}".`)
      } else {
        const code = Object.keys(ERROR_MESSAGES).find((k) => message.startsWith(k))
        setError((code && ERROR_MESSAGES[code]) ?? 'No se pudo registrar el pedido.')
      }
      setSaving(false)
      return
    }

    setSaving(false)
    onClose()
  }

  return (
    <Modal title="Nuevo pedido" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Menú">
          <Select value={menuId} onChange={(e) => setMenuId(e.target.value)}>
            {menus.map((menu) => (
              <option key={menu.id} value={menu.id}>
                {menu.title} · {formatDayMonth(menu.delivery_date)} · {MENU_STATUS_LABELS[menu.status]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-crema-200 p-2">
          {loadingItems ? (
            <p className="py-4 text-center text-sm text-navy-400">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="py-4 text-center text-sm text-navy-400">Este menú no tiene platos.</p>
          ) : (
            items.map((item) => {
              const remaining = remainingFor(item)
              const soldOut = remaining !== null && remaining <= 0
              const qty = quantities[item.id] ?? 0
              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 ${soldOut ? 'opacity-50' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy-800">{item.dish_name}</p>
                    <p className="text-xs text-navy-500">
                      {formatARS(item.unit_price)}
                      {remaining !== null && ` · quedan ${remaining}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQty(item, qty - 1)}
                      disabled={qty === 0}
                      className="h-7 w-7 cursor-pointer rounded-full bg-crema-200 text-base font-bold text-navy-800 hover:bg-crema-300 disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-bold">{qty}</span>
                    <button
                      type="button"
                      onClick={() => setQty(item, qty + 1)}
                      disabled={soldOut}
                      className="h-7 w-7 cursor-pointer rounded-full bg-tomate-500 text-base font-bold text-white hover:bg-tomate-600 disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div>
          <Field label="Buscar cliente existente (opcional)">
            <Input
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Nombre o teléfono..."
            />
          </Field>
          {customerResults.length > 0 && (
            <div className="mt-1 rounded-lg border border-crema-200">
              {customerResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickCustomer(c)}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-crema-50"
                >
                  <span className="font-semibold text-navy-800">{c.name}</span>
                  <span className="text-xs text-navy-400">{c.phone}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre del cliente">
            <Input required value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </Field>
          <Field label="Teléfono (WhatsApp)">
            <Input required type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          </Field>
        </div>

        <div>
          <span className="mb-1 block text-sm font-bold text-navy-700">¿Cómo lo recibe?</span>
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
                {option === 'pickup' ? 'Retira' : 'Delivery'}
              </button>
            ))}
          </div>
        </div>

        {fulfillment === 'delivery' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dirección de entrega">
              <Input required value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <Field label="Costo de envío ($)">
              <Input type="number" min="0" step="0.01" value={deliveryCost}
                onChange={(e) => setDeliveryCost(e.target.value)} placeholder="0" />
            </Field>
          </div>
        )}

        <Field label="Notas (opcional)">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {cart.length > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-crema-100 px-3 py-2 text-sm">
            <span className="font-semibold text-navy-600">
              {cart.reduce((s, { qty }) => s + qty, 0)} porciones
            </span>
            <span className="font-bold text-navy-900">{formatARS(total)}</span>
          </div>
        )}

        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Registrar pedido'}</Button>
        </div>
      </form>
    </Modal>
  )
}
