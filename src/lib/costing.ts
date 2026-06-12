import type { Dish, DishIngredient, Ingredient } from './types'

/** Costo por porción: suma de cantidad por porción × precio del ingrediente. */
export function dishCost(
  recipe: DishIngredient[],
  ingredientById: Map<string, Ingredient>,
): number {
  return recipe.reduce((total, row) => {
    const ingredient = ingredientById.get(row.ingredient_id)
    return total + (ingredient ? row.qty_per_portion * ingredient.current_price : 0)
  }, 0)
}

/** Precio sugerido: costo + margen propio del plato. */
export function suggestedPrice(cost: number, marginPct: number): number {
  return cost * (1 + marginPct / 100)
}

/** Redondeo amable para precios en ARS (a los $50 más cercanos, hacia arriba). */
export function roundPrice(price: number): number {
  return Math.ceil(price / 50) * 50
}

/** Precio efectivo del plato: el manual si está fijado, si no el sugerido redondeado. */
export function effectivePrice(dish: Dish, cost: number): number {
  if (dish.manual_price !== null) return dish.manual_price
  return roundPrice(suggestedPrice(cost, dish.margin_pct))
}
