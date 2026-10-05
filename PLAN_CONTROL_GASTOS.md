# Plan — Control de gastos y publicidad (Etapa 1)

> Estado: **Etapa 1 implementada en código, sin aplicar en producción** (2026-10-05) · Rama base: `main` · Dueño del pedido: Julián (dueño de Alcohn)
> Etapa 2 (atribución por campaña) al final, solo como referencia.

## 1. Problema

- La ganancia real del mes se conoce recién cuando llegan los resúmenes de tarjeta (5 al 10 del mes siguiente).
- La publicidad se carga en Gastos como **un número por mes** sacado de la tarjeta; los impuestos de los gastos en USD se cargan aparte en `impuestos`.
- Se pagan con **varias tarjetas** (del dueño y de familiares, rotan por bloqueos) con **gastos mezclados** y **cierres variables** (26, 30, 2…) → conciliar contra el resumen no es viable.
- No se sabe cuánto rinde cada plataforma (Meta ~2.500 USD/mes, Google ~800 USD/mes en septiembre 2026, aprox.).

Números de referencia (cálculo aproximado con el criterio de Economía → Mensual: fijos + aguinaldo/12 + fabricación + extras + publicidad):

| Mes 2026 | Ventas | Publicidad (tarjeta) | Rentabilidad aprox. |
|---|---|---|---|
| Julio | $22,4 M | $3,2 M | ~22 % |
| Agosto | $19,9 M | $3,35 M | ~4 % |
| Septiembre | $19,6 M | $5,22 M | ~0 % |

**Objetivo del dueño: 25 % de rentabilidad mensual.**

## 2. Principio de diseño

1. **Cada gasto se registra el día que ocurre (devengado), no cuando llega la tarjeta.** La ganancia de un mes es del 1 al último día según la fecha del gasto. La fecha de cierre de la tarjeta deja de importar.
2. **La fuente de verdad del gasto es la plataforma** (Meta, Google, OpenAI), no el resumen. No hay conciliación con tarjetas.
3. **Los gastos en USD se guardan en USD; el valor en pesos es el del día en que se pagan** (decisión del dueño 2026-10-05: no se compran dólares con cada gasto; si se gastó con el blue a 1.500 y se pagó con el blue a 2.000, el costo real es 2.000).
   - **Mes no pagado** → se valúa con el **blue venta de hoy** (la mejor estimación de lo que va a costar pagarlo). El número se mueve con el dólar y la UI lo marca "estimado".
   - **Mes pagado** → el dueño marca el pago de los USD de ese mes (fecha; cotización = blue venta de esa fecha, editable si pagó a otro valor; se admiten pagos parciales). Desde ahí el mes queda **fijo** con esa cotización (promedio ponderado si hubo varios pagos; el saldo no pagado sigue a blue de hoy).
   - El gasto sigue perteneciendo al **mes en que ocurrió** (la publicidad de septiembre resta en septiembre), solo su valor en pesos depende del pago.
   - En su categoría va **gasto + IVA**: `usd × cotización × (1 + iva_pct)`; `iva_pct` = 21 %.
   - Otros recargos (IIBB servicios digitales, sellos, etc.) → automático en `impuestos`: `usd × cotización × otros_impuestos_usd_pct`, por defecto **2 %** (total ≈ 23 %, estimación acordada; ajustable).
   - Desde `mes_corte` ya no se cargan a mano publicidad ni los impuestos de los gastos en USD.
4. **Automático por defecto.** El dueño no carga gastos variables a mano; solo da de alta los recurrentes una vez.

## 3. Modelo de datos (migración nueva)

### `gastos_registros`
Un gasto devengado (un día × una campaña, o un cargo puntual).

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `fecha` | date | día del gasto (zona AR) |
| `proveedor` | text | `meta_ads` · `google_ads` · `openai` · `recurrente` · `manual` |
| `categoria` | text | clave de `ExtrasMonth` (`publicidad`, `automatizaciones`, `impuestos`, …) |
| `concepto` | text | nombre de campaña / proyecto / suscripción |
| `external_ref` | text | id de campaña / proyecto (nullable) |
| `moneda` | text | `USD` · `ARS` |
| `monto_original` | numeric | sin impuestos, en la moneda original |
| `iva_aplica` | bool | true por defecto en USD |
| `fuente` | text | `api` · `recurrente` · `manual` |
| `raw` | jsonb | respuesta original (auditoría) |
| `synced_at` | timestamptz | |

`unique (proveedor, fecha, coalesce(external_ref,''), concepto)` → los sync hacen **upsert** e idempotentes (Meta/Google ajustan los últimos días; se re-sincronizan 7 días hacia atrás).

### `gastos_recurrentes`
Suscripciones y servicios que se repiten (apps, Hetzner, etc.).
`id, nombre, categoria, moneda, monto, iva_aplica bool, dia_del_mes int, activo bool, desde date, hasta date null`.
Un job diario genera el `gastos_registros` del mes el día que corresponde (`proveedor='recurrente'`, idempotente por la unique).

El valor en pesos **no se guarda** en el registro: se calcula al leer (vista / función `gastos_mes_valuados(mes)`) con la cotización que corresponda (pago del mes o blue de hoy) + IVA + otros impuestos. Así un pago marcado después revalúa todo el mes sin reescribir registros.

### `gastos_pagos_usd`
Pagos de los dólares de un mes. `id, mes text ('YYYY-MM'), fecha date, usd numeric null (null = todo lo pendiente del mes), cotizacion numeric, nota text, created_at`.
Pantalla: en Gastos, por mes: "USD del mes: 3.300 · pagado 0 · **estimado a blue de hoy $X**" → botón **Marcar pago** (fecha → trae blue de esa fecha, editable).
Alerta suave si pasaron >45 días del fin de un mes con USD sin pago marcado.

### `cotizaciones_usd`
`fecha date pk, blue_venta numeric, oficial_venta numeric, fuente text`. Se llena a diario desde `https://dolarapi.com/v1/dolares/blue` (y `/oficial` solo como referencia). Si falta el día (fin de semana, caída del servicio), se usa la última anterior.

### `control_gastos_config` (una fila)
`objetivo_rentabilidad` (0.25), `iva_pct` (0.21), `otros_impuestos_usd_pct` (0.02), `mes_corte` (`'2026-10'`: desde ese mes Economía usa registros automáticos para publicidad/automatizaciones), `alertas_activas` bool.

**RLS**: lectura/escritura solo para la cuenta dueña (mismo criterio que `precios_catalog_owner_user_id()` / email del dueño). Las edge functions escriben con service role.

## 4. Ingesta automática

Todas las edge functions: re-sync de los **últimos 7 días**, upsert, log de errores en una tabla `gastos_sync_log (proveedor, ok, detalle, created_at)`.

| Fuente | Cómo | Secretos (los carga el dueño) |
|---|---|---|
| **Meta Ads** | Edge `sync-gastos-meta`: Graph API `GET /act_{id}/insights?level=campaign&time_increment=1&fields=campaign_id,campaign_name,spend&time_range=…`. La cuenta factura en USD. | `META_ADS_ACCOUNT_ID`, `META_ADS_TOKEN` (usuario del sistema del Business Manager con permiso `ads_read`) |
| **Google Ads** | **Script de Google Ads** (corre dentro de la cuenta, sin developer token): GAQL `segments.date, campaign.id, campaign.name, metrics.cost_micros` últimos 7 días → `POST` a edge `ingest-gastos-google` con header secreto. El script vive en `scripts/google-ads/enviar-gastos.js` y el dueño lo pega en Herramientas → Scripts, programado diario. | `GOOGLE_ADS_INGEST_SECRET` |
| **OpenAI** | Edge `sync-gastos-openai`: `GET /v1/organization/costs?bucket_width=1d&group_by=project_id`. Cada proyecto → `concepto` (mapa `project_id → nombre` en config). Categoría `automatizaciones`. **Requisito**: el dueño separa OpenAI en un proyecto por uso, cada uno con su API key (ver §8). | `OPENAI_ADMIN_KEY` (clave **admin**, no la de uso) |
| **Cotización** | Edge `sync-cotizacion-usd` (o dentro del cron) → `cotizaciones_usd`. | — |
| **Recurrentes** | Función SQL `generar_gastos_recurrentes(fecha)`. | — |

Cron (`pg_cron` → `pg_net`, mismo patrón que `meta-conversion`): **07:00 AR** cotización → recurrentes → Meta → OpenAI. Google llega solo desde su script (programarlo ~06:00 AR).

> WhatsApp (costo de conversaciones de Meta) queda **fuera de Etapa 1**: confirmar primero si figura en la facturación de la cuenta publicitaria o en otra. Mientras, puede ir como recurrente estimado.

## 5. Economía y Gastos

### 5.1 Gastos (`/gastos`)
- Para meses `>= mes_corte`: `publicidad`, `automatizaciones` e `impuestos` (USD) se muestran **calculados** (`gastos_mes_valuados`, por categoría del mes calendario), con etiqueta **estimado / pagado**, en solo lectura, con desglose por proveedor/campaña al expandir. El extra manual se mantiene para lo que no venga por API (`gastos_varios`, etc.).
- Nueva sección **"Recurrentes"**: alta/baja/edición de `gastos_recurrentes`.
- Meses anteriores a `mes_corte` no cambian (siguen siendo el número de tarjeta; no son comparables 1 a 1 y la UI lo aclara con un aviso).

### 5.1.b Transición (octubre 2026)
- La hoja actual (Gastos/Economía y sus pestañas) **se mantiene**; no se borra ni recalcula nada histórico.
- Hasta septiembre 2026: publicidad = monto de tarjeta cargado a mano (como hoy).
- Desde octubre 2026: automático. **No cargar a mano** la publicidad de los resúmenes que lleguen en noviembre en adelante (duplicaría).
- Hueco de borde: lo gastado entre el **cierre** de las tarjetas que se cargaron en septiembre y el 30/09 no está en septiembre ni en octubre. El sync puede importar esos días y sumarlos a septiembre como registros automáticos (además del manual). Requiere que el dueño indique la fecha de cierre aproximada (ver §8).

### 5.2 Economía → nueva pestaña **"Mes en curso"** (o bloque arriba de todo)
Criterio de ventas/costos **idéntico** a Economía → Mensual (reusar la misma función; extraer de `src/app/economia/index.tsx` a `src/lib/economia/` si hace falta, con tests).

- **A hoy**: ventas, fabricación, publicidad (Meta / Google con IVA), automatizaciones, fijos prorrateados (`fijos × días transcurridos / días del mes`), envíos, regalos/pruebas → **ganancia a hoy** y **% rentabilidad**.
- **Proyección a fin de mes**: ritmo lineal de ventas y gasto variable diario × días del mes; fijos completos. Si el mes todavía no tiene fijos cargados, usar los del mes anterior marcados "estimado".
- **Presupuesto de publicidad para llegar al objetivo**:
  `tope_pub = ventas_proy × (1 − objetivo) − fab_proy − fijos − otros_proy`
  `restante = tope_pub − publicidad_a_hoy` · `por_dia = restante / días_restantes`
  Mostrar `por_dia` vs gasto diario promedio de los últimos 7 días (Meta + Google). Este número es el que el dueño compara con los presupuestos diarios de sus campañas.
- **Tabla por campaña**: gasto del mes y últimos 7 días (sin resultados todavía: eso es Etapa 2).
- Estado del último sync de cada proveedor (si falla, se ve).

### 5.3 Alertas
Job diario (después del sync) que emite una notificación al dueño (sistema de notificaciones existente) cuando:
- la rentabilidad proyectada < objetivo, o
- el gasto diario de publicidad de los últimos 7 días > `por_dia`, o
- un sync falló 2 días seguidos.
Una alerta por tipo por día como máximo.

## 6. Orden de implementación

1. Migración (tablas, RLS, unique, config inicial, `mes_corte = '2026-10'`).
2. Cotización, recurrentes, `gastos_pagos_usd` y `gastos_mes_valuados` (SQL + cron). Tests de valuación: mes sin pago (blue hoy), pago total, pagos parciales.
3. `sync-gastos-meta` + cron. Verificar contra el Administrador de anuncios (gasto del mes ±1 %).
4. `ingest-gastos-google` + `scripts/google-ads/enviar-gastos.js` + instructivo para pegarlo.
5. `sync-gastos-openai` + cron.
6. Gastos: valores calculados para meses ≥ corte + sección Recurrentes.
7. Economía: "Mes en curso" (lógica en `src/lib/economia/` con tests).
8. Alertas.
9. Docs: `docs/02-modules/economia-gastos`, `docs/07-integrations` (meta, google-ads, openai), `docs/08-automations/cron.md`, manual cap. 13, changelog.

## 7. Criterios de aceptación

- Sin cargar nada a mano, el 5 de un mes se ve la publicidad de Meta y Google del mes anterior **con IVA**, por campaña, y coincide (±1 %) con lo que muestran las plataformas (en USD); en pesos se valúa a blue de hoy hasta marcar el pago y queda fijo con la cotización del pago.
- Cualquier día del mes se ven ganancia a hoy, proyección y presupuesto diario restante para el 25 %.
- Re-ejecutar cualquier sync no duplica gastos.
- Meses anteriores a octubre 2026 no cambian sus números.

## 8. Preguntas abiertas (no inventar: confirmar con el dueño)

- ~~Cotización~~ → **blue venta del día del pago**; mientras no se paga, blue de hoy (decidido 2026-10-05).
- ~~Hueco de transición~~ → el resumen de septiembre cerró **el 28/09**: los días 29 y 30/09 se importan automáticos a septiembre (decidido 2026-10-05).
- ~~Otros impuestos~~ → IVA 21 % en la categoría + **2 %** automático en `impuestos` (decidido 2026-10-05, estimación). Pendiente opcional: calibrar el 2 % comparando un mes completo de registros vs lo pagado; consultar al contador si algún recargo es recuperable.
- **Lista de recurrentes** (apps, Hetzner, etc.) con monto y moneda: la carga el dueño en la pantalla nueva.
- **Proyectos de OpenAI**: hoy probablemente comparten clave. El dueño va a crear un proyecto por uso (p. ej. Web – imágenes, Bot Francisco, App – Centro Alcohn/mockups) con su key, reemplazarla en cada sistema y recién después revocar la vieja. Hasta entonces el gasto de OpenAI llega como un solo concepto.
- WhatsApp (conversaciones de Meta): ¿dónde se factura?

## 9. Etapa 2 (referencia, no implementar todavía)

- Capturar origen del pedido: UTM / `fbclid` / `gclid` en la tienda web; `referral` (anuncio de click a WhatsApp, `ctwa_clid`) en el bot de Hetzner → guardar en la orden/cliente.
- Reporte por campaña: gasto → consultas → pedidos → ventas → margen → costo por pedido.
- Corregir el valor enviado a Meta CAPI (~16 % menor, ver `docs/07-integrations/meta.md`).
- Conversiones offline a Google Ads (ventas cerradas por WhatsApp).
