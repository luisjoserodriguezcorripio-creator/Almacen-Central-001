-- Renombrar aviso del tablón (Control Patio → Gestión de Recepción y Ubicación)
update public.hub_news
set title = 'Gestión de Recepción y Ubicación'
where theme = 'recepcion'
  and title = 'Control Patio · Recepción';
