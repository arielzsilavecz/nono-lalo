import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Dish, DishIngredient, Ingredient } from '../../lib/types'
import { roundPrice, suggestedPrice } from '../../lib/costing'
import { formatARS } from '../../lib/format'
import { Button, Card, ErrorText, Field, Input, InputAdorn, LoadingBlock, PageTitle, Select, Textarea } from '../../components/ui'
import { ImagePositionEditor } from '../../components/ImagePositionEditor'

interface RecipeRow {
  ingredient_id: string
  qty: string
}

interface Props { embeddedId?: string; onClose?: () => void }

export function DishEditor({ embeddedId, onClose }: Props = {}) {
  const { dishId: routeId } = useParams()
  const navigate = useNavigate()
  const dishId = embeddedId ?? routeId
  const isNew = dishId === 'nuevo'
  const close = () => onClose ? onClose() : navigate('/admin/platos')

  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [marginPct, setMarginPct] = useState('50')
  const [manualPrice, setManualPrice] = useState('')
  const [cookingTime, setCookingTime] = useState('')
  const [recipeYield, setRecipeYield] = useState('1')
  const [recipe, setRecipe] = useState<RecipeRow[]>([])
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imagePosition, setImagePosition] = useState('0% 0%')
  const [imageZoom, setImageZoom] = useState(1)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
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
          setCookingTime(dish.cooking_time !== null ? String(dish.cooking_time) : '')
          const yld = dish.recipe_yield ?? 1
          setRecipeYield(String(yld))
          setImageUrl(dish.image_url)
          setImagePosition(dish.image_position)
          setImageZoom(dish.image_zoom)
          setRecipe(
            ((recipeRows ?? []) as DishIngredient[]).map((row) => ({
              ingredient_id: row.ingredient_id,
              // qty_per_portion solo guarda 4 decimales; al multiplicar de vuelta
              // por el rendimiento puede arrastrar ruido de redondeo (ej. 0.5 → 0.5001).
              // Redondeamos a 3 decimales (precisión de 1g/1ml) para mostrarlo limpio.
              qty: String(Math.round(row.qty_per_portion * yld * 1000) / 1000),
            })),
          )
        }
      }
      setLoading(false)
    }
    load()
  }, [dishId, isNew])

  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients])

  const yld = Math.max(1, Number(recipeYield) || 1)

  const cost = useMemo(
    () =>
      recipe.reduce((sum, row) => {
        const ingredient = ingredientById.get(row.ingredient_id)
        const qty = Number(row.qty) / yld
        if (!ingredient || Number.isNaN(qty)) return sum
        return sum + qty * ingredient.current_price
      }, 0),
    [recipe, ingredientById, yld],
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

  function setFile(file: File) {
    setPendingFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFile(file)
    e.target.value = ''
  }

  async function removeImage() {
    if (!window.confirm('¿Quitar la imagen de este plato?')) return
    if (!isNew && dishId) {
      await supabase.storage.from('dish-images').remove([dishId])
      await supabase.from('dishes').update({ image_url: null }).eq('id', dishId)
    }
    setImageUrl(null)
    setPendingFile(null)
    setImagePreview(null)
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
      cooking_time: cookingTime.trim() === '' ? null : Number(cookingTime),
      recipe_yield: yld,
      image_position: imagePosition,
      image_zoom: imageZoom,
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
          qty_per_portion: Number(row.qty) / yld,
        })),
      )
      if (recipeError) {
        setError('El plato se guardó pero la receta no. Revisá las cantidades.')
        setSaving(false)
        return
      }
    }

    if (pendingFile && savedId) {
      const { error: storageError } = await supabase.storage
        .from('dish-images')
        .upload(savedId, pendingFile, { upsert: true, contentType: pendingFile.type })
      if (storageError) {
        setError('El plato se guardó pero la imagen no se pudo subir. Intentá de nuevo editando el plato.')
        setSaving(false)
        close()
        return
      }
      const { data: { publicUrl } } = supabase.storage.from('dish-images').getPublicUrl(savedId)
      await supabase.from('dishes').update({ image_url: publicUrl }).eq('id', savedId)
    }

    close()
  }

  async function deleteDish() {
    if (!window.confirm('¿Eliminar este plato? No se puede deshacer.')) return
    const { error: deleteError } = await supabase.from('dishes').delete().eq('id', dishId)
    if (deleteError) { setError('No se pudo eliminar el plato.'); return }
    close()
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
            <Field
              label="Tiempo de cocción"
              hint={cookingTime && Number(cookingTime) >= 60
                ? `${Math.floor(Number(cookingTime) / 60)} h ${Number(cookingTime) % 60 > 0 ? `${Number(cookingTime) % 60} min` : ''}`.trim()
                : 'Opcional'}
            >
              <InputAdorn
                suffix="min"
                type="number"
                min="1"
                step="1"
                value={cookingTime}
                onChange={(e) => setCookingTime(e.target.value)}
                placeholder="90"
              />
            </Field>
            {/* Imagen del plato */}
            <div>
              <span className="mb-1 block text-sm font-bold text-navy-700">Imagen del plato</span>
              {(imagePreview ?? imageUrl) ? (
                <ImagePositionEditor
                  imageUrl={(imagePreview ?? imageUrl)!}
                  position={imagePosition}
                  zoom={imageZoom}
                  onPositionChange={setImagePosition}
                  onZoomChange={setImageZoom}
                  onSelectFile={setFile}
                  onRemove={removeImage}
                />
              ) : (
                <label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-crema-300 bg-crema-50 text-navy-500 hover:border-navy-400 hover:bg-crema-100">
                  <svg className="h-8 w-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm font-semibold">Subir imagen</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </label>
              )}
            </div>

          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-navy-500">Receta</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-navy-500">Rinde</span>
              <input
                type="number"
                min="1"
                step="1"
                value={recipeYield}
                onChange={(e) => setRecipeYield(e.target.value)}
                className="w-14 rounded-lg border border-crema-300 bg-white px-2 py-1 text-center text-sm font-bold text-navy-800 focus:border-navy-400 focus:outline-none"
              />
              <span className="text-xs text-navy-500">porciones</span>
            </div>
          </div>

          {ingredients.length === 0 ? (
            <p className="text-sm text-navy-500">
              Primero cargá tus{' '}
              <Link to="/admin/despensa" className="font-bold underline">
                ingredientes
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-2">
              {recipe.map((row, index) => {
                const ingredient = ingredientById.get(row.ingredient_id)
                return (
                  <div key={index} className="grid items-center gap-2" style={{ gridTemplateColumns: '1fr 5.5rem 3rem 2rem' }}>
                    <Select
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
                      type="number"
                      min="0"
                      step="0.001"
                      value={row.qty}
                      onChange={(e) => updateRow(index, { qty: e.target.value })}
                      placeholder="Cant."
                    />
                    <span className="text-xs font-semibold text-navy-500">
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
            {yld > 1 && (
              <div className="mb-2 flex justify-between text-xs text-navy-400">
                <span>Costo total ({yld} porciones)</span>
                <span className="tabular-nums">{formatARS(cost * yld)}</span>
              </div>
            )}
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
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar plato'}
            </Button>
            <Link to="/admin/platos">
              <Button variant="ghost">Cancelar</Button>
            </Link>
            {!isNew && (
              <Button variant="danger" type="button" onClick={deleteDish}>
                Eliminar
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
