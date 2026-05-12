-- Nuevo valor de estado_envio en ordenes: «Error de Etiqueta» (fallo al armar fila CSV / datos Correo).
-- Ejecutar en Supabase SQL Editor o psql antes de usar el estado desde la app.

ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_estado_envio_check;

ALTER TABLE public.ordenes
  ADD CONSTRAINT ordenes_estado_envio_check CHECK (
    estado_envio IS NULL
    OR estado_envio IN (
      'Sin envio',
      'Hacer Etiqueta',
      'Etiqueta Lista',
      'Error de Etiqueta',
      'Despachado',
      'Seguimiento Enviado'
    )
  );
