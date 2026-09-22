-- Tablón informativo — Almacén Central DC
-- Ejecutar en SQL Editor de Supabase → New query → Run

create extension if not exists "pgcrypto";

create table if not exists public.hub_news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  published_at timestamptz not null default now(),
  published_by text not null default '',
  image_url text not null default '',
  link_url text not null default '',
  theme text not null default '',
  active boolean not null default true,
  pinned boolean not null default false
);

create index if not exists hub_news_active_published_idx
  on public.hub_news (active, pinned desc, published_at desc);

alter table public.hub_news enable row level security;

drop policy if exists "hub_news_anon_all" on public.hub_news;
create policy "hub_news_anon_all" on public.hub_news for all using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table public.hub_news;
exception when duplicate_object then null;
end $$;
