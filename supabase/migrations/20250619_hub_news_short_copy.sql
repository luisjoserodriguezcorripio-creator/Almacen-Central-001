-- Tablón — textos cortos en noticias seed (sin scroll en tarjeta)
update public.hub_news
set body = 'Qué puedes hacer:
• Preparar y validar pedidos en vivo
• Ver listas, estados y avance del despacho
• Trabajar sincronizado con todo el equipo'
where theme = 'despacho' and title = 'Portal de Despacho';

update public.hub_news
set body = 'Qué puedes hacer:
• Registrar y seguir averías de piso
• Auditorías 5S, seguridad y equipos
• Monitoreo de temperatura y módulos en vivo'
where theme = 'ops' and title = 'Operaciones de Piso';
