# Backlog de mejoras y correcciones

Surgido de la auditoría (2026-09-27) y de las respuestas del equipo (2026-09-28). Cada ítem tiene su evidencia en `audits/`, `04-business-rules/politicas-confirmadas.md` o `14-open-questions/`. **Nada de esto está implementado.** Esfuerzo: S (horas), M (1–2 días), L (varios días).

## A. Seguridad y robustez (base para todo lo demás)

| ID | Qué | Por qué | Evidencia | Esfuerzo | Nota |
|---|---|---|---|---|---|
| B-01 | Cerrar el acceso anónimo a las tablas (activar RLS con políticas para usuarios aprobados) | Hoy cualquiera con la clave pública puede leer/modificar/borrar clientes y pedidos y aprobarse como usuario | AUD-SEC-001, AUD-SEC-002 | M–L | **Revisar antes el repo de la tienda web**: comparte la base y puede depender de ese acceso. Hacerlo por etapas |
| B-02 | Exigir sesión en las funciones `/api` (Vectorizer, OpenAI, workers) y en `webhook-bot` | Consumo de créditos y envíos de WhatsApp/etiquetas por terceros | AUD-SEC-004, AUD-SEC-007 | S–M | |
| B-03 | Backups y monitoreo mínimo del VPS (bot + workers) | Hoy no hay ninguno; si el VPS cae se pierde el bot | Q-ARQ-001 | S–M | Supabase tiene backups propios según el plan contratado: verificar |
| B-04 | Proceso de cambios seguro: migraciones versionadas + entorno de prueba (rama de Supabase o proyecto de staging) | Hoy se prueba en producción y la base es compartida con la web | Q-ARQ-003, Q-ARQ-004 | M | |
| B-05 | Sacar de la carpeta del proyecto los archivos con datos de clientes y los restos de despliegues | Privacidad y ruido para los agentes | Q-ARQ-005, AUD-DEAD-015 | S | Decisión del dueño |

## B. Errores confirmados

| ID | Qué | Evidencia | Esfuerzo |
|---|---|---|---|
| B-06 | **Evento Purchase a Meta con valor de menos** (~16 % en promedio, 108 de 638 pedidos de la app): mandar el evento cuando el pedido tiene todos sus ítems | Q-WEB-004, AUD-UND-009 | S–M |
| B-07 | **Sello rehecho atado a su programa viejo**: que quede registrado en el programa donde falló pero pueda asignarse a uno nuevo | POL-017, AUD-INC-013, Q-PROG-009 | M |
| B-08 | **Rehacer desde el menú del programa debe pedir motivo** (mismo diálogo que Pedidos/Producción) | POL-016, AUD-INC-012 | S |
| B-09 | **Demanda de stock inflada**: excluir pedidos viejos (> 2 meses) salvo deudores | Q-STK-003, AUD-UND-011 | S |
| B-10 | **WhatsApp marcados como fallidos (30–50 %) y posibles duplicados**: alinear timeouts, que los reintentos pasen por la edge, evitar reenviar si el bot ya lo envió | AUD-UND-003, AUD-UND-008, Q-WA-003 | M |
| B-11 | Evento `ASPIRE_DESCARGADO` rechazado por la base | AUD-INC-010 | S |
| B-12 | Guardar costos en Gastos borra los largos máximos de planchuela | AUD-INC-011 | S |
| B-13 | Seña por defecto de pedidos web ($20.000 vs $30.000) | Q-WEB-006 | S (según respuesta) |

## C. Políticas confirmadas no implementadas / deseos

| ID | Qué | Evidencia | Esfuerzo |
|---|---|---|---|
| B-14 | Recordatorio automático a deudores cada ~15 días | POL-008 | S–M |
| B-15 | Stock de **bronce (planchuelas) y packaging** | Q-STK-001 ("próximo paso") | L |
| B-16 | Subir trayectorias a la app y descargarlas desde la PC de la CNC (reemplaza el pendrive) | Q-CNC-002, ADR-010 | M–L |
| B-17 | Metas de venta configurables y escalonadas (equilibrio / bueno / objetivo) | Q-GEN-004 | S–M |
| B-18 | Mensaje automático pidiendo los datos de envío (Correo) al pasar a Transferido | Q-ENV-002, Q-ENV-009 | S–M |
| B-19 | MiCorreo por API oficial (esperando credenciales nuevas; si no llegan, híbrido) | Q-COR-005 | L |
| B-20 | Automatizar la bajada del PDF de etiquetas de MiCorreo (hoy manual, no urgente) | Q-COR-003 | M |
| B-21 | Usar tiempo de mecanizado y material real que reporta el gadget | Q-PROG-008 | M |
| B-22 | Stock mínimo por insumo con alertas | Q-STK-004 | S |

## D. Limpieza de producto

| ID | Qué | Evidencia |
|---|---|---|
| B-23 | Quitar la edición manual del estado Aspire en Producción (ya lo hace Programas) | Q-PROD-003 |
| B-24 | Quitar o redefinir la prioridad caliente/tibio/frío de Comercial (no se usa) | POL-029 |
| B-25 | Decidir la vista "lista" de Programas: llevar sus funciones únicas (subir `.crv3d` a mano, revisión por sello) al tablero o eliminarla | Q-PROG-007, AUD-DEAD-003 |
| B-26 | Eliminar código muerto listado en auditorías | AUD-DEAD-* |
