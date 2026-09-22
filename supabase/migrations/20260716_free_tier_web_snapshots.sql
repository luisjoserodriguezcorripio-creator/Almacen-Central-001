-- Plan gratuito Supabase — sync estable sin tablas extra
-- Ejecutar en SQL Editor (opcional). La web ya usa web_snapshots + REST poll.

create table if not exists public.web_snapshots (
  module text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.web_snapshots enable row level security;

drop policy if exists "web_snapshots_anon_all" on public.web_snapshots;
create policy "web_snapshots_anon_all" on public.web_snapshots
  for all using (true) with check (true);

insert into public.web_snapshots (module, data) values
  ('platform', '{"version":1,"updatedAt":"1970-01-01T00:00:00.000Z"}'::jsonb),
  ('averias', '{"version":1,"updatedAt":"1970-01-01T00:00:00.000Z","incidences":[],"damages":[],"securityIncidents":[],"audits5s":[],"despachoAudits":[],"equipmentInspections":[],"equipmentRegistry":{}}'::jsonb),
  ('despacho', '{"version":1,"updatedAt":"1970-01-01T00:00:00.000Z"}'::jsonb),
  ('registry', '{"version":1,"updatedAt":"1970-01-01T00:00:00.000Z","users":[],"areas":[],"accessRequests":[]}'::jsonb),
  ('turnos', '{"version":1,"counter":0,"entries":[],"dashboardDay":"","autoResetDashboard":true}'::jsonb),
  ('agenda', '{"version":1,"updatedAt":"1970-01-01T00:00:00.000Z"}'::jsonb),
  ('hub_news', '{"version":1,"updatedAt":"1970-01-01T00:00:00.000Z","items":[]}'::jsonb)
on conflict (module) do nothing;

-- Realtime opcional (la web Free usa poll REST; esto no es obligatorio)
do $$ begin
  alter publication supabase_realtime add table public.web_snapshots;
exception when duplicate_object then null;
end $$;
