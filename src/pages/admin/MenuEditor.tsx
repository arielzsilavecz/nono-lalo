import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Dish, DishIngredient, Ingredient, Menu, MenuItem, MenuStatus } from '../../lib/types'
import { MENU_STATUS_LABELS } from '../../lib/types'
import { dishCost, effectivePrice } from '../../lib/costing'
import { formatARS, fromDatetimeLocal, toDatetimeLocal } from '../../lib/format'
import { Badge, Button, Card, ErrorText, Field, Input, LoadingBlock, PageTitle, Select, Textarea } from '../../components/ui'

const STATUS_TONES: Record<MenuStatus, 'gray' | 'green' | 'amber' | 'navy'> = {
  draft: 'gray',
  published: 'green',
  closed: 'amber',
  cooked: 'navy',
}

interface ItemRow {
  id: string
  dish_id: string
  dish_name: string
  dish_description: string
  price: string
  maxPortions: string
  reserved: number
}

export function MenuEditor() {
  const { menuId } = useParams()
  const navigate = useNavigate()
  const isNew = menuId === 'nuevo'

  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<MenuStatus>('draft')
  const [title, setTitle] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deadlineLocal, setDeadlineLocal] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<ItemRow[]>([])
  const [dishes, setDishes] = useState<Dish[]>([])
  const [recipes, setRecipes] = useState<DishIngredient[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [selectedDish, setSelectedDish] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      const [dishesRes, recipesRes, ingredientsRes] = await Promise.all([
        supabase.from('dishes').select('*').eq('active', true).order('name'),
        supabase.from('dish_ingredients').select('*'),
        supabase.from('ingredients').select('*'),
      ])
      setDishes((dishesRes.data ?? []) as Dish[])
      setRecipes((recipesRes.data ?? []) as DishIngredient[])
      setIngredients((ingredientsRes.data ?? []) as Ingredient[])

      if (!isNew && menuId) {
        const [{ data: menuRow }, { data: itemRows }] = await Promise.all([
          supabase.from('menus').select('*').eq('id', menuId).maybeSingle(),
          supabase.from('menu_items').select('*').eq('menu_id', menuId).order('dish_name'),
        ])
        const menu = menuRow as Menu | null
        if (menu) {
          setStatus(menu.status)
          setTitle(menu.title)
          setDeliveryDate(menu.delivery_date)
          setDeadlineLocal(menu.order_deadline ? toDatetimeLocal(menu.order_deadline) : '')
          setNotes(menu.notes)
          setItems(
            ((itemRows ?? []) as MenuItem[]).map((item) => ({
              id: item.id,
              dish_id: item.dish_id,
              dish_name: item.dish_name,
              dish_description: item.dish_description,
              price: String(item.unit_price),
              maxPortions: item.max_portions !== null ? String(item.max_portions) : '',
              reserved: item.reserved_portions,
            })),
          )
        }
      }
      setLoading(false)
    }
    load()
  }, [menuId, isNew])

  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients])
  const availableDishes = useMemo(() => {
    const usedIds = new Set(items.map((item) => item.dish_id))
    return dishes.filter((dish) => !usedIds.has(dish.id))
  }, [dishes, items])

  async function saveMenuFields(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!deliveryDate || !deadlineLocal) {
      setError('Completá la fecha de entrega y el cierre de encargos.')
      return
    }
    setSaving(true)
    const row = {
      title: title.trim(),
      delivery_date: deliveryDate,
      order_deadline: fromDatetimeLocal(deadlineLocal),
      notes: notes.trim(),
    }

    if (isNew) {
      const { data, error: insertError } = await supabase
        .from('menus')
        .insert(row)
        .select('id')
        .single()
      setSaving(false)
      if (insertError || !data) {
        setError('No se pudo crear el menú.')
        return
      }
      navigate(`/admin/menus/${data.id}`, { replace: true })
    } else {
      const { error: updateError } = await supabase.from('menus').update(row).eq('id', menuId)
      setSaving(false)
      if (updateError) setError('No se pudo guardar el menú.')
    }
  }

  async function setMenuStatus(next: MenuStatus) {
    setError('')
    if (next === 'published') {
      if (items.length === 0) {
        setError('Agregá al menos un plato antes de publicar.')
        return
      }
      if (Date.parse(fromDatetimeLocal(deadlineLocal)) <= Date.now()) {
        setError('El cierre de encargos ya pasó: actualizalo antes de publicar.')
        return
      }
    }
    const { error: updateError } = await supabase.from('menus').update({ status: next }).eq('id', menuId)
    if (updateError) {
      setError('No se pudo cambiar el estado.')
      return
    }
    setStatus(next)
  }

  async function addDish() {
    const dish = dishes.find((d) => d.id === selectedDish)
    if (!dish || !menuId) return
    const recipe = recipes.filter((r) => r.dish_id === dish.id)
    const price = effectivePrice(dish, dishCost(recipe, ingredientById))
    const { data, error: insertError } = await supabase
      .from('menu_items')
      .insert({
        menu_id: menuId,
        dish_id: dish.id,
        dish_name: dish.name,
        dish_description: dish.description,
        unit_price: price,
        max_portions: null,
      })
      .select('*')
      .single()
    if (insertError || !data) {
      setError('No se pudo agregar el plato.')
      return
    }
    const item = data as MenuItem
    setItems((rows) => [
      ...rows,
      {
        id: item.id,
        dish_id: item.dish_id,
        dish_name: item.dish_name,
        dish_description: item.dish_description,
        price: String(item.unit_price),
        maxPortions: '',
        reserved: 0,
      },
    ])
    setSelectedDish('')
  }

  async function saveItem(item: ItemRow) {
    const price = Number(item.price)
    const max = item.maxPortions.trim() === '' ? null : Number(item.maxPortions)
    if (Number.isNaN(price) || price < 0) return
    if (max !== null && (!Number.isInteger(max) || max <= 0)) return
    await supabase
      .from('menu_items')
      .update({ unit_price: price, max_portions: max })
      .eq('id', item.id)
  }

  async function removeItem(item: ItemRow) {
    if (!window.confirm(`¿Quitar "${item.dish_name}" del menú?`)) return
    const { error: deleteError } = await supabase.from('menu_items').delete().eq('id', item.id)
    if (deleteError) {
      window.alert('No se puede quitar: ya tiene encargos. Cancelá esos pedidos primero.')
      return
    }
    setItems((rows) => rows.filter((row) => row.id !== item.id))
  }

  async function deleteMenu() {
    if (!window.confirm('¿Eliminar este menú borrador?')) return
    const { error: deleteError } = await supabase.from('menus').delete().eq('id', menuId)
    if (deleteError) {
      setError('No se pudo eliminar el menú.')
      return
    }
    navigate('/admin/menus')
  }

  async function markCooked() {
    if (!menuId) return
    setError('')

    const { data: orderRows } = await supabase
      .from('orders')
      .select('id')
      .eq('menu_id', menuId)
      .neq('status', 'cancelled')
    const orderIds = (orderRows ?? []).map((o) => o.id as string)

    const portionsByDish = new Map<string, number>()
    if (orderIds.length > 0) {
      const { data: orderItemRows } = await supabase
        .from('order_items')
        .select('menu_item_id, qty')
        .in('order_id', orderIds)
      const dishByMenuItem = new Map(items.map((item) => [item.id, item.dish_id]))
      for (const row of orderItemRows ?? []) {
        const dishId = dishByMenuItem.get(row.menu_item_id as string)
        if (dishId) {
          portionsByDish.set(dishId, (portionsByDish.get(dishId) ?? 0) + Number(row.qty))
        }
      }
    }

    const usage = new Map<string, number>()
    for (const [dishId, portions] of portionsByDish) {
      for (const recipe of recipes.filter((r) => r.dish_id === dishId)) {
        usage.set(
          recipe.ingredient_id,
          (usage.get(recipe.ingredient_id) ?? 0) + portions * recipe.qty_per_portion,
        )
      }
    }

    const summary = [...usage.entries()]
      .map(([ingredientId, qty]) => {
        const ingredient = ingredientById.get(ingredientId)
        return `• ${ingredient?.name ?? '?'}: ${qty.toFixed(2)} ${ingredient?.unit ?? ''}`
      })
      .join('\n')

    const message =
      usage.size > 0
        ? `Se va a descontar de la despensa:\n${summary}\n\n¿Marcar el menú como cocinado?`
        : 'No hay pedidos con porciones para descontar. ¿Marcar el menú como cocinado igualmente?'
    if (!window.confirm(message)) return

    if (usage.size > 0) {
      const { error: movementError } = await supabase.from('pantry_movements').insert(
        [...usage.entries()].map(([ingredientId, qty]) => ({
          ingredient_id: ingredientId,
          qty: -qty,
          reason: 'cooking',
          menu_id: menuId,
          notes: `Cocina: ${title}`,
        })),
      )
      if (movementError) {
        setError('No se pudieron registrar los movimientos de despensa.')
        return
      }
    }
    await setMenuStatus('cooked')
  }

  async function copyPublicLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/menu/${menuId}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <LoadingBlock />

  return (
    <div>
      <PageTitle
        title={isNew ? 'Nuevo menú' : title || 'Editar menú'}
        action={<Badge tone={STATUS_TONES[status]}>{MENU_STATUS_LABELS[status]}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={saveMenuFields}>
          <Card>
            <div className="space-y-4">
              <Field label="Título del menú">
                <Input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej: Menú del viernes — pastas"
                />
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
                <Field label="Cierre de encargos">
                  <Input
                    required
                    type="datetime-local"
                    value={deadlineLocal}
                    onChange={(e) => setDeadlineLocal(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Notas (opcional)" hint="Se muestran en la carta pública.">
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Guardando…' : isNew ? 'Crear menú' : 'Guardar cambios'}
                </Button>
                {!isNew && status === 'draft' && (
                  <>
                    <Button variant="secondary" onClick={() => setMenuStatus('published')}>
                      Publicar
                    </Button>
                    <Button variant="danger" onClick={deleteMenu}>
                      Eliminar
                    </Button>
                  </>
                )}
                {status === 'published' && (
                  <>
                    <Button variant="secondary" onClick={() => setMenuStatus('closed')}>
                      Cerrar encargos
                    </Button>
                    <Button variant="ghost" onClick={copyPublicLink}>
                      {copied ? '¡Link copiado!' : 'Copiar link público'}
                    </Button>
                  </>
                )}
                {status === 'closed' && (
                  <>
                    <Button variant="secondary" onClick={markCooked}>
                      Marcar como cocinado
                    </Button>
                    <Button variant="ghost" onClick={() => setMenuStatus('published')}>
                      Reabrir encargos
                    </Button>
                  </>
                )}
              </div>
              {error && <ErrorText>{error}</ErrorText>}
            </div>
          </Card>
        </form>

        <Card>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy-500">
            Platos del menú
          </h2>

          {isNew ? (
            <p className="text-sm text-navy-500">Primero creá el menú, después agregale platos.</p>
          ) : (
            <>
              {items.length === 0 && (
                <p className="mb-3 text-sm text-navy-500">Todavía no agregaste platos.</p>
              )}
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={item.id} className="rounded-xl border border-crema-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-navy-800">{item.dish_name}</p>
                        <p className="text-xs text-navy-500">
                          {item.reserved} porciones reservadas
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item)}
                        className="cursor-pointer rounded-full px-2 text-lg text-tomate-600 hover:bg-tomate-100"
                        aria-label={`Quitar ${item.dish_name}`}
                      >
                        ×
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <Field label="Precio por porción ($)">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.price}
                          onChange={(e) =>
                            setItems((rows) =>
                              rows.map((row, i) => (i === index ? { ...row, price: e.target.value } : row)),
                            )
                          }
                          onBlur={() => saveItem(items[index])}
                        />
                      </Field>
                      <Field label="Cupo (vacío = sin límite)">
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={item.maxPortions}
                          onChange={(e) =>
                            setItems((rows) =>
                              rows.map((row, i) =>
                                i === index ? { ...row, maxPortions: e.target.value } : row,
                              ),
                            )
                          }
                          onBlur={() => saveItem(items[index])}
                          placeholder="Sin límite"
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>

              {availableDishes.length > 0 && (
                <div className="mt-4 flex gap-2">
                  <Select value={selectedDish} onChange={(e) => setSelectedDish(e.target.value)}>
                    <option value="">Elegí un plato…</option>
                    {availableDishes.map((dish) => {
                      const recipe = recipes.filter((r) => r.dish_id === dish.id)
                      const price = effectivePrice(dish, dishCost(recipe, ingredientById))
                      return (
                        <option key={dish.id} value={dish.id}>
                          {dish.name} — {formatARS(price)}
                        </option>
                      )
                    })}
                  </Select>
                  <Button variant="secondary" onClick={addDish} disabled={!selectedDish}>
                    Agregar
                  </Button>
                </div>
              )}
              {dishes.length === 0 && (
                <p className="mt-3 text-sm text-navy-500">
                  No tenés platos activos.{' '}
                  <Link to="/admin/platos/nuevo" className="font-bold underline">
                    Creá uno
                  </Link>
                  .
                </p>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
