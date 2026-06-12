import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Dish, DishIngredient, Ingredient } from '../../lib/types'
import { roundPrice, suggestedPrice } from '../../lib/costing'
import { formatARS } from '../../lib/format'
import { Button, Card, ErrorText, Field, Input, LoadingBlock, PageTitle, Select, Textarea } from '../../components/ui'

interface RecipeRow {
  ingredient_id: string
  qty: string
}

export function DishEditor() {
  const { dishId } = useParams()
  const navigate = useNavigate()
  const isNew = dishId === 'nuevo'

  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [marginPct, setMarginPct] = useState('50')
  const [manualPrice, setManualPrice] = useState('')
  const [active, setActive] = useState(true)
  const [recipe, setRecipe] = useState<RecipeRow[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: ingredientRows } = await supabase.from('ingredients').select('*').order('name')
      setIngredients((ingredientRows ?? []) as Ingredient[])

      if (!isNew && dishId) {
        const [{ data: dishRow }, { data: recipeRows }] = await Promise.all([
          supabase.from('dishes').select('*').eq('id', dishId).maybeSingle(),
          supabase.from('dish_ingredients').select('*').eq('dish_id', dishId),
        ])
        const dish = dishRow as Dish | null
        if (dish) {
          setName(dish.name)
          setDescription(dish.description)
          setMarginPct(String(dish.margin_pct))
          setManualPrice(dish.manual_price !== null ? String(dish.manual_price) : '')
          setActive(dish.active)
          setRecipe(
            ((recipeRows ?? []) as DishIngredient[]).map((row) => ({
              ingredient_id: row.ingredient_id,
              qty: String(row.qty_per_portion),
            })),
          )
        }
      }
      setLoading(false)
    }
    load()
  }, [dishId, isNew])

  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients])

  const cost = useMemo(
    () =>
      recipe.reduce((sum, row) => {
        const ingredient = ingredientById.get(row.ingredient_id)
        const qty = Number(row.qty)
        if (!ingredient || Number.isNaN(qty)) return sum
        return sum + qty * ingredient.current_price
      }, 0),
    [recipe, ingredientById],
  )

  const margin = Number(marginPct) || 0
  const suggested = roundPrice(suggestedPrice(cost, margin))

  function updateRow(index: number, patch: Partial<RecipeRow>) {
    setRecipe((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addRow() {
    const used = new Set(recipe.map((r) => r.ingredient_id))
    const firstFree = ingredients.find((i) => !used.has(i.id))
    if (!firstFree) return
    setRecipe((rows) => [...rows, { ingredient_id: firstFree.id, qty: '' }])
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const cleanRecipe = recipe.filter((row) => Number(row.qty) > 0)
    const uniqueIds = new Set(cleanRecipe.map((r) => r.ingredient_id))
    if (uniqueIds.size !== cleanRecipe.length) {
      setError('Hay ingredientes repetidos en la receta.')
      return
    }
    const manual = manualPrice.trim() === '' ? null : Number(manualPrice)
    if (manual !== null && (Number.isNaN(manual) || manual < 0)) {
      setError('El precio manual no es válido.')
      return
    }

    setSaving(true)
    const dishRow = {
      name: name.trim(),
      description: description.trim(),
      margin_pct: margin,
      manual_price: manual,
      active,
    }

    let savedId = dishId
    if (isNew) {
      const { data, error: insertError } = await supabase
        .from('dishes')
        .insert(dishRow)
        .select('id')
        .single()
      if (insertError || !data) {
        setError('No se pudo guardar el plato.')
        setSaving(false)
        return
      }
      savedId = data.id as string
    } else {
      const { error: updateError } = await supabase.from('dishes').update(dishRow).eq('id', dishId)
      if (updateError) {
        setError('No se pudo guardar el plato.')
        setSaving(false)
        return
      }
    }

    await supabase.from('dish_ingredients').delete().eq('dish_id', savedId)
    if (cleanRecipe.length > 0) {
      const { error: recipeError } = await supabase.from('dish_ingredients').insert(
        cleanRecipe.map((row) => ({
          dish_id: savedId,
          ingredient_id: row.ingredient_id,
          qty_per_portion: Number(row.qty),
        })),
      )
      if (recipeError) {
        setError('El plato se guardó pero la receta no. Revisá las cantidades.')
        setSaving(false)
        return
      }
    }

    navigate('/admin/platos')
  }

  if (loading) return <LoadingBlock />

  return (
    <div>
      <PageTitle title={isNew ? 'Nuevo plato' : 'Editar plato'} />

      <form onSubmit={save} className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="space-y-4">
            <Field label="Nombre del plato">
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Ñoquis con tuco" />
            </Field>
            <Field label="Descripción" hint="Lo que ven los clientes en la carta.">
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Margen de ganancia (%)">
                <Input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={marginPct}
                  onChange={(e) => setMarginPct(e.target.value)}
                />
              </Field>
              <Field label="Precio manual ($)" hint="Dejalo vacío para usar el sugerido.">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  placeholder={String(suggested)}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm font-bold text-navy-700">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 accent-tomate-500"
              />
              Plato activo (se puede agregar a menús)
            </label>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy-500">
            Receta (por porción)
          </h2>

          {ingredients.length === 0 ? (
            <p className="text-sm text-navy-500">
              Primero cargá tus{' '}
              <Link to="/admin/ingredientes" className="font-bold underline">
                ingredientes
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-2">
              {recipe.map((row, index) => {
                const ingredient = ingredientById.get(row.ingredient_id)
                return (
                  <div key={index} className="flex items-center gap-2">
                    <Select
                      className="flex-1"
                      value={row.ingredient_id}
                      onChange={(e) => updateRow(index, { ingredient_id: e.target.value })}
                    >
                      {ingredients.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      className="w-24"
                      type="number"
                      min="0"
                      step="0.001"
                      value={row.qty}
                      onChange={(e) => updateRow(index, { qty: e.target.value })}
                      placeholder="Cant."
                    />
                    <span className="w-14 text-xs font-semibold text-navy-500">
                      {ingredient?.unit ?? ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRecipe((rows) => rows.filter((_, i) => i !== index))}
                      className="cursor-pointer rounded-full px-2 text-lg text-tomate-600 hover:bg-tomate-100"
                      aria-label="Quitar ingrediente"
                    >
                      ×
                    </button>
                  </div>
                )
              })}
              <Button variant="ghost" onClick={addRow}>
                + Agregar ingrediente
              </Button>
            </div>
          )}

          <div className="mt-5 rounded-xl bg-crema-100 p-4 text-sm">
            <div className="flex justify-between">
              <span className="font-semibold text-navy-600">Costo por porción</span>
              <span className="font-bold text-navy-900">{formatARS(cost)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="font-semibold text-navy-600">Precio sugerido (+{margin}%)</span>
              <span className="font-bold text-tomate-600">{formatARS(suggested)}</span>
            </div>
            {manualPrice.trim() !== '' && (
              <div className="mt-1 flex justify-between">
                <span className="font-semibold text-navy-600">Precio manual</span>
                <span className="font-bold text-navy-900">{formatARS(Number(manualPrice) || 0)}</span>
              </div>
            )}
          </div>
        </Card>

        <div className="lg:col-span-2">
          {error && <div className="mb-3"><ErrorText>{error}</ErrorText></div>}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar plato'}
            </Button>
            <Link to="/admin/platos">
              <Button variant="ghost">Cancelar</Button>
            </Link>
          </div>
        </div>
      </form>
    </div>
  )
}
