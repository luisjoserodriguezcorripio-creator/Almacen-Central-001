-- Tablón — imágenes, enlaces a portales y noticias iniciales
alter table public.hub_news add column if not exists image_url text not null default '';
alter table public.hub_news add column if not exists link_url text not null default '';
alter table public.hub_news add column if not exists theme text not null default '';

insert into public.hub_news (title, body, published_by, pinned, image_url, link_url, theme, active)
select
  'Portal de Despacho',
  'Prepara y valida pedidos en tiempo real desde el almacén central.

Qué puedes hacer:
• Preparar órdenes como preparador de despacho
• Validar pedidos y liberar carga como validador
• Ver listas, estados y avance en vivo
• Sincronizar el equipo en la misma información',
  'Almacén Central DC',
  true,
  'assets/img/login-dispatch-poster.jpg',
  'despacho.html',
  'despacho',
  true
where not exists (
  select 1 from public.hub_news where theme = 'despacho' and title = 'Portal de Despacho'
);

insert into public.hub_news (title, body, published_by, pinned, image_url, link_url, theme, active)
select
  'Operaciones de Piso',
  'Gestiona averías, 5S, seguridad y equipos del almacén desde un solo portal.

Qué puedes hacer:
• Registrar y dar seguimiento a averías de piso
• Ejecutar auditorías 5S y controles de seguridad
• Administrar equipos y áreas operativas
• Consultar monitoreo de temperatura y módulos en vivo',
  'Almacén Central DC',
  true,
  'assets/img/login-averias-poster.jpg',
  'averias.html',
  'ops',
  true
where not exists (
  select 1 from public.hub_news where theme = 'ops' and title = 'Operaciones de Piso'
);
