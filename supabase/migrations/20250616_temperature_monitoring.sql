-- Monitoreo de temperatura — Almacén Central DC
-- Ejecutar en SQL Editor de Supabase → New query → Run

create extension if not exists "pgcrypto";

-- Áreas monitoreadas con rangos permitidos
create table if not exists public.temp_areas (
  id text primary key,
  name text not null,
  min_celsius numeric(5,2) not null,
  max_celsius numeric(5,2) not null,
  warn_margin numeric(5,2) not null default 2,
  sort_order int not null default 0,
  active boolean not null default true
);

-- Historial de lecturas
create table if not exists public.temp_readings (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.temp_areas(id),
  celsius numeric(5,2) not null,
  recorded_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual', 'sensor', 'import')),
  recorded_by text not null default '',
  notes text not null default ''
);

-- Estado actual por área (dashboard en vivo)
create table if not exists public.temp_current (
  area_id text primary key references public.temp_areas(id),
  celsius numeric(5,2),
  status text not null default 'unknown' check (status in ('ok', 'warn', 'critical', 'unknown')),
  reading_id uuid references public.temp_readings(id),
  updated_at timestamptz not null default now()
);

-- Alertas automáticas
create table if not exists public.temp_alerts (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.temp_areas(id),
  reading_id uuid references public.temp_readings(id),
  celsius numeric(5,2) not null,
  alert_type text not null check (alert_type in ('high', 'low')),
  severity text not null default 'critical' check (severity in ('warn', 'critical')),
  status text not null default 'active' check (status in ('active', 'acknowledged', 'resolved')),
  message text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  acknowledged_by text not null default ''
);

create index if not exists temp_readings_area_recorded_idx
  on public.temp_readings (area_id, recorded_at desc);
create index if not exists temp_alerts_status_created_idx
  on public.temp_alerts (status, created_at desc);

-- Calcula estado: ok | warn | critical
create or replace function public.temp_compute_status(
  p_celsius numeric,
  p_min numeric,
  p_max numeric,
  p_margin numeric
) returns text
language sql
immutable
as $$
  select case
    when p_celsius is null then 'unknown'
    when p_celsius < p_min or p_celsius > p_max then 'critical'
    when p_celsius <= (p_min + p_margin) or p_celsius >= (p_max - p_margin) then 'warn'
    else 'ok'
  end;
$$;

-- Actualiza temp_current y genera alertas al registrar lectura
create or replace function public.temp_on_reading_insert()
returns trigger
language plpgsql
as $$
declare
  v_area public.temp_areas%rowtype;
  v_status text;
  v_alert_type text;
begin
  select * into v_area from public.temp_areas where id = new.area_id and active = true;
  if not found then
    return new;
  end if;

  v_status := public.temp_compute_status(
    new.celsius, v_area.min_celsius, v_area.max_celsius, v_area.warn_margin
  );

  insert into public.temp_current (area_id, celsius, status, reading_id, updated_at)
  values (new.area_id, new.celsius, v_status, new.id, coalesce(new.recorded_at, now()))
  on conflict (area_id) do update set
    celsius = excluded.celsius,
    status = excluded.status,
    reading_id = excluded.reading_id,
    updated_at = excluded.updated_at;

  if v_status in ('critical', 'warn') then
    v_alert_type := case
      when new.celsius > v_area.max_celsius then 'high'
      when new.celsius < v_area.min_celsius then 'low'
      when new.celsius >= (v_area.max_celsius - v_area.warn_margin) then 'high'
      else 'low'
    end;

    insert into public.temp_alerts (area_id, reading_id, celsius, alert_type, severity, message)
    values (
      new.area_id,
      new.id,
      new.celsius,
      v_alert_type,
      case when v_status = 'critical' then 'critical' else 'warn' end,
      case
        when v_status = 'critical' then
          format('Temperatura %s°C fuera de rango (%s–%s°C) en %s',
            new.celsius, v_area.min_celsius, v_area.max_celsius, v_area.name)
        else
          format('Temperatura %s°C cerca del límite en %s', new.celsius, v_area.name)
      end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists temp_readings_after_insert on public.temp_readings;
create trigger temp_readings_after_insert
  after insert on public.temp_readings
  for each row execute function public.temp_on_reading_insert();

-- Datos iniciales — 6 áreas del almacén
insert into public.temp_areas (id, name, min_celsius, max_celsius, warn_margin, sort_order) values
  ('almacen', 'Almacén', 20, 26, 2, 1),
  ('cuarto_frio', 'Cuarto frío', 0, 4, 1, 2),
  ('nave1', 'Nave 1', 20, 26, 2, 3),
  ('nave2', 'Nave 2', 20, 26, 2, 4),
  ('nave3', 'Nave 3', 20, 26, 2, 5),
  ('area_averia', 'Área de avería', 18, 28, 2, 6)
on conflict (id) do update set
  name = excluded.name,
  min_celsius = excluded.min_celsius,
  max_celsius = excluded.max_celsius,
  warn_margin = excluded.warn_margin,
  sort_order = excluded.sort_order;

insert into public.temp_current (area_id, celsius, status)
select id, null, 'unknown' from public.temp_areas
on conflict (area_id) do nothing;

-- RLS (mismo modelo anon que inventario/averías)
alter table public.temp_areas enable row level security;
alter table public.temp_readings enable row level security;
alter table public.temp_current enable row level security;
alter table public.temp_alerts enable row level security;

drop policy if exists "temp_areas_anon_all" on public.temp_areas;
create policy "temp_areas_anon_all" on public.temp_areas for all using (true) with check (true);

drop policy if exists "temp_readings_anon_all" on public.temp_readings;
create policy "temp_readings_anon_all" on public.temp_readings for all using (true) with check (true);

drop policy if exists "temp_current_anon_all" on public.temp_current;
create policy "temp_current_anon_all" on public.temp_current for all using (true) with check (true);

drop policy if exists "temp_alerts_anon_all" on public.temp_alerts;
create policy "temp_alerts_anon_all" on public.temp_alerts for all using (true) with check (true);

-- Realtime
do $$ begin
  alter publication supabase_realtime add table public.temp_readings;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.temp_current;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.temp_alerts;
exception when duplicate_object then null;
end $$;
