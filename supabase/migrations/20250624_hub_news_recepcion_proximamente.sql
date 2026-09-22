-- Tablón — Gestión de Recepción y Ubicación · Próximamente
alter table public.hub_news add column if not exists coming_soon boolean not null default false;

update public.hub_news
set
  coming_soon = true,
  body = 'Próximamente disponible para el equipo de patio y recepción.

Qué podrás hacer:
• Registrar contenedores importados o locales
• Validar mercancía y dar entrada al muelle
• Ver paletas, división y estado en una sola tabla
• Compartir el seguimiento en pantalla TV del patio'
where theme = 'recepcion';
