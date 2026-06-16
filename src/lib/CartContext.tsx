import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export interface CartItem {
  menuId: string
  menuItemId: string
  menuTitle: string
  deliveryDate: string
  dishName: string
  unitPrice: number
  qty: number
  deliveryIncluded: boolean
  maxPortions: number | null
  reservedPortions: number
}

interface CartContextValue {
  items: CartItem[]
  getQty: (menuItemId: string) => number
  setItemQty: (meta: Omit<CartItem, 'qty'>, qty: number) => void
  clearCart: () => void
  totalItems: number
  subtotal: number
}

const CartContext = createContext<CartContextValue | null>(null)
const STORAGE_KEY = 'nono_cart'

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as CartItem[]
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  function getQty(menuItemId: string): number {
    return items.find((i) => i.menuItemId === menuItemId)?.qty ?? 0
  }

  function setItemQty(meta: Omit<CartItem, 'qty'>, qty: number) {
    setItems((prev) => {
      if (qty <= 0) return prev.filter((i) => i.menuItemId !== meta.menuItemId)
      const exists = prev.some((i) => i.menuItemId === meta.menuItemId)
      if (exists) return prev.map((i) => i.menuItemId === meta.menuItemId ? { ...i, qty } : i)
      return [...prev, { ...meta, qty }]
    })
  }

  function clearCart() {
    setItems([])
  }

  return (
    <CartContext.Provider value={{
      items,
      getQty,
      setItemQty,
      clearCart,
      totalItems: items.reduce((s, i) => s + i.qty, 0),
      subtotal: items.reduce((s, i) => s + i.unitPrice * i.qty, 0),
    }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
