# Precios

> Ruta: `/precios` · Página: `src/app/precios/index.tsx` · Servicio: `src/lib/supabase/services/preciosPro.service.ts` · Lógica: `src/lib/precios/*` · Migraciones: `migration_precios_normalizado.sql`, `migration_precios_catalogo_lectura_equipo.sql`, `migration_add_precios_lista.sql`
> Documento para terceros: `cotizador-sellos-web.md` (cómo cotizar desde otro sistema con la misma tabla)

## Propósito

✅ Lista de precios oficial de Alcohn, usada para **cotizar automáticamente** en el alta de pedidos, al agregar ítems y en el generador de mockups; y (🔶) por la tienda web.

## Estructura (✅ tablas `precios_*`)

| Sección en UI | Tabla | Contenido |
|---|---|---|
| Sellos por medida — 4 grupos | `precios_sello_grupo` + `precios_sello_medida_grupo` | Grupos `chicos`, `medianos`, `grandes`, `xl` con precio de transferencia; cada medida (ancho × largo) se asigna a un grupo. |
| Otras medidas de sellos | `precios_sello_medida_fija` (19 filas) | Precio fijo para medidas puntuales; **pisa** al grupo. |
| Sellos redondos | `precios_sello_redondo` | Por rango: precio simple / intermedio / complejo. |
| Abecedarios | `precios_abecedario` | Por categoría/detalle. |
| Accesorios | `precios_accesorio` | `soldador`, `base_remachadora`, `mango_golpe`. |
| Nota de presupuesto | `precios_config.nota_presupuesto` | Texto libre. |

Todos los precios son **de transferencia**. El **precio link** (tarjeta / link de pago) se calcula: `round(transferencia × 1,15)` (`precioLinkDesdeTransferencia`). Esta fórmula **no está en la base** (también está duplicada en la edge `confirm-web-order`).

## Resolución de precio de un sello rectangular (✅ `resolverPrecioSelloRectangular`)

1. Normalizar medida (cm, orden indistinto).
2. Si existe precio de **medida fija** → ese.
3. Si no, buscar el **grupo** de esa medida → precio del grupo.
4. Si no hay match → sin precio (se cotiza a mano). 🔶 `clasificarGrupoSelloRectangularMm` también se usa en Economía para clasificar productos.

## Permisos

✅ RLS: **solo una cuenta** (email hardcodeado en las políticas, dueño del catálogo) puede insertar/editar/borrar; el resto del equipo **lee** el catálogo del dueño a través de `precios_catalog_owner_user_id()`. Si otra persona edita en la UI, la escritura falla por RLS.
Datos semilla: `src/lib/precios/preciosSeedData.ts`.

## Tabla sin uso aparente

`catalogo_items` (5 códigos de ítem con `precio_base`, RLS desactivado) no es referenciada por el frontend. Ver [AUD-DEAD-005](../../audits/posible-codigo-muerto.md#aud-dead-005).
