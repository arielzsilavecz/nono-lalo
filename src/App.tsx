import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, RequireAuth } from './context/AuthContext'
import { PublicLayout } from './layouts/PublicLayout'
import { AdminLayout } from './layouts/AdminLayout'
import { Home } from './pages/public/Home'
import { PublicMenu } from './pages/public/PublicMenu'
import { OrderConfirmed } from './pages/public/OrderConfirmed'
import { Login } from './pages/admin/Login'
import { ChangePassword } from './pages/admin/ChangePassword'
import { Dashboard } from './pages/admin/Dashboard'
import { Menus } from './pages/admin/Menus'
import { MenuEditor } from './pages/admin/MenuEditor'
import { Publications } from './pages/admin/Publications'
import { PublicationEditor } from './pages/admin/PublicationEditor'
import { Orders } from './pages/admin/Orders'
import { ShoppingList } from './pages/admin/ShoppingList'
import { Dishes } from './pages/admin/Dishes'
import { DishEditor } from './pages/admin/DishEditor'
import { Pantry } from './pages/admin/Pantry'
import { Settings } from './pages/admin/Settings'
import { Customers } from './pages/admin/Customers'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/menu/:menuId" element={<PublicMenu />} />
            <Route path="/pedido-confirmado" element={<OrderConfirmed />} />
          </Route>

          <Route path="/admin/login" element={<Login />} />
          <Route path="/admin/cambiar-contrasena" element={<RequireAuth><ChangePassword /></RequireAuth>} />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="publicaciones" element={<Publications />} />
            <Route path="publicaciones/:pubId" element={<PublicationEditor />} />
            <Route path="menus" element={<Menus />} />
            <Route path="menus/:menuId" element={<MenuEditor />} />
            <Route path="pedidos" element={<Orders />} />
            <Route path="clientes" element={<Customers />} />
            <Route path="compras" element={<ShoppingList />} />
            <Route path="platos" element={<Dishes />} />
            <Route path="platos/:dishId" element={<DishEditor />} />
            <Route path="despensa" element={<Pantry />} />
            <Route path="ajustes" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
