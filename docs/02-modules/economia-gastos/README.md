# Economía y Gastos

> Rutas: `/economia` (dentro de `OrdersProvider`), `/gastos` · Páginas: `src/app/economia/index.tsx`, `src/app/gastos/index.tsx`
> Servicios: `economiaSettings.service.ts`, `economiaMovimientos.service.ts`, `gastosMensuales.service.ts`, `fabricacionParametros.service.ts` · Lógica: `src/lib/economia/*`, `src/lib/gastos/*`
> Menú visible **solo** para la cuenta del dueño (email hardcodeado en `Sidebar.tsx`); las rutas no tienen protección adicional.

## Economía

✅ Tablero financiero calculado en el navegador a partir de **todas** las órdenes (con caché local `economiaOrdersCache`):

- **Mes actual**: sellos vendidos, ventas brutas, rentabilidad en pesos y en USD (con cotización de referencia).
- **Envío en ventas brutas**: se imputa el costo de `costos_de_envio` solo cuando el pedido ya está Despachado / Seguimiento enviado. **Excepción**: Andreani con link asignado (actual o histórico en `envios_andreani_links`) **no** suma envío — el cliente lo paga en Andreani y esa plata no entra (BR-COS-006).
- **Pendiente de cobro** desglosado por estado de venta: Deudor, Foto enviada, Señado.
- **Cajas** (saldo manual): efectivo, Mercado Pago, dos cuentas Santander (a nombre de dos personas), BBVA; cotización USD de referencia → `economia_settings` (RLS **por usuario**).
- **Movimientos reales**: compra de USD (ahorro), inversión en la empresa, inversión "Cyprea" → `economia_movimientos_reales` (RLS por creador). Cyprea = marca paralela de Alcohn de sellos de lacre (Q-ECO-001). Las cajas se cargan a mano y hoy están desactualizadas (Q-ECO-002).
- Pestañas: **Volumen** (resumen anual + barras + tabla), **Por producto**, **P&L mensual** (gasto operativo según fuente del mes), **Mix**, **Por año** (ganancia / rentabilidad anual + tendencias).
- Costos y márgenes por ítem vienen de los triggers `calc_sello_fabrication_cost` / `refresh_orden_fabrication_totals`.

### Fuente del mes en Gastos (`MonthCostsBundle`)

✅ Cada mes en `economia_gastos_mensuales.months` puede llevar:

- `fuente?: 'detalle' | 'resumen'`
- `gastos_reales?: number` (gasto operativo real del mes; **incluye publicidad**)
- `ventas_resumen?` / `unidades_resumen?` (facturación y cantidad del cierre Excel; si están, Mensual las usa en meses resumen — p. ej. 2024 sin pedidos en el catálogo)

Si `fuente === 'resumen'` y hay `gastos_reales` > 0, la pestaña **Mensual** de Economía usa ese total como gasto operativo y **no** vuelve a restar fabricación de pedidos ni fijos/extras. Publicidad, compra de dólares e inversiones empresa siguen en `extras` como desglose / columna Ganancias.

Meses con carga fina (sueldos, alquiler, etc.) o `fuente: 'detalle'` usan el cálculo clásico: fijos + costos ventas + extras + publicidad + envíos.

El script `scripts/seed-economia-resumen-excel.mjs` (dry-run por defecto; `--write` para aplicar) carga Jul-24…Ago-25 desde el Excel de cierre. No pisa meses con detalle fino ni Sep-25+.

## Gastos

✅ Carga mensual de costos, guardada como JSON por usuario en `economia_gastos_mensuales.months` (migrado desde `localStorage`):
- **Fijos**: sueldos (una fila por usuario, con aguinaldo calculado), monotributos, contador, alquiler, seguro, crédito, servicios (electricidad, agua, internet).
- **Extras**: publicidad, envíos, inversiones de la empresa, compra de dólares, gastos varios, automatizaciones, remodelaciones, impuestos, inversiones en Cyprea.
- **Resumen histórico**: meses viejos pueden tener solo `gastos_reales` + publicidad/dólares/inversión (sin inventar sueldos). En `/gastos` se muestra un aviso y el total proyectado usa `gastos_reales`.
- **Parámetros de fabricación** (costos unitarios): soldadores, base, mango de golpe, amortización de fresa, precio por cm de planchuela (12/20/25/40/63 mm), tubo, caja ABC, mango de madera, varilla, prisionero, soporte ABC, cm de material de abecedario, pérdida de corte. "Guardar en Supabase" **inserta una nueva versión** en `fabricacion_parametros` con "vigente desde"; los ítems nuevos se costean con la versión vigente a su `created_at`.

⚠️ Guardar parámetros desde Gastos **no copia** las claves `largoMaximoPlanchuelaMm_C/G/XL` (no están en `VariableCostsState`), así que la nueva versión las pierde y Programas vuelve a los valores por defecto (hoy coinciden). [AUD-INC-011](../../audits/inconsistencias.md#aud-inc-011).

## Fórmula de costo por ítem (✅ trigger `calc_sello_fabrication_cost`)

| Ítem | Costo |
|---|---|
| Soldador | precio soldador (100 W o 200 W; se detecta por `item_config.soldadorPower` o texto "100W" en diseño/nota) + amortización |
| Mango de golpe | precio mango de golpe |
| Base remachadora | precio base + amortización |
| Abecedario | amortización + soporte + mango madera + varilla + prisionero + caja + tubo + (cm material × precio planchuela 12) — 40 cm si una caja de letras, 80 si ambas |
| Sello | amortización + mango madera + varilla + prisionero + tubo + (lado mayor + pérdida) × precio por cm de la planchuela según lado menor |

Margen = valor − costo (por ítem y por orden).

## Gastos automáticos y Mes en curso (Etapa 1 de control de gastos, 2026-10)

✅ Plan: [`PLAN_CONTROL_GASTOS.md`](../../../PLAN_CONTROL_GASTOS.md) · Decisión: [control-de-gastos](../../13-decisions/control-de-gastos.md) · Integraciones: [gastos-automaticos](../../07-integrations/gastos-automaticos.md).

- **Tablas**: `gastos_registros` (un día × campaña/proyecto/recurrente, en su moneda original), `gastos_pagos_usd` (pagos de los USD de un mes), `gastos_recurrentes`, `cotizaciones_usd` (blue venta diario), `control_gastos_config` (objetivo 25 %, IVA 21 %, otros impuestos USD 2 %, `fecha_inicio` **2025-09-01** desde 2026-10-07 — antes 2026-09-29), `gastos_sync_log`. RLS: solo la cuenta dueña (`precios_catalog_owner_user_id()`).
- **Valuación** (`src/lib/gastos/gastosAuto.ts`, con tests): el gasto cuenta en el **mes en que ocurrió**; los USD se pasan a pesos con el **blue del día del pago** (pagos cargados en Gastos → «Marcar pago»); lo no pagado, al **blue de hoy** («estimado»). En la categoría va gasto + IVA; el 2 % de otros recargos va a `impuestos`. El valor en pesos no se guarda: se calcula al leer.
- **Economía**: `sumarGastosAutoAMeses` **suma** lo automático a lo cargado a mano en `economia_gastos_mensuales` (no lo persiste). Desde `fecha_inicio` no hay que cargar a mano la publicidad de la tarjeta (se duplicaría). Ver «Publicidad real retroactiva».
- **Gastos**: tarjeta «Gastos automáticos» (desglose por plataforma/campaña, estado de sync, «Actualizar ahora», «Marcar pago») y «Gastos recurrentes».
- **Economía → Mes en curso** (pestaña por defecto): ventas y ganancia a hoy (fijos prorrateados), proyección a fin de mes (ventas al ritmo del mes; publicidad al ritmo de los últimos 7 días) y **publicidad por día** que permite llegar al objetivo (también en USD aprox.). Si el mes no tiene fijos cargados, usa los del mes anterior.
- **Días hábiles** (`src/lib/gastos/diasHabiles.ts`): lunes a viernes menos la tabla `feriados` (calendario del equipo, POL-046). En Mes en curso las **ventas** se proyectan por día hábil (ritmo = ventas de hábiles terminados ÷ hábiles terminados) y lo vendido un día no hábil se imputa al **hábil siguiente** (criterio POL-071); la **publicidad** se proyecta por **día corrido**. Los fijos «a hoy» se prorratean por hábiles.
- **Fijos estimados línea por línea** (`estimarFijos`): lo que en el mes en curso está en 0 y el mes anterior tenía monto (cada sueldo, alquiler, luz…) se toma del mes anterior y se avisa qué falta cargar. Los **recurrentes** que se cobran después de hoy se suman a la proyección (`recurrentesPendientesArs`).
- **Gastos → resumen**: «Gasto del mes» = criterio de Economía (sin compra de dólares ni inversiones, que van en «Inversiones y ahorro»). En el mes en curso, «Cierre estimado» = cargado + fijos que faltan + publicidad al ritmo de 7 días × días corridos restantes + recurrentes por cobrar.
- **Meta dinámica en sellos** (`calcularVentasNecesarias` + `calcularObjetivoSellos`): equilibrio y objetivo en pesos → sellos con la venta promedio por sello del mes. Lo necesario por día se mide desde hoy sobre los hábiles terminados, igual que la proyección (test de coherencia). Reemplaza la meta fija de 200 en Economía; Inicio sigue usando `src/lib/metas` (200/10).
- Pendiente (Etapa 2): alertas automáticas, atribución de ventas por campaña.

❓ Preguntas: [economia.md](../../14-open-questions/economia.md).

## Publicidad real retroactiva (2026-10-07)

Decisión del dueño (2026-10-07): **desde septiembre 2025 la publicidad de cada mes es la real de Meta y Google** (por día y campaña, `gastos_registros`), no el total del resumen de la tarjeta cargado a mano.

- `control_gastos_config.fecha_inicio` = **2025-09-01**. OpenAI **no** se trae para atrás (`OPENAI_DESDE` = 2026-09-29 en `gastos-sync`): antes de esa fecha, automatizaciones siguen siendo las cargadas a mano.
- Carga histórica: Meta con `gastos-sync` `{ "meta_desde": "2025-09-01" }` (de a un mes); Google con `scripts/google-ads/enviar-gastos-historico.js` (se corre **una vez** desde Google Ads).
- Dólar histórico (oficial y blue venta diarios) cargado en `cotizaciones_usd` desde ArgentinaDatos (`fuente = 'argentinadatos'`).
- **Pago de cada mes** = blue venta del **día 10 del mes siguiente** (aprox. pago de la tarjeta). Desde 2026-10-07 lo aplica la app sola para **todo mes sin pago marcado** una vez pasado ese día (`completarPagosAutomaticos`, se ve como «automático» en Gastos); nadie tiene que marcar pagos. Un pago cargado a mano tiene prioridad. Los meses 2025-09 a 2026-08 además tienen el pago guardado en `gastos_pagos_usd` (nota «retroactivo», `scripts/sql/pagos-usd-retroactivos.sql`).
- La publicidad manual de 2025-09 a 2026-09 se puso en **0** (no había otra publicidad aparte de Meta y Google, confirmado por el dueño). Valores originales (resumen de tarjeta, ARS) como respaldo:

| Mes | Publicidad manual original |
|---|---|
| 2025-09 | 1.771.000 |
| 2025-10 | 1.236.200 |
| 2025-11 | 2.279.100 |
| 2025-12 | 3.515.550 |
| 2026-01 | 2.354.000 |
| 2026-02 | 1.982.000 |
| 2026-03 | 2.498.000 |
| 2026-04 | 3.500.000 |
| 2026-05 | 2.615.000 |
| 2026-06 | 3.569.000 |
| 2026-07 | 3.200.000 |
| 2026-08 | 3.347.000 |
| 2026-09 | 5.221.000 |

- **Automatizaciones (2026-10-07, segunda parte):** OpenAI y Claude también se trajeron para atrás (`gastos-sync` `{ "automatizaciones_desde": "2025-09-01" }`, de a un mes): OpenAI solo guarda el último año (desde 2025-10-07); Claude tiene consumo desde 2026-04. Los 6 recurrentes de octubre se generaron para cada mes 2025-09 a 2026-09 (`generar_gastos_recurrentes` con el último día de cada mes). El dueño acomoda a mano lo que queda en «automatizaciones» de cada mes (no se tocó). Los pagos «retroactivo» se borraron: la regla automática del día 10 cubre todos los dólares del mes.
- **Recurrentes por mes (2026-10-07):** en Gastos cada recurrente tiene la casilla «este mes»: la prende o apaga **solo en el mes que se mira** (borra o crea su registro de ese mes y guarda el mes en `gastos_recurrentes.meses_excluidos`, que `generar_gastos_recurrentes` respeta; migración `migration_gastos_recurrentes_meses_excluidos.sql`). «Se sigue cobrando» (antes «Activo») es la marca general: afecta desde el mes en curso y no toca meses pasados.
- ❓ Pendiente de confirmar: los «impuestos» cargados a mano en esos meses (0 a 1,25 M) — si incluyen recargos de la tarjeta sobre los dólares, el 2 % automático los duplica (≈ 2 % de la publicidad del mes).
