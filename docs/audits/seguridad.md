# Auditoría — Seguridad

> Hallazgos observados al documentar (2026-09-27). **No se modificó nada.** Se recomienda revisarlos con prioridad; varios exponen datos personales de clientes.

<a id="aud-sec-001"></a>

### AUD-SEC-001 · Tablas núcleo accesibles con la anon key 🔴
- **Evidencia (verificada en la DB)**: RLS **desactivado** en `ordenes`, `sellos`, `clientes`, `direcciones`, `programa`, `solicitudes_registro`, `webhook_logs`, `web_analytics_events`, `vector_jobs`, `vistas_tabla`, `fotos_pendientes`, `costos_de_envio`, `fabricacion_parametros`, `catalogo_items`, `comercial_cliente_seguimientos`; el rol `anon` tiene `SELECT/INSERT/UPDATE/DELETE` sobre ellas.
- **Por qué importa**: la anon key es pública (está en el bundle del frontend y en funciones SQL). Cualquiera con ella puede leer nombres, teléfonos, emails y direcciones de clientes, modificar o borrar pedidos, y **aprobar su propia cuenta** editando `solicitudes_registro`.
- **Nota**: las políticas "Permitir todo para usuarios autenticados" existentes no tienen efecto con RLS desactivado.

<a id="aud-sec-002"></a>

### AUD-SEC-002 · Aprobación de usuarios solo del lado del cliente
`useAuth.signIn` cierra la sesión de usuarios no aprobados, pero sus credenciales siguen siendo válidas contra la API; las políticas usan `authenticated` sin chequear aprobación.

<a id="aud-sec-003"></a>

### AUD-SEC-003 · Buckets con escritura pública
`base`, `foto`, `vector`: política `ALL` para `public`; `programas-aspire`, `programas-preview`: INSERT/UPDATE para `anon`.

<a id="aud-sec-004"></a>

### AUD-SEC-004 · Funciones `/api` sin autenticación
`/api/vectorize`, `/api/optimize-logo`, `/api/simplify-logo`, `/api/suggest-mockup-name`, `/api/parse-shipping`, `/api/micorreo-upload`, `/api/andreani-*`, `/api/vectorize-enqueue` no verifican sesión: consumen créditos pagos y pueden crear envíos/links reales.

<a id="aud-sec-005"></a>

### AUD-SEC-005 · API key de CloudConvert en el bundle
`VITE_CLOUDCONVERT_API_KEY` (si está configurada) queda embebida en el JavaScript público.

<a id="aud-sec-006"></a>

### AUD-SEC-006 · Secretos y endpoints en código SQL
Anon key y URLs en `enviar_webhook_pedido`, `enviar_confirmacion_web_order`, `enviar_meta_conversion`; IP y puerto del bot por HTTP sin TLS en `reintentar_webhooks_fallidos` (y como default en la edge `webhook-bot`).

<a id="aud-sec-007"></a>

### AUD-SEC-007 · Edge functions con `verify_jwt=false`
Las cuatro. `webhook-bot` acepta cualquier POST y reenvía al bot (con el token del bot) → cualquiera podría disparar WhatsApp a números arbitrarios. `confirm-web-order`/`meta-conversion` son idempotentes pero públicas.

<a id="aud-sec-008"></a>

### AUD-SEC-008 · Clave de instalación única para gadgets
Una sola `PROGRAMA_SYNC_KEY` para todas las PCs; con ella se obtienen los tokens de todos los programas abiertos.

<a id="aud-sec-009"></a>

### AUD-SEC-009 · Datos personales fuera de la base
CSV/PDF con datos de clientes en la raíz del repo (no versionados) y `webhook_logs`/`web_analytics_events` sin RLS con teléfonos e IPs.

<a id="aud-sec-010"></a>

### AUD-SEC-010 · Restricciones de pantalla solo visuales
Economía/Gastos solo se ocultan del menú; la ruta es accesible para cualquier usuario autenticado (los datos de cajas sí están protegidos por RLS por usuario).
