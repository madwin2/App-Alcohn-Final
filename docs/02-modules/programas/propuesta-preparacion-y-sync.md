# Propuesta: preparar programas en la app y sincronizar cambios con Aspire

**Actualización 2026-10-15:** el [alcance implementado](preparacion-visual.md) incluye editor, controles, comparación de pasadas y sincronización incremental. La migración y los despliegues están pendientes de autorización. Este documento conserva el objetivo completo; la certificación del recorte parcial sin contactos y la simulación volumétrica acumulada aún no están implementadas.

Fecha: 2026-10-15. **Diseño del objetivo completo; alcance inicial implementado localmente y aún sin desplegar.**

Objetivo del usuario: preparar el programa desde Alcohn AI, revisar automáticamente antes que el operario, organizar los sellos sobre el soporte real y llegar a Aspire para sincronizar y guardar los TXT. La exportación automática de TXT queda como una etapa posterior.

## 1. Problema y alcance

Fede concentra vectorización, preparación del programa y operación CNC. El objetivo es que la preparación habitual y sus correcciones ocurran en la app; Aspire calcula y verifica las trayectorias sobre la geometría resultante. El operario revisa las excepciones y confirma el montaje físico.

Automatización completa de la **preparación digital** es el objetivo. Con la información disponible no se puede prometer detección automática de material mal colocado, herramienta instalada incorrecta o cero físico incorrecto: necesitan confirmación del operario o medición externa. Esta distinción delimita qué demuestra cada chequeo.

No se propone modificar ahora estados productivos, consumo de bronce ni automatizaciones. El diseño requiere coordinar Programas, Vectorización, Producción, costos y Stock antes de implementarse.

## 2. Decisiones confirmadas por el usuario

- **POL-079 / Q-PROG-013 (parcial)**: C, G y XL tienen cada una un soporte de fijación fijo. Uso parcial significa cargar menos sellos sobre una planchuela completa: el ejemplo del usuario son cuatro sellos de 50 mm sobre una planchuela de 400 mm. Ese ejemplo describe 200 mm de diseño; para planificar se agregan las separaciones/cortes vigentes, sin cambiar BR-MAT-002. Faltan geometría útil y márgenes exactos. No implica que existan tres CNC físicas: Q-CNC-007 sigue abierta.
- **POL-080 / Q-PROG-014**: conservar lo vendido y registrar aparte cómo se fabrica. El tipo comercial no debe cambiar silenciosamente al elegir una receta de mecanizado.
- **POL-081 / Q-PROG-015 (parcial)**: mantener las correcciones hechas sobre los vectores de Aspire; aplicar sobre ellos cambios compatibles de la app. Pedir decisión solo cuando la misma propiedad cambió en los dos lados. Falta resolver el reemplazo del vector fuente frente a una geometría corregida localmente.
- **POL-082 / Q-PROG-017**: decidir el repaso con la fina «0,1» (física 0,1 mm, configurada 0,2 mm en Aspire) viendo qué detalle falta después de la fresa de 0,5 mm (15° laterales). Elegir solo una parte si no toca el resto; ampliar la selección cuando haga falta para evitar choques, pudiendo incluir todo el sello y evitando partes innecesarias.
- **POL-083/084 / Q-PROG-018**: la fresa llamada «0,5 mm» está configurada como **0,6 mm**, con 15° laterales; la fina tiene punta física 0,1 mm, configurada 0,2 mm en Aspire (Q-PROG-020), 30° laterales y profundidad final **0,6 mm también en Alimento**. Profundidad del mecanizado principal: Clásico 1,7 mm; 3 mm a 3 mm; Alimento a 3 mm más corte perimetral con fresa de 6 mm.
- **POL-085 / Q-VEC-011**: para Alimento, lo ideal es que baste la primera fresa; ≈1 mm era referencia de buen grabado para esa pasada. Si necesita la fina, buscar unos **0,4–0,5 mm**, con máximo 0,6 mm. Rango confirmado; corte rígido de aprobación y tratamiento de advertencias por calibrar.

Las decisiones restantes de este documento son **propuestas**, no reglas vigentes.

**Trabajo manual actual confirmado (Q-PROG-016)**: después del gadget, Fede ajusta vectores, chequea medidas (puede pasarle una diferencia) y decide qué mecanizar con el perfilado fino «0,1» (configurada 0,2 mm en Aspire). Esta última selección también forma parte del trabajo que se busca automatizar; no alcanza con organizar posiciones y tamaños.

## 3. Qué existe hoy (✅ código local)

| Capacidad | Implementación y límite |
|---|---|
| Seleccionar y sugerir sellos | `suggestStampSelection`, `material.ts`, servicio de Programas: prioridad, antigüedad y carga estimada por ancho. No guardan la posición de cada sello sobre el soporte. |
| Medida de fabricación | `fabricationSize.ts`, `ProgramStamp`: se distingue de la medida pedida. El gadget recibe la medida de fabricación si existe. |
| Primer armado | Gadgets C/G/XL: importar, corregir escala, espejar, orientar, apilar, generar auxiliares y recalcular. |
| Preservar ajustes manuales | En Actualizar, un sello reconocido se omite. Eso evita reimportarlo, pero también impide aplicar sobre él una posición, medida o vector nuevos enviados por la app. |
| Identificar presencia | `sellosPresentes`: principalmente `ALCOHN_SELLO_ID` en la marca de Corte; fallback por UUID en capas antiguas. No hay identificación completa demostrada de todos los contornos y auxiliares de cada sello. |
| Comprobar escala | `validateAndFixScale`: compara el lado mayor al importar, con tolerancia relativa del 2 %. No constituye una revisión de ambos ejes de todos los sellos existentes. |
| Revisar fresa | Chequeo y editor SVG disponibles; simulación aproximada. Los resultados se calculan en memoria; no certifican las trayectorias finales de Aspire. |
| Recibir el resultado | Reporte del gadget, `.crv3d`, preview, material y tiempo estimado. El reporte actual no devuelve una geometría editable por sello con sus ajustes locales. |
| Declarar listo | Generar ZIP o confirmar subida del Aspire puede llevar a LISTO. No está condicionado a un informe completo de controles aprobados de esa revisión. |
| Exportar TXT | Manual. La tabla/bucket de trayectorias existe; el flujo automático no está implementado. |

Hallazgos y diferencias entre documentación y código: [auditoría específica](../../audits/programas-automatizacion-2026-10-15.md).

## 4. Experiencia propuesta

Mantener el tablero para elegir programas. Al abrir uno, mostrar una **mesa de preparación** con:

1. **Soporte al centro**, con sus posiciones reales. Distinguir soporte, material declarado y zona útil de mecanizado. Cada sello muestra el vector a escala, identificación y receta.
2. **Sellos pendientes a un lado**, priorizados según el criterio confirmado. Poder agregarlos arrastrando o mediante acciones accesibles sin arrastre.
3. **Propiedades del sello seleccionado**: medida pedida, medida de fabricación, receta de mecanizado, posición, planchuela y separación. Mantener los nombres comerciales como referencia.
4. **Controles agrupados por problema**, con acción para enfocar la pieza afectada. Mostrar qué falta resolver y cuánto sobresale o se superpone, sin exigir revisar manualmente cada sello que ya pasó.
5. **Estado de la sincronización**: cambios pendientes, última revisión aplicada en Aspire y controles de esa revisión. La app no debe presentar una vista vieja del Aspire como si fuera el armado actual.

Acciones útiles:

- Mover al final de la planchuela, reordenar, cambiar a otra planchuela compatible y sacar a pendientes indicando falta de material.
- Escribir una medida exacta o escalar conservando proporción; mostrar la diferencia con lo pedido y con la medida anteriormente confirmada.
- Elegir Clásico, 3 mm o Alimento como **receta de fabricación**, independiente del tipo comercial.
- Ajustar separación entre sellos, fijar una posición y deshacer/rehacer.
- Reacomodar automáticamente solo piezas no fijadas; mostrar resultado y permitir deshacer. No reducir diseños ni cambiar recetas para que entren sin decisión del usuario.
- Sugerir alternativas concretas: otra posición compatible, otra planchuela con material o dejar una pieza para el próximo programa.

Para el trabajo habitual conviene restringir el movimiento a las posiciones válidas del soporte y ordenar dentro de la planchuela. Evita que el operario deba acertar coordenadas al arrastrar. La edición de nodos y letras puede seguir en el editor de fresa existente; no hace falta convertir la mesa de preparación en otro CAD completo.

Para el caso confirmado, representar planchuelas completas y distinguir el largo ocupado del largo total. Poder indicar que no hay material para una posición si ocurre falta de stock, sin presentarlo como inventario físico medido automáticamente. No incluir edición de recortes ni zonas ya mecanizadas como requisito del primer editor: el usuario aclaró que «parcial» se refiere a menor carga de sellos sobre la barra completa.

## 5. Controles propuestos

Dos momentos: **preparación en la app** y **verificación de lo realmente aplicado en Aspire**. Repetir sobre el resultado real los controles que correspondan; una previsualización correcta no demuestra una trayectoria correcta.

| Control | Qué debería comprobar |
|---|---|
| Identidad y cantidad | Cada instancia esperada aparece una vez; no faltan sellos, no hay duplicados ni piezas sin identificar. Pertenencia al programa correcto. |
| Medidas | Ambos lados del diseño final contra la medida de fabricación aceptada; comparar lados largo/corto considerando orientación. Mostrar por separado el desvío respecto a lo vendido. No confundir bounding box del diseño con cortes/offsets auxiliares. |
| Apoyo sobre bronce | El contorno de la pieza terminada, con los márgenes definidos, entra en la zona de material disponible. No basta con que el ancho del diseño sea menor que el ancho nominal de la planchuela. |
| Separación | No hay solapamientos entre piezas y se respetan espacio de corte, márgenes y separación operativa. Medir desde la geometría relevante y el montaje real. |
| Montaje | Plancha correcta en posición correcta; área útil, espesor declarado, límites y zonas de sujeción compatibles. El recorrido previsto no invade zonas de fijación según las operaciones que deban evitarlas. |
| Vector | Geometría válida para cada operación: contornos abiertos donde no corresponde, duplicados, objetos sueltos, auto intersecciones problemáticas, espejo/orientación y versión de diseño. Coincidir en medida no garantiza que el diseño sea el correcto. |
| Fresa | Recalcular al cambiar tamaño, diseño o receta. Analizar la geometría corregida que se va a mecanizar, no solo el SVG original. |
| Mecanizado | Receta correcta, herramientas y profundidades esperadas; selección de vectores completa, operaciones obligatorias presentes y recálculo exitoso. Revisar también planeado, taladrado y cortes. |
| Revisión | Archivo, geometría, montaje, receta y controles corresponden a la misma revisión. Un TXT anterior no queda aprobado por una verificación posterior de otro armado. |

**Propuesta de severidades**: errores geométricos inequívocos (pieza fuera del material, duplicado, pieza faltante, recálculo fallido) impiden declarar esa revisión apta. Las advertencias de diseño requieren una política acordada. Para problemas de fresa sigue abierta Q-VEC-009: no dar por aprobado un nuevo bloqueo o un «confirmar igual» diferente del actual.

**Sin verificar** debe ser un resultado posible. Si falta el largo disponible, un margen físico o el perfil de herramienta, no mostrar un chequeo aprobado por omisión.

Definir con Fede tolerancias absolutas/relativas apropiadas para cada control. Ni el 2 % usado al importar ni el umbral de 6 mm usado en revisión del pedido deben reutilizarse automáticamente como tolerancia final de fabricación.

### Selección del perfilado fino «0,1» (criterio confirmado)

**Operación confirmada** (Q-PROG-017): Fede revisa cómo queda el sello con la fresa de 0,5 mm, de 15° laterales, y decide dónde necesita la fina «0,1» (física 0,1 mm, configurada 0,2 mm en Aspire). Si solo falta un detalle y la pasada sobre ese detalle no toca el resto, elige esa parte. Si toca, incluye las partes necesarias para evitar el choque; puede llegar al sello completo y evita repasar partes innecesarias. El criterio está documentado; la automatización sigue propuesta.

Esto requiere comparar **resultado de la primera pasada**, **mejora posible con la fina** y **efecto de la selección concreta sobre el resto del diseño**. El chequeo actual responde qué problemas quedan con la fina; no demuestra que la primera pasada alcance ni propone una selección de repaso.

Proceso de cálculo propuesto:

1. Representar el resultado de la pasada de 0,5 mm con sus parámetros reales, después de las operaciones previas que correspondan a la receta. Para una primera sugerencia puede usarse una aproximación geométrica; distinguirla del resultado calculado de Aspire.
2. Detectar qué detalle relevante falta respecto del resultado deseado y qué puede resolver la fina «0,1» (configurada 0,2 mm). Si tampoco lo resuelve la fina, señalar que necesita corrección del diseño u otra revisión; no generar una pasada inútil como solución.
3. Proponer la selección más acotada que cubra ese detalle. Mantener todo el diseño como contexto de protección, incluidas piezas e islas excluidas y sus agujeros. Seleccionar un ojo aislado o una letra no puede convertir en vaciable el relieve que quedó fuera de la selección.
4. Calcular la pasada correspondiente y comprobar la huella completa de la herramienta a las alturas relevantes contra las partes que deben conservarse. Comprobar movimientos de corte y entradas/salidas pertinentes; una caja o una distancia en 2D no certifica ausencia de contacto.
5. Si existe contacto no previsto, ampliar con los contornos necesarios y recalcular. La ampliación no garantiza por sí sola que desaparezca el problema: verificar el resultado de cada intento. Puede llegar al sello completo; si tampoco hay una solución comprobada, marcar «Requiere revisión», sin declarar la selección apta.
6. Comparar resultado combinado de ambas pasadas con el objetivo: detalle cubierto y diseño protegido. Reducir recorrido innecesario solo entre opciones que cumplan esos controles. No afirmar que se encontró el mínimo global de tiempo sin medirlo.

La punta más pequeña no garantiza menor ocupación lateral a todas las profundidades: influyen el ángulo del cono, la profundidad y el material que se conserva. Q-PROG-018 aclara que la primera herramienta se llama «0,5» pero está configurada como **0,6 mm**; no usar el nombre para reconstruir su geometría. La fina tiene punta **física 0,1 mm, configurada 0,2 mm en Aspire, y 30° por lado**, con final **0,6 mm** en la descripción de su pasada. Ambas usan V-carve: el tope final no implica profundidad constante en todas las secciones.

| Mecanizado confirmado | Profundidad principal | Operación adicional confirmada |
|---|---|---|
| Clásico | 1,7 mm | Repaso fino cuando hace falta, según POL-082 |
| 3 mm | 3 mm | Repaso fino cuando hace falta, según POL-082 |
| Alimento | 3 mm | Repaso fino hasta 0,6 mm cuando hace falta y corte perimetral con fresa de 6 mm |

El modelo debe distinguir profundidad principal de la del repaso. No comparar las herramientas como si ambas debieran alcanzar el mismo fondo ni exigir a la fina 1,7/3 mm por el solo nombre del mecanizado. Simular el resultado acumulado, tomando en cuenta el material retirado por las operaciones anteriores y el relieve que se conserva.

**Criterio de calidad confirmado para Alimento (POL-085)**: evaluar primero si la primera fresa resuelve el grabado sin repaso fino. El ≈1 mm indicado antes corresponde a esa verificación. Solo donde necesite la fina «0,1» (configurada 0,2 mm), buscar que alcance **unos 0,4–0,5 mm**, con máximo 0,6 mm. No exigir a ambas herramientas la misma profundidad ni aplicar a Alimento el mínimo general de 0,3 mm por defecto.

Esto cambia la recomendación del editor: distinguir «Queda bien con la primera fresa» de «Necesita repaso y la fina alcanza la profundidad buscada». Un detalle puede ser válido con la primera y no necesitar la fina aunque exista una herramienta menor. El objetivo de evitar repaso no autoriza deformar el logo ni cambiar automáticamente medida/receta: cualquier corrección sigue las decisiones y límites ya confirmados.

**Calibración pendiente**: el usuario indicó «0,4 o 0,5» como referencia para el repaso; no se fijó 0,5 mm como obligación ni 0,4 mm como límite duro. Presentar profundidad estimada y contraste con el rango. Definir el corte operativo con casos de Fede (Q-VEC-007) y el tratamiento de advertencias (Q-VEC-009) antes de aprobar/bloquear automáticamente.

**Diferencia detectada y resuelta localmente**: el perfil anterior mezclaba final 3 mm/mínima 1 mm con la herramienta fina. Se separaron principal y fina; Alimento fino usa final 0,6 y referencias 0,4/0,5 mm. AUD-PROG-005 registra el estado previo; la calificación del resultado acumulado y del recorte parcial sigue pendiente.

Elegir Alimento también exige comprobar la huella y el espacio del **corte perimetral de 6 mm**, incluidos vecinos y soporte; no basta con comprobar que el dibujo entra sobre la planchuela. El diámetro de corte, su compensación y los márgenes pertinentes deben participar en la validación del montaje.

Propuesta de experiencia: en la mesa, cada sello indica «Sin repaso», «Repaso parcial», «Repaso completo» o «Requiere revisión». Al seleccionarlo se muestra cómo queda con 0,5 mm, qué detalle mejora la fina «0,1» y qué selección se propone. Si la selección creció, explicar la causa: por ejemplo «Incluye el contorno vecino para evitar invadirlo». Poder incluir/excluir, revisar el efecto y deshacer; una edición manual debe recalcular cobertura y contactos.

El gadget debe aplicar una selección por identidades geométricas, no por número de elemento en una lista. Guardar selección y contexto de protección por ejecución/revisión. Cambiar geometría, tamaño, herramienta, profundidad o receta invalida el análisis; una traslación rígida conserva la selección local solo si también se comprueban los nuevos límites y vecinos del montaje.

**Alternativas para validar**: selección por sello completo simplifica el primer prototipo pero puede sumar recorrido; selección por grupos de contornos permite acercarse al trabajo actual de Fede y exige comprobación adicional. El objetivo sigue siendo automatizar también la selección parcial. Primero comprobar casos reales de Fede: sin repaso, detalle aislado, detalle que obliga a ampliar la selección y sello completo.

**Límite de viabilidad**: no está demostrado que la versión instalada permita extraer/comprobar automáticamente toda la trayectoria necesaria desde el gadget. La documentación actual de [V-Carve de Vectric](https://docs.vectric.com/docs/V12.5/Aspire/ENU/Help/form/VCarve%20Toolpath%20Creator/) relaciona la trayectoria con herramienta y vectores y describe secuencias de herramientas de limpieza, pero no prueba que esa opción equivalga a las dos operaciones actuales ni que exista en la versión instalada. Probar receta, selección y comparación del resultado en archivos de copia antes de prometer validación automática completa.

## 6. Sincronización que preserve los ajustes

La unidad a sincronizar debe ser la **instancia del sello en una ejecución**, identificada de forma estable. No alcanza el nombre de una capa, la posición en la lista ni una marca de Corte aislada.

Separar:

- Identidad y revisión del vector fuente.
- Geometría propia del diseño, incluidas correcciones locales.
- Posición, orientación y escala en el montaje.
- Receta de fabricación.
- Geometría auxiliar derivada: offsets, corte, taladrado y planeado.

Los contornos del diseño y sus auxiliares deben poder vincularse inequívocamente a la instancia y a su función. Hace falta probar qué ocurre con esas identidades al desagrupar, separar, unir, copiar, borrar o editar nodos en la versión instalada de Aspire. Un objeto sin identidad no se debe asignar silenciosamente al sello más cercano.

### Comparar tres estados

En cada sincronización comparar **último estado común**, **app actual** y **Aspire actual**. Comparar por propiedad y con tolerancias adecuadas; no tomar `updated_at` o `dirty` como prueba suficiente de un conflicto geométrico.

| Cambio desde el último estado común | Resultado propuesto |
|---|---|
| App mueve sello; Aspire separó letras | Trasladar los contornos corregidos existentes. Mantener la separación. |
| App cambia tamaño; Aspire corrigió nodos | Aplicar el tamaño solicitado sobre la geometría corregida, conservando proporción. Revalidar ambos lados y apoyo; pedir decisión si ambos cambiaron la medida. |
| Ambos cambian tamaño a valores distintos | Pedir decisión con vista previa, medidas y efecto sobre encaje. |
| Ambos llegan al mismo valor | Aceptar sin preguntar. |
| Aspire cambió tamaño; app no lo cambió | Detectar y reflejar el cambio; revisar según política de medida. No restaurar automáticamente el tamaño antiguo de la app. |
| App cambia receta | Conservar contornos del diseño; regenerar los auxiliares que dependan de la receta y recalcular. |
| App reemplaza el vector; Aspire corrigió su geometría | Conflicto de geometría: no hay una combinación universal segura. Política por confirmar (Q-PROG-015). |
| Se quitó una instancia desde la app | Retirar sus elementos identificados, con posibilidad de recuperación. Resolver antes si también se editó localmente. |
| Falta geometría pero queda la marca de Corte | Informar identidad incompleta; no declararlo presente y correcto por la marca. |

Las transformaciones deben ser **idempotentes**: sincronizar dos veces la misma revisión no vuelve a escalar, espejar, desplazar ni duplicar nada. Definir un anclaje y marco local por instancia; calcular el cambio desde el estado realmente observado. La caja exterior por sí sola no distingue una traslación de un ajuste interno que desplazó una letra.

No escalar indiscriminadamente todos los auxiliares junto con el diseño: agrandar el sello no debe agrandar automáticamente el diámetro del taladro, la herramienta ni una distancia fija de offset. Regenerar esos elementos desde sus parámetros. Si se hicieron correcciones manuales sobre auxiliares, identificarlas y resolver su compatibilidad antes de regenerarlos.

### Devolver a la app lo que quedó

Propuesta: el gadget devuelve por instancia medida real, posición/orientación, receta aplicada, identidad de geometría y resultados de control. Para que la mesa y el chequeo de fresa representen las letras realmente corregidas, también hace falta una representación geométrica utilizable por la app, por ejemplo un SVG normalizado del diseño corregido.

Guardar solo un hash o una miniatura sirve para detectar cambios o mostrarlos, pero no alcanza para volver a verificar geometría. La extracción y normalización de contornos debe validarse mediante una prueba en Aspire; no se da por disponible por la existencia del reporte actual.

### Evitar que una subida vieja apruebe cambios nuevos

Versionar el contenido de fabricación. El gadget descarga revisión N y reporta que aplicó N. Si la app ya está en N+1, guardar N como resultado anterior sin borrar los cambios pendientes ni declarar N+1 listo.

El informe y el archivo deben vincularse a la misma revisión/operación, con reintentos idempotentes. Si falla subida o recálculo, mostrar el paso pendiente y permitir reintentar sin volver a importar todo. Conservar una versión recuperable antes de una actualización que altere el trabajo.

## 7. Datos propuestos y efectos sobre otros módulos

Nombres conceptuales; no son un esquema SQL aprobado:

| Entidad | Datos necesarios |
|---|---|
| Configuración de soporte | Posiciones físicas, coordenadas/origen, ancho permitido, límite útil, zonas de sujeción y versión. Compartida por app y gadget. |
| Material de la corrida | Planchuela completa por posición, disponibilidad declarada y espesor si la receta lo requiere. Distinguir longitud total y longitud ocupada; no asumir recortes. |
| Instancia de fabricación | Identidad estable, sello de origen, ejecución, geometría/revisión, medida efectiva, posición, receta y cambios aceptados. |
| Receta versionada | Operaciones, identificadores de herramienta, nombres visibles y parámetros geométricos configurados por separado, profundidades y selecciones por mecanizado. Incluir repaso fino/contexto protegido (POL-082), profundidades/corte de POL-083/084 y criterios separados de primera pasada/repaso de Alimento (POL-085). |
| Revisión y resultado | Estado esperado, último estado común, estado observado en Aspire, informe de validación y archivos asociados. |

Esta separación permite conservar lo vendido y también el historial de cada intento, necesario para el problema ya confirmado de Rehacer (Q-PROG-009). Es una propuesta de evolución: no obliga a resolver todo el historial de fabricación en el primer incremento.

**Material y costos**: hoy se calculan desde campos del sello y su planchuela; si una ejecución usa otra medida, receta o planchuela, el consumo debe poder registrar la ejecución efectiva. De lo contrario, el editor puede mostrar una planchuela y Stock/costos registrar otra. Requiere diseño y autorización de los cambios de DB correspondientes; no duplicar consumo al sincronizar.

**Estados**: separar preparación, sincronización y validación de fabricación. Propuesta de etiquetas: «En preparación», «Pendiente de sincronizar», «Requiere decisión», «Sincronizado con problemas» y «Apto para generar TXT». No reemplazan todavía el CHECK existente. Cambiar geometría o receta invalida la aprobación de esa revisión; el estado Haciendo/Hecho sigue referido al trabajo físico.

**Automatizaciones**: antes de implementar, revisar los triggers de dirty, costo, máquina, estado y bronce. Sincronizar geometría no debe marcar Hecho, generar consumos ni disparar por accidente los efectos de Rehacer. Consultados [triggers](../../08-automations/triggers.md) y [cron](../../08-automations/cron.md); no se ejecutaron escrituras.

## 8. Alternativas y orden recomendado

| Alternativa | Ventaja | Costo o límite |
|---|---|---|
| App organiza; Aspire solo aplica; ajustes de diseño se hacen en la app | Menos conflictos y un único editor de geometría | Restringe el trabajo actual en Aspire y no cubre el requisito de conservar sus correcciones sin trasladarlas primero. |
| App y Aspire sincronizan por instancia y propiedad | Cubre el flujo pedido y permite excepciones locales | Exige identidad persistente, devolución de geometría, revisiones y manejo explícito de conflictos. **Recomendada para el objetivo pedido.** |
| Regenerar todo desde los SVG | Implementación más simple | Pierde correcciones de Aspire; incompatible con el requisito confirmado. |

Orden de implementación propuesto:

1. **Prueba de sincronización en archivos de copia**: un sello corregido, trasladado, escalado, con cambio de receta y dos sincronizaciones consecutivas. Probar desagrupar/copiar y conflictos; demostrar conservación e idempotencia antes de construir todo el editor.
2. **Unificar modelo físico y recetas**: configurar soporte/material, anchos útiles, márgenes y operaciones, incluida la selección del perfilado fino. Resolver diferencias actuales con Fede. Empezar validando una configuración, luego repetir en las otras.
3. **Mesa de preparación**: mover, reordenar, cambiar planchuela, medida y receta; deshacer; controles en vivo. Datos de ejemplo claramente identificados hasta confirmar el montaje físico.
4. **Circuito completo de sincronización y validación**: ida/vuelta, vista real en la app, conflictos y aprobación vinculada a una revisión. Cerrar diferencias contra `.crv3d` y montaje observado.
5. **TXT**: exportación desde Aspire con postprocesador correcto, agrupación/orden de herramientas definidos y archivos asociados a la revisión validada. Primero descarga; más adelante automatizar la entrega a la PC/CNC.

La documentación oficial confirma que los gadgets pueden manipular geometría y trayectorias: [Vectric Developer Info](https://gadgets.vectric.com/developerinfo). La compatibilidad de cada operación y de la exportación debe probarse con la versión realmente instalada; no inferirla solo desde documentación de versiones más nuevas.

## 9. Criterios de aceptación del flujo futuro

- Separar letras en Aspire y mover el sello en la app conserva las letras corregidas y su separación.
- Escalar modifica el diseño existente una sola vez; no deforma la proporción ni cambia el diámetro del taladro por arrastre.
- Dos sincronizaciones iguales producen el mismo resultado, sin vectores ni auxiliares duplicados.
- Cambios simultáneos de propiedades diferentes se combinan; un conflicto real se presenta una sola vez con alternativas concretas.
- La mesa de la app y los chequeos corresponden a la geometría recibida de Aspire y a una revisión identificada.
- Un programa con piezas fuera del material o recálculo fallido no se presenta como apto por el solo hecho de subir un archivo.
- La subida de N no aprueba N+1; una edición invalida únicamente la validación afectada y deja los archivos anteriores identificados.
- Elegir Alimento aplica su receta comprobada; no cae silenciosamente en Clásico.
- La simulación usa los 0,6 mm configurados de la herramienta llamada «0,5», no deduce el diámetro desde su nombre. Distingue profundidad principal y repaso fino.
- Al cambiar a Alimento se incorpora y verifica el corte perimetral con fresa de 6 mm y se revalida su efecto sobre el montaje.
- La selección del perfilado fino responde al criterio confirmado de Fede y queda vinculada al diseño sobre el que se calculó. No se reutiliza una selección anterior sin comprobar su correspondencia.
- Caso sin repaso: la pasada de 0,5 mm ya da el resultado aceptado; no se añade la fina «0,1» solo por existir la herramienta.
- Alimento distingue ≈1 mm como referencia de la primera pasada y unos 0,4–0,5 mm para los detalles que requieren repaso fino. No usa final 3 mm ni mínima 1 mm para la fina, ni convierte el rango en un umbral rígido sin calibración.
- Caso parcial: una zona necesita la fina y el cálculo del repaso no invade partes excluidas; se conserva una selección acotada.
- Caso con vecinos: la selección inicial invadiría otras partes; se amplía y recalcula hasta obtener un resultado comprobado. Seleccionar todo no se acepta como garantía automática.
- Caso imposible con ambas: no se oculta la limitación bajo un repaso completo; se pide revisar el diseño o la receta.
- Los datos comerciales originales se conservan; medida/material/receta reales quedan registrados para la ejecución.
- Los programas antiguos sin identidades completas tienen un camino explícito de revisión o migración; no se intenta inferir asociaciones dudosas automáticamente.

## 10. Información todavía necesaria

- Q-PROG-013: geometría/márgenes del soporte. Uso parcial ya aclarado: menos sellos sobre barra completa. Q-CNC-007: relación entre configuraciones y CNC físicas.
- Q-PROG-014: política y tolerancias de revisión cuando se cambia la fabricación respecto de lo vendido, sin modificar el pedido.
- Q-PROG-015: reemplazo de diseño y alcance de los ajustes que deben volver desde Aspire.
- Q-PROG-016/017/018 documentadas: tareas, selección y parámetros principales confirmados, incluida profundidad fina de Alimento a 0,6 mm. Falta calibrar tolerancias de calidad y contacto con casos aceptados por Fede; medir frecuencia/tiempo si se quiere priorizar por esfuerzo.
- Q-VEC-011 documentada: Alimento preferentemente sin repaso; referencia ≈1 mm en primera pasada y unos 0,4–0,5 mm si requiere la fina. Q-VEC-007/008/009: calibración de umbrales, herramientas por receta y tratamiento de advertencias. La fina de Alimento ya usa final 0,6 mm y referencias 0,4/0,5 mm (análisis v6; AUD-PROG-005 resuelto).

No se ejecutaron migraciones, llamadas a producción ni cambios funcionales para preparar esta propuesta.
