export type Unit = 'kg' | 'g' | 'l' | 'ml' | 'u' | 'docena' | 'paquete'

export const UNITS: Unit[] = ['kg', 'g', 'l', 'ml', 'u', 'docena', 'paquete']

export interface Ingredient {
  id: string
  name: string
  unit: Unit
  current_price: number
  created_at: string
}

export interface IngredientPriceEntry {
  id: string
  ingredient_id: string
  price: number
  recorded_at: string
}

export interface Dish {
  id: string
  name: string
  description: string
  margin_pct: number
  manual_price: number | null
  active: boolean
  image_url: string | null
  created_at: string
}

export interface DishIngredient {
  dish_id: string
  ingredient_id: string
  qty_per_portion: number
}

export type MenuStatus = 'draft' | 'published' | 'closed' | 'cooked'

export interface Menu {
  id: string
  title: string
  delivery_date: string
  order_deadline: string | null
  status: MenuStatus
  notes: string
  cooking_time: number | null
  created_at: string
}

export interface MenuItem {
  id: string
  menu_id: string
  dish_id: string
  dish_name: string
  dish_description: string
  unit_price: number
  max_portions: number | null
  reserved_portions: number
  image_url: string | null
}

export type OrderStatus = 'pending' | 'confirmed' | 'delivered' | 'cancelled'
export type Fulfillment = 'pickup' | 'delivery'

export interface Order {
  id: string
  order_number: number
  menu_id: string
  customer_name: string
  customer_phone: string
  fulfillment: Fulfillment
  address: string | null
  notes: string
  status: OrderStatus
  total: number
  created_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  menu_item_id: string
  dish_name: string
  unit_price: number
  qty: number
}

export type PantryReason = 'purchase' | 'cooking' | 'adjustment'

export interface PantryMovement {
  id: string
  ingredient_id: string
  qty: number
  reason: PantryReason
  menu_id: string | null
  notes: string
  created_at: string
}

export interface AppSetting {
  key: string
  value: string
}

export const MENU_STATUS_LABELS: Record<MenuStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  closed: 'Encargos cerrados',
  cooked: 'Cocinado',
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

export const FULFILLMENT_LABELS: Record<Fulfillment, string> = {
  pickup: 'Retiro',
  delivery: 'Delivery',
}

export const PANTRY_REASON_LABELS: Record<PantryReason, string> = {
  purchase: 'Compra',
  cooking: 'Cocina',
  adjustment: 'Ajuste',
}

export interface Customer {
  id: string
  phone: string
  name: string
  address: string | null
  created_at: string
}
