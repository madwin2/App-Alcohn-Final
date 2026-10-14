# Preguntas abiertas — Vectorización

### Q-VEC-001
- **Módulo**: Vectorización · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cuál era el "programa de escritorio" de vectorización y se sigue usando? ¿Cuándo se vectoriza a mano (Illustrator u otro)?
- **Evidencia**: changelog #4.
- **Impacto**: medio.
- Respuesta: Ya no, ahora pasamos a vectorizar desde la app. Se vectoriza a mano desde illustrator (archivos que son dificiles para la automatizacion o cosas especificas que define quin hace el vector)

### Q-VEC-002
- **Módulo**: Vectorización · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Qué editor se usa para retocar la imagen base y cuál es el criterio de "imagen lista para vectorizar"?
- **Impacto**: medio.
- Respuesta: Usamos ia por lo general, chat gpt.

### Q-VEC-003
- **Módulo**: vector-worker · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Se piensa reactivar la vectorización automática (worker Python) o se abandona?
- **Impacto**: bajo.
- Respuesta: Por ahora estamos con como esta ahora que es con vectorizer. Funciona mucho mejor de lo que logramos con python.

### Q-VEC-004
- **Módulo**: Vectorización · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Quién revisa los vectores y con qué criterio se rechaza uno? ¿Hay un presupuesto de créditos de Vectorizer.AI?
- **Impacto**: medio.
- Respuesta: Fede o quien haya mandado a hacer le vector. El criterio es si es fidedigno o no al diseño y si tiene las cosas bien, lineas rectas bien hechas, sin deformaciones, etc.

### Q-VEC-005
- **Módulo**: Vectorización · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Qué hacer con los ~345 vectores viejos en EPS (no importables por el gadget)? ¿Se re-vectorizan solo cuando se rehacen?
- **Evidencia**: PLAN F3 §1.4.
- **Impacto**: medio.
- Respuesta: No pasa nada, ya no se usan. Ya fabricados.

### Q-VEC-006
- **Módulo**: Vectorización · **Estado**: abierta
- **Pregunta**: Dos PCs (o dos usuarios) pueden vectorizar el mismo sello si el primero todavía no confirmó, porque la cola de Revisión vive en el navegador. ¿Marcar el sello en la base al vectorizar (p. ej. `EN_PROCESO`) y ocultarlo de pendientes? ¿Cómo liberar sellos "colgados" si se borra el navegador?
- **Evidencia**: cola IndexedDB + `pushReviews`; fix 2026-10-01 solo cubre misma PC / pestañas.
- **Impacto**: medio (créditos duplicados entre dispositivos).


### Q-VEC-007
- **Módulo**: Vectorización / chequeo de fresa · **Estado**: pendiente
- **Pregunta**: Los umbrales del chequeo de fresa se calibraron a ojo con 10 vectores reales: rincones dentro de una misma pieza de menos de 0,15 mm² se ocultan como "rincón chico" (la fresa siempre los redondea) y las zonas de menos de 0,03 mm² no se informan. ¿Coincide con lo que Fede corrige en Aspire? ¿Hay casos que marca y no importan, o que no marca y sí importan?
- **Evidencia**: `DEFAULT_ANALYSIS_OPTIONS` en `src/lib/fresa/config.ts`; [chequeo-de-fresa](../02-modules/vectorizacion/chequeo-de-fresa.md).
- **Por qué importa**: si marca de más, el equipo deja de mirarlo; si marca de menos, vuelve el trabajo manual en Aspire.
- **Impacto**: medio.

### Q-VEC-008
- **Módulo**: Vectorización / chequeo de fresa · **Estado**: pendiente
- **Pregunta**: ¿La fresa fina (cónica 60°, punta 0,1 mm, mínimo 0,4 mm de 0,6 mm) es la misma para todos los tipos de sello (Clásico, 3 mm, Alimento, Lacre)? El chequeo hoy usa un único perfil.
- **Evidencia**: Q-CNC-008 respondió para "el mecanizado de detalle" sin distinguir tipo; el tipo 3 mm usa "cónico 3 mm" según el SOP.
- **Impacto**: medio.

### Q-VEC-009
- **Módulo**: Vectorización / chequeo de fresa · **Estado**: pendiente
- **Pregunta**: Hoy confirmar un vector con lugares donde la fresa no llega **solo pide confirmación** ("Revisar" / "Confirmar igual"). ¿Debería bloquearse, o pedir un motivo, o está bien así?
- **Por qué importa**: es una regla de negocio; no se inventó un bloqueo.
- **Impacto**: bajo.
