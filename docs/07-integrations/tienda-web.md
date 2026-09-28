# Tienda web (integración por base compartida)

Ver [02-modules/tienda-web](../02-modules/tienda-web/README.md) para el detalle funcional.

| | |
|---|---|
| Sistema | Tienda e-commerce de Alcohn, 🔶 Next.js en otro repositorio, dominio `alcohncnc.com`. |
| Mecanismo | Misma base Supabase. La web escribe con service role desde sus API routes (🔶 según `modelo-datos-web-supabase.md`). Lee `correo_sucursales` y precios. |
| Contrato | `web-alcohn-integracion.md` (reglas que la web debe respetar), `modelo-datos-web-supabase.md`, `001_web_alcohn_integration.sql`, `envios-ecommerce-web.md`, `cotizador-sellos-web.md`, `que-guardamos-en-supabase.md`. |
| Lo que Alcohn AI espera | Órdenes web con `origen='Web'` y `estado_pago_web`; no crear sellos hasta pagar ("Opción A", según comentario en `production.service.ts`); `carrito_json` con precios; mockups `origen='web'`. |
| Riesgo | Cambios de esquema en Alcohn AI pueden romper la web y viceversa; no hay contrato versionado ni tests entre ambos. |
