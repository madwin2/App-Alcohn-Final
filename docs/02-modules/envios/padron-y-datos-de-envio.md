# Datos de envío y padrón de Correo Argentino

## 1. El padrón (`correo_sucursales`)

✅ Tabla con **4.158** filas del padrón oficial de sucursales/localidades de MiCorreo (código de sucursal, calle, número, localidad, provincia, horarios, activa). Se importa con `scripts/import_correo_sucursales_xlsx.py` desde `codigos_sucursales_y_provincias_MiCorreo (3).xlsx` (raíz). Existe además una copia en CSV dentro del bundle: `src/lib/data/sucursales_micorreo.csv`, usada como respaldo del catálogo (`correoSucursalesCatalogCache`, `correoSucursalesPadron`).
Lectura permitida a `anon` y `authenticated` (la tienda web también la usa).

🔶 Propósito: que provincia, localidad y sucursal coincidan **exactamente** con lo que acepta la carga masiva de MiCorreo, para que la etiqueta no falle.

## 2. Formulario de datos de envío (Envíos)

✅ Campos: nombre completo, teléfono, email, provincia, localidad, domicilio (o sucursal), código postal, tipo (Domicilio/Sucursal), código de sucursal MiCorreo manual (opcional).

**Carga rápida desde texto**: se pega el mensaje del cliente y:
1. `parseShippingText` (reglas locales: detecta provincia por nombre, CP, email, teléfono, calle con número, líneas con etiquetas).
2. Opcional **"Usar IA"**: `POST /api/parse-shipping` (OpenAI, modelo por defecto `gpt-4o`) devuelve el mismo esquema en JSON.
3. El resultado se "encaja" (*snap*) a las opciones del padrón (`snapFormToCorreoSucursalCatalog`).

**Validaciones al guardar** (✅, en el navegador):
- Provincia canónica y presente en el padrón.
- Padrón cargado (si no, no deja guardar).
- Sucursal: localidad del desplegable y dirección de sucursal existente en el padrón, **o** código manual.
- "Continuar a confirmación" arma la fila CSV y valida que sea exportable (`createCorreoCsvRow`).

**Email**: se usa el del cliente; si no hay, el del texto; si no, un **email genérico de Alcohn** (`ENVIO_EMAIL_FALLBACK`, solo para la etiqueta; no se guarda en el cliente).

## 3. Qué se guarda (✅ `handleSaveShippingData`)

1. **Nueva fila** en `direcciones` (nunca se edita la anterior; queda historial implícito). Valores vacíos se completan con `'SIN DEFINIR'` / `'0000'`.
2. `ordenes.direccion_id`, `tipo_envio`; primera carga → `envio_datos_cargado_por/at`; siguientes → `envio_datos_editado=true`.
3. Si la etiqueta ya estaba generada/pagada → notificación **l1** a Logística ("dirección cambiada después de la etiqueta").
4. Email detectado → `clientes.mail` (si el cliente no tenía).
5. **Venta → `Transferido`** en la orden y todos los ítems (si no lo estaba). ❓ [Q-VEN-002](../../14-open-questions/ventas-cobros.md#q-ven-002).
6. Encola la **subida a MiCorreo** (ver [WF-06](../../03-workflows/WF-06-envio-correo-argentino.md)).

## 4. Paquete declarado en el CSV (✅ `resolveCorreoCsvPaqueteFromOrderItems`)

| Contenido de la orden | Largo × ancho × alto (cm) | Peso (kg) |
|---|---|---|
| Hay soldador | 40 × 15 × 20 | 1 |
| Hay abecedario o base remachadora | 25 × 13 × 13 | 1 |
| Resto (sellos) | 25 × 8 × 8 | 0,5 (1 si hay ≥2 sellos) |

Tipo de producto `CP`, valor declarado `40000` (`DEFAULT_VALUES`). ❓ Origen de estos valores (¿medidas reales de las cajas?) → [Q-ENV-007](../../14-open-questions/envios.md#q-env-007).
