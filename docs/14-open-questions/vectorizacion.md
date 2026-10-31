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
- **Avance (2026-10-31)**: la placa de prueba da anchos reales de lo que marca y lo que no, y muestra dónde avisa de más (letras que se tocan en un punto, espacios de 0,45–0,55) y de menos (ojos de 0,55–0,7). Ver [limites-de-marca §6](../02-modules/vectorizacion/limites-de-marca.md) y Q-VEC-017.

### Q-VEC-008
- **Módulo**: Vectorización / chequeo de fresa · **Estado**: parcialmente respondida (2026-10-14: Alimento pide 1 mm, ver Q-VEC-011; el resto usa 0,3 mm)
- **Pregunta**: ¿La fresa fina (cónica 60°, punta 0,1 mm, mínimo 0,4 mm de 0,6 mm) es la misma para todos los tipos de sello (Clásico, 3 mm, Alimento, Lacre)? El chequeo hoy usa un único perfil.
- **Evidencia**: Q-CNC-008 respondió para "el mecanizado de detalle" sin distinguir tipo; el tipo 3 mm usa "cónico 3 mm" según el SOP.
- **Impacto**: medio.

### Q-VEC-009
- **Módulo**: Vectorización / chequeo de fresa · **Estado**: pendiente
- **Pregunta**: Hoy confirmar un vector con lugares donde la fresa no llega **solo pide confirmación** ("Revisar" / "Confirmar igual"). ¿Debería bloquearse, o pedir un motivo, o está bien así?
- **Por qué importa**: es una regla de negocio; no se inventó un bloqueo.
- **Impacto**: bajo.

### Q-VEC-010
- **Módulo**: Vectorización / chequeo de fresa · **Estado**: documentada (respondida 2026-10-14)
- **Pregunta**: ¿Qué puede hacer la corrección automática para que la fresa pase? ¿Grosor mínimo del trazo negro, se pueden mover letras, escalar, qué pasa con los ángulos?
- **Respuesta**:
  - Trazo negro mínimo: **0,4 mm**.
  - **Mover sí** (Fede lo hace), respetando alineaciones y la coherencia del diseño. Ej.: 4 palabras alineadas a la izquierda → si hay que separar una letra, se corre hacia la derecha.
  - **Escalar**: en lo posible no; si es muy necesario, sí, pero lo confirma quien revisa (no implementado todavía).
  - **Ángulos**: están bien así; la fresa no llega a la profundidad final pero pasa a ~0,1 mm y quedan marcados.
  - Modo: automático (elige la mejor operación y muestra el resultado).
- **Documentado en**: [chequeo-de-fresa §4](../02-modules/vectorizacion/chequeo-de-fresa.md#4-cómo-corrige--fixts-layoutts-movesvgts-exportsvgts), [ADR-024](../13-decisions/ADR-024-chequeo-de-fresa-en-vectorizacion.md).

### Q-VEC-011
- **Módulo**: Vectorización / chequeo de fresa · **Estado**: documentada (2026-10-15: criterio de las dos pasadas de Alimento aclarado; calibración de umbrales pendiente en Q-VEC-007)
- **Pregunta**: ¿El detalle se hace con V-carve (la fresa sube donde no entra)? ¿Cuál es la profundidad mínima para que algo se separe? ¿Cambia por tipo de sello? ¿Qué zonas tienen que llegar sí o sí?
- **Respuesta**:
  - **V-carve**.
  - **0,3 mm** es lo mínimo mínimo.
  - **Alimento** necesita más: **1 mm**.
  - Zonas: entre letras distintas y en ojos de letras tiene que llegar a la mínima; en ángulos, ranuras y rincones alcanza con que marque (tabla aprobada).
- **Interpretación anterior (2026-10-15, superada en cuanto a profundidad fina)**: Alimento con final 3 mm y mínima ≈1 mm se había aplicado también al chequeo de la herramienta fina.
- **Aclaración definitiva de profundidad (2026-10-15, Q-PROG-018)**: la primera fresa se llama «0,5», está configurada como 0,6 mm y tiene 15° laterales. El repaso usa punta 0,1 mm, 30° laterales y profundidad final **0,6 mm también en Alimento**. Alimento tiene mecanizado principal a **3 mm** más corte perimetral con fresa de **6 mm**.
- **Respuesta sobre calidad (2026-10-15)**: el milímetro indicado para Alimento era una referencia de verificación para que quede buen grabado con la **primera fresa, llamada «0,5»**. El objetivo ideal es que los sellos de Alimento **no necesiten la de 0,1 mm**. Si necesitan repaso fino, se busca que esa pasada alcance **al menos unos 0,4–0,5 mm**, dentro de su máximo de 0,6 mm. No exigir 1 mm a la fina ni sustituir ese criterio por el mínimo general de 0,3 mm.
- **Alcance de la respuesta**: se confirmó una preferencia y un rango operativo; no se eligió entre 0,4 y 0,5 mm como corte rígido de aprobación. Calibrar con casos reales en Q-VEC-007 y definir el tratamiento de advertencias en Q-VEC-009 antes de imponer bloqueos. Análisis v6: `FRESA_ALIMENTO` (repaso) quedó con final 0,6 mm y referencia inferior 0,4 mm (0,5 como preferida); la primera fresa se compara aparte con `primaryProfile` (Alimento 3 mm, referencia 1 mm). Cierra la diferencia de AUD-PROG-005.
- **Actualización (2026-10-31)**: para el perfil general (y la principal fuera de Alimento), el mínimo de 0,3 mm se reemplazó por los límites de marca medidos sellando la placa de prueba (espacio 0,45 mm ≈ 0,22 de profundidad; ojo 0,70 mm). Alimento sigue igual. Ver [limites-de-marca](../02-modules/vectorizacion/limites-de-marca.md).
- **Documentado en**: [chequeo-de-fresa §2–3](../02-modules/vectorizacion/chequeo-de-fresa.md), [ADR-024](../13-decisions/ADR-024-chequeo-de-fresa-en-vectorizacion.md).

### Q-VEC-012
- **Módulo**: Vectorización / chequeo de fresa · **Estado**: documentada (respondida 2026-10-15)
- **Pregunta**: En **texto en arco** pegado a un aro, la corrección acerca o aleja del centro **todo el tramo** (hasta 0,8 mm, como con renglones rectos). Cuando el tramo está encajado entre dos aros y eso no alcanza, corre **una letra sola** fuera del arco, hoy hasta **0,15 mm** (valor provisorio, `MAX_ARC_LETTER_RADIAL_MM`). ¿Está bien correr una letra sola fuera de su arco? ¿Hasta cuánto?
- **Evidencia**: "Rockets Butchery" (40 mm): con letra sola se resuelven C, O, ' y S (0,04–0,09 mm); sin esa opción quedaban pegadas al aro.
- **Por qué importa**: es una regla de cuánto se puede cambiar el diseño; si una letra se sale mucho del arco se nota.
- **Impacto**: bajo.
- **Respuesta**: se puede ajustar lo que se necesite sin deformarlo mucho. "Fuera de su arco" = esa letra sola se acerca o se aleja del centro, así que queda un poco corrida respecto de la curva de sus vecinas. Se tomó como tope el **8 % del alto de la letra**, entre 0,15 y 0,35 mm (a esa escala no se nota a simple vista).
- **Documentado en**: [chequeo-de-fresa §4](../02-modules/vectorizacion/chequeo-de-fresa.md).

### Q-VEC-013
- **Módulo**: Vectorización / corrección automática · **Estado**: documentada (respondida 2026-10-21)
- **Pregunta**: ¿Qué es «confiable» en números para que la app guarde una corrección sola, sin que nadie la mire? Propuesta: un tipo de caso pasa a «aplica sola» con ≥ 95 % de propuestas aceptadas sin cambios en ≥ 100 casos y ningún rehacer por vector en ese período. ¿Qué error no se acepta nunca (por ejemplo, que cambie un logo de marca)?
- **Por qué importa**: define cuándo se activa cada nivel de autonomía ([PLAN_CORRECCION_AUTONOMA_VECTORES §7](../../PLAN_CORRECCION_AUTONOMA_VECTORES.md)).
- **Impacto**: alto.
- **Respuesta**: **90 %** de aceptación sin cambios → la app guarda sola y marca para revisar (nivel 3); **95 %** → autónoma con revisión por muestreo (nivel 4). La cantidad mínima de casos y qué error no se acepta nunca quedan para definir con los datos.
- **Documentado en**: [PLAN_CORRECCION_AUTONOMA_VECTORES §7](../../PLAN_CORRECCION_AUTONOMA_VECTORES.md).

### Q-VEC-014
- **Módulo**: Vectorización / registro de ediciones · **Estado**: documentada (respondida 2026-10-21)
- **Pregunta**: Al editar un vector a mano, ¿Fede quiere marcar el motivo con un toque (por ejemplo «letras pegadas», «ojo tapado», «no me gustó cómo quedó») o solo se registra lo que hace?
- **Por qué importa**: el motivo ayuda a aprender más rápido, pero suma un paso. Sin motivo, se deduce de las operaciones y del chequeo.
- **Impacto**: medio.
- **Respuesta**: alcanza con registrar lo que se hace; no se pide motivo.
- **Documentado en**: [PLAN_CORRECCION_AUTONOMA_VECTORES §4](../../PLAN_CORRECCION_AUTONOMA_VECTORES.md).

### Q-VEC-015
- **Módulo**: Vectorización / prueba de mecanizado · **Estado**: documentada (respondida 2026-10-31)
- **Pregunta**: ¿Cómo se puede medir la profundidad del corte en la placa de prueba de bronce (comparador, corte de la pieza, molde, otra forma)? ¿O solo se evalúa si se separa y cómo marca?
- **Por qué importa**: con la profundidad se calibra la simulación directamente; sin ella, solo se sabe el límite (sí/no) de cada celda.
- **Impacto**: medio.
- **Respuesta**: lo que importa es **cómo marca**, no cómo queda el bronce: si en el bronce se ve pero en la marca no, no sirve. Se evalúa sobre la impresión en cuero y madera.
- **Documentado en**: [limites-de-marca](../02-modules/vectorizacion/limites-de-marca.md).

### Q-VEC-016
- **Módulo**: Vectorización / corrección automática · **Estado**: documentada (respondida 2026-10-21)
- **Pregunta**: ¿Hay sellos que nunca deberían corregirse solos, aunque la app esté segura (Alimento, logos de marca registrada, pedidos de prueba, clientes particulares)?
- **Por qué importa**: quedarían siempre para revisión manual, en cualquier nivel de autonomía.
- **Impacto**: medio.
- **Respuesta**: los sellos de **3 mm** no se modifican nunca automáticamente. Ya aplicado en Revisión: la corrección automática se calcula y se puede elegir, pero no queda elegida sola ni se usa al «Confirmar todos». Los demás tipos (Alimento, logos de marca) no se mencionaron: se revisa si aparece un caso.
- **Documentado en**: [chequeo-de-fresa §4 ter](../02-modules/vectorizacion/chequeo-de-fresa.md), [PLAN_CORRECCION_AUTONOMA_VECTORES §7](../../PLAN_CORRECCION_AUTONOMA_VECTORES.md).

### Q-VEC-017
- **Módulo**: Vectorización / chequeo de fresa · **Estado**: abierta en parte (2026-10-31: el dueño aprobó aplicar los niveles; siguen abiertas la letra suelta y los clientes)
- **Pregunta**: Con la placa de prueba se propusieron tres niveles: **grave** (cambia o borra lo que se lee), **se nota** (se lee bien pero no queda perfecto: letras que se tocan en un punto, ojo chico, rayita en vez de espacio) y **OK**. ¿Un sello con solo «se nota» se fabrica sin corregir? ¿Una letra suelta (inicial, monograma) con el ojo tapado es grave aunque se adivine por la silueta? ¿Hay clientes o tipos de sello donde «se nota» tampoco se acepta?
- **Evidencia**: «Rabeg8» de 2,5 y 3,2 mm con letras que se tocan se lee perfecto; la app hoy lo marca grave. Ojos de 0,6 mm salen como un puntito y la app los da OK.
- **Por qué importa**: define qué marca la ayuda visual en rojo y qué corrige la automática; sin esto se sigue corrigiendo de más en unos casos y de menos en otros.
- **Impacto**: alto.
- **Respuesta parcial (2026-10-31)**: «Sí, aplicalos». Los tres niveles quedan en el chequeo: grave en rojo, «se nota» en ámbar (la corrección automática lo intenta resolver sin deformar, igual que antes), OK sin aviso. Falta decidir la letra suelta con el ojo tapado y si hay clientes o tipos de sello donde «se nota» tampoco se acepta.
- **Documentado en**: [limites-de-marca §2 y §6](../02-modules/vectorizacion/limites-de-marca.md), [chequeo-de-fresa](../02-modules/vectorizacion/chequeo-de-fresa.md).

### Q-VEC-018
- **Módulo**: Vectorización / chequeo de fresa · **Estado**: abierta (2026-10-31)
- **Pregunta**: En la placa, los trazos negros de **0,15 a 0,8 mm** marcan enteros. ¿Cuánto aguanta un trazo fino (0,15–0,3 mm) con el uso (muchas marcas a fuego, golpes, limpieza)? ¿Se hace una prueba de uso, o la corrección sigue sin afinar por debajo de 0,4 mm (Q-VEC-010)?
- **Por qué importa**: si 0,2–0,3 aguantan, la corrección podría abrir ojos y espacios que hoy deja para editar a mano.
- **Impacto**: medio.

### Q-VEC-019
- **Módulo**: Vectorización / prueba de mecanizado · **Estado**: abierta (2026-10-31)
- **Pregunta**: La placa probó **Times** con un solo modo de sellado. ¿Se hace una segunda placa con letra de palo seco, negrita y cursiva, espacio entre palabras y entre renglones, ojos entre 0,6 y 0,8 mm y espacios entre 0,40 y 0,50 mm? ¿Cómo se selló cada material en esta prueba (madera a fuego, temperatura; cuero con qué presión o rodillo)?
- **Por qué importa**: los límites de [limites-de-marca](../02-modules/vectorizacion/limites-de-marca.md) valen para esa tipografía y esa forma de sellar. Una negrita tiene ojos más chicos al mismo tamaño.
- **Impacto**: medio.
