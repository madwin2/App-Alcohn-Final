# Edge Functions (Supabase, desplegadas)

| Función | Versión | `verify_jwt` | Llamada por | Qué hace | Doc |
|---|---|---|---|---|---|
| `webhook-bot` | 28 | false | SQL (`pg_net`), app, `confirm-web-order` | Enriquece y reenvía al bot de WhatsApp; `pedido_enviado` OK → `Seguimiento Enviado`; asigna link Andreani | [whatsapp-bot](../07-integrations/whatsapp-bot.md) |
| `confirm-web-order` | 4 | false | Triggers de `ordenes`/`sellos` | Normaliza sellos de pedidos web pagados, `Señado`, link Andreani, WhatsApp `pedido_registrado` | [tienda-web](../02-modules/tienda-web/README.md) |
| `meta-conversion` | 11 | false | Triggers de `ordenes` | Purchase a Meta CAPI | [meta](../07-integrations/meta.md) |
| `programa-sync` | 22 | false | Gadgets de Aspire | Listar/paquete/reporte/subida de `.crv3d` | [gadget-aspire](../02-modules/programas/gadget-aspire.md) |

El código fuente está en `supabase/functions/<nombre>/index.ts`. ⚠️ No hay pipeline de despliegue en el repo: los archivos `_deploy_*`, `_mcp_*`, `_b64_*`, `_chunk_*` en la raíz son restos de despliegues manuales (vía MCP) de `programa-sync`. Ver [11-operations-sops/despliegue.md](../11-operations-sops/despliegue.md).
