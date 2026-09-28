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
