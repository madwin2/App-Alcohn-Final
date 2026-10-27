# WF-07 · Envío por Andreani

| | |
|---|---|
| **Inicio** | Orden con empresa Andreani. |
| **Actores** | 🔶 Logística; cliente (completa el envío y lo **paga** en Andreani); andreani-worker; bot. |
| **Módulos** | Envíos (panel Andreani), Pedidos (fotos), WhatsApp, Stock |
| **Resultado** | Orden `Seguimiento Enviado`. |

## Modelo de negocio (✅ `services/andreani-worker/fixtures/FLOW.md`)

Alcohn usa **Andreani Pymes – "Andreani envíos"**: genera un **link de envío** con origen en la sucursal de despacho configurada (Mar del Plata), paquete estándar 25×8×8 cm, 1 kg, valor declarado $40.000 y un código de descuento. **El destinatario completa sus datos y abona el envío** en la web de Andreani.

## Pasos

1. **Pool de links** (Envíos → Andreani): "Generar más" llama al worker (Playwright en el portal) que crea N links y los guarda en `envios_andreani_links` (`disponible`). Un link vale **30 h**; los viejos se purgan. ❓ Por qué 30 h → [Q-AND-001](../14-open-questions/envios.md#q-and-001).
   - El portal bloquea la IP del servidor: el worker sale a internet por un **túnel SOCKS desde la PC de la oficina** (`office-tunnel.bat`), que tiene que estar abierto → [FR-08](../10-operational-boundaries/README.md#fr-08).
2. **Asignación**: al subir la **foto del último ítem** (WF-05), la edge `webhook-bot` toma el link disponible más antiguo (`asignar_link_andreani`) y lo incluye en el WhatsApp `pedido_listo`. (Los pedidos web lo reciben en el WhatsApp de confirmación.) Si el pool está vacío, el mensaje sale sin link.
3. ❓ El cliente completa y paga el envío en Andreani. ✅ A veces lo completa **a nombre de otra persona** y no avisa: por eso existe la revisión de links ([ADR-029](../13-decisions/ADR-029-revision-de-links-andreani.md)).
   - 🤖 **Revisión de links** (worker `check-links`, sin login, por el túnel de oficina): para cada link `asignado` de un pedido sin seguimiento, consulta la API pública de Andreani (¿se usó?) y, si se usó, abre el link y lee la página "¡Listo!": **nombre** y **número de seguimiento**. Los guarda en el link (`destinatario`, `tracking`, `usado_en`, `revisado_en`). Si ese seguimiento ya estaba como etiqueta **huérfana**, la asigna sola (`asignar_etiqueta_andreani`). Corre **solo como primer paso de "Traer etiquetas"**: el túnel se abre a mano y a veces se cae, así que no hay revisión automática por horario ([Q-AND-005](../14-open-questions/envios.md#q-and-005)).
4. **Traer etiquetas**: botón en el panel → worker revisa los links (paso anterior), descarga las etiquetas Zebra nuevas del portal, lee tracking y destinatario, empareja **primero por el seguimiento que mostró el link** y si no **por nombre** (cliente, dirección de envío o nombre del link; BR-AND-008), enriquece el PDF y lo guarda (`envios_andreani_etiquetas`: `asignada` o `huerfano`; bucket `etiquetas-andreani`). Si al refrescar el portal una etiqueta ya guardada **ya no** está "Pendiente de ingreso", la orden pasa a **`Despachado`** (igual que el paso 8) para que el cliente reciba el WhatsApp de seguimiento.
5. **Asignar** huérfanas a mano (`asignar_etiqueta_andreani`, requiere que la orden tenga link asignado) → `seguimiento`, `Etiqueta Lista`. También se pueden cargar PDFs a mano. Liberar a huérfano, marcar **errónea**, restaurar, eliminar.
6. **Venta**: la descarga del PDF solo se permite si la venta está **Transferido** (selector en el panel).
7. **Descargar PDF unido** (100×152) → ❓ imprimir, pegar, entregar a Andreani.
8. **Actualizar seguimientos**: worker lee el estado en el portal; si ya **no** dice "Pendiente de ingreso", la orden pasa a **`Despachado`** (solo si estaba en `Etiqueta Lista`). Útil si no corriste "Traer etiquetas" después del ingreso en sucursal.
9. ✅ Igual que Correo: trigger → WhatsApp `pedido_enviado` (link de Andreani con el tracking) → `Seguimiento Enviado` → stock.

## Estados

Link: `disponible` → `asignado` → (`descartado` | vuelve a `disponible` | borrado). Un link que el cliente ya completó no vuelve al pool: se descarta (BR-AND-009). Etiqueta: `huerfano` ↔ `asignada`, `erronea`. Orden: `Etiqueta Lista` → `Despachado` → `Seguimiento Enviado`. Ver [06-state-machines/andreani.md](../06-state-machines/andreani.md).

## Excepciones

- Cambiar la empresa de Andreani a otra devuelve el link al pool (o lo borra si tiene >30 h). Borrar la orden también. Si la revisión ya lo vio completado, se descarta en vez de volver al pool.
- La revisión encuentra un seguimiento que ya está asignado a **otro** pedido (el emparejamiento por nombre se equivocó): no lo cambia, lo informa en el mensaje del trabajo ("Revisar: … ya está en otro pedido").
- Tracking ya asignado a otra orden → error.
- "Cargar seguimientos" con PDF de Andreani desde Pedidos: pone `Etiqueta Lista` sin tocar la venta.

## Preguntas

[Q-AND-*](../14-open-questions/envios.md).
