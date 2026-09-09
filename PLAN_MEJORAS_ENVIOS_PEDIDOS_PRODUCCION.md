# Plan de implementación — Mejoras Envíos / Pedidos / Producción

Documento de trabajo con el detalle técnico de cada mejora pedida, referenciando archivos y líneas reales del código actual. Pensado para ejecutarse por fases (una fase = un PR chico y probable).

---

## 0. Resumen de alcance

| # | Página | Mejora |
|---|--------|--------|
| 1 | Envíos | Filtro por transportista en el header (3 cuadrados + "Todos") + buscador |
| 2 | Envíos | Historial de envíos (fechas de carga, impresión/descarga, seguimiento enviado) |
| 3 | Envíos | Unificar las 3 tablas de Correo Argentino en 2 |
| 4 | Pedidos | Validar coherencia entre empresa de envío y número de seguimiento cargado a mano |
| 5 | Pedidos | Nueva empresa de envío: "Retiro en Persona" |
| 6 | Producción | Popup con info del pedido/cliente al click en el nombre del diseño |
| 7 | Producción | Columna que marca si el sello pertenece a un pedido con más de un ítem |

Cada sección incluye: estado actual (con cita de archivo/línea), diseño propuesto, cambios de código, cambios de base de datos si aplica, y puntos a confirmar con vos antes de tocar código.

---

## 1. Envíos — Filtro por transportista + búsqueda en el header

### Estado actual
`src/app/envios/index.tsx` es un único componente de ~2160 líneas sin tabs ni componente de header propio. El bloque de header hoy es solo título + botón "Generar CSV" (`src/app/envios/index.tsx:1582-1610`). Debajo se renderizan, siempre todas juntas y sin forma de ocultarlas:

- `AndreaniPoolCard` + `AndreaniLabelsPanel` (`envios/index.tsx:1613-1620`).
- 3 tablas de Correo Argentino (ver sección 3 para el detalle de cuáles).

No existe ninguna sección de **Via Cargo** hoy, aunque el transportista sí existe como valor (`ShippingCarrier = 'VIA_CARGO'`, `src/lib/types/index.ts:11`) y está totalmente operativo en la página de Pedidos (selector de empresa, cálculo de costo, etc.). En Envíos, las órdenes de Via Cargo simplemente no tienen ningún panel donde aparecer.

### Diseño propuesto

**Header nuevo** (`src/components/envios/EnviosHeader.tsx`, nuevo componente):

- 4 "cuadrados" seleccionables (tipo toggle/tabs, no checkboxes — selección única): **Correo Argentino**, **Andreani**, **Via Cargo**, y **Todos** (este último es el estado por defecto, equivalente al comportamiento actual).
- Un input de **búsqueda** al lado, con placeholder "Buscar por cliente o diseño...".
- Mostrar en cada cuadrado un contador (ej. "Correo Argentino (12)") usando los mismos arrays que ya arma la página, para que el filtro se sienta informativo y no solo decorativo.

**Estado nuevo en `EnviosPage`** (`envios/index.tsx`, cerca de las líneas 228-296 donde ya viven `useOrders()` y los `useMemo` de elegibilidad):

```ts
const [carrierFilter, setCarrierFilter] = useState<'ALL' | 'CORREO_ARGENTINO' | 'ANDREANI' | 'VIA_CARGO'>('ALL');
const [searchQuery, setSearchQuery] = useState('');
```

**Lógica de renderizado:**

- Si `searchQuery` tiene texto → se ignora el layout habitual de secciones/tabs y se muestra **una sola tabla plana** con las órdenes que matchean, reutilizando `renderOrderRow`/`tableHead` (`envios/index.tsx:1337`, `:1528`). El match es contra `order.customer.firstName + ' ' + order.customer.lastName` y `order.items[].designName` (campos reales, `src/lib/types/index.ts:57-58,129`), case-insensitive y sin tildes. El buscador respeta el `carrierFilter` activo si hay uno elegido (busca solo dentro de ese subconjunto); si `carrierFilter === 'ALL'`, busca en todo.
- Si `searchQuery` está vacío, se decide qué secciones mostrar según `carrierFilter`:
  - `ALL` → comportamiento actual (todo visible), incluyendo la nueva sección Via Cargo.
  - `CORREO_ARGENTINO` → solo las tablas de Correo Argentino (ya unificadas, ver sección 3).
  - `ANDREANI` → solo `AndreaniPoolCard` + `AndreaniLabelsPanel`.
  - `VIA_CARGO` → nueva tabla simple de Via Cargo (ver abajo).

**Sección Via Cargo (nueva, no existe hoy):** dado que hoy no hay ningún flujo de etiquetas/CSV para Via Cargo en el código, para que el filtro "Via Cargo" no quede vacío se propone una tabla mínima equivalente a la de Correo Argentino "con datos" (mismas columnas, sin exportación CSV todavía —Via Cargo no tiene integración de etiquetas—), filtrando `order.shipping.carrier === 'VIA_CARGO'`. Si en algún momento se automatiza Via Cargo (CSV o API propia), esta tabla es la base para agregarlo.

> ❓ **A confirmar:** ¿el volumen de pedidos por Via Cargo justifica separar "con datos"/"pendientes" como en Correo Argentino, o alcanza con una sola tabla simple por ahora? Se propone arrancar con una sola tabla y separar después si hace falta.

### Cambios de código
1. Nuevo componente `src/components/envios/EnviosHeader.tsx` (cuadrados + búsqueda + contadores).
2. Nuevo componente `src/components/envios/ViaCargoTable.tsx` (o reutilizar la tabla unificada de Correo Argentino de la sección 3 como componente genérico parametrizado por carrier, ver nota de reuso ahí).
3. `envios/index.tsx`: agregar estado `carrierFilter`/`searchQuery`, armar `ordersFiltradasPorBusqueda` (`useMemo`), envolver el render actual (líneas ~1613-1748) en condicionales según `carrierFilter`.
4. Reemplazar el bloque de header inline (`:1582-1610`) por `<EnviosHeader ... />`, moviendo el botón "Generar CSV" adentro o al lado (queda visible solo si `carrierFilter` es `ALL` o `CORREO_ARGENTINO`, porque el CSV es específico de Correo Argentino).

---

## 2. Envíos — Historial de envíos

### Estado actual (importante: hay infraestructura que ya cubre parte de esto)

Ya existen dos piezas de auditoría que **no hay que duplicar**:

1. **`estado_historial`** (`migration_estado_historial.sql:15-30`): tabla append-only poblada automáticamente por triggers en `sellos` y `ordenes` (`migration_estado_historial.sql:95-208`) cada vez que cambian `estado_fabricacion`, `estado_venta`, `estado_envio` o `estado_orden`, con `estado_anterior`, `estado_nuevo` y `changed_at`. Ya hay un servicio: `src/lib/supabase/services/estadoHistorial.service.ts` (`getEstadoHistorialByOrdenId`, `getEstadoHistorialBySelloId`). Esto **ya nos da gratis** "cuándo se envió el seguimiento" (el cambio de `estado_envio` a `Seguimiento Enviado` queda registrado con timestamp exacto) y en general cualquier cambio de estado de envío (`Sin envío` → `Hacer Etiqueta` → `Etiqueta Lista` → `Despachado` → `Seguimiento Enviado`).
2. **`envio_datos_cargado_at` / `envio_datos_cargado_por` / `envio_datos_editado`** en `ordenes` (`migration_envio_datos_auditoria.sql`), ya mapeado a `Order.shippingDataLoadedAt` / `shippingDataLoadedBy` / `shippingDataEdited` (`src/lib/types/index.ts:96-100`) y ya visible en la tabla "Con datos" (`envios/index.tsx:1306-1335`, columnas "Carga"/"Editado" en `:1478-1491`). Esto **ya cubre** "cuándo se cargó la info de envío".

**Lo que falta y no está persistido en ningún lado:** la fecha de **impresión/descarga** de la etiqueta.

- Para **Andreani**, el estado "descargado" hoy vive **solo en `localStorage`** del navegador (`src/components/envios/AndreaniLabelsPanel.tsx:92-109`, `downloadedStorageKey`) — no es visible entre dispositivos/usuarios ni queda registrado en la base.
- Para **Correo Argentino**, no hay ningún evento de "impresión" propio; lo más parecido es el click en "Generar CSV" (`envios/index.tsx:1599`, handler cerca de la línea 699), que hoy dispara la generación del archivo y (según `PROPUESTA_PAGINA_ENVIOS_CORREO.md` §4.5) debería marcar la orden como `Etiqueta Lista`. Pero si el usuario vuelve a generar el CSV para la misma orden (reimpresión), hoy no queda ningún rastro porque el estado ya no cambia.

### Diseño propuesto

**Tabla nueva `envio_eventos`** (migración SQL nueva), pensada como log genérico de acciones que *no* son cambios de estado (por eso no las cubre `estado_historial`) y que sirve para ambos transportistas y para futuros (Via Cargo):

```sql
create table envio_eventos (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ordenes(id) on delete cascade,
  tipo_evento text not null check (tipo_evento in (
    'csv_generado', 'etiqueta_descargada', 'etiqueta_reimpresa'
  )),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  meta jsonb
);
-- RLS: select para usuarios autenticados, insert vía service/rpc igual que el resto de la app.
```

- Al generar el CSV de Correo Argentino (handler actual ~`envios/index.tsx:699`) → insertar `tipo_evento = 'csv_generado'` por cada orden incluida.
- Al descargar una etiqueta de Andreani (`AndreaniLabelsPanel.tsx:402` `handleDownload`, `:428` `handleDownloadAll`) → insertar `tipo_evento = 'etiqueta_descargada'`, y **migrar el estado "descargado" de `localStorage` a esta tabla** (leer `envio_eventos` en vez de `downloadedStorageKey` para pintar el check visual de "ya descargada").

**Modal de Historial:**

- Nuevo botón "Historial" en `EnviosHeader` (sección 1), al lado del filtro.
- Nuevo componente `src/components/envios/HistorialEnviosDialog.tsx` (Dialog/Sheet grande con su propio buscador y filtros: por cliente/orden, por transportista, por rango de fechas, por tipo de evento).
- Nuevo servicio `src/lib/supabase/services/enviosHistorial.service.ts` que combina:
  - `estado_historial` filtrado a `campo = 'estado_envio'` (cambios de estado de envío, incluye "seguimiento enviado").
  - `envio_eventos` (impresión/descarga/CSV).
  - `ordenes.envio_datos_cargado_at` (carga inicial de datos).
  
  y devuelve una lista unificada tipo timeline por orden, ordenada por fecha descendente.

### Cambios de base de datos
- Migración nueva: crear tabla `envio_eventos` + policies RLS (seguir el patrón de `migration_estado_historial.sql:213-224`).
- No hace falta tocar `estado_historial` ni las columnas de `envio_datos_cargado_*` — ya están.

### Cambios de código
1. Migración SQL `migration_envio_eventos.sql`.
2. `enviosHistorial.service.ts` (nuevo).
3. `HistorialEnviosDialog.tsx` (nuevo).
4. Insertar eventos en: generación de CSV (`envios/index.tsx` ~699) y descarga de etiquetas Andreani (`AndreaniLabelsPanel.tsx:402,428`).
5. Reemplazar lectura de `downloadedStorageKey`/`localStorage` en `AndreaniLabelsPanel.tsx` por lectura de `envio_eventos` (mejora colateral: el check de "descargado" deja de ser por-navegador y pasa a ser real para todo el equipo).

> ❓ **A confirmar:** ¿"cuándo se imprimió" es exactamente lo mismo que "cuándo se descargó" para tu flujo real (imprimís directo desde el PDF descargado), o hay un paso de impresión físicamente distinto que también querés timestampear? Si es lo mismo, con `etiqueta_descargada` alcanza.

---

## 3. Envíos — Unificar las 3 tablas de Correo Argentino en 2

### Estado actual
Las 3 tablas viven todas en `envios/index.tsx`, calculadas con `useMemo` sobre el mismo `useOrders()`:

```ts
// envios/index.tsx:404-433 (resumen)
ordersEnviosWeb        = isWebPendingShippingConfirmation(order) && isSaleReadyForShippingData(order)
ordersConDatosEnvio    = Boolean(order.direccionId) && !isWebPendingShippingConfirmation(order)
ordersPendientesDatos  = !order.direccionId && isSaleReadyForShippingData(order)
```

`isWebPendingShippingConfirmation` (`:148-149`) = pedido con `origen === 'Web'` que ya tiene `direccionId` pero todavía no tiene `shippingDataLoadedAt` (o sea, el cliente cargó sus datos en el checkout web, pero un humano todavía no los confirmó/revisó).

### Diseño propuesto
Fusionar **"Con datos de envío"** + **"Envíos de la web"** en una sola tabla, ya que ambas comparten la condición base `Boolean(order.direccionId)`:

```ts
ordersConDatos = Boolean(order.direccionId)  // reemplaza a las dos anteriores
ordersPendientesDatos = !order.direccionId && isSaleReadyForShippingData(order)  // sin cambios
```

Dentro de la tabla unificada, las filas que sean pedidos web sin confirmar (`isWebPendingShippingConfirmation(order)`) mantienen una marca visual clara (badge "Web — sin confirmar") y conservan la acción de **confirmar/editar los datos** que hoy dispara el flujo de "Datos de envío" (el mismo modal, que al guardar setea `shippingDataLoadedAt` — ver `PROPUESTA_PAGINA_ENVIOS_CORREO.md §4.4.1`). No se pierde funcionalidad, solo se deja de segmentar en una tabla aparte.

### Cambios de código
1. `envios/index.tsx:404-433`: borrar `ordersEnviosWeb` como memo separado, dejar solo `ordersConDatos` (unión de los dos) y `ordersPendientesDatos`.
2. `envios/index.tsx:1631-1714`: colapsar los dos bloques de tabla ("Con datos" y "Envíos de la web") en uno solo, reutilizando `renderOrderRow`. Agregar el badge "Web — sin confirmar" condicionado a `isWebPendingShippingConfirmation(order)` dentro de esa fila (probablemente ya hay algo similar en el render actual de la tabla web — revisar y trasladar en vez de reescribir desde cero).
3. Actualizar el título/contador de la tabla resultante (ej. "Con datos de envío (24)").
4. Revisar `PROPUESTA_PAGINA_ENVIOS_CORREO.md` (documento de diseño previo de esta misma página) para no romper ninguna regla de negocio ya cerrada ahí (ej. la transición automática a `Transferido` al guardar datos, §4.4.1).

---

## 4. Pedidos — Validar seguimiento cargado a mano contra la empresa elegida

### Estado actual
- Carga manual del número de seguimiento: `src/components/pedidos/Table/cells/CellSeguimiento.tsx:10-30`, un `EditableInline` que al confirmar llama `onUpdate(orderId, { shipping: { ...order.shipping, trackingNumber: v || null } })`. Es una celda de tabla independiente de la celda de empresa.
- Selector de empresa: `src/components/pedidos/Table/cells/CellEnvio.tsx:18-27`, opciones actuales:

  ```ts
  ANDREANI_DOMICILIO / ANDREANI_SUCURSAL
  CORREO_ARGENTINO_DOMICILIO / CORREO_ARGENTINO_SUCURSAL
  VIA_CARGO_DOMICILIO / VIA_CARGO_SUCURSAL
  OTRO
  NONE
  ```

### Diseño propuesto
Regla de validación (según lo pedido):

| Empresa (`order.shipping.carrier`) | Prefijo esperado en el seguimiento |
|---|---|
| `CORREO_ARGENTINO` | empieza con `000` |
| `ANDREANI` | empieza con `3600` |
| `VIA_CARGO`, `OTRO`, `RETIRO_EN_PERSONA` (nueva, ver sección 5) | sin validación |

Flujo al confirmar el input de `CellSeguimiento`:

1. Se calcula `detectCarrierFromTracking(value)` → si el valor empieza con `000` sugiere `CORREO_ARGENTINO`; si empieza con `3600` sugiere `ANDREANI`; si no matchea ningún patrón conocido, no se sugiere nada (se guarda directo, sin advertencia — la regla solo dispara cuando hay un **conflicto** detectable, no cuando el número es genérico/desconocido).
2. Si `order.shipping.carrier` no coincide con la empresa esperada por el prefijo → abrir un diálogo de advertencia (nuevo, ver abajo) en vez de guardar directo.
3. El diálogo muestra: "El número cargado empieza con `{prefijo}`, que corresponde a {empresa detectada}, pero el pedido tiene {empresa actual} seleccionada." con 3 botones:
   - **Cambiar empresa** → guarda `trackingNumber` **y** actualiza `order.shipping.carrier` a la empresa detectada (ajustando también `service` a un valor por defecto razonable, ej. mantener el `service` actual si sigue teniendo sentido, o pedir confirmación de Domicilio/Sucursal — a definir según UX real del selector).
   - **Continuar sin cambiar** → guarda el `trackingNumber` tal cual, sin tocar la empresa.
   - **Cancelar** → descarta el valor tipeado, el input vuelve al número anterior.

### Cambios de código
1. Nuevo util `src/lib/utils/trackingValidation.ts`:
   ```ts
   export function detectCarrierFromTracking(value: string): ShippingCarrier | null { ... }
   export function trackingMatchesCarrier(value: string, carrier: ShippingCarrier | null): boolean { ... }
   ```
2. Nuevo componente `src/components/pedidos/Table/cells/TrackingCarrierMismatchDialog.tsx` (diálogo de 3 opciones; usar como referencia de patrón `src/components/programas/ConfirmDialog.tsx` o `src/components/shared/VectorSizeConfirmDialog.tsx`, adaptando a 3 acciones en vez de 2).
3. Modificar `CellSeguimiento.tsx`: en el commit handler, en vez de llamar `onUpdate` directo, correr la validación; si hay conflicto, guardar el valor pendiente en estado local y abrir el diálogo; según la opción elegida, disparar el `onUpdate` correspondiente (con o sin cambio de carrier) o descartar.
4. Este mismo chequeo debería aplicar también en `UploadTrackingDialog.tsx` (carga masiva por PDF, `src/components/pedidos/UploadTracking/UploadTrackingDialog.tsx`) si ahí también se puede editar el número a mano — a confirmar alcance.

> ❓ **A confirmar:** los prefijos "000" (Correo Argentino) y "3600" (Andreani) — ¿son fijos siempre o pueden variar con el tipo de servicio (ej. Domicilio vs Sucursal)? Si varían, la función `detectCarrierFromTracking` necesita más de un patrón por empresa.

---

## 5. Pedidos — Nueva empresa de envío "Retiro en Persona"

### Hallazgo importante en el código actual
Ya existe en la base de datos un valor `'Retiro'` en el CHECK constraint de `ordenes.empresa_envio` (`database_schema.sql:65`):

```sql
empresa_envio VARCHAR(50) CHECK (empresa_envio IN ('Andreani', 'Correo Argentino', 'Via Cargo', 'Retiro'))
```

y la función `get_shipping_cost` ya trata `'Retiro'` como envío sin costo (`database_schema.sql:183`: `IF p_empresa_envio = 'Retiro' ... THEN` costo 0). Hoy, en el frontend, la opción **"Otro"** del selector (`CellEnvio.tsx`, `value: 'OTRO'`) es la que mapea a ese `'Retiro'` de la base (`orders.service.ts:1374-1379`, `empresaMap`). Es decir: **"Retiro en Persona" ya existe a medias**, escondido detrás de la opción genérica "Otro".

### Diseño propuesto
Para que quede como una opción explícita y no ambigua (en vez de reciclar "Otro", que puede necesitarse como bolsón genérico para casos realmente distintos):

1. **Migración SQL**: extender el CHECK constraint para agregar un valor nuevo y distinto, `'Retiro en Persona'`, dejando `'Retiro'` intacto (por las órdenes históricas que ya lo usan vía "Otro"):
   ```sql
   ALTER TABLE ordenes DROP CONSTRAINT <nombre_constraint_actual>;
   ALTER TABLE ordenes ADD CONSTRAINT ordenes_empresa_envio_check
     CHECK (empresa_envio IN ('Andreani', 'Correo Argentino', 'Via Cargo', 'Retiro', 'Retiro en Persona'));
   ```
   y actualizar `get_shipping_cost` (`database_schema.sql:183`) para que el `IF` incluya también `'Retiro en Persona'` (costo 0, igual que `'Retiro'`). **Importante:** localizar la versión *viva* de esta función/trigger en Supabase (vía `list_migrations`/`execute_sql`, no asumir que `database_schema.sql` es lo que corre hoy en producción) antes de tocarla.
2. **Frontend — tipos** (`src/lib/types/index.ts:11,18-19`): agregar `'RETIRO_EN_PERSONA'` a `ShippingCarrier` y a `ShippingOption`.
3. **`CellEnvio.tsx:18-27`**: agregar entrada `{ value: 'RETIRO_EN_PERSONA', carrier: 'RETIRO_EN_PERSONA', service: null, label: 'Retiro en Persona' }` (sin variante Domicilio/Sucursal, como "Otro").
4. **Mapeos** (`orders.service.ts:1374-1379` y `mappers.ts:394`): agregar el caso `RETIRO_EN_PERSONA ↔ 'Retiro en Persona'` en ambas direcciones.
5. **Sección 4 (validación de seguimiento)**: excluir `RETIRO_EN_PERSONA` de la validación de prefijo (no debería llevar número de seguimiento).
6. **Sección 1 (filtro de Envíos)**: los pedidos con `RETIRO_EN_PERSONA` no entran en ningún cuadrado de transportista (no tienen flujo de envío) — confirmar que `isEligibleForShipping`/las queries de Envíos ya los excluyen naturalmente al no tener `carrier` en `{ANDREANI, CORREO_ARGENTINO, VIA_CARGO}`, o agregar el filtro explícito si hiciera falta.

> ❓ **A confirmar:** ¿"Otro" se usa hoy para casos reales que no sean retiro en persona (por ejemplo, un transportista distinto no listado)? Si "Otro" en la práctica **siempre** significó "retiro en persona", la alternativa más simple es renombrar esa opción existente a "Retiro en Persona" y no tocar el schema — pero como pediste agregar una opción nueva, el plan de arriba asume que querés mantener ambas por separado.

---

## 6. Producción — Popup de info al click en el nombre del diseño

### Estado actual
- `ProductionTable`, columnas en `src/components/produccion/Table/columns.tsx:50-185`; la celda de diseño es `CellDisenio` (`src/components/produccion/Table/cells/CellDisenio.tsx`), hoy un `<div>` sin `onClick` ni comportamiento interactivo.
- Ya existe el patrón exacto que necesitamos, en Pedidos: **`ClienteProfile`**.
  - `src/components/pedidos/Table/cells/CellCliente.tsx:47-59`: botón que abre el perfil (`onClick={() => onOpenProfile(order)}`).
  - `src/components/pedidos/ClienteProfile/ClienteProfileDialog.tsx`: el modal en sí (props `open`, `onOpenChange`, `clienteId`, `fallbackName`).
  - Estado dueño del diálogo vive en el padre: `src/components/pedidos/Table/OrdersTable.tsx:71` (`clienteProfileOrder`) y `:849-855` (instancia del dialog).
  - Datos: `fetchClienteProfile()` en `src/lib/supabase/services/clienteProfile.service.ts`, devuelve cliente + sus órdenes + ítems de cada orden.

### Diseño propuesto
Reusar el mismo patrón en Producción, pero centrado en el **pedido** (no en el cliente) ya que lo que se pide es "info de ese pedido, cliente, etc." al clickear el diseño de un sello puntual:

1. `CellDisenio.tsx`: convertir el nombre del diseño en un botón/link clickeable, `onClick={() => onOpenOrderInfo(item)}`.
2. Nuevo componente `src/components/produccion/OrderInfoDialog.tsx` (modal), mostrando: datos del cliente (nombre, contacto), datos de la orden (fecha, estado de fabricación/venta/envío, empresa de envío, valor/restante), y la lista de ítems/sellos de esa orden (reutilizando el mismo shape que ya devuelve `fetchClienteProfile` → `ClienteProfileOrder`/`ClienteProfileItem`, evitando escribir un fetch nuevo desde cero).
3. Estado del diálogo en `src/app/produccion/index.tsx` (siguiendo el mismo patrón que `OrdersTable.tsx:71`, ej. `const [orderInfoItem, setOrderInfoItem] = useState<ProductionItem | null>(null)`), pasado hacia abajo a `ProductionTable`/`columns.tsx` igual que `onOpenProfile` se pasa hoy en Pedidos.
4. Servicio de datos: reutilizar `fetchClienteProfile(clienteId)` si `ProductionItem` ya trae `clienteId` (a verificar en `src/lib/types/index.ts` y `production.service.ts`); si no lo trae, agregar `clienteId` al `getProductionItems` (`src/lib/supabase/services/production.service.ts:60-103`) ya que la query de sellos probablemente hace join con `ordenes`/`clientes` de todos modos.

---

## 7. Producción — Columna "pertenece a un pedido con más de un ítem"

### Estado actual
`getProductionItems` (`src/lib/supabase/services/production.service.ts:60-103`) trae **todos** los sellos en una sola query, y cada `ProductionItem` ya tiene `orderId` (`src/lib/types/index.ts:218`, mapeado desde `sello.orden_id`). Esto significa que **no hace falta ningún join ni query nueva**: con los datos que ya están en memoria en `src/app/produccion/index.tsx` alcanza para contar cuántos ítems comparten cada `orderId`.

### Diseño propuesto
1. En `src/app/produccion/index.tsx`, junto a los `items` ya cargados por `useProduction()`, agregar:
   ```ts
   const itemCountByOrderId = useMemo(() => {
     const counts = new Map<string, number>();
     for (const item of items) counts.set(item.orderId, (counts.get(item.orderId) ?? 0) + 1);
     return counts;
   }, [items]);
   ```
   (mismo patrón que ya usa la página de Envíos para mapas similares, ej. `csvLineNumberByOrderId`).
2. Nueva columna en `columns.tsx` (cerca de `disenio`, línea ~104-109), ej. `multiplesItems`, que renderiza un ícono/badge (ej. "🔗" o texto "Multi-ítem") solo si `itemCountByOrderId.get(item.orderId) > 1`; vacío en caso contrario (tal como se pidió).
3. Nueva celda `src/components/produccion/Table/cells/CellMultiplesItems.tsx`, recibiendo el conteo ya calculado como prop (no recalcular por fila).

---

## 8. Cambios de base de datos — resumen

| Migración | Qué agrega | Sección |
|---|---|---|
| `migration_envio_eventos.sql` (nueva) | Tabla `envio_eventos` (log de impresión/descarga de etiquetas) | 2 |
| `migration_empresa_envio_retiro_en_persona.sql` (nueva) | Nuevo valor `'Retiro en Persona'` en CHECK de `ordenes.empresa_envio` + ajuste de `get_shipping_cost` | 5 |

No se necesitan migraciones para las secciones 1, 3, 4, 6 y 7 — son cambios de frontend puros sobre datos que ya existen (`estado_historial`, `envio_datos_cargado_at`, `orden_id` en sellos, etc.).

---

## 9. Orden sugerido de implementación

Pensado para minimizar riesgo (lo que toca base de datos al final de cada bloque, después de validar el resto):

1. **Fase 1 — Producción** (7 → 6): la columna de "múltiples ítems" es la más aislada y rápida (sin DB, sin dependencias de otras fases); el popup de info depende de un patrón ya probado (`ClienteProfile`). Buen punto de partida de bajo riesgo.
2. **Fase 2 — Pedidos / Retiro en Persona** (5): migración chica y acotada, habilita probar la sección 4 con el nuevo carrier ya incluido en las exclusiones.
3. **Fase 3 — Pedidos / Validación de seguimiento** (4): depende de que el carrier `RETIRO_EN_PERSONA` ya exista (fase 2) para excluirlo correctamente de la regla.
4. **Fase 4 — Envíos / Unificar tablas Correo Argentino** (3): cambio de frontend acotado a `envios/index.tsx`, buena base antes de tocar el header.
5. **Fase 5 — Envíos / Header con filtro y búsqueda** (1): depende de la fase 4 (menos tablas que orquestar) y necesita definir la tabla de Via Cargo.
6. **Fase 6 — Envíos / Historial** (2): la más grande (tabla nueva + migración de `AndreaniLabelsPanel` fuera de `localStorage`); se beneficia de que el header (fase 5) ya tenga el lugar para el botón "Historial".

---

## 10. Checklist de aceptación

- [ ] Header de Envíos permite filtrar por Correo Argentino / Andreani / Via Cargo / Todos, cada uno mostrando solo lo suyo.
- [ ] Buscar por cliente o diseño devuelve una tabla plana con coincidencias, respetando el filtro de transportista activo.
- [ ] Existe sección/tabla para Via Cargo en Envíos (aunque sea simple).
- [ ] Botón "Historial" abre un modal con timeline de: carga de datos, impresión/descarga de etiqueta, y seguimiento enviado, buscable.
- [ ] `AndreaniLabelsPanel` deja de depender de `localStorage` para el estado "descargado".
- [ ] Las tablas de Correo Argentino pasan de 3 a 2 sin perder la posibilidad de confirmar datos de pedidos web.
- [ ] Al cargar un seguimiento a mano que no coincide con la empresa elegida, aparece el diálogo con las 3 opciones (cambiar empresa / continuar / cancelar).
- [ ] "Retiro en Persona" aparece como opción en el selector de empresa de envío y no exige seguimiento ni aparece en los filtros de Envíos.
- [ ] Click en el nombre del diseño en Producción abre un popup con datos del pedido y del cliente.
- [ ] Nueva columna en Producción marca (no vacía) los sellos que pertenecen a pedidos con más de un ítem, y queda vacía en caso contrario.

---

## 11. Preguntas abiertas antes de arrancar a codear

1. Via Cargo en Envíos: ¿tabla simple única, o replicar la separación "con datos"/"pendientes" desde el arranque? (§1)
2. "Impresión" vs "descarga" de etiqueta: ¿son el mismo evento en tu flujo real? (§2)
3. Prefijos "000"/"3600": ¿son fijos para toda variante de servicio (Domicilio/Sucursal), o pueden cambiar? (§4)
4. "Otro" en el selector de empresa: ¿hoy se usa para algo distinto de retiro en persona? Define si conviene agregar "Retiro en Persona" como opción nueva (como está planteado arriba) o simplemente renombrar "Otro". (§5)

*Documento generado a partir de una revisión del código actual (Sep 2026). Antes de implementar cada fase, releer la sección correspondiente por si el código cambió mientras tanto.*
