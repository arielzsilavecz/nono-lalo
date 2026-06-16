import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Ingredient, Menu } from '../../lib/types'
import { formatARS, formatDateOnly, formatDayMonth, formatQty } from '../../lib/format'
import { Button, Card, EmptyState, LoadingBlock, PageTitle, Select } from '../../components/ui'

interface ShoppingRow {
  ingredient: Ingredient
  needed: number
  inPantry: number
  toBuy: number
  cost: number
}

export function ShoppingList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [menus, setMenus] = useState<Menu[] | null>(null)
  const [includePending, setIncludePending] = useState(true)
  const [usePantry, setUsePantry] = useState(true)
  const [rows, setRows] = useState<ShoppingRow[]>([])
  const [orderCount, setOrderCount] = useState(0)
  const [computing, setComputing] = useState(false)

  const selectedMenuId = searchParams.get('menu') ?? ''

  useEffect(() => {
    supabase
      .from('menus')
      .select('*')
      .neq('status', 'draft')
      .order('delivery_date', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        const list = (data ?? []) as Menu[]
        setMenus(list)
        if (!searchParams.get('menu') && list.length > 0) {
          setSearchParams({ menu: list[0].id }, { replace: true })
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const compute = useCallback(async () => {
    if (!selectedMenuId) return
    setComputing(true)

    const statuses = includePending ? ['pending', 'confirmed'] : ['confirmed']
    const [{ data: orderRows }, { data: menuItemRows }] = await Promise.all([
      supabase.from('orders').select('id').eq('menu_id', selectedMenuId).in('status', statuses),
      supabase.from('menu_items').select('id, dish_id').eq('menu_id', selectedMenuId),
    ])
    const orderIds = (orderRows ?? []).map((o) => o.id as string)
    setOrderCount(orderIds.length)

    const portionsByDish = new Map<string, number>()
    if (orderIds.length > 0) {
      const { data: orderItemRows } = await supabase
        .from('order_items')
        .select('menu_item_id, qty')
        .in('order_id', orderIds)
      const dishByMenuItem = new Map((menuItemRows ?? []).map((mi) => [mi.id as string, mi.dish_id as string]))
      for (const row of orderItemRows ?? []) {
        const dishId = dishByMenuItem.get(row.menu_item_id as string)
        if (dishId) {
          portionsByDish.set(dishId, (portionsByDish.get(dishId) ?? 0) + Number(row.qty))
        }
      }
    }

    const needed = new Map<string, number>()
    if (portionsByDish.size > 0) {
      const { data: recipeRows } = await supabase
        .from('dish_ingredients')
        .select('*')
        .in('dish_id', [...portionsByDish.keys()])
      for (const recipe of recipeRows ?? []) {
        const portions = portionsByDish.get(recipe.dish_id as string) ?? 0
        needed.set(
          recipe.ingredient_id as string,
          (needed.get(recipe.ingredient_id as string) ?? 0) + portions * Number(recipe.qty_per_portion),
        )
      }
    }

    if (needed.size === 0) {
      setRows([])
      setComputing(false)
      return
    }

    const [{ data: ingredientRows }, { data: stockRows }] = await Promise.all([
      supabase.from('ingredients').select('*').in('id', [...needed.keys()]),
      supabase.from('pantry_stock').select('*').in('ingredient_id', [...needed.keys()]),
    ])
    const stockByIngredient = new Map(
      (stockRows ?? []).map((s) => [s.ingredient_id as string, Number(s.stock)]),
    )

    const result: ShoppingRow[] = ((ingredientRows ?? []) as Ingredient[])
      .map((ingredient) => {
        const neededQty = needed.get(ingredient.id) ?? 0
        const inPantry = Math.max(0, stockByIngredient.get(ingredient.id) ?? 0)
        const toBuy = usePantry ? Math.max(0, neededQty - inPantry) : neededQty
        return {
          ingredient,
          needed: neededQty,
          inPantry,
          toBuy,
          cost: toBuy * ingredient.current_price,
        }
      })
      .sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name))

    setRows(result)
    setComputing(false)
  }, [selectedMenuId, includePending, usePantry])

  useEffect(() => {
    compute()
  }, [compute])

  if (!menus) return <LoadingBlock />

  const selectedMenu = menus.find((m) => m.id === selectedMenuId)
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0)

  return (
    <div>
      <PageTitle
        title="Lista de compras"
        action={
          <Button variant="ghost" className="no-print" onClick={() => window.print()}>
            🖨 Imprimir
          </Button>
        }
      />

      <div className="no-print mb-4 flex flex-wrap items-center gap-4">
        <Select
          className="w-auto!"
          value={selectedMenuId}
          onChange={(e) => setSearchParams({ menu: e.target.value })}
        >
          {menus.map((menu) => (
            <option key={menu.id} value={menu.id}>
              {menu.title} · {formatDayMonth(menu.delivery_date)}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm font-semibold text-navy-700">
          <input
            type="checkbox"
            checked={includePending}
            onChange={(e) => setIncludePending(e.target.checked)}
            className="h-4 w-4 accent-tomate-500"
          />
          Incluir pedidos pendientes
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-navy-700">
          <input
            type="checkbox"
            checked={usePantry}
            onChange={(e) => setUsePantry(e.target.checked)}
            className="h-4 w-4 accent-tomate-500"
          />
          Descontar lo que hay en despensa
        </label>
      </div>

      {selectedMenu && (
        <p className="mb-4 text-sm text-navy-600">
          <strong>{selectedMenu.title}</strong> · entrega {formatDateOnly(selectedMenu.delivery_date)} ·{' '}
          {orderCount} pedidos considerados
        </p>
      )}

      {computing ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState title="Nada que comprar (por ahora)">
          Cuando haya pedidos con porciones, acá vas a ver cuánto comprar de cada ingrediente.
        </EmptyState>
      ) : (
        <>
        {/* Mobile: lista de cards */}
        <div className="space-y-2 md:hidden print:hidden">
          {rows.map((row) => (
            <div
              key={row.ingredient.id}
              className={`flex items-center justify-between gap-3 rounded-xl border border-crema-200 bg-white px-4 py-3 ${row.toBuy <= 0 ? 'opacity-50' : ''}`}
            >
              <div className="min-w-0">
                <p className="font-semibold text-navy-800">{row.ingredient.name}</p>
                <p className="text-xs text-navy-500">
                  Necesario {formatQty(row.needed)} · en despensa {formatQty(row.inPantry)} {row.ingredient.unit}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-bold text-navy-900">{formatQty(row.toBuy)} {row.ingredient.unit}</p>
                <p className="text-xs font-bold text-tomate-600">{formatARS(row.cost)}</p>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-xl bg-crema-100 px-4 py-3">
            <span className="font-bold text-navy-900">Total estimado</span>
            <span className="text-lg font-bold text-tomate-600">{formatARS(totalCost)}</span>
          </div>
        </div>

        {/* Desktop / impresión: tabla */}
        <Card className="hidden overflow-x-auto p-0 md:block print:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-crema-200 text-left text-xs font-bold uppercase tracking-wide text-navy-500">
                <th className="px-4 py-3">Ingrediente</th>
                <th className="px-4 py-3 text-right">Necesario</th>
                <th className="px-4 py-3 text-right">En despensa</th>
                <th className="px-4 py-3 text-right">A comprar</th>
                <th className="px-4 py-3 text-right">Costo estimado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.ingredient.id}
                  className={`border-b border-crema-100 last:border-0 ${row.toBuy <= 0 ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3 font-semibold text-navy-800">{row.ingredient.name}</td>
                  <td className="px-4 py-3 text-right text-navy-700">
                    {formatQty(row.needed)} {row.ingredient.unit}
                  </td>
                  <td className="px-4 py-3 text-right text-navy-700">
                    {formatQty(row.inPantry)} {row.ingredient.unit}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-navy-900">
                    {formatQty(row.toBuy)} {row.ingredient.unit}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-tomate-600">
                    {formatARS(row.cost)}
                  </td>
                </tr>
              ))}
              <tr className="bg-crema-100">
                <td colSpan={4} className="px-4 py-3 text-right font-bold text-navy-900">
                  Total estimado
                </td>
                <td className="px-4 py-3 text-right text-lg font-bold text-tomate-600">
                  {formatARS(totalCost)}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
        </>
      )}
    </div>
  )
}
