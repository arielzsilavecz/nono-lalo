-- =====================================================================
-- il nonno Lalo — esquema inicial
-- Ejecutar en el SQL Editor de Supabase (o con `supabase db push`).
-- Modelo: cualquier usuario autenticado es admin (los clientes no se
-- registran). Deshabilitar signups públicos en Authentication > Providers.
-- =====================================================================

create extension if not exists pgcrypto;

-- ============================ INGREDIENTES ===========================

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null check (unit in ('kg', 'g', 'l', 'ml', 'unidad', 'docena', 'paquete')),
  -- precio de compra por unidad (ej: $/kg)
  current_price numeric(12, 2) not null default 0 check (current_price >= 0),
  created_at timestamptz not null default now()
);

create table public.ingredient_price_history (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  price numeric(12, 2) not null,
  recorded_at timestamptz not null default now()
);

create index idx_price_history_ingredient
  on public.ingredient_price_history (ingredient_id, recorded_at desc);

-- Cada vez que cambia el precio de un ingrediente queda registrado
create or replace function public.log_ingredient_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.current_price is distinct from old.current_price then
    insert into public.ingredient_price_history (ingredient_id, price)
    values (new.id, new.current_price);
  end if;
  return new;
end;
$$;

create trigger trg_log_ingredient_price
  after insert or update of current_price on public.ingredients
  for each row execute function public.log_ingredient_price();

-- ============================== PLATOS ===============================

create table public.dishes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  -- margen de ganancia propio de cada plato, en porcentaje
  margin_pct numeric(6, 2) not null default 50 check (margin_pct >= 0),
  -- precio fijado a mano; si es null se usa el sugerido (costo + margen)
  manual_price numeric(12, 2) check (manual_price is null or manual_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Receta: cantidad de cada ingrediente POR PORCIÓN, en la unidad del ingrediente
create table public.dish_ingredients (
  dish_id uuid not null references public.dishes (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  qty_per_portion numeric(12, 4) not null check (qty_per_portion > 0),
  primary key (dish_id, ingredient_id)
);

create index idx_dish_ingredients_ingredient on public.dish_ingredients (ingredient_id);

-- =============================== MENÚS ===============================

create table public.menus (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  delivery_date date not null,
  order_deadline timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'closed', 'cooked')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index idx_menus_status_date on public.menus (status, delivery_date);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus (id) on delete cascade,
  dish_id uuid not null references public.dishes (id) on delete restrict,
  -- snapshot del plato: el menú no cambia aunque después se edite el plato
  dish_name text not null,
  dish_description text not null default '',
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  -- cupo opcional: null = sin límite
  max_portions integer check (max_portions is null or max_portions > 0),
  reserved_portions integer not null default 0 check (reserved_portions >= 0),
  unique (menu_id, dish_id)
);

create index idx_menu_items_menu on public.menu_items (menu_id);

-- ============================== PEDIDOS ==============================

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity,
  menu_id uuid not null references public.menus (id) on delete restrict,
  customer_name text not null,
  customer_phone text not null,
  fulfillment text not null check (fulfillment in ('pickup', 'delivery')),
  address text,
  notes text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'delivered', 'cancelled')),
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index idx_orders_menu_status on public.orders (menu_id, status);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  menu_item_id uuid not null references public.menu_items (id) on delete restrict,
  dish_name text not null,
  unit_price numeric(12, 2) not null,
  qty integer not null check (qty > 0)
);

create index idx_order_items_order on public.order_items (order_id);
create index idx_order_items_menu_item on public.order_items (menu_item_id);

-- Al cancelar un pedido se liberan las porciones reservadas (y se vuelven
-- a tomar si se des-cancela).
create or replace function public.sync_reserved_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.menu_items mi
    set reserved_portions = greatest(0, mi.reserved_portions - s.total_qty)
    from (
      select menu_item_id, sum(qty) as total_qty
      from public.order_items where order_id = new.id group by menu_item_id
    ) s
    where mi.id = s.menu_item_id;
  elsif old.status = 'cancelled' and new.status <> 'cancelled' then
    update public.menu_items mi
    set reserved_portions = mi.reserved_portions + s.total_qty
    from (
      select menu_item_id, sum(qty) as total_qty
      from public.order_items where order_id = new.id group by menu_item_id
    ) s
    where mi.id = s.menu_item_id;
  end if;
  return new;
end;
$$;

create trigger trg_sync_reserved_on_cancel
  after update of status on public.orders
  for each row execute function public.sync_reserved_on_cancel();

-- ============================== DESPENSA =============================

create table public.pantry_movements (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  -- positivo = entra (compra), negativo = sale (cocina/ajuste)
  qty numeric(12, 4) not null,
  reason text not null check (reason in ('purchase', 'cooking', 'adjustment')),
  menu_id uuid references public.menus (id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index idx_pantry_movements_ingredient on public.pantry_movements (ingredient_id);

create view public.pantry_stock
with (security_invoker = true) as
select ingredient_id, coalesce(sum(qty), 0) as stock
from public.pantry_movements
group by ingredient_id;

-- ============================== AJUSTES ==============================

create table public.app_settings (
  key text primary key,
  value text not null default ''
);

insert into public.app_settings (key, value) values
  ('whatsapp_number', ''),
  ('pickup_address', '')
on conflict (key) do nothing;

-- ====================== FUNCIÓN: CREAR PEDIDO ========================
-- Llamada únicamente por la Edge Function `place-order` (service role).
-- Valida fecha límite y cupos de forma atómica y calcula el total con
-- los precios de la base (nunca se confía en el precio del cliente).

create or replace function public.place_order(
  p_menu_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_fulfillment text,
  p_address text,
  p_notes text,
  p_items jsonb -- [{ "menu_item_id": "...", "qty": 2 }]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus%rowtype;
  v_order_id uuid;
  v_order_number bigint;
  v_total numeric(12, 2) := 0;
  v_item record;
  v_mi public.menu_items%rowtype;
begin
  select * into v_menu from public.menus where id = p_menu_id;
  if not found or v_menu.status <> 'published' then
    raise exception 'MENU_NOT_AVAILABLE';
  end if;
  if now() > v_menu.order_deadline then
    raise exception 'DEADLINE_PASSED';
  end if;
  if p_customer_name is null or btrim(p_customer_name) = '' then
    raise exception 'INVALID_CUSTOMER';
  end if;
  if p_customer_phone is null or btrim(p_customer_phone) = '' then
    raise exception 'INVALID_CUSTOMER';
  end if;
  if p_fulfillment not in ('pickup', 'delivery') then
    raise exception 'INVALID_FULFILLMENT';
  end if;
  if p_fulfillment = 'delivery' and (p_address is null or btrim(p_address) = '') then
    raise exception 'ADDRESS_REQUIRED';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  insert into public.orders (menu_id, customer_name, customer_phone, fulfillment, address, notes)
  values (
    p_menu_id,
    btrim(p_customer_name),
    btrim(p_customer_phone),
    p_fulfillment,
    nullif(btrim(coalesce(p_address, '')), ''),
    coalesce(p_notes, '')
  )
  returning id, order_number into v_order_id, v_order_number;

  for v_item in
    select (e ->> 'menu_item_id')::uuid as menu_item_id, (e ->> 'qty')::int as qty
    from jsonb_array_elements(p_items) e
  loop
    if v_item.qty is null or v_item.qty <= 0 or v_item.qty > 100 then
      raise exception 'INVALID_QTY';
    end if;

    select * into v_mi
    from public.menu_items
    where id = v_item.menu_item_id and menu_id = p_menu_id
    for update;

    if not found then
      raise exception 'ITEM_NOT_FOUND';
    end if;
    if v_mi.max_portions is not null
       and v_mi.reserved_portions + v_item.qty > v_mi.max_portions then
      raise exception 'SOLD_OUT:%', v_mi.dish_name;
    end if;

    update public.menu_items
    set reserved_portions = reserved_portions + v_item.qty
    where id = v_mi.id;

    insert into public.order_items (order_id, menu_item_id, dish_name, unit_price, qty)
    values (v_order_id, v_mi.id, v_mi.dish_name, v_mi.unit_price, v_item.qty);

    v_total := v_total + v_mi.unit_price * v_item.qty;
  end loop;

  update public.orders set total = v_total where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total', v_total
  );
end;
$$;

-- Solo la edge function (service role) puede crear pedidos
revoke all on function public.place_order(uuid, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.place_order(uuid, text, text, text, text, text, jsonb)
  to service_role;

-- ================================ RLS ================================

alter table public.ingredients enable row level security;
alter table public.ingredient_price_history enable row level security;
alter table public.dishes enable row level security;
alter table public.dish_ingredients enable row level security;
alter table public.menus enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.pantry_movements enable row level security;
alter table public.app_settings enable row level security;

-- Admin: cualquier usuario autenticado tiene acceso total
create policy admin_all on public.ingredients
  for all to authenticated using (true) with check (true);
create policy admin_all on public.ingredient_price_history
  for all to authenticated using (true) with check (true);
create policy admin_all on public.dishes
  for all to authenticated using (true) with check (true);
create policy admin_all on public.dish_ingredients
  for all to authenticated using (true) with check (true);
create policy admin_all on public.menus
  for all to authenticated using (true) with check (true);
create policy admin_all on public.menu_items
  for all to authenticated using (true) with check (true);
create policy admin_all on public.orders
  for all to authenticated using (true) with check (true);
create policy admin_all on public.order_items
  for all to authenticated using (true) with check (true);
create policy admin_all on public.pantry_movements
  for all to authenticated using (true) with check (true);
create policy admin_all on public.app_settings
  for all to authenticated using (true) with check (true);

-- Público (carta): solo menús no borrador y los ajustes (ej: WhatsApp)
create policy public_read_menus on public.menus
  for select to anon using (status <> 'draft');
create policy public_read_menu_items on public.menu_items
  for select to anon using (
    exists (
      select 1 from public.menus m
      where m.id = menu_items.menu_id and m.status <> 'draft'
    )
  );
create policy public_read_settings on public.app_settings
  for select to anon using (true);
