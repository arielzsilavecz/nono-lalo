import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Ingredient, IngredientPriceEntry, Unit } from '../../lib/types'
import { UNITS } from '../../lib/types'
import { formatARS, formatShortDateTime } from '../../lib/format'
import { Button, Card, EmptyState, ErrorText, Field, Input, LoadingBlock, Modal, PageTitle, Select } from '../../components/ui'

interface EditorState {
  id: string | null
  name: string
  unit: Unit
  price: string
}

const EMPTY_EDITOR: EditorState = { id: null, name: '', unit: 'kg', price: '' }

export function Ingredients() {
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [error, setError] = useState('')
  const [historyFor, setHistoryFor] = useState<Ingredient | null>(null)
  const [history, setHistory] = useState<IngredientPriceEntry[]>([])

  async function load() {
    const { data } = await supabase.from('ingredients').select('*').order('name')
    setIngredients((data ?? []) as Ingredient[])
  }

  useEffect(() => {
    load()
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!editor) return
    setError('')
    const price = Number(editor.price)
    if (Number.isNaN(price) || price < 0) {
      setError('El precio no es válido.')
      return
    }
    const row = { name: editor.name.trim(), unit: editor.unit, current_price: price }
    const result = editor.id
      ? await supabase.from('ingredients').update(row).eq('id', editor.id)
      : await supabase.from('ingredients').insert(row)
    if (result.error) {
      setError('No se pudo guardar. Probá de nuevo.')
      return
    }
    setEditor(null)
    load()
  }

  async function remove(ingredient: Ingredient) {
    if (!window.confirm(`¿Eliminar "${ingredient.name}"?`)) return
    const { error: deleteError } = await supabase.from('ingredients').delete().eq('id', ingredient.id)
    if (deleteError) {
      window.alert('No se puede eliminar: está usado en la receta de algún plato.')
      return
    }
    load()
  }

  async function showHistory(ingredient: Ingredient) {
    setHistoryFor(ingredient)
    const { data } = await supabase
      .from('ingredient_price_history')
      .select('*')
      .eq('ingredient_id', ingredient.id)
      .order('recorded_at', { ascending: false })
      .limit(20)
    setHistory((data ?? []) as IngredientPriceEntry[])
  }

  if (!ingredients) return <LoadingBlock />

  return (
    <div>
      <PageTitle
        title="Ingredientes"
        action={<Button onClick={() => setEditor(EMPTY_EDITOR)}>+ Nuevo ingrediente</Button>}
      />

      {ingredients.length === 0 ? (
        <EmptyState title="Sin ingredientes todavía">
          Cargá tus ingredientes con su precio para poder costear los platos.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-crema-200 text-left text-xs font-bold uppercase tracking-wide text-navy-500">
                <th className="px-4 py-3">Ingrediente</th>
                <th className="px-4 py-3">Unidad</th>
                <th className="px-4 py-3 text-right">Precio por unidad</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((ingredient) => (
                <tr key={ingredient.id} className="border-b border-crema-100 last:border-0">
                  <td className="px-4 py-3 font-semibold text-navy-800">{ingredient.name}</td>
                  <td className="px-4 py-3 text-navy-600">{ingredient.unit}</td>
                  <td className="px-4 py-3 text-right font-bold text-navy-800">
                    {formatARS(ingredient.current_price)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" onClick={() => showHistory(ingredient)}>
                        Historial
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setEditor({
                            id: ingredient.id,
                            name: ingredient.name,
                            unit: ingredient.unit,
                            price: String(ingredient.current_price),
                          })
                        }
                      >
                        Editar
                      </Button>
                      <Button variant="danger" onClick={() => remove(ingredient)}>
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editor && (
        <Modal
          title={editor.id ? 'Editar ingrediente' : 'Nuevo ingrediente'}
          onClose={() => setEditor(null)}
        >
          <form onSubmit={save} className="space-y-4">
            <Field label="Nombre">
              <Input
                required
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                placeholder="Ej: Harina 000"
              />
            </Field>
            <Field label="Unidad de medida" hint="Las recetas se cargan en esta misma unidad.">
              <Select
                value={editor.unit}
                onChange={(e) => setEditor({ ...editor, unit: e.target.value as Unit })}
              >
                {UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`Precio por ${editor.unit} ($)`}>
              <Input
                required
                type="number"
                min="0"
                step="0.01"
                value={editor.price}
                onChange={(e) => setEditor({ ...editor, price: e.target.value })}
              />
            </Field>
            {error && <ErrorText>{error}</ErrorText>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditor(null)}>
                Cancelar
              </Button>
              <Button type="submit">Guardar</Button>
            </div>
          </form>
        </Modal>
      )}

      {historyFor && (
        <Modal title={`Historial: ${historyFor.name}`} onClose={() => setHistoryFor(null)}>
          {history.length === 0 ? (
            <p className="text-sm text-navy-500">Sin registros de precio.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {history.map((entry) => (
                <li key={entry.id} className="flex justify-between border-b border-crema-100 py-1.5 last:border-0">
                  <span className="text-navy-600">{formatShortDateTime(entry.recorded_at)}</span>
                  <span className="font-bold text-navy-800">{formatARS(entry.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  )
}
