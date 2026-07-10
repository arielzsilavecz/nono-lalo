-- =====================================================================
-- il nonno Lalo — push notifications para el admin
-- Suscripciones Web Push de los usuarios autenticados (el admin), para
-- avisar de pedidos nuevos sin tener que tener la pestaña abierta.
-- =====================================================================

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Mismo criterio que el resto del esquema: cualquier autenticado es admin
create policy admin_all on public.push_subscriptions
  for all to authenticated using (true) with check (true);
