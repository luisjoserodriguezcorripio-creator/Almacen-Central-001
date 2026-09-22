-- Inventario RF: actualizar PIN admin (ejecutar una vez en Supabase SQL Editor)
update public.inv_users
set admin_pin = 'Central@'
where employee_id = 'admin';
