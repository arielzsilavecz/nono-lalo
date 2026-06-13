import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Dish, DishIngredient, Ingredient } from '../../lib/types'
import { dishCost, effectivePrice, roundPrice, suggestedPrice } from '../../lib/costing'
import { formatARS } from '../../lib/format'
import { Badge, Button, Card, EmptyState, LoadingBlock, PageTitle } from '../../components/ui'

export function Dishes() {
  const [dishes, setDishes] = useState<Dish[] | null>(null)
  const [recipes, setRecipes] = useState<DishIngredient[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])

  async function load() {
    const [dishesRes, recipesRes, ingredientsRes] = await Promise.all([
      supabase.from('dishes').select('*').order('name'),
      supabase.from('dish_ingredients').select('*'),
      supabase.from('ingredients').select('*'),
    ])
    setDishes((dishesRes.data ?? []) as Dish[])
    setRecipes((recipesRes.data ?? []) as DishIngredient[])
    setIngredients((ingredientsRes.data ?? []) as Ingredient[])
  }

  useEffect(() => {
    load()
  }, [])

  async function toggleActive(dish: Dish) {
    await supabase.from('dishes').update({ active: !dish.active }).eq('id', dish.id)
    load()
  }

  if (!dishes) return <LoadingBlock />

  const ingredientById = new Map(ingredients.map((i) => [i.id, i]))

  return (
    <div>
      <PageTitle
        title="Platos"
        action={
          <Link to="/admin/platos/nuevo">
            <Button>+ Nuevo plato</Button>
          </Link>
        }
      />

      {dishes.length === 0 ? (
        <EmptyState title="El recetario está vacío">
          Creá tus platos con su receta para calcular costos y precios.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-crema-200 text-left text-xs font-bold uppercase tracking-wide text-navy-500">
                <th className="px-4 py-3">Plato</th>
                <th className="px-4 py-3 text-right">Costo/porción</th>
                <th className="px-4 py-3 text-right">Margen</th>
                <th className="px-4 py-3 text-right">Sugerido</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {dishes.map((dish) => {
                const recipe = recipes.filter((r) => r.dish_id === dish.id)
                const cost = dishCost(recipe, ingredientById)
                const suggested = roundPrice(suggestedPrice(cost, dish.margin_pct))
                const price = effectivePrice(dish, cost)
                return (
                  <tr key={dish.id} className="border-b border-crema-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {dish.image_url ? (
                          <img src={dish.image_url} alt={dish.name} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <div className="h-10 w-10 shrink-0 rounded-lg bg-crema-200" />
                        )}
                        <div>
                          <p className="font-semibold text-navy-800">{dish.name}</p>
                          {recipe.length === 0 && (
                            <p className="text-xs text-tomate-600">Sin receta cargada</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-navy-700">{formatARS(cost)}</td>
                    <td className="px-4 py-3 text-right text-navy-700">{dish.margin_pct}%</td>
                    <td className="px-4 py-3 text-right text-navy-700">{formatARS(suggested)}</td>
                    <td className="px-4 py-3 text-right font-bold text-navy-900">
                      {formatARS(price)}
                      {dish.manual_price !== null && (
                        <span className="ml-1 text-xs font-semibold text-navy-400">(manual)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={dish.active ? 'green' : 'gray'}>
                        {dish.active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" onClick={() => toggleActive(dish)}>
                          {dish.active ? 'Desactivar' : 'Activar'}
                        </Button>
                        <Link to={`/admin/platos/${dish.id}`}>
                          <Button variant="secondary">Editar</Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
