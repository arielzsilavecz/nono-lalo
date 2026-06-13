import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Ingredient, PantryMovement } from '../../lib/types'
import { PANTRY_REASON_LABELS } from '../../lib/types'
import { formatARS, formatQty, formatShortDateTime } from '../../lib/format'
import { ShoppingCart } from 'lucide-react'
import { Button, Card, EmptyState, ErrorText, Field, Input, LoadingBlock, Modal, PageTitle } from '../../components/ui'

interface MovementEditor {
  ingredient: Ingredient
  mode: 'purchase' | 'adjustment'
  qty: string
  newPrice: string
  notes: string
}

export function Pantry() {
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null)
  const [stock, setStock] = useState<Map<string, number>>(new Map())
  const [movements, setMovements] = useState<PantryMovement[]>([])
  const [editor, setEditor] = useState<MovementEditor | null>(null)
  const [error, setError] = useState('')

  async function load() {
    const [ingredientsRes, stockRes, movementsRes] = await Promise.all([
      supabase.from('ingredients').select('*').order('name'),
      supabase.from('pantry_stock').select('*'),
      supabase.from('pantry_movements').select('*').order('created_at', { ascending: false }).limit(25),
    ])
    setIngredients((ingredientsRes.data ?? []) as Ingredient[])
    setStock(
      new Map(
        (stockRes.data ?? []).map((row) => [row.ingredient_id as string, Number(row.stock)]),
      ),
    )
    setMovements((movementsRes.data ?? []) as PantryMovement[])
  }

  useEffect(() => {
    load()
  }, [])

  async function saveMovement(e: React.FormEvent) {
    e.preventDefault()
    if (!editor) return
    setError('')

    const qty = Number(editor.qty)
    if (Number.isNaN(qty) || qty === 0) {
      setError('La cantidad no es válida.')
      return
    }
    if (editor.mode === 'purchase' && qty < 0) {
      setError('En una compra la cantidad debe ser positiva.')
      return
    }

    const { error: movementError } = await supabase.from('pantry_movements').insert({
      ingredient_id: editor.ingredient.id,
      qty,
      reason: editor.mode,
      notes: editor.notes.trim(),
    })
    if (movementError) {
      setError('No se pudo registrar el movimiento.')
      return
    }

    if (editor.mode === 'purchase' && editor.newPrice.trim() !== '') {
      const newPrice = Number(editor.newPrice)
      if (!Number.isNaN(newPrice) && newPrice >= 0 && newPrice !== editor.ingredient.current_price) {
        await supabase.from('ingredients').update({ current_price: newPrice }).eq('id', editor.ingredient.id)
      }
    }

    setEditor(null)
    load()
  }

  if (!ingredients) return <LoadingBlock />

  const ingredientById = new Map(ingredients.map((i) => [i.id, i]))

  return (
    <div>
      <PageTitle title="Despensa" />

      {ingredients.length === 0 ? (
        <EmptyState title="Sin ingredientes">
          Cargá ingredientes primero para llevar el stock de tu despensa.
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="overflow-x-auto p-0 lg:col-span-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-crema-200 text-left text-xs font-bold uppercase tracking-wide text-navy-500">
                  <th className="px-4 py-3">Ingrediente</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-center">Valor aproximado</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ingredient) => {
                  const currentStock = stock.get(ingredient.id) ?? 0
                  return (
                    <tr key={ingredient.id} className="border-b border-crema-100 last:border-0">
                      <td className="px-4 py-3 font-semibold text-navy-800">{ingredient.name}</td>
                      <td className={`px-4 py-3 text-right font-bold ${currentStock < 0 ? 'text-tomate-600' : 'text-navy-900'}`}>
                        {formatQty(currentStock)} {ingredient.unit}
                      </td>
                      <td className="px-4 py-3 text-center text-navy-600">
                        {formatARS(Math.max(0, currentStock) * ingredient.current_price)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="secondary"
                            onClick={() =>
                              setEditor({
                                ingredient,
                                mode: 'purchase',
                                qty: '',
                                newPrice: String(ingredient.current_price),
                                notes: '',
                              })
                            }
                          >
                            <ShoppingCart size={14} className="mr-1" />
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setEditor({ ingredient, mode: 'adjustment', qty: '', newPrice: '', notes: '' })
                            }
                          >
                            Ajustar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy-500">
              Últimos movimientos
            </h2>
            {movements.length === 0 ? (
              <p className="text-sm text-navy-500">Sin movimientos todavía.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {movements.map((movement) => {
                  const ingredient = ingredientById.get(movement.ingredient_id)
                  return (
                    <li key={movement.id} className="border-b border-crema-100 pb-2 last:border-0">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold text-navy-800">{ingredient?.name ?? '—'}</span>
                        <span className={`font-bold ${movement.qty < 0 ? 'text-tomate-600' : 'text-emerald-700'}`}>
                          {movement.qty > 0 ? '+' : ''}
                          {formatQty(Number(movement.qty))} {ingredient?.unit ?? ''}
                        </span>
                      </div>
                      <p className="text-xs text-navy-500">
                        {PANTRY_REASON_LABELS[movement.reason]} · {formatShortDateTime(movement.created_at)}
                        {movement.notes ? ` · ${movement.notes}` : ''}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      )}

      {editor && (
        <Modal
          title={
            editor.mode === 'purchase'
              ? `Compra: ${editor.ingredient.name}`
              : `Ajuste: ${editor.ingredient.name}`
          }
          onClose={() => setEditor(null)}
        >
          <form onSubmit={saveMovement} className="space-y-4">
            <Field
              label={`Cantidad (${editor.ingredient.unit})`}
              hint={editor.mode === 'adjustment' ? 'Usá negativo para descontar (ej: -0.5).' : undefined}
            >
              <Input
                required
                type="number"
                step="0.001"
                value={editor.qty}
                onChange={(e) => setEditor({ ...editor, qty: e.target.value })}
              />
            </Field>
            {editor.mode === 'purchase' && (
              <Field
                label={`Precio por ${editor.ingredient.unit} ($)`}
                hint="Si cambió, actualiza el precio del ingrediente y el costeo de los platos."
              >
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editor.newPrice}
                  onChange={(e) => setEditor({ ...editor, newPrice: e.target.value })}
                />
              </Field>
            )}
            <Field label="Nota (opcional)">
              <Input
                value={editor.notes}
                onChange={(e) => setEditor({ ...editor, notes: e.target.value })}
                placeholder="Ej: compra en el mayorista"
              />
            </Field>
            {error && <ErrorText>{error}</ErrorText>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditor(null)}>
                Cancelar
              </Button>
              <Button type="submit">Registrar</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
