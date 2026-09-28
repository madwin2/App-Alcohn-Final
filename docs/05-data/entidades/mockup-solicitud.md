# Mockup / solicitud de muestra (`mockup_solicitudes`)

**Qué representa**: un pedido de "muestra visual" de un logo como sello, hecho en la app (Ventas) o en el generador de la tienda web. 8.876 filas.

| Grupo | Campos |
|---|---|
| Identidad | `id`, `nombre_muestra`, `nombre_slug`, `origen` (`app`/`web`), `creado_por`, `cliente_id`, `orden_id`, `whatsapp`, `email`, `web_session_id` |
| Proceso | `estado` (`procesando`, `pendiente_aprobacion`, `completado`, `error`), `mensaje_error`, `omitir_analisis`, `intentos_optimizacion`, `preparado_con_simplificar_ia`, `validacion` (JSON) |
| Archivos | `archivo_base_url/path`, `imagen_optimizada_url/path`, `mockup_cuero_url/path`, `mockup_madera_url/path` (bucket `foto` en app; `mockups-web`/`logos-web` en web) |
| Material | `material` (`cuero`, `madera`, `ambos`, `ceramica`, `alimentos`, `otros`) |
| Medición y precio | `logo_trazo_ancho_px/alto_px/ratio_w_h/ratio_label/bbox_fallback`, `medidas_cotizacion_json` |
| Web / comercial | `checkout_iniciado_at`, `checkout_completado_at`, `carrito_json`, `metadata_web` (incluye `contacto_comercial_eligible_at`, `_enviado_at`, `_omitido_at`, `_omitido_motivo`, `_tipo`) |

**Triggers**: `trg_schedule_contacto_comercial_mockup` (programa el contacto a los 10 min para web), `updated_at`.
**Relaciones**: `sellos.mockup_solicitud_id`, `ordenes.mockup_solicitud_id`.
