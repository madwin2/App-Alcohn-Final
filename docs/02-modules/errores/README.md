# Errores (hoja de rehaceres)

> Ruta: `/errores` · Página: `src/app/errores/index.tsx` · Servicio: `src/lib/supabase/services/errores.service.ts` · UI: `src/components/errores/*`
> Origen de datos: [Rehacer](../pedidos/rehacer.md) · Tabla: `sello_rehacer_eventos` · Migración: `migration_rehacer_snapshots_y_errores.sql`

## Propósito

✅ Ver **métricas**, listado y **trazabilidad** de los errores que se registran al marcar **Rehacer**. Cada evento guarda motivo, estados previos, medidas y (desde la migración de snapshots) **copias inmutables** de base/vector del momento del error.

## Alcance

- ✅ Solo eventos de Rehacer (`sello_rehacer_eventos`).
- ✅ Snapshot de archivos **solo al marcar Rehacer** (no en cada upload).
- ❌ No incluye fallos de vectorización automática, EPS en Aspire, etc., si no pasaron por Rehacer.

## Pantalla

- Filtros: período (mes / 90 días / todo), motivo (también desde las barras de métricas), **sin descripción**, búsqueda por cliente/diseño/texto.
- Métricas orientadas a calidad: total + tasa, **sin descripción** (accionable), motivo top, **origen taller vs cliente/envío** (barra partida), distribución por motivo con %, por mes, quién marcó. Cobro y snapshots como nota secundaria.
- Tabla: resalta filas sin descripción con CTA “Completar descripción”.
- Tabla: **cambiar tipo de error** inline (Select) sin abrir el caso.
- Detalle: también cambia el tipo, **editar/completar descripción**, medidas, programa, thumbs de archivos congelados.

## Snapshots de archivos

Al confirmar Rehacer ([`registrarRehacer`](../../src/lib/supabase/services/rehacer.service.ts)):

1. RPC `registrar_rehacer` inserta el evento (con medidas/`programa_id`) y devuelve `(evento_id, sello_id)`.
2. El cliente copia base / vector (`archivo_vector_preview`) / base mejorada a:

```
rehacer-snapshots/{evento_id}/base.{ext}
rehacer-snapshots/{evento_id}/vector.{ext}
rehacer-snapshots/{evento_id}/base_mejorada.{ext}
```

3. Actualiza las columnas `archivo_*_snapshot` del evento.

Borrar o reemplazar el archivo del sello **no** toca esas copias. `deleteFile` ignora paths bajo `rehacer-snapshots/`. Si la copia falla, el Rehacer igual queda registrado (sin snapshot).

Eventos anteriores a la migración quedan con snapshots NULL (siguen sirviendo para métricas de motivo/fecha).

## Dependencias

- Requiere ejecutar `migration_rehacer_snapshots_y_errores.sql` en Supabase (producción; pedir OK).
- Buckets `base` y `vector` (mismos de siempre).
