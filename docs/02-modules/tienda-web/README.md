# Integración con la tienda web

> La tienda web **no está en este repositorio** (🔶 Next.js, según `modelo-datos-web-supabase.md`). Comparte el **mismo proyecto Supabase**.
> Documentos de acuerdo entre sistemas (raíz): `modelo-datos-web-supabase.md`, `web-alcohn-integracion.md`, `que-guardamos-en-supabase.md`, `envios-ecommerce-web.md`, `cotizador-sellos-web.md`, `001_web_alcohn_integration.sql`.
> Workflow: [WF-02](../../03-workflows/WF-02-pedido-web.md) · Integración: [07-integrations/tienda-web.md](../../07-integrations/tienda-web.md)

## Qué escribe la web en la base (✅ columnas/tablas existentes)

| Dato | Dónde |
|---|---|
| Cliente web | `clientes` con `medio_contacto='Web'` |
| Generador de muestras | `mockup_solicitudes` `origen='web'` (+ `carrito_json`, `checkout_*_at`, `metadata_web`, `web_session_id`, buckets privados `mockups-web`/`logos-web`) |
| Pedido web | `ordenes.origen='Web'`, `metodo_pago` (`Openpay`, `Transferencia`, `Internacional`), `estado_pago_web` (`pendiente`, `pago_fallido`, `esperando_comprobante`, `pagado`, `abandonado`), `web_checkout_ref`, `openpay_order_id`, `pago_*`, `comprobante_*` (bucket `comprobantes`), `notas_web`, `carrito_json` |
| Datos de envío | `direcciones` validadas contra `correo_sucursales` |
| Analítica | `web_analytics_events` |

## Qué hace Alcohn AI con eso (✅)

1. **Oculta** órdenes web no pagadas de Pedidos, Producción y Envíos (BR-WEB-001).
2. Cuando `estado_pago_web` pasa a `'pagado'` (por la web —Openpay— o por el equipo en Comercial Web), triggers llaman a la edge `confirm-web-order`:
   - idempotente por `web_pedido_confirm_log`;
   - arma los **sellos** desde el carrito (uno por unidad; precio transferencia o link; seña repartida entre ítems; medidas desde `variantSize` o el mockup; tipo `Clasico`, `Sin Hacer`, `Señado`; base = imagen optimizada del mockup) y **reemplaza** los existentes si no coinciden;
   - pone `estado_orden='Señado'` y `pago_confirmado_at`;
   - si la empresa es Andreani, asigna link del pool;
   - manda WhatsApp `pedido_registrado`.
3. Trigger impide "des-pagar" una orden web (`trg_preserve_web_pago_confirmado`).
4. Evento **Purchase** a Meta Conversions API (edge `meta-conversion`).
5. Comercial Web muestra el embudo, potenciales y pagos pendientes.

## Reglas de precio web (✅ en `confirm-web-order` y `webCart.ts`)

- Precio **link** (tarjeta/Openpay) = transferencia × **1,15** (redondeado). Pagando por transferencia se usa el precio de transferencia.
- Seña: primer monto encontrado en `notas_web` (`senia_monto`, `monto_senia`, …); si el método no es transferencia, el total cobrado; si no, **$20.000** por defecto.

❓ Preguntas: [Q-WEB-001…](../../14-open-questions/comercial-web.md).
