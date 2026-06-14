import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Customer, Order } from '../../lib/types'
import { FULFILLMENT_LABELS, ORDER_STATUS_LABELS } from '../../lib/types'
import { formatARS, formatDateOnly, formatShortDateTime, waLink } from '../../lib/format'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  Input,
  LoadingBlock,
  PageTitle,
  Textarea,
} from '../../components/ui'
import { ModalOverlay } from '../../components/ModalOverlay'
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil } from 'lucide-react'

const STATUS_TONES: Record<string, 'amber' | 'green' | 'navy' | 'red'> = {
  pending: 'amber',
  confirmed: 'green',
  delivered: 'navy',
  cancelled: 'red',
}

interface OrderWithMenu extends Order {
  menus: { title: string; delivery_date: string } | null
}

// ─── Editor / detalle ────────────────────────────────────────────────────────

function CustomerDetail({
  customerId,
  onClose,
  onSaved,
}: {
  customerId: string | 'nueva'
  onClose: () => void
  onSaved: () => void
}) {
  const isNew = customerId === 'nueva'
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [orders, setOrders] = useState<OrderWithMenu[]>([])

  useEffect(() => {
    if (isNew) return
    async function load() {
      const { data: cust } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .maybeSingle()
      if (cust) {
        const c = cust as Customer
        setName(c.name)
        setPhone(c.phone)
        setAddress(c.address ?? '')

        const { data: orderRows } = await supabase
          .from('orders')
          .select('*, menus(title, delivery_date)')
          .or(`customer_id.eq.${customerId},customer_phone.eq.${c.phone}`)
          .order('created_at', { ascending: false })
          .limit(30)
        setOrders((orderRows ?? []) as OrderWithMenu[])
      }
      setLoading(false)
    }
    load()
  }, [customerId, isNew])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('El nombre es requerido.'); return }
    if (!phone.trim()) { setError('El teléfono es requerido.'); return }
    setSaving(true)
    if (isNew) {
      const { error: err } = await supabase.from('customers').insert({
        name: name.trim(), phone: phone.trim(), address: address.trim() || null,
      })
      if (err) { setError(err.code === '23505' ? 'Ya existe un cliente con ese teléfono.' : 'No se pudo guardar.'); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('customers')
        .update({ name: name.trim(), phone: phone.trim(), address: address.trim() || null })
        .eq('id', customerId)
      if (err) { setError(err.code === '23505' ? 'Ya existe un cliente con ese teléfono.' : 'No se pudo guardar.'); setSaving(false); return }
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  if (loading) return <LoadingBlock />

  return (
    <div className="space-y-5">
      <h2 className="font-script text-3xl font-bold text-navy-800">
        {isNew ? 'Nuevo cliente' : name || 'Editar cliente'}
      </h2>

      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="María García" required />
          </Field>
          <Field label="Teléfono">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="1123456789" required />
          </Field>
        </div>
        <Field label="Dirección (opcional)" hint="Para clientes que reciben delivery">
          <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Av. Corrientes 1234, 2° B" />
        </Field>
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : isNew ? 'Crear cliente' : 'Guardar cambios'}
        </Button>
      </form>

      {!isNew && (
        <>
          <hr className="border-crema-200" />
          <div>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy-500">
              Historial de pedidos
            </h3>
            {orders.length === 0 ? (
              <p className="text-sm text-navy-400">Sin pedidos registrados.</p>
            ) : (
              <div className="space-y-2">
                {orders.map((o) => (
                  <div key={o.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-crema-200 bg-white px-4 py-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-navy-800">#{o.order_number}</span>
                        <Badge tone={STATUS_TONES[o.status] ?? 'gray'}>{ORDER_STATUS_LABELS[o.status] ?? o.status}</Badge>
                        <Badge tone="gray">{FULFILLMENT_LABELS[o.fulfillment]}</Badge>
                      </div>
                      {o.menus && (
                        <p className="mt-0.5 text-xs text-navy-500">{o.menus.title} · {formatDateOnly(o.menus.delivery_date)}</p>
                      )}
                      <p className="mt-0.5 text-xs text-navy-400">{formatShortDateTime(o.created_at)}</p>
                    </div>
                    <span className="font-bold text-navy-900">{formatARS(o.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Lista principal ──────────────────────────────────────────────────────────

type SortCol = 'name' | 'phone' | 'address' | 'created_at'

export function Customers() {
  const [customers, setCustomers] = useState<Customer[] | null>(null)
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [sortCol, setSortCol] = useState<SortCol>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  async function load() {
    const { data } = await supabase.from('customers').select('*')
    setCustomers((data ?? []) as Customer[])
  }

  useEffect(() => { load() }, [])

  function closeModal() { setOpenId(null) }

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <ArrowUpDown size={12} className="opacity-40" />
    return sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const filtered = (customers ?? []).filter((c) => {
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.phone.includes(q)
  })

  const visible = [...filtered].sort((a, b) => {
    const av = (a[sortCol] ?? '').toLowerCase()
    const bv = (b[sortCol] ?? '').toLowerCase()
    const cmp = av.localeCompare(bv, 'es')
    return sortDir === 'asc' ? cmp : -cmp
  })

  if (!customers) return <LoadingBlock />

  return (
    <div>
      <PageTitle
        title="Clientes"
        action={<Button onClick={() => setOpenId('nueva')}>+ Nuevo cliente</Button>}
      />

      <div className="mb-4">
        <Input
          placeholder="Buscar por nombre o teléfono…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm!"
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Sin clientes por acá">
          {customers.length === 0
            ? 'Los clientes se agregan automáticamente cuando realizan un pedido, o podés cargarlos vos.'
            : 'Ningún cliente coincide con la búsqueda.'}
        </EmptyState>
      ) : (
        <Card className="p-0! overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-crema-200 bg-crema-100 text-xs font-bold uppercase tracking-wide text-navy-500">
                {([ ['name', 'Nombre'], ['phone', 'Teléfono'], ['address', 'Dirección'], ['created_at', 'Alta'] ] as [SortCol, string][]).map(([col, label]) => (
                  <th
                    key={col}
                    className="cursor-pointer select-none px-4 py-3 transition-colors hover:bg-crema-200 hover:text-navy-700"
                    onClick={() => handleSort(col)}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {label} <SortIcon col={col} />
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c, i) => (
                <tr
                  key={c.id}
                  className={`cursor-pointer transition-colors hover:bg-crema-50 ${i !== 0 ? 'border-t border-crema-100' : ''}`}
                  onClick={() => setOpenId(c.id)}
                >
                  <td className="px-4 py-3 font-semibold text-navy-800">{c.name}</td>
                  <td className="px-4 py-3 text-center">
                    <a
                      href={waLink(c.phone, `¡Hola ${c.name}! Te escribimos de _il nonno Lalo_.`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="font-bold text-emerald-700 underline"
                    >
                      {c.phone}
                    </a>
                  </td>
                  <td className="max-w-55 truncate px-4 py-3 text-navy-600">
                    {c.address ?? <span className="text-navy-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center text-navy-400">
                    {new Date(c.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setOpenId(c.id) }}
                      className="cursor-pointer rounded-full p-1.5 text-navy-400 hover:bg-crema-200 hover:text-navy-700"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {openId && (
        <ModalOverlay onClose={closeModal} maxWidth="max-w-lg">
          <CustomerDetail customerId={openId} onClose={closeModal} onSaved={load} />
        </ModalOverlay>
      )}
    </div>
  )
}
