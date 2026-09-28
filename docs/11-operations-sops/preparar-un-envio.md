# SOP · Preparar un envío por Correo Argentino

> Workflow: [WF-06](../03-workflows/WF-06-envio-correo-argentino.md) · Frontera: [FR-07](../10-operational-boundaries/README.md#fr-07), [FR-09](../10-operational-boundaries/README.md#fr-09)

**Responsable**: Cachi (logística). **Frecuencia / horario**: `[REQUIERE INFORMACIÓN DEL EQUIPO]`

## Antes de empezar
- Todos los ítems del pedido están **Hecho** y el cliente **pagó todo** (los datos de envío se cargan solo después del pago).
- Si el pedido no tiene empresa elegida, se trata como Correo Argentino.

## Pasos

1. **Alcohn AI** → Envíos → Correo → "Pendientes de datos". Identificar el pedido.
2. Mandarle al cliente el **mensaje estándar** pidiendo los datos. `[REQUIERE INFORMACIÓN DEL EQUIPO: texto del mensaje]`
3. **Alcohn AI** → abrir el pedido → pegar el texto del cliente → "Interpretar" (o "Usar IA") → revisar provincia/localidad/sucursal contra los desplegables → Domicilio o Sucursal → "Continuar" → "Guardar".
   - Automático: el pedido queda **Transferido** y se sube y paga en MiCorreo (no cerrar la pestaña hasta que termine).
4. Verificar: "Etiqueta Lista" (ok) o "Error de Etiqueta" (corregir datos y volver a guardar).
5. Descargar el **PDF de etiquetas** desde el portal MiCorreo y hacer el chequeo manual.
6. **Justo antes de ir al correo**: Alcohn AI → Pedidos → "Cargar seguimientos" → Correo Argentino → subir el PDF → revisar coincidencias y asignar las que falten → "Aplicar".
   - Automático: seguimiento cargado, **Despachado**, se descarga el PDF listo (100×152 con íconos de los sellos) y el cliente recibe el seguimiento → **Seguimiento Enviado** y descuento de stock.
7. Imprimir en la **Zebra ZD220** (papel 100×152).
8. **Armar cada sello**: varilla M6 de 130 mm con tuerca, mango de madera enroscado a la varilla, prisionero pegado.
9. Embalar en **tubo** (sellos 25×8×8; abecedario/base 25×13×13; soldador 40×15×20 — son las medidas declaradas) y pegar la etiqueta.
10. Llevar a la **Sucursal 5 de Mar del Plata (calle Sarmiento)**.
11. Cierre: el envío termina cuando el cliente recibió el seguimiento; no se sigue la entrega salvo que el cliente pregunte.

## Problemas frecuentes
- Provincia/localidad/sucursal fuera del padrón → usar el desplegable o el código de sucursal manual.
- Subida "Generando" que no termina → probablemente se cerró la pestaña; volver a guardar.
- Cambio de datos con la etiqueta ya pagada → **cancelar la etiqueta en MiCorreo** (reintegran el dinero) y volver a guardar.
- Respaldo: "Generar CSV" y subirlo a mano en MiCorreo.
