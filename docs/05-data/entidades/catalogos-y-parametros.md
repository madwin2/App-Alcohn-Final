# Catálogos y parámetros

| Tabla | Qué es | Quién la mantiene |
|---|---|---|
| `correo_sucursales` | Padrón de sucursales/localidades de MiCorreo (4.158). Lectura pública (anon) para la tienda web. | Script `scripts/import_correo_sucursales_xlsx.py` ❓ frecuencia de actualización [Q-COR-001](../../14-open-questions/envios.md#q-cor-001) |
| `costos_de_envio` | Costo por empresa (`Andreani`, `Correo Argentino`, `Via Cargo`) y servicio (`Domicilio`, `Sucursal`), con `activo` y `activo_desde`. Activos: Andreani 5.000/8.000, Correo 6.000/9.000, Vía Cargo 0. | ❓ Sin pantalla: se edita en la base [Q-ENV-005](../../14-open-questions/envios.md#q-env-005) |
| `fabricacion_parametros` | Versiones (`effective_from`) de costos unitarios y parámetros de material (JSON `params`). Hoy 1 versión (1970-01-01). | Gastos → "Guardar en Supabase" |
| `precios_sello_grupo`, `precios_sello_medida_grupo`, `precios_sello_medida_fija`, `precios_sello_redondo`, `precios_abecedario`, `precios_accesorio`, `precios_config` | Lista de precios (por `user_id` del dueño) | Precios (solo dueño) |
| `catalogo_items` | 5 códigos de ítem con `precio_base`, `precio_editable`, `activo` | **Sin uso en el frontend** (RLS desactivado) |

## `fabricacion_parametros.params` (claves)

`amortFresa`, `soldador100`, `soldador200`, `baseRemachadora`, `mangoGolpe`, `planchuela12`, `planchuela20`, `planchuela25`, `planchuela40`, `planchuela63` ($/cm), `tubo`, `cajaAbc`, `mangoMadera`, `varilla`, `prisionero`, `soporteAbc`, `abcCmSimple`, `abcCmAmbas`, `selloPerdidaCorteCm`, `largoMaximoPlanchuelaMm_C/G/XL`.
⚠️ Las claves de planchuela usan 20 y 40 (tamaño de stock) mientras el resto del sistema usa 19 y 38.
