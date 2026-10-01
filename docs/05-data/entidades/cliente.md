# Cliente (`clientes`)

**Qué representa**: una persona o negocio que compró o consultó. 5.309 filas. Compartido con la tienda web.

| Campo | Notas |
|---|---|
| `nombre`, `apellido` | |
| `telefono` | Clave práctica de identificación (búsqueda por variantes de formato argentino). Sin UNIQUE. |
| `mail` | **UNIQUE**. |
| `dni` | **UNIQUE**; casi nunca se completa. |
| `medio_contacto` | `Whatsapp`, `Instagram`, `Facebook`, `Mail`, `Web`. ⚠️ El alta manual siempre escribe `Whatsapp` si hay teléfono. |
| `es_interno` | Cliente interno (p. ej. "Alcohn – Pruebas internas"). Excluido de Comercial/recompra. `telefono` puede ser `''` (NOT NULL en BD). |

**Quién lo crea**: alta de pedido (Pedidos), tienda web, scripts de importación (`scripts/import-clientes-viejos-csv.mjs`, `import-ventas-csv.mjs`, `update-clientes-contacto-csv.mjs`).
**Quién lo modifica**: alta de pedido (actualiza nombre/teléfono/email si ya existía), edición en Pedidos, Envíos (email detectado).
**Relaciones**: `ordenes`, `direcciones` (cascada), `mockup_solicitudes`, `comercial_cliente_seguimientos`, `comercial_exclusiones`.
**Perfil**: `ClienteProfileDialog` (Pedidos), `ClienteDetailDialog` (Comercial).

❓ Duplicados de cliente (mismo teléfono con formatos distintos, o distinta persona con mismo teléfono) → [Q-DAT-002](../../14-open-questions/datos.md#q-dat-002).
