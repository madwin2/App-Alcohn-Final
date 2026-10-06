# Preguntas abiertas — Equipo / página personal

Preguntas del plan [`PLAN_PAGINA_PERSONAL.md`](../../PLAN_PAGINA_PERSONAL.md) (Q-EQ-001 a 006, respondidas el 2026-10-02) y de la revisión de uso [`REVISION_EQUIPO_LOGICA_DE_USO.md`](../../REVISION_EQUIPO_LOGICA_DE_USO.md) (Q-EQ-007 a 016, documentadas el 2026-10-05).

### Q-EQ-001
- **Módulo**: perfil · **Estado**: documentada (2026-10-02)
- **Pregunta**: ¿Las vacaciones son por año calendario o por aniversario de ingreso? ¿Los días no usados se acumulan?
- **Por qué importa**: define el cálculo de saldo y el momento en que se acreditan los 10 días hábiles.
- **Impacto**: alto (Etapa 2).
- **Respuesta**: Año calendario. Cada 1/1 se suman 10 días hábiles nuevos; los no usados se acumulan. Saldos iniciales al 2026-10-02: Fede 10, Cachi 0, Juli B 3. → D18, D19 · [POL-039+](../04-business-rules/politicas-confirmadas.md)

### Q-EQ-002
- **Módulo**: perfil · **Estado**: documentada (2026-10-02)
- **Pregunta**: ¿Un cambio de día sin recupero descuenta vacaciones?
- **Por qué importa**: afecta el saldo y qué se muestra en el calendario.
- **Impacto**: medio (Etapa 2).
- **Respuesta**: Solo queda registrado; no descuenta vacaciones. → D19c

### Q-EQ-003
- **Módulo**: perfil · **Estado**: documentada (2026-10-02)
- **Pregunta**: ¿Cuál es el email de login del dueño para el bootstrap del admin?
- **Por qué importa**: la migración crea el primer admin buscando ese email en `auth.users`.
- **Impacto**: alto (Etapa 1).
- **Respuesta**: `julian.475@hotmail.com` (mismo que Economía/Precios). → D20

### Q-EQ-004
- **Módulo**: perfil / innovación · **Estado**: documentada (2026-10-02)
- **Pregunta**: ¿El corcho de ideas se integra con el módulo Innovación o van separados?
- **Por qué importa**: modelo de datos y navegación.
- **Impacto**: medio (Etapa 6).
- **Respuesta**: Separados por ahora. → D22

### Q-EQ-005
- **Módulo**: perfil · **Estado**: documentada (2026-10-02)
- **Pregunta**: Si una tarea mensual cae en fin de semana o feriado, ¿qué pasa?
- **Por qué importa**: lógica de ocurrencias de tareas recurrentes.
- **Impacto**: medio (Etapa 3).
- **Respuesta**: Pasa al día hábil siguiente. → D21

### Q-EQ-006
- **Módulo**: perfil · **Estado**: documentada (2026-10-02)
- **Pregunta**: ¿Julián Moreno tiene límite de días de vacaciones?
- **Por qué importa**: contador en el encabezado y avisos al cargar.
- **Impacto**: medio (Etapa 1–2).
- **Respuesta**: No tiene límite (`vacaciones_sin_limite = true`). Sus vacaciones se ven en el calendario, pero no se calcula saldo ni se muestra contador. → D19b

### Q-EQ-007
- **Módulo**: perfil · **Estado**: documentada (2026-10-05)
- **Pregunta**: ¿Se pueden cargar vacaciones o cambios de día con fecha de hoy o pasada?
- **Por qué importa**: hoy se permite y la persona queda sin poder editarlo ni borrarlo.
- **Impacto**: alto (EQ-R05).
- **Respuesta**: No. La persona solo carga ausencias **futuras**; lo de hoy o retroactivo lo carga el admin (UI + RLS). → [POL-056](../04-business-rules/politicas-confirmadas.md)

### Q-EQ-008
- **Módulo**: perfil · **Estado**: documentada (2026-10-05)
- **Pregunta**: Al desactivar a alguien, ¿se le corta el acceso a calendario, corcho y pedidos? ¿Un usuario aprobado sin perfil puede usar el corcho?
- **Por qué importa**: hoy todas las políticas son "cualquier usuario logueado".
- **Impacto**: alto (EQ-R13).
- **Respuesta**: Sí, se corta. Solo los integrantes **activos** (fila en `perfiles_equipo` con `activo = true`) ven y usan lo del equipo. Un usuario aprobado sin perfil tampoco. → [POL-057](../04-business-rules/politicas-confirmadas.md) (RLS en `migration_equipo_fix_rls.sql`, pendiente de OK para aplicar).

### Q-EQ-009
- **Módulo**: perfil · **Estado**: documentada (2026-10-05)
- **Pregunta**: ¿Se avisa al equipo cuando alguien cambia o cancela sus vacaciones?
- **Impacto**: medio (EQ-R14).
- **Respuesta**: Sí, en los dos casos (cambio de fechas y cancelación), al mismo público que `e1`. → [POL-058](../04-business-rules/politicas-confirmadas.md)

### Q-EQ-010
- **Módulo**: perfil · **Estado**: documentada (2026-10-05)
- **Pregunta**: Si el admin edita un feedback ya leído, ¿qué pasa?
- **Impacto**: medio (EQ-R15).
- **Respuesta**: Vuelve a **Nuevo** (no leído), se muestra "Editado" y le llega una notificación a la persona. → [POL-059](../04-business-rules/politicas-confirmadas.md) (`editado_at` en migración pendiente de OK).

### Q-EQ-011
- **Módulo**: perfil · **Estado**: documentada (2026-10-05)
- **Pregunta**: "Lo que necesito": ¿hacen falta estados intermedios o "No se puede"?
- **Impacto**: bajo (EQ-R16).
- **Respuesta**: No. Se mantiene **Pendiente / Resuelta**. (Mejora técnica sin cambio de regla: que la notificación incluya la respuesta del admin si la hay.) → [POL-060](../04-business-rules/politicas-confirmadas.md)

### Q-EQ-012
- **Módulo**: perfil · **Estado**: documentada (2026-10-05)
- **Pregunta**: ¿El día de recupero puede ser anterior al día que se falta?
- **Impacto**: bajo (EQ-R19).
- **Respuesta**: Sí, se puede adelantar. Solo se avisa (sin bloquear) si recupero = falta, es feriado o cae en vacaciones propias. → [POL-061](../04-business-rules/politicas-confirmadas.md)

### Q-EQ-013
- **Módulo**: perfil · **Estado**: documentada (2026-10-05)
- **Pregunta**: En Mis números, ¿"Etiquetas" cuenta envíos o acciones?
- **Impacto**: bajo (EQ-R22).
- **Respuesta**: **Envíos distintos**: cada orden cuenta una vez por período. → [POL-062](../04-business-rules/politicas-confirmadas.md)

### Q-EQ-014
- **Módulo**: perfil · **Estado**: documentada (2026-10-05)
- **Pregunta**: ¿Se avisa al admin cuando borran/pausan una tarea que sumó o cuando alguien logra un objetivo?
- **Impacto**: bajo (EQ-R23).
- **Respuesta**: No, en ningún caso. → [POL-063](../04-business-rules/politicas-confirmadas.md)

### Q-EQ-015
- **Módulo**: perfil · **Estado**: documentada (2026-10-05)
- **Pregunta**: ¿El año de nacimiento puede quedar visible por API para el equipo?
- **Impacto**: bajo (EQ-R33).
- **Respuesta**: Sí, no es problema. Se guarda con año y se muestra sin año (como hoy). → [POL-064](../04-business-rules/politicas-confirmadas.md)

### Q-EQ-016
- **Módulo**: perfil / corcho · **Estado**: documentada (2026-10-05)
- **Pregunta**: ¿Una idea aprobada tiene seguimiento (Hecha, responsable, Innovación)?
- **Impacto**: bajo.
- **Respuesta**: Nada por ahora: queda **Aprobada**, como hoy. → [POL-065](../04-business-rules/politicas-confirmadas.md)

### Q-EQ-017
- **Módulo**: perfil / calendario · **Estado**: documentada (2026-10-05)
- **Pregunta**: ¿Qué tareas se ven en el calendario del equipo?
- **Respuesta**: **Un solo calendario**: lo público del equipo (vacaciones, cambios de día, feriados, cumpleaños) lo ven todos; encima, cada uno ve sus cosas privadas (sus tareas). Ver [`REVISION_EQUIPO_USABILIDAD.md`](../../REVISION_EQUIPO_USABILIDAD.md) UX-01. → [POL-066](../04-business-rules/politicas-confirmadas.md)

### Q-EQ-018
- **Módulo**: perfil / tareas · **Estado**: documentada (2026-10-05) — cambia D9 y §10 del plan
- **Pregunta**: ¿Se adelanta "marcar hecha" en las tareas?
- **Respuesta**: Sí. Todas las tareas (repetidas y de un solo día) se marcan por ocurrencia: **Hecha**, **Posponer** al día siguiente, **Mover a otro día** o **No hecha** (en las repetidas: se hace la próxima vez que toque). → [POL-067](../04-business-rules/politicas-confirmadas.md)

### Q-EQ-019
- **Módulo**: perfil / tareas · **Estado**: documentada (2026-10-05)
- **Pregunta**: ¿Qué pasa con una tarea que no se marcó al terminar el día?
- **Respuesta**: **Se arrastra al día siguiente** ("atrasada desde…") hasta que se marque, tanto las de un solo día como las que se repiten. → [POL-068](../04-business-rules/politicas-confirmadas.md)

### Q-EQ-020
- **Módulo**: perfil / inicio · **Estado**: documentada (2026-10-05, corregida el mismo día)
- **Pregunta**: ¿Se unifican post-its, "tarea a un compañero" y tareas del perfil?
- **Respuesta**: **No.** Los post-its del Inicio son **notas / avisos** (para uno o entre compañeros) y las **tareas** son otra cosa (Mi perfil + calendario). Quedan separados: los post-its no crean tareas ni van al calendario. (Una primera respuesta proponía unificarlos; el dueño la corrigió.) → [POL-069](../04-business-rules/politicas-confirmadas.md)

### Q-EQ-021
- **Módulo**: perfil / inicio · **Estado**: anulada (2026-10-05)
- **Pregunta**: ¿Para qué día queda la tarea de un post-it o de un compañero?
- **Respuesta**: No aplica: los post-its no crean tareas (Q-EQ-020).

### Q-EQ-022
- **Módulo**: perfil / inicio · **Estado**: anulada (2026-10-05)
- **Pregunta**: ¿Post-it y tarea están sincronizados?
- **Respuesta**: No aplica: son cosas separadas (Q-EQ-020).

### Q-EQ-023
- **Módulo**: perfil / tareas · **Estado**: documentada (2026-10-05)
- **Pregunta**: ¿Quién puede marcar una tarea?
- **Respuesta**: La persona dueña y el admin. Quien la asignó (el admin) ve el estado. → [POL-070](../04-business-rules/politicas-confirmadas.md)

### Q-EQ-024
- **Módulo**: perfil / tareas · **Estado**: documentada (2026-10-05)
- **Pregunta**: Supuestos S13–S17 de [`REVISION_EQUIPO_USABILIDAD.md`](../../REVISION_EQUIPO_USABILIDAD.md) (tareas en feriado/ausencia, atrasadas múltiples, arranque del arrastre, post-its viejos, reposición de stock).
- **Respuesta**:
  - **S13**: una ocurrencia en feriado, vacaciones o día que falto **se mueve al día hábil siguiente** que trabajo. Si en ese período hubo varias de la misma tarea, **se mueve solo una**; el resto queda "No aplica". → [POL-071](../04-business-rules/politicas-confirmadas.md)
  - **S14**: varias atrasadas de la misma tarea se ven en **una sola tarjeta** "atrasada (N veces)". → [POL-072](../04-business-rules/politicas-confirmadas.md)
  - **S15**: el arrastre cuenta **desde que se publica la función**. → [POL-073](../04-business-rules/politicas-confirmadas.md)
  - **S16**: ya no aplica (los post-its no se tocan, Q-EQ-020).
  - **S17**: las tareas automáticas de **reposición de stock quedan aparte**, como hoy. → [POL-074](../04-business-rules/politicas-confirmadas.md)
