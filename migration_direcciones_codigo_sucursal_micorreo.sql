-- Código de oficina MiCorreo elegido en Envíos (sucursal), para armar el CSV sin re-buscar por texto.
-- Ejecutar en Supabase antes de desplegar el cambio en la app que inserta/lee esta columna.

alter table public.direcciones
  add column if not exists codigo_sucursal_micorreo text null;

comment on column public.direcciones.codigo_sucursal_micorreo is
  'Código sucursal MiCorreo (tabla correo_sucursales.codigo) cuando el envío es a sucursal; se guarda al confirmar datos en Envíos.';
