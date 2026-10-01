# Políticas del negocio confirmadas por el equipo

Reglas que el equipo **confirmó** (respuestas a `14-open-questions`, 2026-09-28). A diferencia del resto de `04-business-rules` (que documenta lo implementado), acá se indica si cada política está **implementada**, **parcialmente** o **no implementada**. Lo no implementado es candidato a mejora (ver [16-backlog](../16-backlog/README.md)).

| ID | Política | Fuente | ¿Implementada? |
|---|---|---|---|
| POL-001 | **Sin seña no se toma un trabajo.** El resto de requisitos del alta (diseño, medida) pueden completarse después. | Q-PED-001 | Parcial: el sistema no exige seña > 0 |
| POL-002 | Seña estándar **$20.000** en ventas por WhatsApp; **$30.000** para sellos XL; **$30.000** en la tienda web. El comprobante llega por WhatsApp. | Q-VEN-001, Q-WEB-003 | Parcial: `confirm-web-order` usa $20.000 por defecto si la web no informa la seña ([Q-WEB-006](../14-open-questions/comercial-web.md#q-web-006)) |
| POL-003 | Pago con link/tarjeta = precio transferencia **+15 %**. | Q-WEB-003 | Sí (BR-PRE-002) |
| POL-004 | **Un envío por pedido.** Si hacen falta envíos distintos, son órdenes distintas. | Q-PED-003 | Sí (implícito) |
| POL-005 | La **fecha límite** es la fecha en que el pedido tiene que estar **listo y despachado**; la usa todo el equipo. | Q-PED-004 | Sí (avisos p4 y l2) |
| POL-006 | **Transferido** = pagó todo lo que debía, incluido el envío si correspondía. Con Andreani el envío lo paga el cliente en la página de Andreani, así que no se incluye. | Q-VEN-003 | Sí |
| POL-007 | Los **datos de envío se cargan solo después de que el cliente pagó** (por eso guardarlos pasa a Transferido). | Q-VEN-002 | Sí (BR-VEN-005) |
| POL-008 | **Deudor** a los 10 días fijos desde que se mandó la foto sin pago; **recordatorio cada ~15 días** mientras siga deudor. | Q-VEN-004 | Sí: el paso a Deudor es diario; el recordatorio lo manda el cron `recordatorio-pago-pendiente` **todos los jueves** (semanal, no cada 15 días; desde 2026-10-01; ver [Q-WA-006](../14-open-questions/whatsapp-bot.md#q-wa-006)) |
| POL-009 | La **foto** se manda **por ítem**, apenas ese ítem está Hecho. | Q-VEN-005 | Sí |
| POL-010 | Avisar al cliente de todo **Rehacer** es intencional (transparencia: sabe que hubo un error y que va a demorar). | Q-VEN-006 | Sí |
| POL-011 | El cargo adicional de un Rehacer se cobra o no según de quién fue el error; se le informa el monto al cliente y lo paga. | Q-VEN-007 | Informativo en el sistema |
| POL-012 | **Hecho** = el operario cortó los sellos, los sacó de la máquina y **los probó en cuero**. **Haciendo** = dejó la máquina corriendo. | Q-CNC-005 | Manual |
| POL-013 | **Retocar** = salió un detalle mal que se corrige sin rehacer. **Verificar** = Producción no está segura y le deja a Ventas el chequeo. | Q-PROD-002 | Estados existen; sin flujo asociado |
| POL-014 | Criterio para armar programas: 1) prioritarios, 2) los pedidos más viejos, 3) aprovechar la planchuela completa. Se mezclan tipos de sello; normalmente una sola corrida. | Q-PROG-001, Q-PROG-002 | Sí ("Sugerir" usa prioridad + antigüedad + tope de largo) |
| POL-015 | **Un programa por día por máquina.** Chica: corrida ideal ~24 h. Grande: 10–12 h o menos. | Q-CNC-003 | No se controla |
| POL-016 | Rehacer desde un programa **debe pedir motivo** (para asignar el error a los sellos del programa). | Q-PROD-004 | **No** (AUD-INC-012) |
| POL-017 | Un sello rehecho **queda registrado en el programa donde falló** (trazabilidad) pero **debe poder asignarse a un programa nuevo**. | Q-PROG-009 | **No** (AUD-INC-013) |
| POL-018 | Largos máximos de planchuela (C 400 mm, G/XL 250 mm) y pérdida de corte 0,8 cm son correctos. | Q-PROG-012 | Sí |
| POL-019 | Criterio de revisión de vectores: fidelidad al diseño, líneas rectas bien hechas, sin deformaciones. Revisa quien pidió el vector (normalmente Fede). | Q-VEC-004 | Manual |
| POL-020 | Tiempos del contacto comercial automático (10 min después de la muestra, cooldown 7 días) y de recompra (2 meses, clientes con 1 compra) son los deseados. | Q-COM-002 | Sí |
| POL-021 | Un pedido **sin empresa de envío** se trata como Correo Argentino. | Q-ENV-003 | Sí |
| POL-022 | **Retiro en persona** y **Vía Cargo** se marcan a mano (los retiran o se mandan como encomienda copiando los datos a mano). | Q-ENV-004 | Sí (manual) |
| POL-023 | Un envío termina cuando el cliente recibe el seguimiento; no se hace seguimiento de la entrega salvo consulta del cliente. | Q-ENV-008 | Sí |
| POL-024 | Si se cambian datos de envío con la etiqueta de MiCorreo ya pagada, **se cancela la etiqueta** y MiCorreo reintegra el dinero a la cuenta. | Q-COR-004 | Manual (solo se notifica l1) |
| POL-025 | Un envío Andreani **no se despacha hasta que el cliente completó y pagó el link**. | Q-AND-004 | Sí (la etiqueta no existe hasta que paga) |
| POL-026 | Los links de Andreani los generan los vendedores **antes de mandar las fotos**; no hay refill automático porque depende del túnel en una PC de la oficina. | Q-AND-002 | Sí (manual) |
| POL-027 | Las **cajas** de Economía se actualizan a mano (hoy desactualizadas). Los costos de fabricación se actualizan cuando cambian significativamente. | Q-ECO-002, Q-ECO-003 | Sí (manual) |
| POL-028 | Las metas de venta (200/mes, 10/día) están vigentes; a futuro deberían ser configurables y escalonadas (mínimo de equilibrio, bueno, objetivo). | Q-GEN-004 | Parcial (fijas en código) |
| POL-029 | La prioridad caliente/tibio/frío de Comercial **no se usa**: el equipo no confía en el criterio. No se trabaja la lista de potenciales a mano. | Q-COM-001 | — |
| POL-030 | **Prueba** descuenta stock y se da por cerrada cuando **todos** sus ítems quedan `Hecho` (D1). | PLAN_PEDIDOS_PRUEBA_Y_REGALO | Sí (BR-STK-007) |
| POL-031 | **Prueba** se carga al cliente interno fijo sin teléfono; motivo obligatorio; nunca WhatsApp (D2). | PLAN_PEDIDOS_PRUEBA_Y_REGALO | Sí (BR-PED-013) |
| POL-032 | **Regalo**: el cliente recibe WhatsApp con el ítem "Regalo – sin cargo" y sin pedir pago (D3). Plantillas `regalo_*` pendientes (flag apagado). | PLAN_PEDIDOS_PRUEBA_Y_REGALO | Parcial (Q-WA-007) |
| POL-033 | **Regalo aparte**: el envío lo paga Alcohn (restante $0; costo de envío = gasto) (D4). | PLAN_PEDIDOS_PRUEBA_Y_REGALO | Sí (update_orden_totals) |
| POL-034 | **Regalo aparte** nace Transferido; foto opcional; nunca Deudor ni recordatorios (D5). | PLAN_PEDIDOS_PRUEBA_Y_REGALO | Sí |
| POL-035 | Pruebas y regalos **no** suman a ventas; su costo resta en Economía como gasto "Pruebas"/"Regalos" (D6). | PLAN_PEDIDOS_PRUEBA_Y_REGALO | Sí |
| POL-036 | No se guarda valor de lista de lo regalado; alcanza el costo de fabricación (D7). | PLAN_PEDIDOS_PRUEBA_Y_REGALO | Sí |
| POL-037 | El tipo de pedido y la marca `es_regalo` **no se pueden cambiar** después de creados (D8). | PLAN_PEDIDOS_PRUEBA_Y_REGALO | Sí (triggers) |
