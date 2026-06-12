-- =====================================================================
-- il nonno Lalo — ingredientes, platos y recetas
-- Precios en 0: actualizar en el tablero (Ingredientes).
-- Cantidades por porción en la unidad del ingrediente.
-- =====================================================================

insert into public.ingredients (name, unit, current_price) values
  ('Harina 0000',          'kg',     0),
  ('Harina integral',      'kg',     0),
  ('Harina leudante',      'kg',     0),
  ('Huevo',                'unidad', 0),
  ('Aceite de oliva',      'ml',     0),
  ('Sal',                  'g',      0),
  ('Papa',                 'kg',     0),
  ('Ricota',               'kg',     0),
  ('Espinaca',             'kg',     0),
  ('Queso rallado',        'kg',     0),
  ('Nuez moscada',         'g',      0),
  ('Pollo',                'kg',     0),
  ('Cebolla',              'kg',     0),
  ('Crema de leche',       'ml',     0),
  ('Mozzarella',           'kg',     0),
  ('Jamón cocido',         'kg',     0),
  ('Calabaza',             'kg',     0),
  ('Queso provolone',      'kg',     0),
  ('Queso cremoso',        'kg',     0),
  ('Manzana',              'kg',     0),
  ('Azúcar',               'kg',     0),
  ('Limón',                'unidad', 0),
  ('Durazno',              'kg',     0),
  ('Leche',                'ml',     0),
  ('Manteca',              'kg',     0),
  ('Polvo de hornear',     'g',      0),
  ('Esencia de vainilla',  'ml',     0),
  ('Cacao en polvo',       'g',      0),
  ('Jugo de naranja',      'ml',     0),
  ('Ralladura de naranja', 'g',      0),
  ('Levadura fresca',      'g',      0),
  ('Pimienta',             'g',      0)
on conflict do nothing;

-- =====================================================================
-- PASTAS
-- =====================================================================

with d as (
  insert into public.dishes (name, description, margin_pct)
  values ('Fideos caseros', 'Pasta fresca al huevo, hecha a mano. Se vende fresca lista para cocinar.', 70)
  returning id
)
insert into public.dish_ingredients (dish_id, ingredient_id, qty_per_portion)
select d.id, i.id, v.qty from d
join (values
  ('Harina 0000',    0.030::numeric),
  ('Huevo',          0.25),
  ('Aceite de oliva',2.5),
  ('Sal',            0.5)
) v(name, qty) on true
join public.ingredients i on i.name = v.name;

with d as (
  insert into public.dishes (name, description, margin_pct)
  values ('Ñoquis de papa', 'Ñoquis caseros de papa con la receta de siempre, suaves y esponjosos.', 70)
  returning id
)
insert into public.dish_ingredients (dish_id, ingredient_id, qty_per_portion)
select d.id, i.id, v.qty from d
join (values
  ('Papa',           0.100::numeric),
  ('Harina 0000',    0.025),
  ('Huevo',          0.25),
  ('Aceite de oliva',2.5),
  ('Sal',            0.5)
) v(name, qty) on true
join public.ingredients i on i.name = v.name;

with d as (
  insert into public.dishes (name, description, margin_pct)
  values ('Ravioles de ricota y espinaca', 'Ravioles caseros con masa al huevo y relleno de ricota fresca y espinaca. Por porción (~8 ravioles).', 70)
  returning id
)
insert into public.dish_ingredients (dish_id, ingredient_id, qty_per_portion)
select d.id, i.id, v.qty from d
join (values
  ('Harina 0000',    0.030::numeric),
  ('Huevo',          0.375),
  ('Aceite de oliva',1.25),
  ('Ricota',         0.040),
  ('Espinaca',       0.015),
  ('Queso rallado',  0.008),
  ('Nuez moscada',   0.5),
  ('Sal',            0.5)
) v(name, qty) on true
join public.ingredients i on i.name = v.name;

-- =====================================================================
-- SORRENTINOS
-- =====================================================================

with d as (
  insert into public.dishes (name, description, margin_pct)
  values ('Sorrentinos de pollo al disco', 'Sorrentinos caseros con relleno de pollo tierno con cebolla, crema y queso. Por porción (~6 sorrentinos).', 72)
  returning id
)
insert into public.dish_ingredients (dish_id, ingredient_id, qty_per_portion)
select d.id, i.id, v.qty from d
join (values
  ('Harina 0000',    0.035::numeric),
  ('Huevo',          0.33),
  ('Aceite de oliva',2.5),
  ('Pollo',          0.045),
  ('Cebolla',        0.030),
  ('Crema de leche', 20.0),
  ('Queso rallado',  0.008),
  ('Nuez moscada',   0.5),
  ('Pimienta',       0.3),
  ('Sal',            0.5)
) v(name, qty) on true
join public.ingredients i on i.name = v.name;

with d as (
  insert into public.dishes (name, description, margin_pct)
  values ('Sorrentinos de jamón y mozzarella', 'Sorrentinos caseros con relleno de ricota, jamón cocido y mozzarella fundida. Por porción (~6 sorrentinos).', 72)
  returning id
)
insert into public.dish_ingredients (dish_id, ingredient_id, qty_per_portion)
select d.id, i.id, v.qty from d
join (values
  ('Harina 0000',    0.035::numeric),
  ('Huevo',          0.33),
  ('Aceite de oliva',2.5),
  ('Ricota',         0.035),
  ('Mozzarella',     0.020),
  ('Jamón cocido',   0.025),
  ('Pimienta',       0.3),
  ('Sal',            0.5)
) v(name, qty) on true
join public.ingredients i on i.name = v.name;

with d as (
  insert into public.dishes (name, description, margin_pct)
  values ('Sorrentinos de calabaza y queso', 'Sorrentinos caseros con relleno de calabaza asada, provolone y queso cremoso. Por porción (~6 sorrentinos).', 72)
  returning id
)
insert into public.dish_ingredients (dish_id, ingredient_id, qty_per_portion)
select d.id, i.id, v.qty from d
join (values
  ('Harina 0000',    0.035::numeric),
  ('Huevo',          0.33),
  ('Aceite de oliva',2.5),
  ('Calabaza',       0.060),
  ('Cebolla',        0.020),
  ('Queso provolone',0.020),
  ('Queso cremoso',  0.015),
  ('Nuez moscada',   0.5),
  ('Sal',            0.5)
) v(name, qty) on true
join public.ingredients i on i.name = v.name;

-- =====================================================================
-- MERMELADAS (1 porción = 1 frasco ~300g)
-- =====================================================================

with d as (
  insert into public.dishes (name, description, margin_pct)
  values ('Mermelada casera de manzana', 'Mermelada artesanal de manzana, sin conservantes ni colorantes. Frasco de aproximadamente 300g.', 80)
  returning id
)
insert into public.dish_ingredients (dish_id, ingredient_id, qty_per_portion)
select d.id, i.id, v.qty from d
join (values
  ('Manzana', 0.600::numeric),
  ('Azúcar',  0.300),
  ('Limón',   0.5)
) v(name, qty) on true
join public.ingredients i on i.name = v.name;

with d as (
  insert into public.dishes (name, description, margin_pct)
  values ('Mermelada casera de durazno', 'Mermelada artesanal de durazno de temporada, sin conservantes. Frasco de aproximadamente 300g.', 80)
  returning id
)
insert into public.dish_ingredients (dish_id, ingredient_id, qty_per_portion)
select d.id, i.id, v.qty from d
join (values
  ('Durazno', 0.650::numeric),
  ('Azúcar',  0.325),
  ('Limón',   0.5)
) v(name, qty) on true
join public.ingredients i on i.name = v.name;

-- =====================================================================
-- BUDINES (1 porción = 1 rodaja/slice)
-- =====================================================================

with d as (
  insert into public.dishes (name, description, margin_pct)
  values ('Budín artesanal de vainilla', 'Budín casero de vainilla, húmedo y esponjoso, hecho con ingredientes frescos. Porción individual.', 75)
  returning id
)
insert into public.dish_ingredients (dish_id, ingredient_id, qty_per_portion)
select d.id, i.id, v.qty from d
join (values
  ('Harina 0000',        0.035::numeric),
  ('Azúcar',             0.020),
  ('Huevo',              0.25),
  ('Leche',              25.0),
  ('Manteca',            0.008),
  ('Polvo de hornear',   2.5),
  ('Esencia de vainilla',2.5),
  ('Sal',                0.3)
) v(name, qty) on true
join public.ingredients i on i.name = v.name;

with d as (
  insert into public.dishes (name, description, margin_pct)
  values ('Budín artesanal marmolado', 'Budín casero marmolado con swirls de vainilla y cacao. Porción individual.', 75)
  returning id
)
insert into public.dish_ingredients (dish_id, ingredient_id, qty_per_portion)
select d.id, i.id, v.qty from d
join (values
  ('Harina 0000',        0.035::numeric),
  ('Azúcar',             0.020),
  ('Huevo',              0.33),
  ('Leche',              25.0),
  ('Aceite de oliva',    10.0),
  ('Polvo de hornear',   2.5),
  ('Cacao en polvo',     2.5),
  ('Esencia de vainilla',2.5),
  ('Sal',                0.3)
) v(name, qty) on true
join public.ingredients i on i.name = v.name;

with d as (
  insert into public.dishes (name, description, margin_pct)
  values ('Budín artesanal de naranja', 'Budín casero con jugo y ralladura de naranja fresca, húmedo y perfumado. Porción individual.', 75)
  returning id
)
insert into public.dish_ingredients (dish_id, ingredient_id, qty_per_portion)
select d.id, i.id, v.qty from d
join (values
  ('Harina leudante',      0.025::numeric),
  ('Azúcar',               0.025),
  ('Huevo',                0.25),
  ('Manteca',              0.015),
  ('Jugo de naranja',      30.0),
  ('Ralladura de naranja', 2.5)
) v(name, qty) on true
join public.ingredients i on i.name = v.name;

-- =====================================================================
-- PAN (1 porción = 1 rodaja ~50g)
-- =====================================================================

with d as (
  insert into public.dishes (name, description, margin_pct)
  values ('Pan artesanal 100% integral', 'Pan casero 100% integral con harina de trigo integral y levadura natural, sin aditivos. Porción (rodaja).', 65)
  returning id
)
insert into public.dish_ingredients (dish_id, ingredient_id, qty_per_portion)
select d.id, i.id, v.qty from d
join (values
  ('Harina integral', 0.040::numeric),
  ('Levadura fresca', 2.5),
  ('Sal',             0.5),
  ('Aceite de oliva', 1.0)
) v(name, qty) on true
join public.ingredients i on i.name = v.name;
