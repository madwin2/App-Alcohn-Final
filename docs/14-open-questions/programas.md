# Preguntas abiertas — Programas

### Q-PROG-001
- **Módulo**: Programas · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Con qué criterio se decide qué sellos entran en un programa y cuándo se arma (prioridad, fecha límite, llenar planchuelas, tipo de sello, máquina libre)?
- **Contexto**: "Sugerir" usa prioridad + antigüedad hasta llenar planchuelas.
- **Por qué importa**: cualquier mejora para "tener menos pasos" depende de si el criterio se puede automatizar.
- **Impacto**: alto.
- Respuesta: Primero los que sean prioritarios, despues los que sea hayan pedido hace mas tiempo, y despues el aprovechamiento de planchuela, tratar de usar la planchuela completa.

### Q-PROG-002
- **Módulo**: Programas · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Un programa se fabrica en una sola corrida o puede partirse? ¿Se mezclan tipos de sello (Clásico y 3 mm) en un mismo programa?
- **Impacto**: medio.
- Respuesta: se mezclan. generalmente de una sola corrida.

### Q-PROG-003
- **Módulo**: Programas · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿El candado se usa en la práctica? ¿Para qué casos?
- **Contexto**: desde F3 es solo manual.
- **Impacto**: bajo.
- Respuesta: no se si se usa mucho.

### Q-PROG-004
- **Módulo**: Programas/Aspire · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿El gadget se corre siempre con internet (lista de programas) o se usa el ZIP? ¿Qué pasa en la práctica cuando falla la subida del `.crv3d`?
- **Impacto**: medio.
- Respuesta: Se usa siempre con internet. Sino se sube manual, auqnue tratamos de evitar eso.

### Q-PROG-005
- **Módulo**: Programas · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Se usa la "verificación" del programa (Aspire Check)? No hay botón visible en la vista tablero.
- **Impacto**: bajo.
- Respuesta: Por ahora no.

### Q-PROG-006
- **Módulo**: Programas · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Quién mantiene los `.crv3d` base por máquina y cuándo se actualizan? ¿Siguen teniendo capas/sellos viejos?
- **Evidencia**: PLAN F3 §1.7.
- **Impacto**: medio.
- Respuesta: Fede se encarga.

### Q-PROG-007
- **Módulo**: Programas · **Estado**: pendiente (decisión de producto, ver backlog)
- **Pregunta**: La vista **lista** es la única con subida manual del `.crv3d`, conciliación y revisión por sello. ¿Alguien la usa? ¿Deberían estas acciones estar en la vista tablero?
- **Impacto**: medio.
- Respuesta: No se.

### Q-PROG-008
- **Módulo**: Programas · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Se van a usar el tiempo de mecanizado y el material real que reporta el gadget (hoy solo se guardan)?
- **Impacto**: bajo.
- Respuesta: Por ahora no, pero me parece interesante que este. La idea es que a futuro si se use.

### Q-PROG-009
- **Módulo**: Programas/Rehacer · **Estado**: documentada (2026-09-28)
- **Pregunta**: Un sello que se rehace sigue vinculado a su programa original (`programa_id`). ¿Debería salir del programa al rehacerse, o volver a fabricarse en el mismo?
- **Evidencia**: `registrar_rehacer` no toca `programa_id`. `getEligibleStamps` solo lista sellos con `programa_id IS NULL`, y `addStampsToProgram` rechaza sellos de otro programa. Resultado probable: el sello rehecho **no aparece** en el panel Vectores y queda dentro de un programa que puede seguir mostrándose como Finalizado (el estado guardado no retrocede). Ver AUD-INC-013.
- **Por qué importa**: un sello a rehacer podría quedar "invisible" para Programas hasta que alguien lo quite a mano del programa viejo.
- **Impacto**: alto.
- Respuesta: Deberia mantenerse en ese programam (para tener trasabilidad de en que programa fallo) pero deberia permitir asignarse a un nuevo programa.

### Q-PROG-010
- **Módulo**: Programas · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Los programas `ABC` se usan? ¿Cómo se arman "a mano"?
- **Impacto**: bajo.
- Respuesta: Se arman a mano ya que no tenemos automatizacion de eso aun.

### Q-PROG-011
- **Módulo**: Programas · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Qué se hace con los sellos que Aspire pone en otra planchuela distinta a la planificada? ¿Es un error o una corrección aceptable?
- **Impacto**: medio.
- Respuesta: Todavia nada, aunque deberia chequearse a futuro.

### Q-PROG-012
- **Módulo**: Programas · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Los largos máximos (C 400 mm, G/XL 250 mm) y la pérdida de corte (0,8 cm) son correctos y fijos? ¿Deberían estar en una pantalla de configuración?
- **Evidencia**: `fabricacion_parametros`, hardcode en edge `programa-sync`; AUD-INC-011.
- **Impacto**: medio.
- Respuesta: Son correctos.