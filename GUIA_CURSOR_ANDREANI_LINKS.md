# Guía Cursor: envíos Andreani con links de pago

Guía de implementación por etapas. Contexto de negocio en `PROPUESTA_AUTOMATIZACION_ANDREANI.md`.

**Resumen:** el cliente completa sus datos y paga el envío directo a Andreani mediante un link de un solo uso. Todos los links son idénticos al crearse (solo sucursal de despacho + medidas del paquete estándar), por lo que se generan **en lote** con un worker y se asignan desde un **pool** en la base.

**Fuera de alcance (por ahora):** poller que detecta si el link fue completado/pagado. No implementar.

**Regla transversal crítica:** un envío Andreani asignado **no implica pago**. Nunca pasar `estado_venta` a `Transferido` por acciones del flujo Andreani (ver Etapa 5).

---

## Etapa 1 — Base de datos: pool de links

Nueva migración `migration_envios_andreani_links.sql`:

```sql
create table envios_andreani_links (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  estado text not null default 'disponible'
    check (estado in ('disponible','asignado','descartado')),
  orden_id uuid references ordenes(id),
  creado_en timestamptz not null default now(),
  asignado_en timestamptz,
  nota text
);
create index on envios_andreani_links (estado);
create unique index envios_andreani_un_asignado
  on envios_andreani_links (orden_id) where estado = 'asignado';
```

- `disponible`: generado, sin usar. `asignado`: vinculado a una orden. `descartado`: vencido/roto, no reutilizable.
- Índice único parcial: **máximo un link asignado por orden**.
- RLS: mismas políticas de equipo que `ordenes` (ver migraciones existentes como referencia).

Dos funciones RPC (o métodos en un nuevo `src/lib/supabase/services/andreani.service.ts`):

- `asignar_link_andreani(p_orden_id)` → toma el link `disponible` más antiguo con `for update skip locked`, lo marca `asignado`, devuelve la url. Si la orden ya tiene link asignado, devuelve ese. Si no hay disponibles, devuelve null (no error).
- `liberar_link_andreani(p_orden_id, p_descartar boolean default false)` → el link asignado de la orden vuelve a `disponible` (o `descartado` si `p_descartar`, ej. link vencido).

## Etapa 2 — Worker generador de links (`services/andreani-worker`)

Clonar la estructura de `services/micorreo-worker` (server HTTP + `job-queue.ts` + Playwright + artefactos de error). Reutilizar patrones de `browser-helpers.ts`, `config.ts`, `classify-result.ts` adaptados.

Endpoints (auth por `Bearer`/`x-api-key` igual que micorreo-worker):

- `POST /generate { count }` → login a pymes.andreani.com (una sola vez: **persistir storageState de Playwright en disco** y reusar hasta expirar), genera `count` links repitiendo el flujo de creación en la misma sesión, e inserta cada url en `envios_andreani_links` como `disponible` (service role key de Supabase). Devuelve `{ generated, urls }`.
- `POST /refill { min }` → si los `disponible` son menos que `min` (default 15), genera la diferencia. Pensado para cron (systemd timer / pm2 cron, cada 6-12 h).
- `GET /health`.

CLI de prueba equivalente a `scripts/cli-upload.ts`: `cli-generate.ts --count 1` para validar el flujo antes de integrar.

Config por env (`.env`, ver `micorreo-worker/src/config.ts`): `ANDREANI_USER`, `ANDREANI_PASS`, `ANDREANI_SUCURSAL_DESPACHO`, `ANDREANI_PAQUETE_{ALTO,ANCHO,LARGO,PESO}`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_API_KEY`.

> **Antes de codear los selectores:** hacer una pasada manual grabada del flujo de creación de link en el portal (equivale a la etapa de exploración). Guardar screenshots/HTML en `fixtures/` como hace micorreo-worker. Si el login tiene 2FA/captcha, la sesión persistida es la mitigación: re-login manual esporádico y alerta en logs cuando falle.

## Etapa 3 — Asignación automática del link al crear pedido

Comportamiento esperado:

1. **Default Andreani:** ya existe en `src/components/pedidos/NewOrder/NewOrderForm.tsx` (línea ~125, `carrier: 'ANDREANI'`). Verificar que `NewOrderStepForm.tsx` y cualquier otro path de creación (pedidos web) usen el mismo default.
2. **Al crear una orden con `empresa_envio = 'Andreani'`** → llamar `asignar_link_andreani(orden_id)`. Punto de integración: el servicio de creación en `src/lib/supabase/services/orders.service.ts` (o trigger en BD tras insert, elegir uno solo — preferible en el service para poder mostrar el resultado en UI).
3. **Si el carrier cambia a otro** (en `CellEnvio.tsx` → `onEnvioChange` → update en `orders.service.ts`): llamar `liberar_link_andreani(orden_id)` → el link vuelve al pool. Si cambia **a** Andreani, asignar.
4. Si el pool está vacío al asignar: no bloquear la creación del pedido; dejar la orden sin link y mostrar aviso (toast) "Sin links Andreani disponibles — generá más". (Opcional: disparar `POST /refill` del worker.)

Mostrar en la tabla de pedidos (columna envío o tooltip en `CellEnvio`) si la orden tiene link asignado.

## Etapa 4 — Bot: enviar el link tras el mensaje de confirmación

El mensaje de confirmación es el webhook `pedido_registrado` (repo **Whatsapp Hetnez**, `index.js` — `TIPOS_PEDIDO_REGISTRADO` línea ~168 y `generarMensajePedidoRegistrado` línea ~1278). Detalle completo en `GUIA_CURSOR_ANDREANI_BOT.md` dentro de ese repo.

Del lado de esta app: quien dispara el webhook `pedido_registrado` debe incluir en el payload `link_andreani` (la url asignada en Etapa 3) cuando `empresa_envio = 'Andreani'`. Revisar el emisor del webhook (edge function `supabase/functions/webhook-bot/index.ts` o el insert que lo dispara) y sumar el campo.

## Etapa 5 — Seguimientos: selector Correo Argentino / Andreani

Hoy: `UploadTrackingDialog.tsx` parsea el PDF de etiquetas de MiCorreo (`trackingPdfParser.ts`), matchea por nombre, aplica seguimientos y genera el PDF 100×152 mm con logos (`enrichShippingLabelsPdf.ts`). Al aplicar, `src/app/pedidos/index.tsx` (líneas ~156-171) pasa items a `saleState: 'TRANSFERIDO'`.

Cambios:

1. **Selector de origen del PDF** al inicio del diálogo: `Correo Argentino` | `Andreani`.
2. **Correo Argentino:** flujo idéntico al actual, sin cambios.
3. **Andreani:** nuevo parser `src/lib/utils/andreaniTrackingPdfParser.ts` (extraer nombre de destinatario + número de seguimiento del PDF de etiquetas Andreani; obtener un PDF real de muestra para definir los regex/layout, mismo enfoque por líneas de `trackingPdfParser.ts`) y nuevo enricher `src/lib/utils/enrichAndreaniLabelsPdf.ts`: transformar la etiqueta Andreani al formato **100×152 mm para la impresora de etiquetas, con los logos (Alcohn + cliente) y la info del pedido en el rectángulo inferior**, reutilizando de `enrichShippingLabelsPdf.ts` todo lo genérico (footer, logos, composición) y cambiando solo el recorte/normalización específico del PDF fuente.
4. **No tocar estado de venta si es Andreani:** en el `onApply` de `src/app/pedidos/index.tsx`, el bloque que setea `saleState: 'TRANSFERIDO'` debe ejecutarse **solo cuando el origen es Correo Argentino**. Para Andreani se actualiza seguimiento y `estado_envio`, nada más — el pago del sello puede seguir pendiente.
5. La URL de tracking para el mensaje `pedido_enviado` del bot debe ser la de Andreani cuando corresponda (revisar `buildTipoEnvioCampos` / campos `url_seguimiento` en `supabase/functions/webhook-bot/index.ts`).

## Etapa 6 — UI: reasignar y quitar link

En la fila del pedido (dropdown de `CellEnvio` o menú de acciones de la orden):

- **Quitar link** → `liberar_link_andreani(orden_id)` (vuelve `disponible` para otro pedido).
- **Reasignar link** → `liberar_link_andreani(orden_id, p_descartar := true)` + `asignar_link_andreani(orden_id)` (el viejo se descarta por vencido/roto, se asigna uno nuevo del pool). Mostrar la nueva url con botón copiar; opcional: re-disparar el mensaje del bot con el nuevo link.
- Vista simple del pool (puede ser una card en la página Envíos): contadores por estado + botón "Generar más" que llama `POST /generate` del worker.

## Orden sugerido de implementación

1 (BD) → 3 (asignación, testeable insertando links a mano) → 4 (bot) → 6 (UI) → 2 (worker) → 5 (etiquetas Andreani, requiere PDF real de muestra).

El worker (2) puede ir al final: hasta entonces el pool se carga pegando links generados a mano en la tabla, y todo el resto del sistema ya funciona igual.

## Criterios de aceptación

- Crear pedido con Andreani → link asignado automáticamente y enviado por el bot tras la confirmación; con pool vacío, el pedido se crea igual con aviso.
- Cambiar carrier de Andreani a otro → link vuelve a `disponible`.
- Quitar/reasignar link funciona y nunca hay dos links `asignado` para la misma orden.
- Subir PDF Andreani → seguimientos asignados, etiqueta 100×152 con logos e info, y `estado_venta` **sin cambios**.
- Subir PDF Correo Argentino → comportamiento idéntico al actual (incluye pase a `Transferido`).
- Worker: `cli-generate --count 3` produce 3 links válidos en la tabla reusando una sola sesión de login.
