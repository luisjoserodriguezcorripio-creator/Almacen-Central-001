-- Inventario RF (portal web + app Zebra) — Supabase
-- Ejecutar en SQL Editor de supabase.com → New query → Run

create extension if not exists "pgcrypto";

-- Usuarios autorizados (contadores + admin)
create table if not exists public.inv_users (
  employee_id text primary key,
  display_name text not null,
  role text not null default 'COUNT' check (role in ('COUNT', 'ADMIN')),
  active boolean not null default true,
  admin_pin text,
  created_at timestamptz not null default now()
);

-- Catálogo / inventario maestro (import Excel Dynamics)
create table if not exists public.inv_catalog (
  article_code text not null,
  product_name text not null default '',
  warehouse text not null default '300-001',
  location text not null default '',
  matricula text not null default '',
  unit text not null default 'CJ',
  qty_physical numeric not null default 0,
  qty_reserved numeric not null default 0,
  qty_available numeric not null default 0,
  primary key (article_code, location, warehouse)
);

-- Pares de códigos de barras (v1 / v2)
create table if not exists public.inv_article_pairs (
  articulo text not null default '',
  codigo_v1 text not null,
  codigo_v2 text not null,
  product_name text not null default '',
  primary key (codigo_v1, codigo_v2)
);

-- Registros de conteo
create table if not exists public.inv_entries (
  id uuid primary key default gen_random_uuid(),
  barcode text not null,
  product_name text not null default '',
  quantity integer not null,
  zone text not null,
  warehouse text not null default '300-001',
  unit text not null default 'CJ',
  expected_qty numeric not null default 0,
  matricula text not null default '',
  expiration_date text not null default '',
  user_id text not null,
  created_at timestamptz not null default now(),
  synced boolean not null default true,
  count_mode text not null default '',
  rack_pass_index integer not null default 0,
  rack_passes_total integer not null default 0,
  count_number integer not null default 1
);

create index if not exists inv_entries_created_at_idx on public.inv_entries (created_at desc);
create index if not exists inv_entries_zone_idx on public.inv_entries (zone);
create index if not exists inv_entries_user_idx on public.inv_entries (user_id);

-- Datos iniciales (mismos códigos de prueba que la app Zebra)
insert into public.inv_users (employee_id, display_name, role, active, admin_pin) values
  ('51192', 'Jansel Castro', 'COUNT', true, null),
  ('51963', 'Luis José Rodríguez Ruíz', 'COUNT', true, null),
  ('12345', 'María López', 'COUNT', true, null),
  ('admin', 'Administrador', 'ADMIN', true, 'Central@')
on conflict (employee_id) do nothing;

-- Actualizar PIN admin en bases ya desplegadas
update public.inv_users set admin_pin = 'Central@' where employee_id = 'admin';

insert into public.inv_catalog (article_code, product_name, warehouse, location, matricula, unit, qty_available) values
  ('00024100114405', 'CHEEZ IT', '300-001', 'P020-012-1', '', 'CJ', 12),
  ('7501234567890', 'Arroz 1kg', '300-001', 'P019-011-1', '0000123456', 'CJ', 5)
on conflict do nothing;

insert into public.inv_article_pairs (articulo, codigo_v1, codigo_v2, product_name) values
  ('00024100114405', '00024100114405', '0000009539167', 'CHEEZ IT')
on conflict do nothing;

-- RLS: acceso anon (mismo modelo que Firebase en la web actual)
alter table public.inv_users enable row level security;
alter table public.inv_catalog enable row level security;
alter table public.inv_article_pairs enable row level security;
alter table public.inv_entries enable row level security;

drop policy if exists "inv_users_anon_all" on public.inv_users;
create policy "inv_users_anon_all" on public.inv_users for all using (true) with check (true);

drop policy if exists "inv_catalog_anon_all" on public.inv_catalog;
create policy "inv_catalog_anon_all" on public.inv_catalog for all using (true) with check (true);

drop policy if exists "inv_article_pairs_anon_all" on public.inv_article_pairs;
create policy "inv_article_pairs_anon_all" on public.inv_article_pairs for all using (true) with check (true);

drop policy if exists "inv_entries_anon_all" on public.inv_entries;
create policy "inv_entries_anon_all" on public.inv_entries for all using (true) with check (true);

-- Realtime (ignorar si ya estaba activo)
do $$ begin
  alter publication supabase_realtime add table public.inv_entries;
exception when duplicate_object then null;
end $$;

-- Snapshots JSON de TODA la web (WMS, averías, despacho)
create table if not exists public.web_snapshots (
  module text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.web_snapshots (module, data) values
  ('platform', '{"version":1,"updatedAt":"1970-01-01T00:00:00.000Z"}'::jsonb),
  ('averias', '{"version":1,"updatedAt":"1970-01-01T00:00:00.000Z","incidences":[],"damages":[],"securityIncidents":[],"audits5s":[],"despachoAudits":[],"equipmentInspections":[],"equipmentRegistry":{}}'::jsonb),
  ('despacho', '{"version":1,"updatedAt":"1970-01-01T00:00:00.000Z"}'::jsonb),
  ('registry', '{"version":1,"updatedAt":"1970-01-01T00:00:00.000Z","users":[],"areas":[],"accessRequests":[]}'::jsonb)
on conflict (module) do nothing;

-- Instalaciones existentes: añadir array despachoAudits al snapshot averias
update public.web_snapshots
set data = jsonb_set(coalesce(data, '{}'::jsonb), '{despachoAudits}', '[]'::jsonb, true),
    updated_at = now()
where module = 'averias'
  and not (coalesce(data, '{}'::jsonb) ? 'despachoAudits');

alter table public.web_snapshots enable row level security;

drop policy if exists "web_snapshots_anon_all" on public.web_snapshots;
create policy "web_snapshots_anon_all" on public.web_snapshots for all using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table public.web_snapshots;
exception when duplicate_object then null;
end $$;
