# Propuesta: automatización de envíos con Andreani (links de pago)

Documento de diseño para implementar por etapas. Complementa `PROPUESTA_PAGINA_ENVIOS_CORREO.md` y reutiliza la arquitectura de `services/micorreo-worker`.

---

## 1. Objetivo

Reemplazar (gradualmente) el flujo de Correo Argentino por links de envío de Andreani, donde **el cliente completa sus datos y paga el envío directo a Andreani**. Beneficios:

- El costo de envío deja de pasar por nuestra facturación.
- Se elimina el paso de pedir datos de envío, parsearlos y cargarlos: el cliente los completa solo en el link.
- Se elimina el pago manual/automático del envío en MiCorreo.

## 2. Decisiones ya tomadas

| Tema | Decisión |
|---|---|
| Generación de links | Worker automático con Playwright (mismo patrón que `micorreo-worker`). |
| Contenido del link | Al crearlo solo se elige sucursal de despacho + medidas del paquete. Todos los links son idénticos entre sí; **un solo uso**. Como el sello viaja siempre en el paquete estándar, los links son intercambiables → se pueden generar en lote. |
| Convivencia | Andreani pasa a ser el default; Correo Argentino queda solo si el cliente lo pide. El flujo MiCorreo no se toca. |
| Momento del link | **A definir** (ver §3). |

## 3. Momento de envío del link (decisión pendiente)

**Opción A — Al confirmar la compra (junto con la seña):** el cliente paga seña + completa y paga el envío al inicio. Mayor compromiso (sunk cost), menos sellos clavados, y cuando el sello está listo se despacha el mismo día porque la etiqueta ya existe.

**Opción B — Con la foto del sello listo:** mismo momento que hoy. Menos riesgo si el pedido se cae, pero mantiene el tiempo muerto del final (esperar que el cliente complete el link antes de despachar).

**Recomendación: Opción A, con dos verificaciones previas en Andreani:**

1. **Vencimiento:** ¿cuánto tiempo tiene validez un envío pagado sin despachar (imposición)? Si el plazo cubre el tiempo de fabricación + margen, A es viable. Si es corto (ej. 7 días), usar B o un punto intermedio (link al pagar el restante).
2. **Cancelación/reembolso:** qué pasa si el cliente pagó el envío y el pedido se cancela. Si el reembolso es engorroso, es un costo de la opción A a asumir (debería ser poco frecuente justamente por el mayor compromiso).

Si A no pasa las verificaciones, B funciona igual y la arquitectura no cambia — solo cambia el trigger.

## 4. Arquitectura

### 4.1 `services/andreani-worker`

Servicio HTTP + job queue, clonando la estructura de `micorreo-worker`:

- `POST /generate-links { count }` → se loguea a pymes.andreani.com **una sola vez por sesión** (cookies/contexto persistido en disco, re-login solo al expirar) y genera N links en esa misma sesión. Devuelve los links.
- `POST /refill` → mantiene un **pool mínimo** (ej. 15 links disponibles). Como todos los links son iguales, no hace falta generar uno por pedido en el momento: el worker repone el pool en lote (cron cada X horas o al bajar del umbral). Esto minimiza logins y hace que **asignar un link a una orden sea instantáneo** (solo un SELECT del pool).
- `GET /status` → detecta links completados/pagados por el cliente en "mis envíos" del portal: captura número de envío/tracking y estado. Corre como poller (cron cada 30-60 min).

> El pool pre-generado no es una alternativa al worker: es la **estrategia del worker**. Generación en lote automática + asignación instantánea, sin tener que entrar link por link.

### 4.2 Modelo de datos

```sql
create table envios_andreani (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  estado text not null default 'disponible',
    -- disponible | asignado | enviado_cliente | completado | despachado | vencido
  orden_id uuid references ordenes(id),
  numero_andreani text,
  url_seguimiento text,
  creado_en timestamptz default now(),
  asignado_en timestamptz,
  completado_en timestamptz
);
```

En `ordenes`: `empresa_envio = 'Andreani'` ya existente como valor; el estado de envío se deriva de `envios_andreani.estado`.

### 4.3 Flujo completo (opción A)

1. Cliente confirma compra y paga seña → orden creada con `empresa_envio = 'Andreani'`.
2. Sistema toma un link `disponible` del pool → `asignado` → webhook al bot.
3. Bot manda mensaje: confirmación + datos de seña + "Completá acá los datos y el pago del envío: {link}".
4. Poller detecta el link como pagado → `completado`, guarda tracking → actualiza orden.
5. Si a las 48-72 h el link sigue sin completar → recordatorio automático por el bot.
6. Sello listo (`estado_venta = 'Foto'`) → mensaje de foto pide solo el restante del sello (sin opciones de envío: ya está resuelto).
7. Restante pagado → imprimir etiqueta desde el portal y despachar → `despachado`, mensaje `pedido_enviado` con tracking.

Con opción B, los pasos 2-3 se disparan con la foto en lugar de la confirmación.

### 4.4 Cambios en el bot (Whatsapp Hetnez)

- `messages.json`: nueva sección con las líneas del link de envío + recordatorio; simplificar `lineas_restante_sin_envio` de `pedido_listo` (ya no se ofrecen opciones de Correo cuando la orden es Andreani).
- Nuevo tipo de webhook (o campo en el payload existente) con `link_andreani`.

### 4.5 Cambios en la app

- Página Envíos: pestaña/filtro Andreani con estado del link por orden (asignado / completado / despachado), botón para reasignar link y vista del pool disponible.
- El parser de datos pegados (`parse-shipping`) deja de ser necesario para órdenes Andreani.

## 5. Etapas de implementación

1. **Exploración del portal (medio día):** sesión logueada en pymes.andreani.com para mapear el flujo de creación de link, selectores, y responder las dos verificaciones de §3. Grabar el paso a paso.
2. **Worker mínimo:** login + generación de 1 link por CLI (equivalente a `cli-upload.ts`).
3. **Pool + tabla + asignación:** generación en lote, `refill`, asignación a órdenes.
4. **Integración bot:** mensaje con link + recordatorio.
5. **Poller de estados:** detección de completados, tracking, mensaje de despacho.
6. **UI en página Envíos.**

Piloto: correr etapas 2-4 con 5-10 pedidos reales antes de hacer default a Andreani.

## 6. Riesgos

- **Fragilidad del scraping:** cambios en el portal rompen el worker (mismo riesgo ya asumido con MiCorreo). Mitigación: artefactos de error (screenshots/HTML) como en `micorreo-worker`, y alerta cuando el pool baja del mínimo sin poder reponerse.
- **2FA/captcha en el login de Andreani:** verificar en etapa 1; si existe, persistir sesión de larga duración y avisar cuando requiera re-login manual.
- **Vencimiento de links no usados del pool:** verificar si los links sin completar expiran; ajustar tamaño del pool a consumo semanal.
- **Cliente carga mal sus datos:** ahora el error es del cliente y la corrección es con Andreani. Documentar el procedimiento de cambio de destino.
