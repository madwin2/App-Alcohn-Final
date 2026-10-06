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

- **Tablas**: `gastos_registros` (un día × campaña/proyecto/recurrente, en su moneda original), `gastos_pagos_usd` (pagos de los USD de un mes), `gastos_recurrentes`, `cotizaciones_usd` (blue venta diario), `control_gastos_config` (objetivo 25 %, IVA 21 %, otros impuestos USD 2 %, `fecha_inicio` 2026-09-29), `gastos_sync_log`. RLS: solo la cuenta dueña (`precios_catalog_owner_user_id()`).
- **Valuación** (`src/lib/gastos/gastosAuto.ts`, con tests): el gasto cuenta en el **mes en que ocurrió**; los USD se pasan a pesos con el **blue del día del pago** (pagos cargados en Gastos → «Marcar pago»); lo no pagado, al **blue de hoy** («estimado»). En la categoría va gasto + IVA; el 2 % de otros recargos va a `impuestos`. El valor en pesos no se guarda: se calcula al leer.
- **Economía**: `sumarGastosAutoAMeses` **suma** lo automático a lo cargado a mano en `economia_gastos_mensuales` (no lo persiste). Desde `fecha_inicio` no hay que cargar a mano la publicidad de la tarjeta (se duplicaría). Meses anteriores no cambian.
- **Gastos**: tarjeta «Gastos automáticos» (desglose por plataforma/campaña, estado de sync, «Actualizar ahora», «Marcar pago») y «Gastos recurrentes».
- **Economía → Mes en curso** (pestaña por defecto): ventas y ganancia a hoy (fijos prorrateados), proyección a fin de mes (ventas al ritmo del mes; publicidad al ritmo de los últimos 7 días) y **publicidad por día** que permite llegar al objetivo (también en USD aprox.). Si el mes no tiene fijos cargados, usa los del mes anterior.
- **Días hábiles** (`src/lib/gastos/diasHabiles.ts`): lunes a viernes menos la tabla `feriados` (calendario del equipo, POL-045). En Mes en curso las **ventas** se proyectan por día hábil (ritmo = ventas de hábiles terminados ÷ hábiles terminados) y lo vendido un día no hábil se imputa al **hábil siguiente** (criterio POL-070); la **publicidad** se proyecta por **día corrido**. Los fijos «a hoy» se prorratean por hábiles.
- **Fijos estimados línea por línea** (`estimarFijos`): lo que en el mes en curso está en 0 y el mes anterior tenía monto (cada sueldo, alquiler, luz…) se toma del mes anterior y se avisa qué falta cargar. Los **recurrentes** que se cobran después de hoy se suman a la proyección (`recurrentesPendientesArs`).
- **Gastos → resumen**: «Gasto del mes» = criterio de Economía (sin compra de dólares ni inversiones, que van en «Inversiones y ahorro»). En el mes en curso, «Cierre estimado» = cargado + fijos que faltan + publicidad al ritmo de 7 días × días corridos restantes + recurrentes por cobrar.
- Pendiente (Etapa 2): alertas automáticas, atribución de ventas por campaña.

❓ Preguntas: [economia.md](../../14-open-questions/economia.md).
