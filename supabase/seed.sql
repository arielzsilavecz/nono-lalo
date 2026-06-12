-- Datos de ejemplo (opcional) para probar la app.
-- Ejecutar después de la migración inicial.

insert into public.ingredients (name, unit, current_price) values
  ('Harina 000', 'kg', 1200),
  ('Huevos', 'docena', 3600),
  ('Papa', 'kg', 900),
  ('Carne picada', 'kg', 8500),
  ('Pan rallado', 'kg', 2800),
  ('Queso rallado', 'kg', 14000),
  ('Tomate perita (lata)', 'unidad', 1500),
  ('Cebolla', 'kg', 800),
  ('Aceite de girasol', 'l', 2900);

-- Ñoquis de papa con tuco
with d as (
  insert into public.dishes (name, description, margin_pct)
  values ('Ñoquis de papa con tuco', 'Ñoquis caseros de papa con salsa de tomate y cebolla, como los hacía el nonno.', 80)
  returning id
)
insert into public.dish_ingredients (dish_id, ingredient_id, qty_per_portion)
select d.id, i.id, v.qty
from d
join (values
  ('Papa', 0.3::numeric),
  ('Harina 000', 0.1),
  ('Huevos', 0.08),
  ('Tomate perita (lata)', 0.5),
  ('Cebolla', 0.05)
) as v(name, qty) on true
join public.ingredients i on i.name = v.name;

-- Milanesas con puré
with d as (
  insert into public.dishes (name, description, margin_pct)
  values ('Milanesas de carne con puré', 'Milanesas caseras bien crocantes con puré de papa cremoso.', 70)
  returning id
)
insert into public.dish_ingredients (dish_id, ingredient_id, qty_per_portion)
select d.id, i.id, v.qty
from d
join (values
  ('Carne picada', 0.25::numeric),
  ('Pan rallado', 0.08),
  ('Huevos', 0.1),
  ('Papa', 0.25),
  ('Aceite de girasol', 0.05)
) as v(name, qty) on true
join public.ingredients i on i.name = v.name;
