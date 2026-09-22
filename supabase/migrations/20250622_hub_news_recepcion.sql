-- Tablón — Gestión de Recepción y Ubicación
insert into public.hub_news (title, body, published_by, pinned, image_url, link_url, theme, active)
select
  'Gestión de Recepción y Ubicación',
  'Seguimiento de contenedores importados y locales en el patio del almacén.

Qué puedes hacer:
• Registrar contenedores importados o locales
• Validar mercancía y dar entrada al muelle
• Ver paletas, división y estado en una sola tabla
• Compartir el seguimiento en pantalla TV del patio',
  'Almacén Central DC',
  true,
  'assets/img/recepcion-hub-poster.jpg?v=1',
  'recepcion.html',
  'recepcion',
  true
where not exists (
  select 1 from public.hub_news where theme = 'recepcion' and title = 'Gestión de Recepción y Ubicación'
);
