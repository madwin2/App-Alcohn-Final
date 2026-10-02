# Preguntas abiertas — Equipo / página personal

Preguntas del plan [`PLAN_PAGINA_PERSONAL.md`](../../PLAN_PAGINA_PERSONAL.md). Todas respondidas el 2026-10-02.

### Q-EQ-001
- **Módulo**: perfil · **Estado**: documentada (2026-10-02)
- **Pregunta**: ¿Las vacaciones son por año calendario o por aniversario de ingreso? ¿Los días no usados se acumulan?
- **Por qué importa**: define el cálculo de saldo y el momento en que se acreditan los 10 días hábiles.
- **Impacto**: alto (Etapa 2).
- **Respuesta**: Año calendario. Cada 1/1 se suman 10 días hábiles nuevos; los no usados se acumulan. Saldos iniciales al 2026-10-02: Fede 10, Cachi 0, Juli B 3. → D18, D19 · [POL-038+](../04-business-rules/politicas-confirmadas.md)

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
