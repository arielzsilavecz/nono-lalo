import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Ingredient, IngredientPriceEntry, PantryMovement, Unit } from '../../lib/types'
import { PANTRY_REASON_LABELS, UNITS } from '../../lib/types'
import { formatARS, formatQty, formatShortDateTime } from '../../lib/format'
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, History, MoreVertical, Pencil, Search, ShoppingCart, SlidersHorizontal, Trash2, UtensilsCrossed } from 'lucide-react'
import { Button, Card, EmptyState, ErrorText, Field, Input, LoadingBlock, Modal, PageTitle, Select } from '../../components/ui'

// ── Types ────────────────────────────────────────────────────────────────────

interface MovementWithMenu extends PantryMovement {
  menus?: { title: string } | null
}

interface MovementGroup {
  key: string
  label: string
  reason: PantryMovement['reason']
  datetime: string
  movements: MovementWithMenu[]
}

interface IngredientEditor {
  id: string | null
  name: string
  unit: Unit
  price: string
  minStock: string
}

interface MovementEditor {
  ingredient: Ingredient
  mode: 'purchase' | 'adjustment'
  qty: string
  newPrice: string
  notes: string
}

type StockStatus = 'ok' | 'low' | 'empty'
type FilterType = 'all' | 'critical' | 'empty' | 'ok'
type SortCol = 'name' | 'stock' | 'min_stock' | 'status' | 'value' | 'price'

// ── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_EDITOR: IngredientEditor = { id: null, name: '', unit: 'kg', price: '', minStock: '' }

function getStatus(ingredient: Ingredient, currentStock: number): StockStatus {
  if (currentStock <= 0) return 'empty'
  if (ingredient.min_stock !== null && currentStock < ingredient.min_stock) return 'low'
  return 'ok'
}

const STATUS_CONFIG: Record<StockStatus, { label: string; dot: string; badge: string; bar: string }> = {
  ok:    { label: 'Disponible', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500' },
  low:   { label: 'Bajo stock', dot: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-800',    bar: 'bg-amber-400' },
  empty: { label: 'Sin stock',  dot: 'bg-red-500',     badge: 'bg-red-100 text-red-700',        bar: 'bg-red-500' },
}

const STATUS_ORDER: Record<StockStatus, number> = { empty: 0, low: 1, ok: 2 }

function stockBarWidth(ingredient: Ingredient, currentStock: number): number {
  if (!ingredient.min_stock || ingredient.min_stock <= 0) return currentStock > 0 ? 100 : 0
  return Math.min(100, Math.round((Math.max(0, currentStock) / ingredient.min_stock) * 100))
}

function groupMovements(movements: MovementWithMenu[]): MovementGroup[] {
  const groups: MovementGroup[] = []
  const seenMenuIds = new Set<string>()
  const cookingByMenuId = new Map<string, MovementWithMenu[]>()

  for (const m of movements) {
    if (m.reason === 'cooking' && m.menu_id) {
      if (!cookingByMenuId.has(m.menu_id)) cookingByMenuId.set(m.menu_id, [])
      cookingByMenuId.get(m.menu_id)!.push(m)
    }
  }

  for (const m of movements) {
    if (m.reason === 'cooking' && m.menu_id) {
      if (!seenMenuIds.has(m.menu_id)) {
        seenMenuIds.add(m.menu_id)
        groups.push({
          key: `cooking-${m.menu_id}`,
          label: m.menus?.title ?? m.notes ?? 'Elaboración',
          reason: 'cooking',
          datetime: m.created_at,
          movements: cookingByMenuId.get(m.menu_id)!,
        })
      }
    } else {
      groups.push({
        key: m.id,
        label: m.reason === 'purchase' ? 'Compra' : 'Ajuste manual',
        reason: m.reason,
        datetime: m.created_at,
        movements: [m],
      })
    }
  }

  return groups.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Pantry() {
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null)
  const [stock, setStock] = useState<Map<string, number>>(new Map())
  const [movements, setMovements] = useState<MovementWithMenu[]>([])

  const [ingredientEditor, setIngredientEditor] = useState<IngredientEditor | null>(null)
  const [movementEditor, setMovementEditor] = useState<MovementEditor | null>(null)
  const [historyFor, setHistoryFor] = useState<Ingredient | null>(null)
  const [history, setHistory] = useState<IngredientPriceEntry[]>([])
  const [movementsFor, setMovementsFor] = useState<Ingredient | null>(null)
  const [ingredientMovements, setIngredientMovements] = useState<MovementWithMenu[]>([])

  const [ingredientError, setIngredientError] = useState('')
  const [moveError, setMoveError] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('status')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('asc') }
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <ArrowUpDown size={11} className="opacity-40" />
    return sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
  }

  async function load() {
    const [ingredientsRes, stockRes, movementsRes] = await Promise.all([
      supabase.from('ingredients').select('*').order('name'),
      supabase.from('pantry_stock').select('*'),
      supabase.from('pantry_movements')
        .select('*, menus(title)')
        .order('created_at', { ascending: false })
        .limit(60),
    ])
    setIngredients((ingredientsRes.data ?? []) as Ingredient[])
    setStock(new Map((stockRes.data ?? []).map((r) => [r.ingredient_id as string, Number(r.stock)])))
    setMovements((movementsRes.data ?? []) as MovementWithMenu[])
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Ingredient CRUD ──

  async function saveIngredient(e: React.FormEvent) {
    e.preventDefault()
    if (!ingredientEditor) return
    setIngredientError('')
    const price = Number(ingredientEditor.price)
    if (Number.isNaN(price) || price < 0) { setIngredientError('El precio no es válido.'); return }
    const minStock = ingredientEditor.minStock === '' ? null : Number(ingredientEditor.minStock)
    if (minStock !== null && (Number.isNaN(minStock) || minStock < 0)) { setIngredientError('El stock mínimo no es válido.'); return }
    const row = { name: ingredientEditor.name.trim(), unit: ingredientEditor.unit, current_price: price, min_stock: minStock }
    const result = ingredientEditor.id
      ? await supabase.from('ingredients').update(row).eq('id', ingredientEditor.id)
      : await supabase.from('ingredients').insert(row)
    if (result.error) { setIngredientError('No se pudo guardar. Probá de nuevo.'); return }
    setIngredientEditor(null)
    load()
  }

  async function removeIngredient(ingredient: Ingredient) {
    if (!window.confirm(`¿Eliminar "${ingredient.name}"?`)) return
    const { error } = await supabase.from('ingredients').delete().eq('id', ingredient.id)
    if (error) { window.alert('No se puede eliminar: está usado en la receta de algún plato.'); return }
    load()
  }

  async function showHistory(ingredient: Ingredient) {
    setHistoryFor(ingredient)
    const { data } = await supabase
      .from('ingredient_price_history').select('*')
      .eq('ingredient_id', ingredient.id)
      .order('recorded_at', { ascending: false }).limit(20)
    setHistory((data ?? []) as IngredientPriceEntry[])
  }

  async function showIngredientMovements(ingredient: Ingredient) {
    setMovementsFor(ingredient)
    const { data } = await supabase
      .from('pantry_movements').select('*, menus(title)')
      .eq('ingredient_id', ingredient.id)
      .order('created_at', { ascending: false }).limit(30)
    setIngredientMovements((data ?? []) as MovementWithMenu[])
  }

  // ── Movement CRUD ──

  async function saveMovement(e: React.FormEvent) {
    e.preventDefault()
    if (!movementEditor) return
    setMoveError('')
    const qty = Number(movementEditor.qty)
    if (Number.isNaN(qty) || qty === 0) { setMoveError('La cantidad no es válida.'); return }
    if (movementEditor.mode === 'purchase' && qty < 0) { setMoveError('En una compra la cantidad debe ser positiva.'); return }
    const { error: insertError } = await supabase.from('pantry_movements').insert({
      ingredient_id: movementEditor.ingredient.id,
      qty,
      reason: movementEditor.mode,
      notes: movementEditor.notes.trim(),
    })
    if (insertError) { setMoveError('No se pudo registrar el movimiento.'); return }
    if (movementEditor.mode === 'purchase' && movementEditor.newPrice.trim() !== '') {
      const newPrice = Number(movementEditor.newPrice)
      if (!Number.isNaN(newPrice) && newPrice >= 0 && newPrice !== movementEditor.ingredient.current_price) {
        await supabase.from('ingredients').update({ current_price: newPrice }).eq('id', movementEditor.ingredient.id)
      }
    }
    setMovementEditor(null)
    load()
  }

  // ── Derived state ──

  if (!ingredients) return <LoadingBlock />

  const ingredientById = new Map(ingredients.map((i) => [i.id, i]))

  const withStatus = ingredients
    .map((i) => ({ ingredient: i, currentStock: stock.get(i.id) ?? 0, status: getStatus(i, stock.get(i.id) ?? 0) }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])

  const countOk    = withStatus.filter((r) => r.status === 'ok').length
  const countLow   = withStatus.filter((r) => r.status === 'low').length
  const countEmpty = withStatus.filter((r) => r.status === 'empty').length
  const totalValue = withStatus.reduce((sum, { ingredient, currentStock }) =>
    sum + Math.max(0, currentStock) * ingredient.current_price, 0)

  const critical = withStatus.filter((r) => r.status !== 'ok')

  const filtered = withStatus.filter(({ ingredient, status }) => {
    const matchesFilter =
      filter === 'all' ? true :
      filter === 'critical' ? status !== 'ok' :
      filter === 'empty' ? status === 'empty' :
      status === 'ok'
    const matchesSearch = ingredient.name.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const sortedFiltered = [...filtered].sort((a, b) => {
    let av: number | string
    let bv: number | string
    switch (sortCol) {
      case 'name':     av = a.ingredient.name.toLowerCase(); bv = b.ingredient.name.toLowerCase(); break
      case 'stock':    av = a.currentStock; bv = b.currentStock; break
      case 'min_stock': av = a.ingredient.min_stock ?? -1; bv = b.ingredient.min_stock ?? -1; break
      case 'status':   av = STATUS_ORDER[a.status]; bv = STATUS_ORDER[b.status]; break
      case 'value':    av = Math.max(0, a.currentStock) * a.ingredient.current_price; bv = Math.max(0, b.currentStock) * b.ingredient.current_price; break
      case 'price':    av = a.ingredient.current_price; bv = b.ingredient.current_price; break
    }
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string, 'es') : (av as number) - (bv as number)
    return sortDir === 'asc' ? cmp : -cmp
  })

  const movementGroups = groupMovements(movements)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <PageTitle
        title="Despensa"
        action={<Button onClick={() => setIngredientEditor(EMPTY_EDITOR)}>+ Nuevo ingrediente</Button>}
      />

      {/* Dashboard cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">Stock OK</p>
          <p className="mt-1 text-3xl font-bold text-emerald-600">{countOk}</p>
          <p className="mt-0.5 text-xs text-navy-400">ingredientes</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">Bajo stock</p>
          <p className={`mt-1 text-3xl font-bold ${countLow > 0 ? 'text-amber-500' : 'text-navy-300'}`}>{countLow}</p>
          <p className="mt-0.5 text-xs text-navy-400">ingredientes</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">Sin stock</p>
          <p className={`mt-1 text-3xl font-bold ${countEmpty > 0 ? 'text-red-600' : 'text-navy-300'}`}>{countEmpty}</p>
          <p className="mt-0.5 text-xs text-navy-400">ingredientes</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">Valor inventario</p>
          <p className="mt-1 text-xl font-bold text-navy-700">{formatARS(totalValue)}</p>
          <p className="mt-0.5 text-xs text-navy-400">en stock</p>
        </Card>
      </div>

      {/* Critical section */}
      {critical.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <h2 className="mb-3 flex flex-wrap items-center gap-2 text-sm font-bold text-red-700">
            <AlertTriangle size={15} />
            <span>Requieren reposición</span>
            <span className="text-xs font-normal text-navy-500">
              (<span className="font-semibold text-red-600">🔴 Reponer urgente</span>
              {' | '}
              <span className="font-semibold text-amber-600">🟡 Bajo mínimo</span>)
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {critical.map(({ ingredient, currentStock, status }) => (
              <div
                key={ingredient.id}
                className={`flex min-w-[160px] flex-col gap-1 rounded-lg border px-3 py-2 text-sm ${
                  status === 'empty'
                    ? 'border-red-300 bg-white'
                    : 'border-amber-300 bg-white'
                }`}
              >
                <span className="font-semibold text-navy-800">{ingredient.name}</span>
                <span className={`text-xs font-medium ${status === 'empty' ? 'text-red-600' : 'text-amber-600'}`}>
                  Stock: {formatQty(currentStock)} {ingredient.unit}
                  {ingredient.min_stock !== null && ` / mín ${formatQty(ingredient.min_stock)}`}
                </span>
                <button
                  type="button"
                  onClick={() => setMovementEditor({ ingredient, mode: 'purchase', qty: '', newPrice: String(ingredient.current_price), notes: '' })}
                  className={`mt-1 flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                    status === 'empty'
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                  }`}
                >
                  <ShoppingCart size={11} /> Registrar compra
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {ingredients.length === 0 ? (
        <EmptyState title="Sin ingredientes">
          Cargá tus ingredientes para llevar el stock y costear los platos.
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Main table */}
          <div className="space-y-3 lg:col-span-2">
            {/* Filters + search */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar ingrediente..."
                  className="w-full rounded-full border border-crema-300 bg-white py-1.5 pl-8 pr-3 text-sm text-navy-800 placeholder-navy-400 focus:border-navy-400 focus:outline-none"
                />
              </div>
              <div className="flex gap-1">
                {([
                  { key: 'all',      label: 'Todos' },
                  { key: 'critical', label: 'Críticos' },
                  { key: 'empty',    label: 'Sin stock' },
                  { key: 'ok',       label: 'Disponible' },
                ] as { key: FilterType; label: string }[]).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                      filter === key
                        ? 'bg-navy-800 text-white'
                        : 'bg-crema-100 text-navy-600 hover:bg-crema-200'
                    }`}
                  >
                    {label}
                    {key === 'critical' && countLow + countEmpty > 0 && (
                      <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">
                        {countLow + countEmpty}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <Card className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-crema-200 text-xs font-bold uppercase tracking-wide text-navy-500">
                    {([
                      ['name',      'Ingrediente', 'text-left',   'px-4'],
                      ['stock',     'Stock',       'text-center', 'px-3'],
                      ['min_stock', 'Mín',         'text-center', 'px-3'],
                      ['status',    'Estado',      'text-center', 'px-3'],
                      ['value',     'Valor',       'text-center', 'px-3'],
                      ['price',     'Precio/ud',   'text-center', 'px-3'],
                    ] as [SortCol, string, string, string][]).map(([col, label, align, px]) => (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        className={`cursor-pointer select-none ${px} py-3 ${align} transition-colors hover:bg-crema-100 hover:text-navy-700`}
                      >
                        <div className={`flex items-center gap-1 ${align === 'text-center' ? 'justify-center' : ''}`}>
                          {label} <SortIcon col={col} />
                        </div>
                      </th>
                    ))}
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFiltered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-sm text-navy-400">
                        Sin resultados
                      </td>
                    </tr>
                  )}
                  {sortedFiltered.map(({ ingredient, currentStock, status }) => {
                    const cfg = STATUS_CONFIG[status]
                    const barPct = stockBarWidth(ingredient, currentStock)
                    return (
                      <tr key={ingredient.id} className="border-b border-crema-100 last:border-0">
                        <td className="px-4 py-2.5 font-semibold text-navy-800">{ingredient.name}</td>
                        <td className={`whitespace-nowrap px-3 py-2.5 text-center font-bold ${currentStock < 0 ? 'text-red-600' : 'text-navy-900'}`}>
                          {formatQty(currentStock)} {ingredient.unit}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-center text-navy-400">
                          {ingredient.min_stock !== null ? `${formatQty(ingredient.min_stock)} ${ingredient.unit}` : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cfg.badge}`}>
                              {cfg.label}
                            </span>
                            {ingredient.min_stock !== null && (
                              <div className="h-1 w-16 overflow-hidden rounded-full bg-crema-200">
                                <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${barPct}%` }} />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-center text-navy-600">
                          {formatARS(Math.max(0, currentStock) * ingredient.current_price)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-center text-navy-500 text-xs">
                          {formatARS(ingredient.current_price)}/{ingredient.unit}
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="relative" ref={openMenuId === ingredient.id ? menuRef : undefined}>
                            <button
                              type="button"
                              onClick={() => setOpenMenuId(openMenuId === ingredient.id ? null : ingredient.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-navy-400 transition-colors hover:bg-crema-100 hover:text-navy-700"
                            >
                              <MoreVertical size={15} />
                            </button>
                            {openMenuId === ingredient.id && (
                              <div className="absolute right-0 top-8 z-50 min-w-[180px] rounded-xl border border-crema-200 bg-white py-1 shadow-lg">
                                <button type="button" onClick={() => { setMovementEditor({ ingredient, mode: 'purchase', qty: '', newPrice: String(ingredient.current_price), notes: '' }); setOpenMenuId(null) }}
                                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-navy-700 hover:bg-crema-50">
                                  <ShoppingCart size={13} /> Agregar stock
                                </button>
                                <button type="button" onClick={() => { setMovementEditor({ ingredient, mode: 'adjustment', qty: '', newPrice: '', notes: '' }); setOpenMenuId(null) }}
                                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-navy-700 hover:bg-crema-50">
                                  <SlidersHorizontal size={13} /> Ajustar inventario
                                </button>
                                <button type="button" onClick={() => { showIngredientMovements(ingredient); setOpenMenuId(null) }}
                                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-navy-700 hover:bg-crema-50">
                                  <History size={13} /> Ver movimientos
                                </button>
                                <button type="button" onClick={() => { showHistory(ingredient); setOpenMenuId(null) }}
                                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-navy-700 hover:bg-crema-50">
                                  <History size={13} /> Historial de precios
                                </button>
                                <div className="my-1 border-t border-crema-100" />
                                <button type="button" onClick={() => { setIngredientEditor({ id: ingredient.id, name: ingredient.name, unit: ingredient.unit, price: String(ingredient.current_price), minStock: ingredient.min_stock !== null ? String(ingredient.min_stock) : '' }); setOpenMenuId(null) }}
                                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-navy-700 hover:bg-crema-50">
                                  <Pencil size={13} /> Editar ingrediente
                                </button>
                                <button type="button" onClick={() => { removeIngredient(ingredient); setOpenMenuId(null) }}
                                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                                  <Trash2 size={13} /> Eliminar
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          </div>

          {/* Timeline */}
          <Card className="max-h-[calc(100vh-12rem)] overflow-y-auto">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-navy-500">Últimos movimientos</h2>
            {movementGroups.length === 0 ? (
              <p className="text-sm text-navy-400">Sin movimientos todavía.</p>
            ) : (
              <ol className="relative border-l border-crema-200">
                {movementGroups.map((group) => (
                  <li key={group.key} className="mb-5 ml-4">
                    <div className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white ${
                      group.reason === 'cooking' ? 'bg-tomate-500' :
                      group.reason === 'purchase' ? 'bg-emerald-500' : 'bg-navy-400'
                    }`} />
                    <p className="text-[11px] text-navy-400">{formatShortDateTime(group.datetime)}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-navy-700">
                      {group.reason === 'cooking' && <UtensilsCrossed size={12} className="text-tomate-500" />}
                      {group.label}
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
                      {Array.from(
                        group.movements.reduce((acc, m) => {
                          acc.set(m.ingredient_id, (acc.get(m.ingredient_id) ?? 0) + Number(m.qty))
                          return acc
                        }, new Map<string, number>())
                      ).map(([ingredientId, totalQty]) => {
                        const ing = ingredientById.get(ingredientId)
                        return (
                          <li key={ingredientId} className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-navy-600">{ing?.name ?? '—'}</span>
                            <span className={`font-bold tabular-nums ${totalQty < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                              {totalQty > 0 ? '+' : ''}{formatQty(totalQty)} {ing?.unit ?? ''}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                    {group.reason !== 'cooking' && group.movements[0].notes && (
                      <p className="mt-1 text-xs text-navy-400">{group.movements[0].notes}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}

      {/* Modal: editar/crear ingrediente */}
      {ingredientEditor && (
        <Modal
          title={ingredientEditor.id ? 'Editar ingrediente' : 'Nuevo ingrediente'}
          onClose={() => setIngredientEditor(null)}
        >
          <form onSubmit={saveIngredient} className="space-y-4">
            <Field label="Nombre">
              <Input required value={ingredientEditor.name}
                onChange={(e) => setIngredientEditor({ ...ingredientEditor, name: e.target.value })}
                placeholder="Ej: Harina 000" />
            </Field>
            <Field label="Unidad de medida" hint="Las recetas se cargan en esta misma unidad.">
              <Select value={ingredientEditor.unit}
                onChange={(e) => setIngredientEditor({ ...ingredientEditor, unit: e.target.value as Unit })}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
            </Field>
            <Field label={`Precio por ${ingredientEditor.unit} ($)`}>
              <Input required type="number" min="0" step="0.01" value={ingredientEditor.price}
                onChange={(e) => setIngredientEditor({ ...ingredientEditor, price: e.target.value })} />
            </Field>
            <Field label={`Stock mínimo (${ingredientEditor.unit})`} hint="Umbral para alerta de bajo stock. Opcional.">
              <Input type="number" min="0" step="0.001" value={ingredientEditor.minStock}
                placeholder="Sin mínimo"
                onChange={(e) => setIngredientEditor({ ...ingredientEditor, minStock: e.target.value })} />
            </Field>
            {ingredientError && <ErrorText>{ingredientError}</ErrorText>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIngredientEditor(null)}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: movimiento de stock */}
      {movementEditor && (
        <Modal
          title={movementEditor.mode === 'purchase' ? `Compra: ${movementEditor.ingredient.name}` : `Ajuste: ${movementEditor.ingredient.name}`}
          onClose={() => setMovementEditor(null)}
        >
          <form onSubmit={saveMovement} className="space-y-4">
            <Field
              label={`Cantidad (${movementEditor.ingredient.unit})`}
              hint={movementEditor.mode === 'adjustment' ? 'Usá negativo para descontar (ej: -0.5).' : undefined}
            >
              <Input required type="number" step="0.001" value={movementEditor.qty}
                onChange={(e) => setMovementEditor({ ...movementEditor, qty: e.target.value })} />
            </Field>
            {movementEditor.mode === 'purchase' && (
              <Field label={`Precio por ${movementEditor.ingredient.unit} ($)`}
                hint="Si cambió, actualiza el precio del ingrediente y el costeo de los platos.">
                <Input type="number" min="0" step="0.01" value={movementEditor.newPrice}
                  onChange={(e) => setMovementEditor({ ...movementEditor, newPrice: e.target.value })} />
              </Field>
            )}
            <Field label="Nota (opcional)">
              <Input value={movementEditor.notes} placeholder="Ej: compra en el mayorista"
                onChange={(e) => setMovementEditor({ ...movementEditor, notes: e.target.value })} />
            </Field>
            {moveError && <ErrorText>{moveError}</ErrorText>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setMovementEditor(null)}>Cancelar</Button>
              <Button type="submit">Registrar</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: movimientos del ingrediente */}
      {movementsFor && (
        <Modal title={`Movimientos: ${movementsFor.name}`} onClose={() => setMovementsFor(null)}>
          {ingredientMovements.length === 0 ? (
            <p className="text-sm text-navy-500">Sin movimientos todavía.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {ingredientMovements.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-2 border-b border-crema-100 pb-2 last:border-0">
                  <div>
                    <p className="font-semibold text-navy-700">
                      {PANTRY_REASON_LABELS[m.reason]}
                      {m.menus?.title ? ` · ${m.menus.title}` : m.notes ? ` · ${m.notes}` : ''}
                    </p>
                    <p className="text-xs text-navy-400">{formatShortDateTime(m.created_at)}</p>
                  </div>
                  <span className={`whitespace-nowrap font-bold tabular-nums ${m.qty < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                    {m.qty > 0 ? '+' : ''}{formatQty(Number(m.qty))} {movementsFor.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {/* Modal: historial de precios */}
      {historyFor && (
        <Modal title={`Historial de precios: ${historyFor.name}`} onClose={() => setHistoryFor(null)}>
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
