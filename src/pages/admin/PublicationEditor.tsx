import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Dish, DishIngredient, Ingredient, Menu, MenuItem, MenuStatus } from '../../lib/types'
import { MENU_STATUS_LABELS } from '../../lib/types'
import { dishCost, effectivePrice } from '../../lib/costing'
import { formatARS, formatDateOnly, fromDatetimeLocal, toDatetimeLocal } from '../../lib/format'
import { Badge, Button, Card, ErrorText, Field, Input, LoadingBlock, PageTitle, Select, Textarea } from '../../components/ui'

const STATUS_TONES: Record<MenuStatus, 'gray' | 'green' | 'amber' | 'navy'> = {
  draft: 'gray',
  published: 'green',
  closed: 'amber',
  cooked: 'navy',
}

export function PublicationEditor() {
  const { pubId } = useParams()
  const navigate = useNavigate()
  const isNew = pubId === 'nueva'

  const [loading, setLoading] = useState(true)
  const [dishes, setDishes] = useState<Dish[]>([])
  const [recipes, setRecipes] = useState<DishIngredient[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])

  // form state
  const [status, setStatus] = useState<MenuStatus>('draft')
  const [selectedDishId, setSelectedDishId] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [openUntilSoldOut, setOpenUntilSoldOut] = useState(false)
  const [deadlineLocal, setDeadlineLocal] = useState('')
  const [price, setPrice] = useState('')
  const [maxPortions, setMaxPortions] = useState('')
  const [notes, setNotes] = useState('')

  // saved menu_item id (for existing publications)
  const [menuItemId, setMenuItemId] = useState<string | null>(null)
  const [reserved, setReserved] = useState(0)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const [dishesRes, recipesRes, ingredientsRes] = await Promise.all([
        supabase.from('dishes').select('*').eq('active', true).order('name'),
        supabase.from('dish_ingredients').select('*'),
        supabase.from('ingredients').select('*'),
      ])
      const dishList = (dishesRes.data ?? []) as Dish[]
      setDishes(dishList)
      setRecipes((recipesRes.data ?? []) as DishIngredient[])
      setIngredients((ingredientsRes.data ?? []) as Ingredient[])

      if (!isNew && pubId) {
        const [{ data: menuRow }, { data: itemRows }] = await Promise.all([
          supabase.from('menus').select('*').eq('id', pubId).maybeSingle(),
          supabase.from('menu_items').select('*').eq('menu_id', pubId).limit(1),
        ])
        const menu = menuRow as Menu | null
        const item = ((itemRows ?? []) as MenuItem[])[0] ?? null
        if (menu) {
          setStatus(menu.status)
          setDeliveryDate(menu.delivery_date)
          setOpenUntilSoldOut(menu.order_deadline === null)
          if (menu.order_deadline !== null) setDeadlineLocal(toDatetimeLocal(menu.order_deadline))
          setNotes(menu.notes)
        }
        if (item) {
          setMenuItemId(item.id)
          setSelectedDishId(item.dish_id)
          setPrice(String(item.unit_price))
          setMaxPortions(item.max_portions !== null ? String(item.max_portions) : '')
          setReserved(item.reserved_portions)
        } else if (dishList.length > 0) {
          setSelectedDishId(dishList[0].id)
        }
      } else if (dishList.length > 0) {
        setSelectedDishId(dishList[0].id)
      }
      setLoading(false)
    }
    load()
  }, [pubId, isNew])

  // Limpiar deadline cuando se activa "hasta agotar stock"
  useEffect(() => {
    if (openUntilSoldOut) setDeadlineLocal('')
  }, [openUntilSoldOut])

  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients])

  const selectedDish = dishes.find((d) => d.id === selectedDishId) ?? null

  // When dish changes, pre-fill price with suggested
  useEffect(() => {
    if (!selectedDish || !isNew) return
    const recipe = recipes.filter((r) => r.dish_id === selectedDish.id)
    const suggested = effectivePrice(selectedDish, dishCost(recipe, ingredientById))
    setPrice(String(suggested))
  }, [selectedDishId, isNew]) // eslint-disable-line react-hooks/exhaustive-deps

  const cost = useMemo(() => {
    if (!selectedDish) return 0
    const recipe = recipes.filter((r) => r.dish_id === selectedDish.id)
    return dishCost(recipe, ingredientById)
  }, [selectedDish, recipes, ingredientById])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!selectedDishId) { setError('Elegí un plato.'); return }
    if (!deliveryDate) { setError('Completá la fecha de entrega.'); return }
    if (!openUntilSoldOut && !deadlineLocal) { setError('Completá el cierre de encargos o activá "hasta agotar stock".'); return }
    if (openUntilSoldOut && !maxPortions.trim()) { setError('Definí el cupo máximo si publicás hasta agotar stock.'); return }
    if (Number(price) < 0) { setError('El precio no es válido.'); return }

    setSaving(true)
    const dish = dishes.find((d) => d.id === selectedDishId)!
    const menuRow = {
      title: dish.name,
      delivery_date: deliveryDate,
      order_deadline: openUntilSoldOut ? null : fromDatetimeLocal(deadlineLocal),
      notes: notes.trim(),
    }

    let savedMenuId = pubId
    if (isNew) {
      const { data, error: insertError } = await supabase.from('menus').insert(menuRow).select('id').single()
      if (insertError || !data) { setError('No se pudo crear la publicación.'); setSaving(false); return }
      savedMenuId = data.id as string
    } else {
      const { error: updateError } = await supabase.from('menus').update(menuRow).eq('id', pubId)
      if (updateError) { setError('No se pudo guardar.'); setSaving(false); return }
    }

    const itemRow = {
      menu_id: savedMenuId,
      dish_id: selectedDishId,
      dish_name: dish.name,
      dish_description: dish.description,
      unit_price: Number(price),
      max_portions: maxPortions.trim() === '' ? null : Number(maxPortions),
    }

    if (isNew) {
      const { error: itemError } = await supabase.from('menu_items').insert(itemRow)
      if (itemError) { setError('El menú se creó pero falló el plato. Recargá y revisá.'); setSaving(false); return }
    } else if (menuItemId) {
      const { error: itemError } = await supabase.from('menu_items').update({
        unit_price: Number(price),
        max_portions: maxPortions.trim() === '' ? null : Number(maxPortions),
        dish_description: dish.description,
      }).eq('id', menuItemId)
      if (itemError) { setError('No se pudo actualizar el plato.'); setSaving(false); return }
    }

    setSaving(false)
    if (isNew) navigate(`/admin/publicaciones/${savedMenuId}`, { replace: true })
  }

  async function changeStatus(next: MenuStatus) {
    setError('')
    if (next === 'published') {
      if (!menuItemId) { setError('Guardá primero antes de publicar.'); return }
      if (!openUntilSoldOut && Date.parse(fromDatetimeLocal(deadlineLocal)) <= Date.now()) {
        setError('El cierre de encargos ya pasó. Actualizalo antes de publicar.')
        return
      }
      if (openUntilSoldOut && !maxPortions.trim()) {
        setError('Definí el cupo máximo antes de publicar.')
        return
      }
    }
    const { error: updateError } = await supabase.from('menus').update({ status: next }).eq('id', pubId)
    if (updateError) { setError('No se pudo cambiar el estado.'); return }
    setStatus(next)
  }

  async function markCooked() {
    if (!pubId || !menuItemId) return
    setError('')

    const { data: orderRows } = await supabase
      .from('orders').select('id').eq('menu_id', pubId).neq('status', 'cancelled')
    const orderIds = (orderRows ?? []).map((o) => o.id as string)

    let usage = new Map<string, number>()
    if (orderIds.length > 0 && selectedDish) {
      const { data: orderItemRows } = await supabase
        .from('order_items').select('qty').eq('menu_item_id', menuItemId).in('order_id', orderIds)
      const totalPortions = (orderItemRows ?? []).reduce((sum, r) => sum + Number(r.qty), 0)
      for (const recipe of recipes.filter((r) => r.dish_id === selectedDish.id)) {
        usage.set(recipe.ingredient_id, totalPortions * recipe.qty_per_portion)
      }
    }

    const summary = [...usage.entries()].map(([id, qty]) => {
      const ing = ingredientById.get(id)
      return `• ${ing?.name ?? '?'}: ${qty.toFixed(2)} ${ing?.unit ?? ''}`
    }).join('\n')

    const msg = usage.size > 0
      ? `Se va a descontar de la despensa:\n${summary}\n\n¿Marcar como cocinado?`
      : '¿Marcar esta publicación como cocinada?'
    if (!window.confirm(msg)) return

    if (usage.size > 0) {
      await supabase.from('pantry_movements').insert(
        [...usage.entries()].map(([ingredientId, qty]) => ({
          ingredient_id: ingredientId, qty: -qty, reason: 'cooking',
          menu_id: pubId, notes: `Cocina: ${selectedDish?.name}`,
        }))
      )
    }
    await changeStatus('cooked')
  }

  async function deletePublication() {
    const { data: orderRows } = await supabase
      .from('orders').select('id', { count: 'exact', head: false }).eq('menu_id', pubId).neq('status', 'cancelled')
    const orderCount = (orderRows ?? []).length
    const msg = orderCount > 0
      ? `Esta publicación tiene ${orderCount} pedido${orderCount > 1 ? 's' : ''} activo${orderCount > 1 ? 's' : ''}. ¿Eliminarla igualmente? Los pedidos quedarán huérfanos.`
      : '¿Eliminar esta publicación? No se puede deshacer.'
    if (!window.confirm(msg)) return
    const { error: deleteError } = await supabase.from('menus').delete().eq('id', pubId)
    if (deleteError) { setError('No se pudo eliminar.'); return }
    navigate('/admin/publicaciones')
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/menu/${pubId}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <LoadingBlock />

  return (
    <div className="max-w-xl">
      <PageTitle
        title={isNew ? 'Nueva publicación' : (selectedDish?.name ?? 'Editar publicación')}
        action={!isNew && <Badge tone={STATUS_TONES[status]}>{MENU_STATUS_LABELS[status]}</Badge>}
      />

      <form onSubmit={save}>
        <Card>
          <div className="space-y-4">
            <Field label="¿Qué vas a cocinar?">
              {dishes.length === 0 ? (
                <p className="text-sm text-navy-500">
                  Primero cargá un{' '}
                  <Link to="/admin/platos/nuevo" className="font-bold underline">plato</Link>.
                </p>
              ) : (
                <Select
                  value={selectedDishId}
                  onChange={(e) => setSelectedDishId(e.target.value)}
                  disabled={!isNew}
                >
                  {dishes.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </Select>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Fecha de entrega">
                <Input
                  required
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </Field>
              {!openUntilSoldOut && (
                <Field label="Cierre de encargos">
                  <Input
                    required
                    type="datetime-local"
                    value={deadlineLocal}
                    onChange={(e) => setDeadlineLocal(e.target.value)}
                  />
                </Field>
              )}
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-navy-700">
              <input
                type="checkbox"
                checked={openUntilSoldOut}
                onChange={(e) => setOpenUntilSoldOut(e.target.checked)}
                className="h-4 w-4 accent-tomate-500"
              />
              Publicar hasta agotar stock
            </label>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Precio por porción ($)" hint={cost > 0 ? `Costo: ${formatARS(cost)}` : undefined}>
                <Input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </Field>
              <Field label="Cupo de porciones" hint={openUntilSoldOut ? 'Requerido cuando publicás hasta agotar stock' : 'Vacío = sin límite'}>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={maxPortions}
                  onChange={(e) => setMaxPortions(e.target.value)}
                  placeholder="Sin límite"
                />
              </Field>
            </div>

            {!isNew && reserved > 0 && (
              <p className="text-sm font-semibold text-tomate-600">
                {reserved} porciones ya encargadas
                {maxPortions ? ` de ${maxPortions}` : ''}
              </p>
            )}

            <Field label="Nota para los clientes (opcional)">
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: incluye pan casero, apto celíacos…"
              />
            </Field>

            {error && <ErrorText>{error}</ErrorText>}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving || dishes.length === 0}>
                {saving ? 'Guardando…' : isNew ? 'Crear publicación' : 'Guardar cambios'}
              </Button>

              {!isNew && status === 'draft' && (
                <Button variant="secondary" type="button" onClick={() => changeStatus('published')}>
                  Publicar
                </Button>
              )}
              {!isNew && (
                <Button variant="danger" type="button" onClick={deletePublication}>
                  Eliminar
                </Button>
              )}
              {status === 'published' && (
                <>
                  <Button variant="secondary" type="button" onClick={() => changeStatus('closed')}>
                    Cerrar encargos
                  </Button>
                  <Button variant="ghost" type="button" onClick={copyLink}>
                    {copied ? '¡Link copiado!' : 'Copiar link'}
                  </Button>
                </>
              )}
              {status === 'closed' && (
                <>
                  <Button variant="secondary" type="button" onClick={markCooked}>
                    Marcar como cocinado
                  </Button>
                  <Button variant="ghost" type="button" onClick={() => changeStatus('published')}>
                    Reabrir encargos
                  </Button>
                </>
              )}
              {status === 'cooked' && (
                <p className="self-center text-sm font-semibold text-navy-500">
                  Cocinado el {formatDateOnly(deliveryDate)}
                </p>
              )}
            </div>

            {!isNew && status === 'published' && (
              <p className="text-xs text-navy-400">
                Link público:{' '}
                <a
                  href={`/menu/${pubId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {window.location.origin}/menu/{pubId}
                </a>
              </p>
            )}
          </div>
        </Card>
      </form>
    </div>
  )
}
