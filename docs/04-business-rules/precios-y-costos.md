# Reglas — Precios y costos

| ID | Regla | Dónde | Hace cumplir |
|---|---|---|---|
| BR-PRE-001 | Precio de sello rectangular: medida fija si existe; si no, precio del grupo (chicos/medianos/grandes/xl) asignado a esa medida. | `resolverPrecioSelloRectangular` | Servicio |
| BR-PRE-002 | Precio link = round(precio transferencia × 1,15). | `precioLinkDesdeTransferencia`; `confirm-web-order` (`WEB_PRECIO_LINK_MARKUP`) | Servicio/Edge (duplicado) |
| BR-PRE-003 | Solo la cuenta dueña del catálogo puede modificar precios; el resto lee. | RLS `precios_*` (email en JWT), `precios_catalog_owner_user_id()` | DB |
| BR-COS-001 | Costo de fabricación por ítem según tipo (ver fórmula en [economia-gastos](../02-modules/economia-gastos/README.md#fórmula-de-costo-por-ítem--trigger-calc_sello_fabrication_cost)), usando los parámetros vigentes a la fecha de creación del ítem. Margen = valor − costo. | trigger `calc_sello_fabrication_cost`, `fabricacion_params_at` | DB |
| BR-COS-002 | Totales de costo y margen de la orden = suma de sus ítems. | trigger `refresh_orden_fabrication_totals` | DB |
| BR-COS-003 | Los parámetros de fabricación se versionan por "vigente desde"; nunca se editan en el lugar. | `insertFabricacionParamsVersion` | Servicio |
| BR-COS-004 | Consumo de bronce valorizado al precio por cm vigente al momento de marcar `Hecho` (no al de creación). | `registrar_bronce_consumo_sello` (`fabricacion_params_at(NOW())`) | DB |
| BR-COS-005 | Envío gratis si la orden tiene ≥3 ítems tipo SELLO — **solo** en el cálculo del mensaje de WhatsApp (el `restante` de la base sigue sumando el costo de envío). | edge `webhook-bot` | Edge |
