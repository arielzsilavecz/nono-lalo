import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatARS, formatDayMonth, waLink } from '../../lib/format'
import logoImg from '/sorrentino_ok.png'
import { Card } from '../../components/ui'

interface ConfirmationEntry {
  menuTitle: string
  deliveryDate: string
  items: { name: string; qty: number; price: number }[]
}

interface ConfirmationState {
  orderNumbers: number[]
  total: number
  fulfillment: 'pickup' | 'delivery'
  entries: ConfirmationEntry[]
}

export function OrderConfirmed() {
  const location = useLocation()
  const state = location.state as ConfirmationState | null
  const [whatsapp, setWhatsapp] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('*')
      .in('key', ['whatsapp_number', 'pickup_address'])
      .then(({ data }) => {
        for (const row of data ?? []) {
          if (row.key === 'whatsapp_number') setWhatsapp(row.value)
          if (row.key === 'pickup_address') setPickupAddress(row.value)
        }
      })
  }, [])

  if (!state) return <Navigate to="/" replace />

  const orderLabel = state.orderNumbers.length === 1
    ? `#${state.orderNumbers[0]}`
    : state.orderNumbers.map((n) => `#${n}`).join(' y ')

  const allItems = state.entries.flatMap((e) => e.items)
  const totalQty = allItems.reduce((s, i) => s + i.qty, 0)

  const waLines = [
    `¡Hola! Hice ${state.orderNumbers.length === 1 ? 'el pedido' : 'los pedidos'} ${orderLabel} en _il nonno Lalo_:`,
    ...state.entries.flatMap((entry) =>
      entry.items.map((i) => `- ${i.qty} × ${i.name} (entrega ${formatDayMonth(entry.deliveryDate)})`)
    ),
    `Total: ${formatARS(state.total)}`,
    state.fulfillment === 'pickup' ? 'Paso a retirarlo.' : 'Es con delivery.',
  ]

  return (
    <div className="mx-auto max-w-lg text-center">
      <div className="flex justify-center">
        <img src={logoImg} alt="il nonno Lalo" className="h-28 w-28 object-contain drop-shadow-md" />
      </div>
      <h1 className="mt-4 font-script text-5xl font-bold text-navy-800">¡Pedido recibido!</h1>
      <p className="mt-2 text-navy-700">
        {state.orderNumbers.length === 1 ? 'Tu pedido es el' : 'Tus pedidos son el'}{' '}
        <strong>{orderLabel}</strong>. Te vamos a contactar para confirmarlo.
      </p>

      <Card className="mt-6 text-left">
        {state.entries.map((entry, i) => (
          <div key={i} className={i > 0 ? 'mt-4 border-t border-crema-200 pt-4' : ''}>
            <p className="text-sm font-bold uppercase tracking-wide text-tomate-600">
              {entry.menuTitle} · {formatDayMonth(entry.deliveryDate)}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-navy-700">
              {entry.items.map((item) => (
                <li key={item.name} className="flex justify-between">
                  <span>{item.qty} × {item.name}</span>
                  <span className="font-bold">{formatARS(item.price * item.qty)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="mt-4 flex justify-between border-t border-crema-200 pt-3 font-bold text-navy-900">
          <span>{totalQty} {totalQty === 1 ? 'porción' : 'porciones'}</span>
          <span className="text-base">{formatARS(state.total)}</span>
        </div>
        <p className="mt-3 text-xs text-navy-500">
          {state.fulfillment === 'pickup'
            ? pickupAddress
              ? `Retirá por: ${pickupAddress}`
              : 'Te avisamos por teléfono dónde y cuándo retirar.'
            : 'Coordinamos la entrega por teléfono.'}{' '}
          Pagás al recibirlo, en efectivo o transferencia.
        </p>
      </Card>

      {whatsapp && (
        <a
          href={waLink(whatsapp, waLines.join('\n'))}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 font-bold text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          Confirmar por WhatsApp
        </a>
      )}

      <p className="mt-6">
        <Link to="/" className="text-sm font-bold text-navy-600 underline hover:text-navy-800">
          Volver a los menúes
        </Link>
      </p>
    </div>
  )
}
