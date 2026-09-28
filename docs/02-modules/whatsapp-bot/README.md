# WhatsApp Bot (pantalla)

> Ruta: `/whatsapp` · Página: `src/app/whatsapp/index.tsx` · Hook: `src/lib/hooks/useWhatsAppEmbeddedSignup.ts` · SDK: `src/lib/whatsapp/*`
> El **bot** que envía los mensajes a clientes es otro sistema: ver [07-integrations/whatsapp-bot.md](../../07-integrations/whatsapp-bot.md).

## Propósito

✅ Conectar la cuenta de **WhatsApp Business de Alcohn** con Meta mediante **Embedded Signup** (SDK de Facebook; variables `VITE_META_APP_ID`, `VITE_META_WHATSAPP_CONFIG_ID`, `VITE_META_GRAPH_API_VERSION`), usando "Coexistence" con la app WhatsApp Business (commit 2026-09-17).

## Estado actual

- ✅ Muestra el estado de conexión (SDK cargando, no conectado, abriendo Meta, autorización recibida, cancelado, error) y los IDs de sesión (WABA, número, negocio).
- ✅ El **código de autorización se guarda solo en memoria** del navegador: no se envía a ningún backend ni a la base.
- ✅ Changelog #6: "Todavía falta vincularla con el servidor del bot".
- ✅ Existe una cuenta de revisión de Meta (`FBTEST`) que solo puede ver esta pantalla.

✅ Confirmado: la cuenta **está vinculada y funcionando** (aunque la app de Meta la muestre como no vinculada). El bot en Hetzner envía con plantillas de Meta (Q-WA-001, Q-WA-002).
