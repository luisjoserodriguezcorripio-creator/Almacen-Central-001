-- Tablón — Control de Turnos (texto corto + imagen)
update public.hub_news
set
  body = 'Llegas, pides tu turno en segundos y listo.
Sin filas. Sin confusión. Choferes entran más rápido — despacho más fuerte.',
  image_url = 'assets/img/turnos-hub-poster.jpg'
where theme = 'turnos' and title = 'Próximamente: Control de Turnos';

insert into public.hub_news (title, body, published_at, published_by, active, pinned, image_url, link_url, theme)
select
  'Próximamente: Control de Turnos',
  'Llegas, pides tu turno en segundos y listo.
Sin filas. Sin confusión. Choferes entran más rápido — despacho más fuerte.',
  now(),
  'Almacén Central DC',
  true,
  true,
  'assets/img/turnos-hub-poster.jpg',
  'turnos.html',
  'turnos'
where not exists (
  select 1 from public.hub_news where theme = 'turnos' and title = 'Próximamente: Control de Turnos'
);
