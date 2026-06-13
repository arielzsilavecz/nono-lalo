import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Button, Card, ErrorText, Field, Input, InputAdorn, LoadingBlock, PageTitle } from '../../components/ui'

export function Settings() {
  const [whatsapp, setWhatsapp] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [mapsApiKey, setMapsApiKey] = useState('')
  const [deliveryBasePrice, setDeliveryBasePrice] = useState('')
  const [deliveryPricePerKm, setDeliveryPricePerKm] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('*')
      .then(({ data }) => {
        for (const row of data ?? []) {
          if (row.key === 'whatsapp_number') setWhatsapp(row.value)
          if (row.key === 'pickup_address') setPickupAddress(row.value)
          if (row.key === 'google_maps_api_key') setMapsApiKey(row.value)
          if (row.key === 'delivery_base_price') setDeliveryBasePrice(row.value)
          if (row.key === 'delivery_price_per_km') setDeliveryPricePerKm(row.value)
        }
        setLoading(false)
      })
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    const { error: upsertError } = await supabase.from('app_settings').upsert([
      { key: 'whatsapp_number', value: whatsapp.trim() },
      { key: 'pickup_address', value: pickupAddress.trim() },
      { key: 'google_maps_api_key', value: mapsApiKey.trim() },
      { key: 'delivery_base_price', value: deliveryBasePrice.trim() },
      { key: 'delivery_price_per_km', value: deliveryPricePerKm.trim() },
    ])
    setSaving(false)
    if (upsertError) {
      setError('No se pudieron guardar los ajustes.')
      return
    }
    setSaved(true)
  }

  if (loading) return <LoadingBlock />

  return (
    <div className="max-w-lg space-y-6">
      <PageTitle title="Ajustes" />
      <Card>
        <form onSubmit={save} className="space-y-4">
          <Field
            label="WhatsApp del emprendimiento"
            hint="Con código de país, ej: 5493516812128. Los clientes confirman su pedido a este número."
          >
            <Input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="5493516812128"
            />
          </Field>
          <Field
            label="Dirección de retiro"
            hint="Se muestra al cliente cuando elige pasar a retirar. También se usa como origen para calcular el costo de envío."
          >
            <Input
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
              placeholder="Ej: Av. Siempreviva 742, Lanús"
            />
          </Field>

          <hr className="border-crema-200" />

          <p className="text-sm font-bold uppercase tracking-wide text-navy-500">Costo de envío</p>

          <Field
            label="Clave API de Google Maps"
            hint="Habilitá la API de Geocoding en Google Cloud Console y restringí la clave a este dominio."
          >
            <Input
              type="password"
              value={mapsApiKey}
              onChange={(e) => setMapsApiKey(e.target.value)}
              placeholder="AIza…"
              autoComplete="off"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio base de envío" hint="Costo fijo independiente de la distancia.">
              <InputAdorn
                prefix="$"
                type="number"
                min="0"
                step="1"
                value={deliveryBasePrice}
                onChange={(e) => setDeliveryBasePrice(e.target.value)}
                placeholder="200"
              />
            </Field>
            <Field label="Precio por km" hint="Se suma al precio base según la distancia en línea recta.">
              <InputAdorn
                prefix="$"
                type="number"
                min="0"
                step="1"
                value={deliveryPricePerKm}
                onChange={(e) => setDeliveryPricePerKm(e.target.value)}
                placeholder="100"
              />
            </Field>
          </div>

          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar ajustes'}
            </Button>
            {saved && <span className="text-sm font-bold text-emerald-700">¡Guardado!</span>}
          </div>
        </form>
      </Card>
    </div>
  )
}
