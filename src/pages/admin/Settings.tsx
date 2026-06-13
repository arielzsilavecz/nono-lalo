import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Button, Card, ErrorText, Field, Input, LoadingBlock, PageTitle } from '../../components/ui'

export function Settings() {
  const [whatsapp, setWhatsapp] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
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
    <div className="max-w-lg">
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
            hint="Se muestra al cliente cuando elige pasar a retirar."
          >
            <Input
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
              placeholder="Ej: Av. Siempreviva 742, Lanús"
            />
          </Field>
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
