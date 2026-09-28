# Economía y Gastos

> Rutas: `/economia` (dentro de `OrdersProvider`), `/gastos` · Páginas: `src/app/economia/index.tsx`, `src/app/gastos/index.tsx`
> Servicios: `economiaSettings.service.ts`, `economiaMovimientos.service.ts`, `gastosMensuales.service.ts`, `fabricacionParametros.service.ts` · Lógica: `src/lib/economia/*`, `src/lib/gastos/*`
> Menú visible **solo** para la cuenta del dueño (email hardcodeado en `Sidebar.tsx`); las rutas no tienen protección adicional.

## Economía

✅ Tablero financiero calculado en el navegador a partir de **todas** las órdenes (con caché local `economiaOrdersCache`):

- **Mes actual**: sellos vendidos, ventas brutas, rentabilidad en pesos y en USD (con cotización de referencia).
- **Pendiente de cobro** desglosado por estado de venta: Deudor, Foto enviada, Señado.
- **Cajas** (saldo manual): efectivo, Mercado Pago, dos cuentas Santander (a nombre de dos personas), BBVA; cotización USD de referencia → `economia_settings` (RLS **por usuario**).
- **Movimientos reales**: compra de USD (ahorro), inversión en la empresa, inversión "Cyprea" → `economia_movimientos_reales` (RLS por creador). Cyprea = marca paralela de Alcohn de sellos de lacre (Q-ECO-001). Las cajas se cargan a mano y hoy están desactualizadas (Q-ECO-002).
- Pestañas: **Ventas mensuales**, **Desglose productos** (clasificación por grupo de sello/accesorio; unidades, ventas o margen), **Mensual** (registro por mes: *Transferido − (fijos + ventas + extras + publicidad + envíos)*), **Mix de ítems**, **Tendencias** (ticket promedio, unidades por pedido, pedidos, venta bruta, rentabilidad USD).
- Costos y márgenes por ítem vienen de los triggers `calc_sello_fabrication_cost` / `refresh_orden_fabrication_totals`.

## Gastos

✅ Carga mensual de costos, guardada como JSON por usuario en `economia_gastos_mensuales.months` (migrado desde `localStorage`):
- **Fijos**: sueldos (una fila por usuario, con aguinaldo calculado), monotributos, contador, alquiler, seguro, crédito, servicios (electricidad, agua, internet).
- **Extras**: publicidad, envíos, inversiones de la empresa, compra de dólares, gastos varios, automatizaciones, remodelaciones, impuestos, inversiones en Cyprea.
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

❓ Preguntas: [economia.md](../../14-open-questions/economia.md).
