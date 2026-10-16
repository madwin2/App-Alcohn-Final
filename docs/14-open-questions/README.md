# Preguntas abiertas (sistema centralizado)

Información que **el código no contiene**. Cada pregunta tiene ID, módulo, contexto, por qué importa, evidencia, impacto, estado y (si ya se contestó) la respuesta del equipo.

## Estados

- **pendiente** — nadie respondió o falta investigar.
- **respondida** — el equipo respondió; falta volcarlo a la documentación.
- **documentada** — la respuesta ya está en los documentos correspondientes.
- **parcial** — hay respuesta o análisis, pero falta algo.

Al responder: agregar `- Respuesta: …`, cambiar el estado y actualizar los módulos/workflows/reglas afectados (o las [políticas confirmadas](../04-business-rules/politicas-confirmadas.md)).

## Estado general (2026-10-02)

120 preguntas: **104 documentadas**, 2 parciales, **14 pendientes**.

## Pendientes

| ID | Pregunta (resumen) | Cómo se resuelve |
|---|---|---|
| [Q-INI-001](inicio.md#q-ini-001) | Qué cuenta como "Pedido especial" en la Home nueva | Respuesta del equipo |
| [Q-CNC-007](produccion-fabricacion.md#q-cnc-007) | 2 CNC físicas vs 3 máquinas en el sistema (C, G, XL) | Respuesta del equipo |
| [Q-PROD-007](produccion-fabricacion.md#q-prod-007) | ¿Se usa la máquina `ABC` en la app para abecedarios? | Respuesta del equipo |
| [Q-WEB-006](comercial-web.md#q-web-006) | Seña web $30.000 vs valor por defecto $20.000 en el código | Revisar el repo de la web |
| [Q-WEB-002](comercial-web.md#q-web-002) | Qué hace la web con `pago_fallido`/`abandonado` | Revisar el repo de la web |
| [Q-WEB-005](comercial-web.md#q-web-005) | Pedidos "Internacional" | Revisar el código nuevo cuando llegue |
| [Q-MOCK-001](comercial-web.md#q-mock-001) | Mockups web en `procesando` (análisis de datos hecho) | Revisar el repo de la web |
| [Q-WA-003](whatsapp-bot.md#q-wa-003) | Pico de junio–julio y 30–50 % de webhooks "fallidos" | Análisis técnico (backlog B-10) |
| [Q-PROG-007](programas.md#q-prog-007) | Vista "lista" de Programas | Decisión de producto (backlog B-25) |
| [Q-ARQ-005](arquitectura.md#q-arq-005) | Archivos con datos de clientes en la carpeta | Decisión del dueño (backlog B-05) |
| [Q-VEN-008](ventas-cobros.md#q-ven-008) | Estándar de la foto | Respuesta del equipo |
| [Q-VEN-009](ventas-cobros.md#q-ven-009) | Quién verifica los pagos y en qué cuenta | Respuesta del equipo |
| [Q-ENV-009](envios.md#q-env-009) | Texto del mensaje estándar para pedir datos de envío | Respuesta del equipo |
| [Q-PED-005](pedidos.md#q-ped-005) | Uso real de tareas y post-its (parcial) | Revisar uso |
| [Q-EQ-029](equipo.md#q-eq-029) | Corcho: ¿los 👎 muestran el nombre de quien votó? | Decisión del dueño |
| [Q-EQ-030](equipo.md#q-eq-030) | Corcho: ¿se votan las ideas ya aprobadas? | Decisión del dueño |
| [Q-VEC-007](vectorizacion.md#q-vec-007) | Chequeo de fresa: ¿los umbrales coinciden con lo que se corrige en Aspire? | Probarlo con Fede |
| [Q-VEC-008](vectorizacion.md#q-vec-008) | ¿Misma fresa fina para todos los tipos de sello? | Respuesta del equipo |
| [Q-VEC-009](vectorizacion.md#q-vec-009) | ¿Confirmar con problemas de fresa debe bloquearse? | Decisión del dueño |
| [Q-PROG-013](programas.md#q-prog-013) | Soportes fijos y uso parcial aclarados; faltan geometría útil y márgenes | Respuesta de operación (parcial, 2026-10-15) |
| [Q-PROG-019](programas.md#q-prog-019) | Base C y Aspire 10.514 identificados; calificar recetas y después G/XL | Prueba nativa local |
| [Q-PROG-015](programas.md#q-prog-015) | Conservar ajustes y preguntar solo por conflictos de la misma propiedad; implementado el retorno SVG y conflicto de fuente/geometría | Documentada; pendiente calificación en Aspire (2026-10-15) |

## Archivos por área

[general](general.md) · [empresa](empresa.md) · [usuarios-permisos](usuarios-permisos.md) · [equipo](equipo.md) · [pedidos](pedidos.md) · [ventas-cobros](ventas-cobros.md) · [produccion-fabricacion](produccion-fabricacion.md) · [programas](programas.md) · [vectorizacion](vectorizacion.md) · [envios](envios.md) · [stock](stock.md) · [comercial-web](comercial-web.md) · [whatsapp-bot](whatsapp-bot.md) · [economia](economia.md) · [arquitectura](arquitectura.md) · [datos](datos.md)
