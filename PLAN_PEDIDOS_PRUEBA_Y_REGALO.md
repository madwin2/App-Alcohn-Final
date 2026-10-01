# Plan — Pedidos de PRUEBA y de REGALO

> Estado: **diseño cerrado con el dueño (2026-10-01)**, listo para implementar.
> Antes de empezar: leer [`AGENTS.md`](AGENTS.md) y, del índice de ruteo de [`docs/README.md`](docs/README.md), las filas **Pedidos**, **Cobros / venta / deudores**, **Stock**, **Mensajes de WhatsApp** y **Precios / costos / economía**.
> ⚠️ La base Supabase es **producción** y la comparte la tienda web: la migración y el deploy de la edge `webhook-bot` se hacen **solo con permiso explícito** del usuario.

---

## 1. Qué queremos (en palabras del negocio)

Hoy todo lo que se carga en Pedidos es una **venta**: suma a "sellos vendidos", a ventas del mes, a la meta de 200, a Economía, al evento Purchase de Meta, y entra en el circuito de cobro (Señado → Foto → Transferido / Deudor).

Hacen falta dos tipos más, que **se fabrican igual** (aparecen en Pedidos y en Producción, entran a programas, consumen bronce e insumos de stock) pero **no son ventas**:

| Tipo | Para qué | Cliente | Cobro | Envío | Cuenta como venta |
|---|---|---|---|---|---|
| **Venta** (actual) | Lo de siempre | Real | Seña + restante | Según pedido | Sí |
| **Prueba** | Prueba interna (máquina, material, diseño, proceso) | Cliente interno fijo **"Alcohn – Pruebas internas"** (sin teléfono) | Ninguno | **Nunca se envía** | No |
| **Regalo aparte** | Pedido sin cargo para un cliente (sello, accesorio) | Real | Ninguno | Se envía; **lo paga Alcohn** | No |
| **Ítem regalo dentro de una venta** | Un ítem sin cargo que viaja con un pedido real | El del pedido | El ítem vale $0; el resto del pedido se cobra normal | Viaja con el pedido | El ítem no; el resto sí |

Todos se crean desde el **mismo botón "Nuevo pedido"**. Un regalo también se puede sumar a un pedido existente.

## 2. Decisiones tomadas (no re-preguntar)

| # | Decisión |
|---|---|
| D1 | **Prueba** descuenta stock y se da por **cerrada** cuando **todos** sus ítems quedan `Hecho`. |
| D2 | **Prueba** se carga siempre al **cliente interno fijo**, sin teléfono → nunca sale WhatsApp. Lleva un campo obligatorio **"Motivo de la prueba"**. |
| D3 | **Regalo**: el cliente **sí** recibe los WhatsApp automáticos, con el ítem marcado **"Regalo – sin cargo"** y sin pedir pago. |
| D4 | **Regalo aparte**: el envío lo paga **Alcohn** (restante $0; el costo del envío es un gasto). En Andreani, el link lo completa y paga el equipo. |
| D5 | **Regalo aparte** sigue: Hecho → foto **opcional** → cola **Para enviar**. Nace "sin cobro" (equivale a pagado). **Nunca** pasa a Deudor ni recibe recordatorios de pago. |
| D6 | **Economía**: pruebas y regalos **no** suman a ventas, pedidos, sellos vendidos, ticket ni mix; su **costo** (fabricación, y envío en regalos) aparece como **gasto separado** ("Regalos", "Pruebas") que **resta** en la rentabilidad del mes. |
| D7 | **No** se guarda valor de lista de lo regalado: alcanza con el costo de fabricación. |
| D8 | El tipo **no se puede cambiar** después de creado (ni el pedido ni la marca de regalo de un ítem). Si se cargó mal, se borra y se vuelve a cargar. |

## 3. Modelo de datos

### 3.1 Migración (archivo nuevo `migration_pedidos_prueba_y_regalo.sql` en la raíz)

```sql
-- Tipo de pedido a nivel orden. Default 'Venta' => las 3.6k órdenes existentes y las de la tienda web no cambian.
ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS tipo_pedido text NOT NULL DEFAULT 'Venta'
    CHECK (tipo_pedido IN ('Venta', 'Prueba', 'Regalo')),
  ADD COLUMN IF NOT EXISTS motivo_prueba text;

-- Ítem sin cargo. En órdenes 'Regalo' todos los ítems van en true; en 'Venta' puede haber mezcla.
ALTER TABLE public.sellos
  ADD COLUMN IF NOT EXISTS es_regalo boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT sellos_regalo_sin_cargo
    CHECK (NOT es_regalo OR (COALESCE(valor, 0) = 0 AND COALESCE(senia, 0) = 0));

-- Cliente interno para pruebas.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS es_interno boolean NOT NULL DEFAULT false;
-- INSERT del cliente "Alcohn – Pruebas internas" con es_interno = true, sin teléfono ni mail
-- (verificar antes qué columnas de clientes son NOT NULL / UNIQUE en la base en vivo).

CREATE INDEX IF NOT EXISTS idx_ordenes_tipo_pedido_no_venta
  ON public.ordenes (tipo_pedido) WHERE tipo_pedido <> 'Venta';
```

Reglas de integridad adicionales (trigger BEFORE INSERT/UPDATE en `sellos`, o en el servicio + trigger):
- Si la orden es `Prueba` o `Regalo` → el ítem va con `valor = 0`, `senia = 0`; en `Regalo`, además `es_regalo = true`.
- `tipo_pedido` y `es_regalo` no se pueden modificar después del INSERT (D8): trigger que rechace el UPDATE si cambian.

> El `tipo_pedido` **tiene que ir en el INSERT** de `ordenes`, no en un UPDATE posterior: el trigger de Meta y otros se disparan AFTER INSERT.

### 3.2 Tipos TS y mappers

- `Order.orderType: 'VENTA' | 'PRUEBA' | 'REGALO'`, `Order.testReason?: string`; `OrderItem.isGift: boolean`; `Customer.isInternal`.
- `src/lib/supabase/mappers.ts`: leer/escribir las columnas nuevas (`mapOrdenToOrder`, mapper de sellos, el de INSERT).
- Agregar las columnas a todos los `select(...)` explícitos de `orders.service.ts`, `economiaOrdersCache.ts`, `clienteProfile.service.ts`, etc.

### 3.3 Una sola regla de conteo (helper nuevo con tests)

`src/lib/pedidos/tipoPedido.ts`:

```ts
/** Un ítem cuenta como venta solo si su orden es Venta y el ítem no es regalo. */
export const itemCuentaComoVenta = (order, item) => order.orderType === 'VENTA' && !item.isGift;
export const ordenCuentaComoVenta = (order) => order.orderType === 'VENTA';
export const esPruebaCerrada = (order) => order.orderType === 'PRUEBA' && order.items.every(i => i.fabricationState === 'HECHO');
```

**Toda** métrica, cola o automatización de las secciones siguientes usa estos helpers (en TS) o su equivalente SQL (`o.tipo_pedido = 'Venta' AND NOT s.es_regalo`). No duplicar la condición a mano.

## 4. Alta: botón "Nuevo pedido" (`NewOrderDialog` / `NewOrderStepForm`)

**Paso 1 — arriba de todo, selector "Tipo de pedido"**: `Venta` (default) · `Regalo` · `Prueba interna`.

| Tipo | Paso 1 (cliente) | Paso 2 (diseños) | Al crear |
|---|---|---|---|
| **Venta** | Igual que hoy | Igual que hoy + casilla por diseño **"Regalo (sin cargo)"**: pone valor y seña en 0, los bloquea, `es_regalo = true` | Igual que hoy |
| **Regalo** | Cliente normal (busca/crea igual que hoy). Si el cliente tiene pedidos **abiertos** (no despachados), ofrecer: **"Sumar al pedido #… (viaja junto)"** o **"Pedido de regalo aparte"** | Valor y seña ocultos (= 0). Envío: empresa/servicio como siempre | *Sumar*: `addStampToOrder` con `es_regalo = true` en la orden elegida. *Aparte*: orden `tipo_pedido='Regalo'`, todos los ítems `es_regalo=true`, `estado_orden` y `estado_venta` = `Transferido` (D5) |
| **Prueba interna** | Se ocultan los datos del cliente; se usa el cliente interno. Campo obligatorio **Motivo de la prueba**. Sin casilla de WhatsApp, sin internacional | Valor, seña y envío ocultos. Fabricación, prioridad, fecha límite y archivos igual que hoy | Orden `tipo_pedido='Prueba'`, `motivo_prueba`, cliente interno, sin envío. No se llama a `notifyOrderRegistered` |

- Paso 3 (resumen) muestra el tipo con un badge y, en Regalo/Prueba, "Sin cargo".
- La cotización automática de Precios (`cotizacionMedida`) **no** se aplica a ítems regalo/prueba.
- `AddStampDialog` (agregar ítem a un pedido existente): casilla **"Regalo (sin cargo)"** (solo en órdenes `Venta`). En órdenes `Regalo` todo ítem nuevo es regalo; en `Prueba`, todo ítem nuevo es de prueba.
- Pedido internacional + Regalo/Prueba: **fuera de alcance en v1** (deshabilitar la combinación).

## 5. Impacto en cada módulo y automatización

### 5.1 Pedidos (tabla)
- Badge **PRUEBA** / **REGALO** en la fila y, para ítems regalo dentro de una venta, en el renglón del ítem.
- Celdas valor/seña/restante: "Sin cargo" en Prueba/Regalo e ítems regalo.
- Celda **Venta**: deshabilitada en Prueba (muestra "Prueba"); en Regalo aparte muestra "Sin cargo".
- Celda **Envío**: deshabilitada en Prueba.
- **Filtros** (`FiltersDialog`): filtro "Tipo de pedido" (Venta / Regalo / Prueba; por defecto todos).
- **Exportar ventas (CSV)**: solo `ordenCuentaComoVenta`, y sin ítems regalo en el valor.
- Menú de fila: **no** agregar "cambiar tipo" (D8).
- `getOrdersOlderOpenOperational`: excluir pruebas cerradas (si no, una prueba vieja sin envío se carga para siempre como "envío abierto").

### 5.2 Venta: estados, sincronización y deudores
- **Ítem regalo dentro de una venta** acompaña el estado de venta del pedido: al cambiar la venta de los ítems cobrados, los ítems regalo de esa orden toman el mismo valor; la sincronización con `ordenes.estado_orden` (BR-PED-003) se calcula **solo sobre los ítems no regalo**.
- `marcar_ordenes_deudores_por_foto()` (cron diario): considerar solo ítems `NOT es_regalo` en el "todos en Foto"; excluir órdenes `tipo_pedido <> 'Venta'`.
- `procesar_recordatorios_pago_pendiente()`: excluir `tipo_pedido <> 'Venta'`.
- `trigger_foto_sello_subida`: en Prueba **no** envía nada (además no hay teléfono). En Regalo aparte, la foto **no** cambia la venta (ya es `Transferido`) y manda el tipo de mensaje de regalo (ver 5.6).

### 5.3 Producción y Programas
- Badge PRUEBA / REGALO en el ítem (tabla de Producción y tarjetas del programa) para que el taller lo vea; ningún otro cambio. Entran a programas, consumen bronce (`registrar_bronce_consumo_sello`) y suman a `cantidad_sellos` del programa como cualquier ítem (es producción real).
- Notificaciones a Ventas (v1 ítem agregado a orden pagada, v3 "Hecho, enviar foto", v4 deudor): **no** se emiten para Prueba. Buscar todos los emisores (`notificaciones.service.ts`, funciones SQL de `migration_notificaciones.sql`).
- `emitir_notificaciones_vencimientos()`: la alerta **l2** ("orden no despachada") excluye Prueba (nunca se despacha). La **p4** (fecha límite) sí aplica a pruebas.

### 5.4 Stock (BR-STK)
- **Prueba (D1)**: trigger nuevo AFTER UPDATE OF `estado_fabricacion` en `sellos`: si la orden es `Prueba` y, con este cambio, **todos** sus ítems están `Hecho` → `consume_stock_for_order(orden_id)` (reutiliza la BOM y la guarda de idempotencia existente). Replicar en TS donde la app hoy llama a `consumeStockForOrderWhenTrackingSent`, compartiendo la misma guarda.
- **Regalo** (aparte o ítem dentro de una venta): sin cambios — se descuenta al pasar a `Seguimiento Enviado` como cualquier pedido (la BOM ya recorre todos los ítems).
- `getPendingShipmentStockDemand`: excluir pruebas cerradas; las pruebas abiertas sí cuentan como demanda.
- Rehacer de una prueba ya cerrada: igual que hoy, el stock no se repone (no cambiar).

### 5.5 Envíos (Regalo aparte)
- Restante: `update_orden_totals` / `update_orden_restante_on_shipping_change` **no** suman costo de envío al `restante` en órdenes `Regalo` (restante = 0, D4). El costo de envío se sigue calculando para Economía (gasto).
- Al estar `Transferido` desde el alta, cuando sus ítems quedan `Hecho` aparece en **Para enviar** y en Envíos como cualquier pedido pago. Carga de datos de envío, MiCorreo, Andreani y "Cargar seguimientos" funcionan igual.
- Andreani: el link del pool lo completa y paga el equipo; el mensaje al cliente no debe pedirle que pague el envío.
- Regla de **envío gratis con ≥3 sellos** (`webhook-bot`, `sellosParaReglaEnvio`): contar **solo ítems no regalo**.

### 5.6 WhatsApp (`webhook-bot` + bot externo)
- La edge agrega al payload: `datos.tipo_pedido` y, por ítem, `es_regalo`. Ítems regalo con `valor_item = 0`, `saldo_item = 0`.
- **Venta con ítems regalo**: mismos tipos de mensaje que hoy; el ítem regalo figura como "Regalo – sin cargo" y no suma al restante (ya es $0).
- **Regalo aparte**: tipos nuevos `regalo_registrado` (en vez de `pedido_registrado`) y `regalo_listo` (en vez de `pedido_listo`, sin montos ni pedido de pago). `pedido_enviado` igual que hoy.
- `trigger_accesorio_listo`: si el ítem es regalo, mandar el payload con `es_regalo = true` (el bot no debe pedir pago).
- **Prueba**: guarda explícita en `notifyOrderRegistered`, `notifyOrderUpdated`, `enviar_webhook_pedido` y triggers → nunca se envía (además el cliente interno no tiene teléfono).
- ⚠️ **Dependencia externa**: el bot corre en el VPS y usa **plantillas de Meta** que carga Julián. Hasta que existan las plantillas de regalo y el bot entienda `es_regalo` / `regalo_*`, dejar un flag (p. ej. `REGALO_WHATSAPP_HABILITADO`, apagado) con el que **no se envían** `regalo_registrado` ni `regalo_listo`. Los mensajes de ventas que traen un ítem regalo siguen saliendo con la plantilla actual (el ítem va en $0); verificar con Julián que se lean bien. Registrar esto como pregunta abierta en `docs/14-open-questions/whatsapp-bot.md`.

### 5.7 Meta Conversions API
- `trg_meta_conversion_on_orden_insert` (`migration_meta_conversion_api.sql`): **no** enviar Purchase si `NEW.tipo_pedido <> 'Venta'`. Importante: si no, se ensucia la optimización de anuncios con compras falsas.
- El valor del Purchase de una venta con ítems regalo ya excluye el regalo ($0) — sin cambios.

### 5.8 Inicio (`src/app/home/index.tsx`)
- **Objetivos** ("Ventas totales del mes" / "Ventas del día", metas 200 y 10): contar solo `itemCuentaComoVenta`.
- **Sellos listos**: Prueba **fuera** de las 4 colas. Regalo aparte solo en **Para enviar** (no en Enviar foto, Esperando pago ni Deudores). Ítems regalo dentro de una venta siguen al pedido.
- **Prioritarios y con fecha límite**: incluye pruebas y regalos (es trabajo de producción).

### 5.9 Economía (`src/app/economia/index.tsx`, `economiaOrdersCache.ts`, `productCategory.ts`)
- Ventas brutas, pedidos, unidades, sellos, transferido, pendiente, ticket promedio, **Por producto**, **Mix**, **Por año**: solo `ordenCuentaComoVenta` / `itemCuentaComoVenta`.
- `costosVentas` sigue siendo el costo de lo vendido: el costo de fabricación de ítems regalo (dentro de ventas) **sale** de `costosVentas`.
- Líneas nuevas por mes en P&L: **Regalos** = costo de fabricación de ítems regalo + costo de envío de órdenes Regalo; **Pruebas** = costo de fabricación de órdenes Prueba. Ambas suman a gastos operativos y **restan** de la rentabilidad (D6). En meses con `fuente: 'resumen'` respetar la regla actual (no volver a restar costos sobre `gastos_reales`).
- Mostrar en el mes: cantidad de regalos y de pruebas, con su costo.
- Invalidar/versionar el caché local `economiaOrdersCache` (las órdenes cacheadas no tienen el campo nuevo).

### 5.10 Comercial / recompra / perfil de cliente
- `procesar_seguimientos_clientes_pendientes` (`migration_comercial_seguimientos_clientes.sql`): hoy elige clientes con `total_ordenes = 1` y `estado_orden = 'Transferido'`. Contar **solo órdenes Venta** (si no, un regalo saca al cliente de la recompra, o una orden de regalo dispara recompra). Una orden Regalo nunca dispara recompra.
- Cliente interno (`es_interno`): excluido de Comercial, recompra, contacto y de cualquier listado de clientes.
- `ClienteProfileDialog`: los pedidos de regalo se listan con badge; los totales "comprado/gastado" solo con ventas.

### 5.11 Tienda web
- No requiere cambios: las órdenes web nacen con el default `Venta`. Verificar que ningún INSERT/UPDATE de la tienda falle por las columnas nuevas (tienen default).

## 6. Orden de implementación sugerido

1. Migración (columnas, constraint, cliente interno, triggers de integridad) — **con permiso**.
2. Tipos, mappers, `select`s y helper `tipoPedido.ts` + tests.
3. Alta: `NewOrderDialog`/`NewOrderStepForm`, `AddStampDialog`, `createOrder`/`addStampToOrder`.
4. Tabla de Pedidos, filtros, CSV; Producción/Programas (badges).
5. SQL de automatizaciones: Meta, deudores, recordatorio, recompra, restante sin envío en Regalo, vencimientos l2, consumo de stock de pruebas, foto/accesorio.
6. Inicio y Economía.
7. `webhook-bot` (payload + regla ≥3 + flag) — deploy **con permiso**; coordinar plantillas del bot con Julián.
8. Documentación y changelog (sección 8).

## 7. Pruebas (checklist manual + unitarios)

- [ ] Unitarios de `tipoPedido.ts` y del conteo de Inicio/Economía con órdenes mixtas.
- [ ] Venta con 2 sellos + 1 ítem regalo: objetivo del mes suma 2; Economía suma 2 sellos y no el costo del regalo en costosVentas; restante sin cambios; WhatsApp lista el regalo "sin cargo"; ≥3 sellos **no** da envío gratis; deudor a los 10 días funciona con el regalo en otro estado.
- [ ] Regalo aparte: restante $0 aunque tenga Correo/Andreani; no dispara Meta; Hecho → aparece en Para enviar; foto no lo pasa a Foto ni a Deudor; descuenta stock al `Seguimiento Enviado`; aparece en la línea Regalos con fabricación + envío.
- [ ] Prueba: no hay WhatsApp ni Meta; no aparece en colas de Ventas ni en alerta l2; al quedar todos los ítems Hecho descuenta stock **una vez** y sale de la demanda; aparece en Producción y programas; línea Pruebas en Economía.
- [ ] Orden web nueva sigue creándose bien (default `Venta`).
- [ ] Intentar cambiar `tipo_pedido` o `es_regalo` por UPDATE → rechazado.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`.

## 8. Documentación a actualizar en el mismo cambio (AGENTS.md §3)

- `docs/02-modules/pedidos/README.md` (alta, tabla, filtros), `produccion`, `stock`, `economia-gastos`, `inicio`, `comercial`.
- `docs/03-workflows/WF-01-alta-manual-de-pedido.md` (tipos de pedido), WF-05, WF-06/07 (regalo con envío a cargo de Alcohn), WF-10, WF-11, WF-12.
- `docs/04-business-rules/`: nuevas BR (próximos IDs libres de `pedidos-y-venta.md` y `stock.md`) + D1–D8 como POL en `politicas-confirmadas.md`.
- `docs/05-data/entidades/orden.md`, `sello.md`, `cliente.md`; `docs/06-state-machines/venta.md` (Regalo nace Transferido; Prueba sin venta).
- `docs/07-integrations/whatsapp-bot.md`, `meta.md`; `docs/08-automations/triggers.md`, `cron.md`.
- `docs/13-decisions/`: ADR nuevo "Pedidos de prueba y regalo: tipo en la orden + marca por ítem".
- `docs/14-open-questions/`: registrar la dependencia de plantillas del bot (5.6).
- `docs/manual/` (capítulo de Pedidos) y entrada en `src/lib/changelog/entries.ts`.
