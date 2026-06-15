import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatARS, formatDateOnly, waLink } from '../../lib/format'
import logoImg from '/sorrentino_ok.png'
import { Card } from '../../components/ui'

interface ConfirmationState {
  orderNumber: number
  total: number
  menuTitle: string
  deliveryDate: string
  fulfillment: 'pickup' | 'delivery'
  items: { name: string; qty: number; price: number }[]
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

  const totalQty = state.items.reduce((s, i) => s + i.qty, 0)
  const waText = [
    `¡Hola! Hice el pedido #${state.orderNumber} en _il nonno Lalo_:`,
    `${state.menuTitle} (${formatDateOnly(state.deliveryDate)}) · ${totalQty} ${totalQty === 1 ? 'porción' : 'porciones'}`,
    `Total: ${formatARS(state.total)}`,
    state.fulfillment === 'pickup' ? 'Paso a retirarlo.' : 'Es con delivery.',
  ].join('\n')

  return (
    <div className="mx-auto max-w-lg text-center">
      <div className="flex justify-center">
        <img src={logoImg} alt="il nonno Lalo" className="h-28 w-28 object-contain drop-shadow-md" />
      </div>
      <h1 className="mt-4 font-script text-5xl font-bold text-navy-800">¡Pedido recibido!</h1>
      <p className="mt-2 text-navy-700">
        Tu pedido es el <strong>#{state.orderNumber}</strong>. Te vamos a contactar para confirmarlo.
      </p>

      <Card className="mt-6 text-left">
        <p className="text-sm font-bold uppercase tracking-wide text-tomate-600">
          {state.menuTitle} · {formatDateOnly(state.deliveryDate)}
        </p>
        <div className="mt-3 flex items-center justify-between text-sm text-navy-700">
          <span>{totalQty} {totalQty === 1 ? 'porción' : 'porciones'}</span>
          <span className="text-base font-bold text-navy-900">{formatARS(state.total)}</span>
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
          href={waLink(whatsapp, waText)}
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
