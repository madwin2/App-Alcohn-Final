# Preguntas abiertas — Envíos (Correo, Andreani, otros)

### Q-ENV-001
- **Módulo**: Envíos · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Qué significa "Despachado" para el negocio? En Correo se marca al cargar el PDF de etiquetas (antes de llevar el paquete); en Andreani cuando el portal registra el ingreso. ¿Debería significar lo mismo?
- **Evidencia**: `app/pedidos/index.tsx` (`onApply`), `andreani-worker` `markOrderDespachado`.
- **Por qué importa**: dispara el WhatsApp con seguimiento y el descuento de stock.
- **Impacto**: alto.
- Respuesta: Significa que el pedido se envio. Solo que en la logica de uso, cuando enviamos por correo argentino, subimos el pdf justo antes de ir al correo, asi comienza la automatizacion (marcar como enviado, y que se enevie el seguimiento y pasa al sigueinte estado). En cambio en andreni, como traemos las cosas desde su pagina se suele hacer luego de desapachar. Es una cuestion mas operativa. Ya que usamos la app para llevar el pdf al formato correcto y agregarle los iconos de los sellos que tiene (correo argentino). 

### Q-ENV-002
- **Módulo**: Envíos · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cómo se le piden los datos de envío al cliente (mensaje estándar, quién, plazo)?
- **Impacto**: medio.
- Respuesta: En andreani se le manda un link para que lo complete el en la pagina de andreani. En correo argentino se le manda un mensaje estandar con los datos que se necesita.

### Q-ENV-003
- **Módulo**: Envíos · **Estado**: documentada (2026-09-28)
- **Pregunta**: Un pedido sin empresa de envío cae en la cola de Correo. ¿Es correcto asumir Correo por defecto?
- **Evidencia**: `isCorreoShippingFlow`.
- **Impacto**: medio.
- Respuesta: Creeria que si.

### Q-ENV-004
- **Módulo**: Envíos · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cómo funcionan "Retiro en persona" y "Vía Cargo" en la práctica y cómo se registra que se entregaron? Hoy no llegan solos a "Seguimiento Enviado" (sin descuento de stock ni recompra).
- **Impacto**: medio.
- Respuesta: Se marcan manuales, ya que los vienen a buscar o se envian como enconienta (se copian los datos a mano, no tienen sistema los de via cargo).

### Q-ENV-005
- **Módulo**: Envíos · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Quién actualiza `costos_de_envio` y cuándo? No tiene pantalla. ¿Coinciden con los costos del mensaje de WhatsApp (variables de entorno)?
- **Impacto**: medio.
- Respuesta: Los actualizo yo cuando aumentan. Estan actualizados.

### Q-ENV-006
- **Módulo**: Envíos · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Con qué impresora y papel se imprimen las etiquetas 100×152 mm?
- **Impacto**: bajo.
- Respuesta: Zebra zd220. Con papel 100x152.

### Q-ENV-007
- **Módulo**: Envíos · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Las medidas/pesos declarados (25×8×8 cm 0,5 kg, etc.) y el valor declarado $40.000 son los reales? ¿Quién los definió?
- **Evidencia**: `correoCsvPackageFromOrder.ts`, `DEFAULT_VALUES`.
- **Impacto**: medio (costo de envío y seguro).
- Respuesta: Si, son las medidas de los tubos que usamos en los envios.

### Q-ENV-008
- **Módulo**: Envíos · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cuándo se considera terminado un envío? ¿Se hace seguimiento de la entrega o de reclamos?
- **Impacto**: medio.
- Respuesta: No se hace seguimiento. Una vez que se pasa el seguimiento listo. Salvo que un cliente nos pregunte. 

### Q-COR-001
- **Módulo**: Envíos · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cada cuánto se actualiza el padrón `correo_sucursales` desde MiCorreo?
- **Impacto**: medio.
- Respuesta: Cuando lo actualiza el correo, pero cada muchisimo tiempo asi que casi nunca.

### Q-COR-002
- **Módulo**: Envíos · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Desde qué sucursal/origen se despacha (configurado en el worker) y se usa "retiro en origen"?
- **Impacto**: bajo.
- Respuesta: Sucursal 5 mar del plata (calle sarmiento). Esa es el de correo argentino. En el de andrenai esta elegido el de Independencia, la sucursal central de mardel.

### Q-COR-003
- **Módulo**: Envíos · **Estado**: documentada (2026-09-28)
- **Pregunta**: Después de que el worker sube y paga la etiqueta en MiCorreo, ¿quién descarga el PDF de etiquetas del portal y lo carga en "Cargar seguimientos"? ¿Se podría automatizar?
- **Impacto**: alto (paso manual en el flujo más usado).
- Respuesta: Lo hace Cachi (lautaro) que es el encargado de la logistica y hacer los envios. Se podria autoamtizar aunque por ahora el hace un chequeo manual que no lleva tanto tiempo.

### Q-COR-004
- **Módulo**: Envíos · **Estado**: documentada (2026-09-28)
- **Pregunta**: Si se cambian los datos de envío después de generar/pagar la etiqueta, ¿qué se hace con la etiqueta vieja en MiCorreo?
- **Impacto**: medio.
- Respuesta: Se cancela y nos reintegran el dinero en nuestra cuenta.

### Q-COR-005
- **Módulo**: MiCorreo · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿El plan es reemplazar el worker de Playwright por la API oficial? ¿Con qué prioridad?
- **Impacto**: medio.
- Respuesta: Seria lo ideal si nos dan las nuevas credenciales. Nos dieron unas que nos dan unas optimizaciones parciales. Preferimos esperar a ver si nos dan las nuevas para hacerlo bien de una. Si no nos la dan, se hara algo hibirido entre las credenciales y lo que tenemos ahora.

### Q-AND-001
- **Módulo**: Andreani · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Por qué un link de Andreani "vence" a las 30 h? ¿Es una regla del portal o una decisión interna?
- **Impacto**: medio.
- Respuesta: Porque despues de un tiempo el link deja de funcionar.

### Q-AND-002
- **Módulo**: Andreani · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Quién genera links y cada cuánto? ¿Se quiere el refill automático sugerido en el README?
- **Impacto**: medio.
- Respuesta: Lo generan los vendedores. No refill automatico porque como hetzner esta alojado en alemania necesita de un tunel que abran los chicos en su pc. Entonces si se hace autoamtico puede que ese tunel no este activo. Idealmente, antes de mandarse las fotos, que es cuando se envian los links.

### Q-AND-003
- **Módulo**: Andreani · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Quién mantiene abierto el túnel de la oficina y la sesión del portal (captcha/2FA)?
- **Impacto**: medio.
- Respuesta: Puedo ser yo o alguno de los vendedores. El que lo necesite.

### Q-AND-004
- **Módulo**: Andreani · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Qué pasa si el cliente no completa o no paga el link? ¿Cómo se entrega el paquete a Andreani?
- **Impacto**: medio.
- Respuesta: Lo tiene que hacer, no se manda hasta que no lo complete y pague.

### Q-ENV-009
- **Módulo**: Envíos · **Estado**: pendiente
- **Pregunta**: ¿Cuál es el texto del mensaje estándar con el que se le piden los datos de envío (Correo) al cliente? ¿Conviene que lo mande el bot automáticamente al pasar a Transferido?
- **Impacto**: medio (candidato a automatización).
