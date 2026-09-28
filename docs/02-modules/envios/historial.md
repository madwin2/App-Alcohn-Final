# Historial de envíos

> Ruta: `/envios/historial` · Página: `src/app/envios/historial/index.tsx` · Servicio: `src/lib/supabase/services/enviosHistorialTabla.service.ts` · Plan: `PLAN_TABLA_HISTORIAL_ENVIOS.md`

## Propósito

✅ Consultar órdenes ya despachadas (`estado_envio='Seguimiento Enviado'`), paginadas de a 50 (300 al buscar), con: fecha de creación, cliente, diseño, número de seguimiento, empresa, fecha de seguimiento enviado (`seguimiento_enviado_at`), estado del WhatsApp y cantidad de ítems.

## Detalle (`EnviosHistorialDetailDialog`)

✅ Por orden: ítems, dirección, y **eventos de envío** (`envio_eventos`): `csv_generado`, `etiqueta_descargada`, `etiqueta_reimpresa`, con usuario y fecha. Para Andreani, si el PDF ya fue descargado (`hasEtiquetaPdfDownloaded`).

## Tablas

`ordenes`, `envio_eventos` (107 filas), `estado_historial` (historial de cambios de estado por trigger, 7.956 filas), `webhook_logs` (resultado del WhatsApp `pedido_enviado`).

## Observación

🔶 `envio_eventos` solo registra algunas acciones (CSV, descarga/reimpresión de etiqueta); la subida automática a MiCorreo no genera evento acá (queda en `ordenes.etiqueta_*`).
