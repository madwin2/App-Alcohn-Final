# Integraciones externas

Nunca se documentan valores de secretos: solo el **nombre** de la variable y dónde se configura.

| Integración | Para qué | Módulos | Mecanismo | Doc |
|---|---|---|---|---|
| **Bot de WhatsApp** (servidor propio) | Mensajes automáticos a clientes | Pedidos, Envíos, Mockups, Comercial | Edge `webhook-bot` → HTTP al bot; triggers/cron vía `pg_net` | [whatsapp-bot.md](whatsapp-bot.md) |
| **MiCorreo** (Correo Argentino) | Generar y pagar etiquetas | Envíos | `/api/micorreo-upload` → `micorreo-worker` (Playwright) | [micorreo.md](micorreo.md) |
| **Andreani Pymes** | Links de envío pagados por el cliente, etiquetas, tracking | Envíos | `/api/andreani-*` → `andreani-worker` (Playwright) | [andreani.md](andreani.md) |
| **Vectric Aspire** | CAD/CAM de la CNC | Programas | Gadgets Lua ↔ edge `programa-sync`; archivos `.crv3d` | [aspire.md](aspire.md) |
| **Vectorizer.AI** | Bitmap → SVG | Vectorización | `/api/vectorize`, `/api/vectorizer-account` | [vectorizer-ai.md](vectorizer-ai.md) |
| **OpenAI** | Optimizar/simplificar logos, sugerir nombres, parsear datos de envío, asistente del Centro | Mockups, Envíos, Centro Alcohn, (vector-worker) | `/api/optimize-logo`, `/api/simplify-logo`, `/api/suggest-mockup-name`, `/api/parse-shipping`, `/api/knowledge` | [openai.md](openai.md) |
| **Meta** | Conversions API (Purchase) y conexión WhatsApp Business | Pedidos/Web, WhatsApp | Edge `meta-conversion`; SDK FB en `/whatsapp` | [meta.md](meta.md) |
| **Tienda web** (otro repo) | Venta online, generador de muestras, analítica | Comercial, Pedidos | Comparte la base Supabase | [tienda-web.md](tienda-web.md) |
| **vector-worker** (propio) | Vectorización automática (apagada) | Pedidos | `/api/vectorize-enqueue` → worker Python; `vector_jobs` | [vector-worker.md](vector-worker.md) |
| **CloudConvert** | Preview PNG de archivos EPS | Pedidos, Producción | Llamada **desde el navegador** con `VITE_CLOUDCONVERT_API_KEY` | [cloudconvert.md](cloudconvert.md) |
| **Openpay** | Pago con tarjeta en la web | Tienda web | 🔶 Solo en la tienda (Alcohn AI ve `openpay_order_id`, `metodo_pago='Openpay'`) | [tienda-web.md](tienda-web.md) |
| **Supabase** | Base, auth, storage, realtime, edge functions, cron | Todo | SDK `@supabase/supabase-js` | [12-architecture](../12-architecture/README.md) |

## Infraestructura externa inferida

🔶 Un VPS (según los READMEs, Hetzner) corre con PM2 el **bot de WhatsApp**, el **micorreo-worker** y (probablemente) el **andreani-worker** y el **vector-worker**, detrás de nginx (`webhook.alcohncnc.com/...`, ver `services/*/scripts/patch-nginx-webhook.py`). ❓ Inventario y responsable de ese servidor → [Q-ARQ-001](../14-open-questions/arquitectura.md#q-arq-001).
