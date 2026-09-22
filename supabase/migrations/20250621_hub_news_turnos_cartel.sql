-- Tablón — Control de Turnos activo + aviso carteles en Escritorio
update public.hub_news
set
  title = 'Control de Turnos de Despacho',
  body = 'Qué puedes hacer:
• Elegir trámite: despacho, liquidación o nota de crédito
• Pedir turno desde el celular sin hacer fila
• Recibir aviso con voz y alarma cuando sea su turno

Carteles para imprimir (código QR y pasos): carpeta «Turnos-Imprimir-DC» en el Escritorio de esta PC — no están publicados en la web.',
  image_url = 'assets/img/turnos-hub-poster.jpg',
  link_url = 'turnos.html',
  theme = 'turnos',
  pinned = true,
  active = true
where theme = 'turnos' and (title = 'Próximamente: Control de Turnos' or title = 'Control de Turnos de Despacho');

insert into public.hub_news (title, body, published_at, published_by, active, pinned, image_url, link_url, theme)
select
  'Control de Turnos de Despacho',
  'Qué puedes hacer:
• Elegir trámite: despacho, liquidación o nota de crédito
• Pedir turno desde el celular sin hacer fila
• Recibir aviso con voz y alarma cuando sea su turno

Carteles para imprimir (código QR y pasos): carpeta «Turnos-Imprimir-DC» en el Escritorio de esta PC — no están publicados en la web.',
  now(),
  'Almacén Central DC',
  true,
  true,
  'assets/img/turnos-hub-poster.jpg',
  'turnos.html',
  'turnos'
where not exists (
  select 1 from public.hub_news where theme = 'turnos'
);
