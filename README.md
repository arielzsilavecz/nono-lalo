# il nonno Lalo 🍝

Tablero de gestión + carta online para el emprendimiento de comidas caseras **il nonno Lalo**.
*Cocina casera con alma de familia.*

## Qué hace

**Carta pública** (sin registro, para los clientes):

- Menús publicados por fecha de entrega, con platos, precios y porciones disponibles.
- Encargo/reserva antes de cocinar: el cliente deja nombre y teléfono, elige retiro o
  delivery y confirma. Paga al recibir (efectivo o transferencia).
- Botón "Confirmar por WhatsApp" con el detalle del pedido prearmado.

**Tablero de cocina** (`/admin`, con login):

- **Ingredientes** con precio por unidad e historial de precios.
- **Platos** con receta por porción → costo automático, margen de ganancia propio de
  cada plato y precio sugerido (o manual).
- **Menús por fecha** con cierre de encargos, cupos opcionales por plato y precios
  congelados al publicar.
- **Pedidos**: bandeja con estados (pendiente → confirmado → entregado / cancelado);
  al cancelar se liberan las porciones reservadas.
- **Lista de compras** calculada desde los pedidos, con opción de descontar lo que ya
  hay en despensa, costo estimado e impresión.
- **Despensa**: stock real con compras, ajustes y descuento automático al marcar un
  menú como cocinado.

## Stack

- **Frontend**: React 18 + TypeScript + Vite · Tailwind CSS v4 · React Router v6
- **Backend**: Supabase — PostgreSQL con RLS, Auth y Edge Functions (Deno)
- **Deploy**: Vercel (frontend, auto-deploy desde `main`) + Supabase (DB y funciones)

## Puesta en marcha

### 1. Crear el proyecto en Supabase

1. Crear un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, ejecutar el contenido de
   [`supabase/migrations/0001_esquema_inicial.sql`](supabase/migrations/0001_esquema_inicial.sql).
3. (Opcional) Ejecutar [`supabase/seed.sql`](supabase/seed.sql) para datos de ejemplo.
4. En **Authentication → Sign In / Up**, **deshabilitar los registros públicos**
   (Allow new users to sign up: OFF). Cualquier usuario autenticado es admin.
5. En **Authentication → Users → Add user**, crear los dos usuarios admin
   (email + contraseña) — uno para cada hermano 😄.

### 2. Desplegar la Edge Function

Con la [CLI de Supabase](https://supabase.com/docs/guides/cli) instalada:

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy place-order
```

La función usa las variables `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` que
Supabase inyecta automáticamente; no hay que configurar nada más.

### 3. Correr el frontend en local

```bash
cp .env.example .env   # completar con URL y anon key del proyecto
npm install
npm run dev
```

Los valores están en el dashboard de Supabase, **Project Settings → API**.

### 4. Deploy en Vercel

1. Importar el repo en [vercel.com](https://vercel.com) (framework: Vite).
2. Agregar las variables de entorno `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. Listo: cada push a `main` despliega solo. El `vercel.json` ya incluye el rewrite
   de SPA para React Router.

### 5. Primeros pasos en la app

1. Entrar a `/admin` y completar **Ajustes** (WhatsApp del negocio y dirección de retiro).
2. Cargar **Ingredientes** con sus precios.
3. Crear **Platos** con su receta y margen.
4. Crear un **Menú**, agregarle platos y **publicarlo**: ya se puede compartir el link.

## Estructura

```
src/
  components/    UI compartida, logo y mascota (SVG)
  context/       sesión de Supabase Auth
  layouts/       layout público y del tablero
  lib/           cliente supabase, tipos, formato, costeo
  pages/
    public/      Home, menú con carrito, confirmación
    admin/       login, resumen, menús, pedidos, compras,
                 platos, ingredientes, despensa, ajustes
supabase/
  migrations/    esquema, RLS, función place_order
  functions/     edge function place-order (Deno)
  seed.sql       datos de ejemplo (opcional)
```

## Notas de diseño

- Las **recetas se cargan en la unidad del ingrediente** (si la harina se compra por
  kg, la receta va en kg: `0.1` = 100 g por porción).
- Los pedidos públicos entran **solo** por la edge function `place-order`, que valida
  cupo y fecha límite de forma atómica en Postgres y calcula el total con los precios
  de la base — nunca con datos del navegador.
- El precio de un plato dentro de un menú queda **congelado** al agregarlo, aunque
  después cambien los costos de los ingredientes.
