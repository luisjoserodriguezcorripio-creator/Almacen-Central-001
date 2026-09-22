-- Tablón — título y texto con nombre oficial + Próximamente
alter table public.hub_news add column if not exists coming_soon boolean not null default false;

update public.hub_news
set
  title = 'Gestión de Recepción y Ubicación',
  coming_soon = true,
  body = 'Gestión de Recepción y Ubicación — Próximamente disponible para el equipo de patio.

Qué podrás hacer:
• Registrar contenedores importados o locales
• Validar mercancía y dar entrada al muelle
• Ver paletas, división y estado en una sola tabla
• Compartir el seguimiento en pantalla TV del patio'
where theme = 'recepcion'
   or title ilike '%Control Patio%'
   or title ilike '%Recepción y Ubicación%';
