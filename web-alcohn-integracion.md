# Integración Web Alcohn ↔ App interna (Supabase compartido)

Este documento describe las reglas que la **web Alcohn** debe respetar para que la app interna (`Alcohn Ai Nueva`) no se rompa ni muestre datos espurios. La idea es seguir compartiendo el mismo proyecto Supabase, sin separar bases ni duplicar tablas.

Toda la propuesta original (`modelo-datos-web-supabase.md` + `001_web_alcohn_integration.sql`) sigue siendo válida. Acá se aclaran ajustes y reglas operativas que **sí o sí** debe cumplir la web.

---

## 1. Migraciones a aplicar (en este orden, en staging primero)

1. `migration_add_medio_contacto_web.sql` ✅ Ya aplicada en producción.
   - Agrega `'Web'` al CHECK de `clientes.medio_contacto`.
2. `001_web_alcohn_integration.sql` ✅ Ya aplicada en producción.


No hace falta modificar el `001` para que la app interna funcione. Las reglas que siguen son **del lado de la web**.

---

## 2. Regla principal: **Opción A** — Sellos solo al confirmar pago

**Decisión tomada:** la web crea la `ordenes` al confirmar el checkout, pero **no crea los `sellos` hasta que el pago esté confirmado**. Esto evita que pedidos no pagados aparezcan en Producción y en el tablero de Pedidos.

### Flujo

| Momento | Tablas a tocar |
|---------|----------------|
| Wizard / sube logo | `clientes` (upsert) + `mockup_solicitudes` (con `origen='web'`) |
| Confirma checkout (sin pagar todavía) | `ordenes` con `origen='Web'`, `estado_pago_web` ∈ {`pendiente`, `pago_fallido`, `esperando_comprobante`}. **NO crear `sellos` todavía.** |
| Pago Openpay OK / Transferencia validada | Insertar `sellos`, actualizar `ordenes.estado_pago_web = 'pagado'` y `ordenes.estado_orden = 'Señado'`. |
| Pago Openpay falla | UPDATE en la misma orden: `estado_pago_web = 'pago_fallido'` + `pago_error_codigo`, `pago_error_mensaje`. |
| Cliente sube comprobante | Subir a bucket `comprobantes`, setear `comprobante_path`/`comprobante_url`/`comprobante_subido_at`. La app interna lo validará y pasará a `pagado`. |

**Por qué:** los triggers de la app (`update_orden_totals`, `trigger_consume_stock_on_envio`, etc.) se disparan ante cambios en `sellos`. Si la web inserta sellos antes de pagar, se mete ruido en producción y stock.

### Si el pago nunca llega

La `ordenes` queda con `estado_pago_web` distinto de `'pagado'` y sin sellos asociados. La app interna **no la muestra** en Pedidos ni en Producción, pero queda visible en la vista `v_web_ordenes_seguimiento_pago` para hacer remarketing por WhatsApp.

---

## 3. Cómo filtra la app interna (lo que **ya hicimos** en este proyecto)

La app interna ahora oculta de Pedidos y Producción cualquier `ordenes` que cumpla:

```sql
origen = 'Web' AND (estado_pago_web IS NULL OR estado_pago_web != 'pagado')
```

Resumen:

- Pedidos histórico (`origen IS NULL`) → se muestran siempre.
- Pedidos de la app (`origen = 'App'` si llega a setearse) → se muestran siempre.
- Pedidos web pagados (`origen = 'Web'` + `estado_pago_web = 'pagado'`) → se muestran como cualquier otro pedido.
- Pedidos web no pagados → ocultos en Pedidos y Producción. Visibles vía la vista `v_web_ordenes_seguimiento_pago` o consultas directas.

Esto se aplica en JS, con guard para que siga funcionando aunque la migración `001` todavía no esté en la base.

---

## 4. Webhook `pedido_registrado` — **no disparar desde la web**

La app interna manda un webhook (`webhook-bot`, `tipo_actualizacion = 'pedido_registrado'`) cuando se da de alta un pedido manualmente. Es el aviso de confirmación al cliente por WhatsApp.

La web **no debe** disparar este webhook al confirmar checkout, porque:

- Si lo dispara antes de pagar y luego el pago falla, el cliente recibió un mensaje engañoso.
- El equipo ya manda otros mensajes en otros puntos del flujo.

**Quién lo dispara:** la app interna lo dispara automáticamente al validar el pago o al recibir el comprobante. Si querés mandar un aviso desde la web al pagar OK, hablamos para definir un `tipo_actualizacion` nuevo (p. ej. `pago_web_confirmado`) y no reutilizar `pedido_registrado`.

---

## 5. Buckets de Storage

Los nombres definitivos son los del SQL `001`:

| Bucket | Uso |
|--------|-----|
| `logos-web` | Logo original y optimizado del wizard |
| `mockups-web` | Vistas previas / mockups generados |
| `comprobantes` | Comprobantes de transferencia (`{orden_id}/{timestamp}.ext`) |

En el `modelo-datos-web-supabase.md` aparecen como `logos` / `mockups`; ignorar esa sección y usar siempre los nombres del SQL (`-web`). Los buckets de la app interna (`base`, `vector`, `foto`) **no se tocan** desde la web.

Las políticas RLS de estos buckets no están definidas en el SQL: configurarlas en el dashboard o subir todo usando `SUPABASE_SERVICE_ROLE_KEY` desde las API routes de Next.js (recomendado).

---

## 6. Tablas: notas finas

### `clientes`

- `medio_contacto = 'Web'` ✅ admitido por la base.
- `nombre`, `apellido`, `telefono` siguen siendo `NOT NULL`. Si el form solo pide nombre completo, partir antes del insert (la app usa apellido `'-'` como placeholder cuando no llega).
- `mail` tiene UNIQUE: usar `NULL` (no `''`) cuando no hay email.
- No hay UNIQUE en `telefono`. Normalizar a `+54…` antes de upsertear para no duplicar clientes.

### `mockup_solicitudes`

- `nombre_slug` es `NOT NULL`. Generar slug siempre.
- `material` ahora acepta `'cuero' | 'madera' | 'ambos' | 'ceramica' | 'alimentos' | 'otros'` (el `001` extiende el CHECK).
- `origen = 'web'` para todo lo que crea la web. La app sigue insertando con `'app'` (default).
- Campos web nuevos para usar libremente: `cliente_id`, `orden_id`, `email`, `checkout_iniciado_at`, `checkout_completado_at`, `carrito_json`, `metadata_web`, `web_session_id`.

### `ordenes`

- `origen = 'Web'` siempre que cree la web. La app interna **nunca** setea `origen='Web'`.
- `estado_pago_web`: setearlo siempre en pedidos web (no dejar NULL).
- `estado_orden` puede quedar **NULL** mientras `estado_pago_web` no sea `'pagado'`. Al pagar, setear `estado_orden = 'Señado'` (la app interna asume eso).
- `valor_total`, `senia_total`, `restante`, `cantidad_sellos` los recalcula la app a partir de los `sellos` via trigger. **No** los setees a mano desde la web.
- `web_checkout_ref` tiene índice UNIQUE parcial → único cuando no es NULL. Usalo como token opaco para retomar checkout / callbacks Openpay.

### `sellos`

- Triggers activos en INSERT/UPDATE: calculan `restante`, `tiempo`, `costo_fabricacion`, etc. La web debe pasar al menos: `orden_id`, `valor`, `item_type`, `estado_fabricacion = 'Sin Hacer'`, `estado_venta = 'Señado'`.
- `mockup_solicitud_id` (nuevo en `001`): enlazar al mockup del wizard cuando aplique.
- `largo_real` / `ancho_real` están en **cm** (no mm). La app espera cm.

---

## 7. Materiales del wizard

Antes solo había `cuero | madera | ambos`. La migración web extiende el CHECK con `ceramica | alimentos | otros`. La app interna ahora maneja esos valores también (tipos actualizados), pero solo está preparada para renderizar mockups en `cuero` y `madera`. Si la web crea mockups con materiales nuevos, el equipo los ve en el listado pero no se generan vistas previas automáticas en la app — está OK como punto de partida.

---

## 8. Vistas útiles que ya quedan creadas

| Vista | Uso |
|-------|-----|
| `v_web_mockups_sin_compra` | Muestras `completado` / `pendiente_aprobacion` sin orden → remarketing WhatsApp. |
| `v_web_ordenes_seguimiento_pago` | Pedidos web `pendiente` / `pago_fallido` / `esperando_comprobante` / `abandonado`. |

La app interna puede consultarlas para un futuro tablero web sin pelearse con el listado principal de pedidos.

---

## 9. Checklist mínimo para la web

- [ ] Cliente Supabase con `SUPABASE_SERVICE_ROLE_KEY` solo en API routes (server).
- [ ] Upsert de `clientes` por teléfono normalizado, con `medio_contacto = 'Web'`.
- [ ] `mockup_solicitudes` siempre con `origen = 'web'` y `nombre_slug`.
- [ ] `ordenes` con `origen = 'Web'` + `estado_pago_web` desde el primer insert.
- [ ] **No** insertar `sellos` hasta que el pago esté confirmado (Opción A).
- [ ] **No** disparar `webhook-bot` con `pedido_registrado` desde la web.
- [ ] Subir comprobantes a bucket `comprobantes` y reflejar `comprobante_*` en la orden.
- [ ] Subir logos / mockups a `logos-web` y `mockups-web` (no a los buckets de la app).
- [ ] Antes de salir a producción: correr el SQL `001` en staging y verificar que la app sigue listando pedidos / mockups normalmente.

---

## 10. Resumen en una frase

La web crea **cliente + mockup + orden (sin sellos)** durante el checkout y solo agrega los **sellos** al confirmar el pago; la app interna oculta automáticamente cualquier pedido web no pagado, así que el equipo solo ve ventas reales en Pedidos y Producción.
