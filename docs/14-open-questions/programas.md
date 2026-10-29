# Preguntas abiertas — Programas

### Q-PROG-024
- **Módulo**: Programas / gadget Aspire · **Estado**: documentada (2026-10-23)
- **Pregunta**: Si al sincronizar un sello da error (por ejemplo «fuera del ancho útil»), ¿el gadget debe frenar todo (como hoy: no genera ni recalcula ninguna trayectoria) o seguir con el resto y dejar ese sello sin trayectorias para revisarlo?
- **Contexto**: hoy es todo o nada (`SyncPreparation.run`). Con un sello mal, nada del programa queda listo para la CNC.
- **Por qué importa**: seguir parcialmente acelera el día, pero arriesga mecanizar con un sello fuera de la planchuela o mandar a fabricar un programa incompleto que después se marca Hecho entero.
- **Impacto**: alto.
- **Respuesta (2026-10-23)**: «Que siga con el resto de los sellos y deje afuera el que falla, avisando claramente».
- **Documentado en**: POL-096 y [gadget Aspire](../02-modules/programas/gadget-aspire.md). Para evitar los dos riesgos: el sello afuera pasa a una capa que ninguna plantilla toma (no se mecaniza) y el programa **no queda habilitado para fabricar en la app** hasta sacarlo de la mesa, guardar y volver a correr el gadget (así no se marca Hecho junto con los demás).

### Q-PROG-023
- **Módulo**: Programas / mesa de armado · **Estado**: documentada (2026-10-17)
- **Pregunta**: Para una excepción por sello, ¿se modifica la separación entre diseños o el margen del diseño a ambos cortes? ¿Se permite bajar del mínimo vigente de 8 mm entre diseños?
- **Contexto confirmado por el usuario**: imantado obligatorio, reordenamiento sin posiciones libres, reacomodo al cambiar tamaño y «Al final» debajo del último sello. También pide poder aumentar/reducir excepcionalmente el espaciado.
- **Evidencia**: `preparationRules.json` exige 8 mm entre diseños; `executionPlan` sitúa el corte 4 mm por debajo de cada diseño. Cambiar solo el hueco no aumenta ambos márgenes del sello.
- **Por qué importa**: una excepción de margen cambia los auxiliares de Aspire; no equivale a mover únicamente el sello siguiente.
- **Respuesta del usuario**: «lo que yo quiero es que sea exactamente esa distancia. ni mas ni menos».
- **Documentado en**: [BR-PROG-019](../04-business-rules/programas-y-material.md), [ADR-027](../13-decisions/ADR-027-mesa-de-armado.md) y [manual](../manual/05-programas.md). La mesa conserva exactamente 8 mm entre diseños y los cortes vigentes a 4 mm debajo; no se agrega ajuste excepcional de espaciado.

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
- **Evidencia**: `registrar_rehacer` no toca `programa_id`. Antes: `getEligibleStamps` exigía `programa_id IS NULL` y `addStampsToProgram` rechazaba sellos de otro programa. Ver AUD-INC-013.
- **Por qué importa**: un sello a rehacer podía quedar "invisible" para Programas hasta que alguien lo quite a mano del programa viejo.
- **Impacto**: alto.
- Respuesta: Deberia mantenerse en ese programam (para tener trasabilidad de en que programa fallo) pero deberia permitir asignarse a un nuevo programa.
- **Implementado (2026-10-29)**: elegibles incluyen Rehacer con `programa_id`; al agregar a un programa nuevo se transfiere (POL-017 / B-07).

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

### Q-PROG-013
- **Módulo**: Programas / soporte y material · **Estado**: parcial (2026-10-15)
- **Pregunta**: ¿Cada soporte tiene posiciones y anchos de planchuela fijos, o se pueden montar distintos anchos en la misma posición? ¿Cuáles son los límites útiles, márgenes y zonas de sujeción de cada montaje? ¿Se usan tramos más cortos que el máximo nominal?
- **Contexto**: el usuario propone representar el soporte de aluminio en la app y mover sellos entre planchuelas. Los gadgets tienen coordenadas y anchos efectivos propios; el modelo de la app calcula carga por ancho, sin posiciones físicas ni material disponible por tramo.
- **Por qué importa**: determina dónde se puede soltar un sello y qué significa que quede fuera del material. La capacidad de la máquina no demuestra la existencia de bronce montado.
- **Impacto**: alto. Relacionada con Q-CNC-004 y Q-CNC-007.
- **Respuesta (2026-10-15)**: cada máquina C, G y XL tiene su soporte de fijación fijo. A veces se usa completo y a veces parcialmente.
- **Documentado en**: POL-079 y [propuesta de preparación y sincronización](../02-modules/programas/propuesta-preparacion-y-sync.md).
- **Aclaración (2026-10-15)**: uso parcial significa cargar menos sellos sobre una planchuela completa; ejemplo del usuario: planchuela de 400 mm con cuatro sellos de 50 mm ocupa 200 mm de diseño. No se confirmó uso de recortes ni sectores ya mecanizados. Para planificar hay que sumar también las separaciones/cortes definidos; el ejemplo no cambia BR-MAT-002.
- **Pendiente**: geometría y márgenes físicos exactos. La respuesta no resuelve por sí sola Q-CNC-007 (cantidad de CNC físicas).

### Q-PROG-014
- **Módulo**: Programas / medida y mecanizado · **Estado**: documentada (2026-10-15; política confirmada, implementación pendiente)
- **Pregunta**: Al agrandar un sello o elegir otro mecanizado desde Programas, ¿se actualiza la medida de fabricación del sello y su tipo comercial, o se guarda una configuración de fabricación para esa ejecución, conservando lo vendido? ¿Qué diferencias requieren revisión?
- **Contexto**: el usuario pide cambiar tamaño y elegir 3 mm, Clásico o Alimento. Hoy el manifest usa medidas de fabricación del sello y deriva el mecanizado desde su tipo; no existe una receta independiente por ejecución.
- **Por qué importa**: cambiar medida o tipo puede modificar costos, consumo de bronce, avisos a Producción y datos del pedido. No se debe definir esa política por una suposición técnica.
- **Impacto**: alto.
- **Respuesta (2026-10-15)**: conservar lo vendido y registrar aparte la fabricación.
- **Documentado en**: POL-080 y [propuesta de preparación y sincronización](../02-modules/programas/propuesta-preparacion-y-sync.md). Los umbrales de revisión de cambios siguen pendientes de definición.

### Q-PROG-015
- **Módulo**: Programas / sincronización Aspire · **Estado**: documentada (2026-10-15; calificación de la implementación pendiente)
- **Pregunta**: Si la misma propiedad (por ejemplo tamaño o posición) cambió tanto en Aspire como en la app desde la última sincronización, ¿qué versión se conserva? ¿Los ajustes de geometría hechos en Aspire deben volver a la app para que su representación y chequeos reflejen el resultado real?
- **Respuesta confirmada (2026-10-15)**: el usuario pide conservar los vectores ya ajustados en Aspire y aplicar sobre ellos los cambios de organización o tamaño pedidos desde la app, evitando reinsertar el vector original.
- **Respuesta sobre conflictos (2026-10-15)**: pedir una decisión solo cuando cambió la misma propiedad en los dos lados. Combinar automáticamente cambios compatibles de distintas propiedades.
- **Documentado en**: POL-081 y [propuesta de preparación y sincronización](../02-modules/programas/propuesta-preparacion-y-sync.md).
- **Implementación (2026-10-15)**: el informe devuelve SVG/caja por instancia; se muestran sin pisar el plan y se pueden adoptar medidas/posición explícitamente. Fuente reemplazada frente a geometría corregida se resuelve como conflicto de la misma propiedad. [Detalle](../02-modules/programas/preparacion-visual.md). Q-PROG-015 queda documentada; despliegue y calificación nativa pendientes.
- **Por qué importa**: preservar un objeto sin reimportarlo no resuelve por sí solo conflictos entre dos editores; la app podría mostrar y validar una geometría anterior.
- **Impacto**: alto.

### Q-PROG-016
- **Módulo**: Programas / trabajo manual en Aspire · **Estado**: documentada (2026-10-15)
- **Pregunta**: En un programa típico, después de correr el gadget, ¿qué tareas hace hoy Fede a mano y cuáles son las más frecuentes? Además de separar vectores, cambiar tamaños y guardar TXT, ¿ajusta offsets, taladrado, cortes, selección de capas, herramientas o trayectorias?
- **Contexto**: Q-CNC-008 describe correcciones del diseño; el repositorio muestra generación de elementos auxiliares y recálculo, pero no demuestra la secuencia real completa del operario.
- **Por qué importa**: permite comprobar que la propuesta cubra el trabajo real necesario para llegar a «sincronizar y guardar TXT», y priorizar por frecuencia y tiempo.
- **Impacto**: alto.
- **Respuesta (2026-10-15)**: Fede ajusta los vectores, chequea medidas (aunque puede pasarle una diferencia) y decide qué mecanizar y qué no con el perfilado de 0,1 mm.
- **Documentado en**: [propuesta de preparación y sincronización](../02-modules/programas/propuesta-preparacion-y-sync.md), [gadget Aspire](../02-modules/programas/gadget-aspire.md) y [FR-03](../10-operational-boundaries/README.md#fr-03).
- **Seguimiento**: criterio del perfilado en Q-PROG-017; no se inventó una regla de selección.

### Q-PROG-017
- **Módulo**: Programas / selección del perfilado fino · **Estado**: documentada (2026-10-15; criterio operativo confirmado, automatización pendiente)
- **Pregunta**: ¿«Perfilado de 0,1 mm» se refiere a la fresa de punta 0,1 mm de Q-CNC-008 o a otra operación? ¿Fede decide por sello completo o por contornos/partes? ¿Con qué criterio incluye o excluye una parte (detalle que la anterior no hizo, acabado, tiempo, fragilidad u otro)?
- **Contexto**: Q-PROG-016 confirma que esta selección se hace a mano después del gadget. El chequeo de fresa actual estima accesibilidad del V-carve; no demuestra qué regiones necesitan una operación adicional.
- **Por qué importa**: para automatizar la preparación completa hay que reproducir el criterio real y distinguir geometría que no se puede mecanizar de geometría que ya fue resuelta por otra herramienta. Es una regla de negocio/proceso que no se debe inferir por el nombre de la operación.
- **Impacto**: alto.
- **Respuesta (2026-10-15)**: sí, la herramienta fina es la de punta 0,1 mm. Fede observa cómo queda el sello tras la pasada de la fresa de 0,5 mm, con ángulo lateral de 15°, y determina qué necesita la de 0,1 mm. Puede elegir el sello entero o partes del dibujo. Si solo falta un detalle y la pasada fina sobre esa parte no entra en contacto con el resto del sello, elige solo esa parte. Si toca otras partes, amplía la selección con las partes necesarias para evitar el choque, evitando mecanizar las demás cuando puede.
- **Documentado en**: POL-082, [propuesta de preparación y sincronización](../02-modules/programas/propuesta-preparacion-y-sync.md), [chequeo de fresa](../02-modules/vectorizacion/chequeo-de-fresa.md), WF-04 y FR-03.
- **Seguimiento**: parámetros exactos de ambas pasadas en Q-PROG-018. La selección cualitativa confirmada no define todavía tolerancias numéricas de acabado ni un algoritmo de verificación.

### Q-PROG-018
- **Módulo**: Programas / perfiles y profundidades de las dos pasadas · **Estado**: documentada (2026-10-15; parámetros principales y repaso de Alimento confirmados)
- **Pregunta**: ¿0,5 mm es el diámetro de la punta de la primera fresa? ¿La fina de punta 0,1 mm sigue teniendo 30° por lado, como Q-CNC-008? ¿Qué profundidades inicial/final se usan en cada pasada y cambian según Clásico, 3 mm o Alimento?
- **Contexto**: Q-PROG-017 confirma primera herramienta de 0,5 mm con 15° laterales y repaso de punta 0,1 mm. El chequeo implementado solo modela la fina; la información previa de profundidad es 0,6 mm general y 3 mm Alimento para el detalle, sin describir la primera pasada ni todas las recetas.
- **Por qué importa**: para comparar qué deja una herramienta y qué mejora la otra hay que considerar el perfil completo y la profundidad, incluidos contactos laterales. Una punta menor no demuestra un menor ancho del cono a todas las alturas. No se debe configurar una simulación de producción suponiendo esos datos.
- **Impacto**: alto.
- **Respuesta (2026-10-15)**:
  - «0,5 mm» es el **nombre** de la primera fresa; está **configurada como 0,6 mm**. Mantiene el ángulo lateral de **15°** confirmado en Q-PROG-017. El análisis debe distinguir nombre de parámetros geométricos; no deducir 0,5 mm de su etiqueta.
  - La primera pasada es **V-carve**: donde no puede alcanzar la profundidad final, sube hasta donde entra en esa sección.
  - La de punta **0,1 mm sigue igual**: **30° por lado**, V-carve, profundidad final **0,6 mm** en la descripción de esta pasada.
  - Profundidades por mecanizado: **Clásico 1,7 mm**, **3 mm a 3 mm**, **Alimento a 3 mm más corte perimetral con fresa de 6 mm**.
- **Documentado en**: POL-083/084, [propuesta de preparación y sincronización](../02-modules/programas/propuesta-preparacion-y-sync.md), [SOP de fabricación](../11-operations-sops/fabricar-un-sello.md) y [chequeo de fresa](../02-modules/vectorizacion/chequeo-de-fresa.md).
- **Confirmación posterior (2026-10-15)**: **también en Alimento la de punta 0,1 mm llega hasta 0,6 mm**. Esto corrige la interpretación anterior del detalle de Alimento a 3 mm; esa profundidad corresponde al mecanizado principal. AUD-PROG-005 se resolvió localmente con final fino 0,6, referencia inferior 0,4 y comparación a 0,5; se agregó la primera herramienta al análisis.
- **Seguimiento**: Q-VEC-011 ya documenta el criterio de Alimento: ideal resolver con la primera fresa (≈1 mm como referencia de buen grabado); si requiere la fina, buscar unos 0,4–0,5 mm, con final 0,6 mm (POL-085). Calibrar el rango antes de usarlo como umbral rígido. Profundidades iniciales y demás parámetros de trayectoria deberán verificarse en las recetas de Aspire antes de implementar.

### Q-PROG-019
- **Módulo**: Programas / calificación de Aspire · **Estado**: parcial (2026-10-15)
- **Pregunta**: ¿Qué versión de Aspire usa Fede y dónde están las bases y plantillas vigentes para probar el flujo real?
- **Respuesta**: Aspire 10.5; base C `Archivo Base Maq C.crv3d`, facilitada localmente por el usuario. G y XL se validarán después.
- **Comprobado**: contenedor de la base indica Aspire **10.514**; coincide con la aplicación instalada. Se trabaja con una copia en una carpeta temporal, conservando el original.
- **Comprobado después**: selectores/herramientas de las 12 plantillas; ocho trayectorias válidas para Clásico/3MM y nueve para Alimento. Cinco sincronizaciones locales con importación, mezcla, movimiento/escala sin reimportar y detalle interior, guardado y respaldos. Informe/subida simulados sin red.
- **Pendiente**: programas representativos y límites físicos con el operario; bases G/XL. Las muestras no certifican acabado físico ni producción.
- **Grande (usuario, 2026-10-20)**: dos planchuelas, 38 mm (centro 50,65) y 12,7 mm reales (en la app 12 por márgenes; centro 94,4, como el gadget). Largo útil **250 mm desde donde empieza el primer sello**. Usa **las mismas fresas y trayectorias que la Chica**: se usan las 12 plantillas de la Chica. El archivo «28_09_G_CHECK» tiene las mismas 9 trayectorias de Clásico (capas y profundidades) con fresas de una versión anterior; no se usa como referencia. Falta: el dibujo de la base en el fondo y la prueba en Aspire con el gadget nuevo.
- **XL (usuario, 2026-10-20)**: como el gadget: una planchuela de 63 mm, centro 31,5, el primer sello empieza 1 mm debajo del borde. Largo útil **250 mm desde el primer sello**. Mismas fresas y plantillas que la Chica. Separación entre sellos: **8 mm, igual que en las otras máquinas** (el gadget anterior usaba 4 mm en la XL).
- **Comprobado 2026-10-16**: ocho SVG ficticios y dos revisiones descargadas desde el editor de la app, aplicadas en Aspire real con instrumento local; quince trayectorias válidas y vista previa de mecanizado. Tras corrección interna, p19 → p38 y 12×30 →16×40 conservan la huella editada y los ocho IDs, con cero reimportaciones. Informe/subida sin red; no cambia los pendientes anteriores. [Evidencia](../audits/programas-aspire-real-2026-10-16.md).
- **Documentado en**: [preparación visual](../02-modules/programas/preparacion-visual.md), [validación](../audits/programas-preparacion-validacion-2026-10-15.md).

### Q-PROG-020
- **Módulo**: Programas / receta real de C · **Estado**: documentada (2026-10-15)
- **Pregunta**: ¿La herramienta llamada «0,1» usa efectivamente punta de diámetro 0,2 mm como la base C, o hay que reemplazar esa configuración? ¿Los «perfilados» interior/exterior guardados (inicio 0,5; pasada fina 0,6) son las trayectorias vigentes que el equipo llama V-carve, o se cambian luego al armar el programa?
- **Evidencia**: `InspectBase.lua` ejecutado sobre copia en Aspire 10.514 exportó 12 plantillas. Principal: herramienta de punta 0,6; repaso: nombre `Grabado (30.0°, Tip 0.2 - 3.18 mm)`, `FlatRadius(true)` ≈0,1. Plantillas de repaso: Profile Outside / Profile Inside, inicio 0,5, profundidad de pasada 0,6 y selector automático desactivado/sin capas. Principal también figura Profile Outside, profundidad 1,7 o 3 e inicio 0,5.
- **Impacto**: el nombre comercial no equivale al diámetro; una simulación de V-carve desde superficie no describe automáticamente estas plantillas. No modificar herramienta/tipo/inicio de las recetas por inferencia. La selección automática completa/parcial necesita configurar el método vigente.
- **Relacionado**: Q-PROG-017/018, Q-VEC-007/009. No invalida la respuesta del usuario; registra la discrepancia con el archivo facilitado.
- **Respuesta**: la fresa física es de **0,1 mm**, configurada deliberadamente en Aspire como **0,2 mm** para dar juego favorable si está algo rota/desgastada. El perfilado fino se selecciona manualmente; los demás mecanizados usan selección automática. Inicio **0,5 mm** porque el planeado previo baja esa cantidad; se conserva un único Z0 y las profundidades de grabado se miden desde la superficie planeada.
- **Documentado**: análisis v6 usa diámetro configurado 0,2 y conserva diámetro físico 0,1 como dato separado. Las plantillas nativas conservan inicio 0,5; no sumar/restar otra vez en el análisis geométrico relativo al planeado. No cambiar el tipo de trayectoria por su nombre coloquial.

### Q-PROG-021
- **Módulo**: Programas / selección del repaso interior y exterior · **Estado**: documentada (2026-10-15)
- **Pregunta**: ¿Qué contornos selecciona Fede para cada uno de los dos perfilados finos de la base C (exterior e interior)? ¿Exterior para bordes externos del relieve e interior para ojos/huecos, o existe otro criterio?
- **Contexto**: Q-PROG-020 confirma selección manual; la base guarda ambas trayectorias sin selectores automáticos. La regla de ampliar selección para evitar contactos (Q-PROG-017) no identifica cómo se distribuyen entre esas dos operaciones.
- **Impacto**: seleccionar automáticamente los mismos vectores para ambas puede mecanizar del lado incorrecto. Hace falta confirmar la correspondencia antes de sustituir la selección manual.
- **Respuesta**: Fede generalmente selecciona el **sello completo** para el perfilado fino habitual. El perfilado interior se reserva para un caso puntual: solo necesita repasar el interior de una letra o detalle interno, y evita el resto. No es una separación automática de todos los contornos externos e internos en cada sello.
- **Documentado en**: [preparación visual](../02-modules/programas/preparacion-visual.md). La asignación parcial específica requiere calificación antes de generarse automáticamente.

### Q-PROG-022
- **Módulo**: Programas / receta Alimento en C · **Estado**: documentada (2026-10-15)
- **Pregunta**: ¿Alimento usa los mismos cajeados/perfilado de 3 mm de la base C y luego `Corte Forma`? ¿Ese perímetro conserva inicio 3,5 mm y pasada 5,5 mm de la plantilla facilitada, y se realiza después del repaso fino?
- **Evidencia**: la base C tiene operaciones automáticas para `VECTOR 3MM`, pero ninguna para `VECTOR ALIMENTO`/`Corte Alimento`. `Corte Forma` es manual, sin número de etapa; herramienta de 6 mm, Profile Outside, inicio 3,5 y pasada 5,5. Q-PROG-018 confirma profundidad principal 3 mm y perímetro con fresa de 6 mm, sin identificar esta plantilla ni sus parámetros.
- **Por qué importa**: asociar una plantilla por su nombre no demuestra la receta vigente. Hay que confirmar trayectoria y secuencia antes de automatizar el corte perimetral. Se continúa calificando Clásico/3MM sin inventar los parámetros de Alimento.
- **Impacto**: alto.
- **Respuesta**: el usuario confirma los mismos mecanizados de 3 mm, seguidos de `Corte Forma` con fresa de 6 mm, inicio 3,5 mm y pasada 5,5 mm, después del repaso fino.
- **Documentado**: POL-088 y [preparación visual](../02-modules/programas/preparacion-visual.md). Se reutilizan los bytes de las plantillas 3MM y se adaptan únicamente sus selectores a las capas de Alimento mediante el SDK; el perímetro manual recibe `Corte Alimento`. No se modifican herramienta ni profundidades del archivo.

### Q-PROG-024
- **Módulo**: Programas / simulación del mecanizado en la mesa · **Estado**: respondida (2026-10-17)
- **Respuesta (usuario, 2026-10-17)**: (a) sí, taladrado y roscado se hacen previamente del lado de atrás; está bien que la vista no los muestre. (b) la planchuela tiene **10 mm**; se planea 0,5 mm y el corte baja 9 mm desde la cara planeada, así que los sellos quedan unidos por **0,5 mm**. Aplicado en `FIXTURE.barHeightMm = 10` y en la profundidad del corte (`barSegments`).
- **Pregunta**: (a) ¿«0 Taladrado» (broca Ø5 a 6,5 mm) y «0 Roscado» (Ø4,8 a 5 mm), en el centro de cada sello, se hacen del lado de atrás, antes de dar vuelta la planchuela? (b) ¿Cuánto mide de espesor la planchuela en bruto? El perfil del SVG de la base la dibuja de 11,13 mm y el «5 Corte 6MM» baja a 9 mm: ¿deja ~2 mm sin cortar a propósito (los sellos se separan después) o la planchuela es más fina?
- **Evidencia**: plantillas nativas de la base C (`Native-001`…`012`): capa «Taladrado» = círculo de 6 mm en el centro del diseño; Zmin del taladrado −6,5 y del roscado −5; corte «Profile On» sobre la línea «Corte», inicio 3,5 y pasada 5,5 (Zmin −9).
- **Por qué importa**: la simulación de la mesa no muestra el taladrado (si fuera del frente atravesaría el diseño) y dibuja el corte como ranura hasta −9 mm sobre una planchuela de 11,13 mm. Sin la respuesta, la vista puede mostrar un material o una separación que no es la real.
- **Impacto**: medio (solo visualización; no cambia trayectorias ni reglas de armado).
- **Relacionado**: POL-089, ADR-027.

### Q-PROG-025
- **Módulo**: Programas / gadget · sello tipo Personalizado · **Estado**: abierta (2026-10-22)
- **Pregunta**: Para que el gadget aplique solo el mecanizado de un sello Personalizado: (a) ¿cuál es la profundidad del exterior («1 Cajeado 6MM») en Clásico? (b) ¿Fede puede exportar plantillas nativas de taladrado y roscado para M5 y M4, y una de perfilado recto con fresa de 1 mm (con su etapa y profundidad)? (c) ¿Se puede probar en la PC de la C que Aspire acepte una plantilla con la profundidad cambiada y una capa propia por sello?
- **Contexto**: el tipo y su configuración ya se guardan desde Pedidos y se ven en la mesa ([mecanizado personalizado](../02-modules/pedidos/mecanizado-personalizado.md)). La base solo tiene la rosca M6, y no tiene perfilado recto de 1 mm. La profundidad de cada trayectoria está fija en su plantilla.
- **Impacto**: alto para automatizar; mientras tanto Fede ajusta esas trayectorias a mano en Aspire.
- **Relacionado**: Q-PROG-018, Q-PROG-024, [gadget-aspire](../02-modules/programas/gadget-aspire.md).
