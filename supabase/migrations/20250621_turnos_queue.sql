-- Control de Turnos — cola en vivo (Almacén Central DC)

create extension if not exists "pgcrypto";

create table if not exists public.turnos_counter (
  id int primary key default 1 check (id = 1),
  counter int not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.turnos_counter (id, counter) values (1, 0)
on conflict (id) do nothing;

create table if not exists public.turnos_queue (
  id uuid primary key default gen_random_uuid(),
  turno text not null,
  fecha date not null default (timezone('utc', now()))::date,
  hora text not null default '',
  tipo text not null check (tipo in ('despacho_facturas', 'liquidacion_facturas', 'nota_credito')),
  chofer_nombre text not null,
  ids_carga text not null default '',
  cantidad_viajes int,
  detalle text not null default '',
  estado text not null default 'PENDIENTE',
  convocado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

create index if not exists turnos_queue_fecha_created_idx
  on public.turnos_queue (fecha desc, created_at desc);

create or replace function public.turnos_next_counter()
returns int
language plpgsql
as $$
declare n int;
begin
  update public.turnos_counter
  set counter = counter + 1, updated_at = now()
  where id = 1
  returning counter into n;
  return n;
end;
$$;

alter table public.turnos_counter enable row level security;
alter table public.turnos_queue enable row level security;

drop policy if exists "turnos_counter_anon_all" on public.turnos_counter;
create policy "turnos_counter_anon_all" on public.turnos_counter for all using (true) with check (true);

drop policy if exists "turnos_queue_anon_all" on public.turnos_queue;
create policy "turnos_queue_anon_all" on public.turnos_queue for all using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table public.turnos_queue;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.turnos_counter;
exception when duplicate_object then null;
end $$;
