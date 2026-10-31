# Límites de marca: qué se pierde al sellar y cuándo es grave

> Fuente: [placa de prueba](../../../prueba-mecanizado/README.md) (34 × 34 mm), fabricada dos veces y sellada (fotos del 2026-10-31):
> **con repaso 0,2** (primera fresa + repaso) sellada en **cuero** y en **madera**, y **solo con la primera fresa 0,6** sellada en **cuero**.
> Medidas tomadas del SVG real de la placa (raster de 4 µm); lectura de cada celda en las fotos.
> Fotos: [madera con repaso](../../../prueba-mecanizado/fotos/madera-con-repaso-02.jpg) · [cuero con repaso](../../../prueba-mecanizado/fotos/cuero-con-repaso-02.jpg) · [cuero solo 0,6](../../../prueba-mecanizado/fotos/cuero-solo-06.jpg) · [letras comparadas](../../../prueba-mecanizado/fotos/letras-comparadas.jpg)
> Relacionado: [chequeo de fresa](chequeo-de-fresa.md) · [Q-VEC-007](../../14-open-questions/vectorizacion.md#q-vec-007) · [Q-VEC-017…019](../../14-open-questions/vectorizacion.md#q-vec-017)

**Criterio de esta guía (dueño, 2026-10-31): lo que importa es cómo marca, no cómo queda el bronce.** Si en el bronce se ve pero en la marca no, no sirve. Por eso todo está medido sobre la impresión.

✅ = se vio en la placa · 🔶 = se infiere de lo que se vio (falta confirmar) · ❓ = no se sabe todavía.

---

## 1. Regla rápida (para vectorizar y armar el programa)

Las medidas son **en el sello, a la medida de fabricación**: espacio blanco más angosto entre dos piezas, ancho del ojo (el círculo más grande que entra adentro) y ancho del trazo.

| Qué mirar | Con repaso 0,2 | Sin repaso (solo 0,6) | Si no llega |
|---|---|---|---|
| **Espacio entre letras o piezas** | ✅ **0,45 mm o más:** se separan. **0,35–0,45:** se tocan apenas o queda una rayita. **0,30 o menos:** se tocan siempre | ✅ **0,8 mm o más:** se separan. Menos de 0,6: ni se toca, la zona sale como un bloque | Ver §2: depende de si la letra conserva la forma |
| **Ojo de letra** (a, e, o, b, R, g, 8…) | ✅ **0,7 mm o más:** se ve bien. **0,45–0,7:** se ve chico (puntito o ranurita). **Menos de 0,45:** se tapa | ✅ **1,0 mm:** bien. **0,8:** puntito. **0,6 o menos:** tapado | Ojo tapado = grave en las letras que se reconocen por el ojo (§2) |
| **Texto o dibujo calado** (blanco sobre negro) | ✅ Trazo de **0,5 mm o más:** se ve limpio (rayado G2). **~0,42:** se lee apenas («ALCOHN»). 🔶 Menos de 0,4: no se lee | ✅ 0,5 no aparece | Grave si es texto que hay que leer |
| **Trazo negro fino** (relieve) | ✅ Marca entero desde **0,15 mm** (no se probó más fino) | ✅ Igual | ❓ Cuánto aguanta con el uso: por eso la corrección sigue sin afinar por debajo de 0,4 (Q-VEC-018) |
| **Puntas negras** (estrellas, triángulos, serifas) | ✅ Quedan enteras hasta 20° | ✅ Igual | Nunca es problema |
| **Rincones y V blancas** (adentro de M, V, W, unión de serifas) | ✅ La V se rellena desde el fondo hasta donde mide ~0,4 mm de ancho | ✅ Hasta ~0,7 mm | No cambia la lectura: OK (§2) |
| **Tamaño de letra** (Times, alto de mayúscula) | ✅ **2,5 mm o más:** bien. **2,0:** bien, pero se pegan. **1,6:** se lee con esfuerzo (ojos tapados). **1,3:** apenas, como silueta. **1,0:** no se lee | ✅ **3,2:** se lee pegada (la e casi c). **2,5:** se lee por las panzas. **2,0 o menos:** mancha | Es un atajo: lo que manda son el espacio y el ojo. Una letra negrita o de palo seco tiene ojos más chicos al mismo tamaño |

**Madera y cuero dan casi lo mismo** con el repaso (✅). La madera es apenas peor en ojos chicos: el de 0,5 casi no se ve.

**Sin repaso todo se corre unos 0,35 mm** (✅): lo que con la 0,2 se separa a 0,45 mm, con la 0,6 recién a 0,8. Un sello con texto chico al que no le llega el repaso queda grave, aunque el vector esté bien.

---

## 2. Cuándo es grave y cuándo no

🔶 Propuesta armada con la placa; falta que el equipo confirme qué se acepta entregar ([Q-VEC-017](../../14-open-questions/vectorizacion.md#q-vec-017)). La pregunta es siempre la misma: **¿la marca se lee como el diseño?**

### Grave (rojo): cambia o borra lo que se lee

| Caso | Por qué | Visto en la placa |
|---|---|---|
| **Ojo tapado** (menos de 0,45 mm) en letras que se reconocen por el ojo: **e, a, o, 0, 8, 6, 9, B, g** | La letra cambia: la e pasa a c, la o a punto, la a a mancha | ✅ Sin repaso la e de «Rabeg8» (3,2 mm) queda casi una «c». Con repaso, a y e tapadas desde 1,6 mm para abajo |
| **Letras unidas y además chicas** (mayúscula de menos de ~1,6 mm en Times) **o con los ojos tapados** | Cada letra deja de tener forma propia: la palabra pasa a ser una mancha | ✅ E1 (1,0) ilegible; E2 (1,3) solo se adivina la silueta |
| **Espacio que la fresa no saca** (menos de 0,6 mm sin repaso) | No es solo que se peguen: queda bronce plano y toda la zona marca como un bloque | ✅ Sin repaso, cada «Rabe» salió como un rectángulo con letras adentro |
| **Texto calado con trazos de menos de ~0,45 mm** | Se ve como rayitas sueltas | ✅ «ALCOHN» (trazos de 0,42) apenas se lee con repaso y no aparece sin él |
| **Rayado o líneas que tienen que verse separadas, con blanco de menos de 0,45 mm** | Se empastan en un lleno | ✅ Rayado de 0,5: limpio con repaso, empastado sin él |

### Se nota (ámbar): se lee bien, pero no queda perfecto

| Caso | Visto en la placa |
|---|---|
| **Letras que se tocan en un punto** (remate con remate, pie de la R con la a), con letra de 2 mm o más y ojos abiertos | ✅ «Rabeg8» de 2,5 y 3,2 mm: R–a, a–b y b–e se tocan y la palabra se lee perfecto, en cuero y en madera |
| **Espacio de 0,35–0,45 mm:** se toca apenas o queda una rayita | ✅ Celda A6 (0,40) y los pares e–g (0,36) y a–b (0,37) |
| **Ojo chico** (0,45–0,7 mm): se ve como puntito o ranurita, pero la letra se reconoce | ✅ Ojos de 0,5–0,6 (fila C); la e de 2,5 mm (0,45) y de 3,2 mm (0,58) |
| **Ojo tapado en letras que se reconocen igual por la silueta** (R, P, b, d, p, q) dentro de una palabra que se lee | ✅ En «Rabe» de 1,6 y 2,0 mm se lee la palabra con los ojos chicos o tapados. 🔶 Una letra suelta (una inicial) no tiene ese contexto: ahí es grave |

La medida que separa «se toca en un punto» de «se une» es **cuánto largo de la letra está pegado**, comparado con su altura de minúscula. En la placa:

| Palabra | Altura de minúscula | Largo pegado (a menos de 0,30 mm) | Cómo se lee |
|---|---|---|---|
| Rabeg8 3,2 mm | 2,2 mm | 0,25 mm (solo R–a) · ~12 % | Muy bien |
| Rabeg8 2,5 mm | 1,7 mm | 0,27–0,38 mm · 16–22 % | Bien |
| Rabe 2,0 mm | 1,35 mm | 0,37–0,59 mm · 27–44 % | Bien, se nota pegada |
| Rabe 1,6 mm | 1,1 mm | 0,35–0,64 mm · 33–59 % | Con esfuerzo |
| Rabe 1,3 mm | 0,9 mm | 0,34–0,64 mm · 38–72 % | Solo la silueta |
| Rabe 1,0 mm | 0,7 mm | 0,31–0,78 mm · 46–114 % | No se lee |

Hasta ~25 % se lee sin problema; por encima de ~50 %, junto con los ojos tapados, la palabra se pierde. Es una sola tipografía: hay que confirmarlo con otros casos antes de usarlo como corte.

### OK (sin aviso o gris): no cambia la lectura

- ✅ **Rincones, ranuras y V internas**: la fresa redondea el fondo y la V se rellena desde la punta. En la marca no se nota (fila D, interior de la M, uniones de serifas).
- ✅ **Puntas negras**: quedan enteras.
- ✅ **Trazos negros de 0,15 mm o más**: marcan (con la duda de durabilidad, Q-VEC-018).
- ✅ **Espacios de 0,45 mm o más** y **ojos de 0,7 mm o más** con repaso.

### Qué hacer en cada caso

| Nivel | Al vectorizar | Al armar el programa |
|---|---|---|
| **Grave** | Corregir: separar letras, abrir el ojo, engrosar el calado o agrandar el sello (último recurso, lo confirma quien revisa). Si no se puede sin cambiar el diseño, avisar antes de fabricar | El sello necesita repaso 0,2 en esas piezas. Si aun con repaso queda grave, no se fabrica así |
| **Se nota** | 🔶 Corregir solo si se puede sin deformar (mover letras enteras, como hoy). Si no, se acepta | Repaso en esas piezas |
| **OK** | Nada | Nada |

---

## 3. Resultados por fila (✅)

Profundidad de la app = V-carve con la punta **configurada** (0,2 mm o 0,6 mm). «App hoy» = lo que marca el chequeo de fresa actual (`analyze.ts`, v6) sobre la misma placa.

### A · Espacio entre dos barras

| Hueco (mm) | 0,10–0,25 | 0,30 | 0,40 | 0,50 (rayado G2) | 0,55 | 0,80 |
|---|---|---|---|---|---|---|
| Profundidad app con 0,2 (mm) | 0–0,04 | 0,09 | 0,17 | 0,26 | 0,30 | 0,52 |
| Madera, con repaso | pegado | pegado | rayita | **separado** | separado | separado |
| Cuero, con repaso | pegado | pegado | rayita | **separado** | separado | separado |
| Cuero, solo 0,6 | pegado | pegado | pegado | empastado | pegado | **separado** |
| App hoy (0,2) | grave | grave | grave | **grave** | OK | OK |

### C · Ojo redondo dentro de un cuadrado

| Diámetro (mm) | 0,20–0,30 | 0,40 | 0,50 | 0,60 | 0,80 | 1,00 |
|---|---|---|---|---|---|---|
| Profundidad app con 0,2 (mm) | 0–0,08 | 0,17 | 0,25 | 0,34 | 0,51 | 0,69 |
| Madera, con repaso | tapado | tapado | casi nada | puntito | **bien** | bien |
| Cuero, con repaso | tapado | tapado | puntito | puntito | **bien** | bien |
| Cuero, solo 0,6 | tapado | tapado | tapado | tapado | puntito | **bien** |
| App hoy (0,2) | grave | grave | grave | **OK** | OK | OK |

Un ojo necesita unos 0,2 mm más que un espacio para verse igual de bien. 🔶 Es un cono: el cuero y la madera entran mucho menos en un agujero redondo que en una ranura larga.

### B · Trazo negro suelto (0,15 a 0,80 mm)

Las 8 líneas marcan enteras en los tres sellados. La app no las mira.

### D · V blancas y puntas negras

- Las V blancas (2,6 mm de largo) se marcan desde la boca hasta, más o menos (medido a ojo en la foto):

| Ángulo | 20° | 30° | 45° | 60° |
|---|---|---|---|---|
| Cuero con repaso | ~1,5 mm | ~1,9 mm | ~2,3 mm | casi entera |
| Cuero solo 0,6 | ~0,6 mm | ~1,3 mm | ~1,8 mm | ~2,2 mm |

  Equivale a que la V se rellena donde mide menos de ~0,4 mm de ancho (0,2) o ~0,7 mm (0,6).
- Puntas negras de 20° a 60°: enteras en los tres.

### G · Uso

| Celda | Con repaso (madera y cuero) | Solo 0,6 | App hoy |
|---|---|---|---|
| G1 lleno 6 × 5,6 | parejo | parejo | — |
| G2 rayado 0,4 negro / 0,5 blanco | **rayas separadas, limpias** | empastado | grave (×6) |
| G3 «ALCOHN» calado, Times 2,6 mm (trazos de 0,41–0,44) | se lee apenas | no aparece | grave (6 letras) |

### Letras de las filas (Arial negrita, 1,4 mm)

Ojos de 0,26–0,37 mm: tapados en cuero (la B queda como un cuadrado). Coincide con la regla.

---

## 4. Letra por letra (Times, con repaso)

Espacio = blanco más angosto entre dos letras vecinas. Ojo = ancho del círculo más grande que entra. Lectura: madera y cuero coinciden salvo donde se aclara.

| Palabra (mayúscula) | Espacios (mm) | Ojos (mm) | Qué marcó |
|---|---|---|---|
| Rabe 1,0 | R–a 0,08 · a–b 0,12 · b–e 0,11 | R 0,33 · a 0,24 · b 0,34 · e 0,18 | No se lee. Todo unido, ojos tapados |
| Rabe 1,3 | 0,10 · 0,15 · 0,15 | R 0,43 · a 0,32 · b 0,45 · e 0,23 | Se adivina por la silueta. Unida, todos los ojos tapados |
| Rabe 1,6 | 0,12 · 0,18 · 0,18 | R 0,53 · a 0,39 · b 0,55 · e 0,29 | Se lee. Unida; R y b con ojo chico; a y e tapadas |
| Rabe 2,0 | 0,15 · 0,23 · 0,22 | R 0,66 · a 0,49 · b 0,69 · e 0,36 | Se lee bien. Unida abajo; R y b abiertos; a chica; e tapada (en madera, chica) |
| Rabeg8 2,5 | R–a 0,19 · a–b 0,29 · b–e 0,28 · e–g 0,36 · g–8 0,41 | R 0,82 · a 0,61 · b 0,86 · e 0,45 · g 0,68 y 0,56 · 8 0,80 y 0,85 | Se lee bien. R–a, a–b y b–e se tocan; e–g justo; g–8 separadas. Todos los ojos abiertos; a y e chicos |
| Rabeg8 3,2 | 0,24 · 0,37 · 0,35 · 0,46 · 0,52 | R 1,06 · a 0,78 · b 1,10 · e 0,58 · g 0,87 y 0,72 · 8 1,03 y 1,08 | Se lee muy bien. R–a se toca en el pie; a–b y b–e apenas; e–g y g–8 separadas. Todos los ojos abiertos; e chica |

**Sin repaso (cuero, solo 0,6):** las cuatro «Rabe» salen como un rectángulo y, como mucho, aparece la panza de la R. «Rabeg8» de 2,5 se lee por las panzas (R, b, g, 8), con a y e tapadas. «Rabeg8» de 3,2 se lee, toda unida, con la e casi como una c.

Lo que deja ver la tabla:
- **En Times los espacios entre letras son muy chicos**: aun a 3,2 mm, R–a mide 0,24. Que se toquen es normal y no impide leer. Lo que decide si se lee es que cada letra **conserve los ojos** y tenga tamaño.
- **El ojo que primero se pierde es el de la e** (es el más angosto) y después el de la a. Son los que más cambian la letra.

---

## 5. Por qué pasa (el modelo)

✅ La versión sin repaso coincide **exacto** con la simulación de la app (punta configurada 0,6, 15° por lado):
- hueco de 0,55 → profundidad 0 → pegado;
- 0,8 → 0,37 mm → separado;
- ojo de 0,6 → 0 → tapado; ojo de 0,8 → 0,37 → se ve;
- rayado de 0,5 → 0 → empastado.

✅ Con repaso pasa lo mismo, corrido: al sellar, el material se hunde y cubre el borde de cada blanco. 🔶 En la práctica, cada blanco «se achica» unos 0,3 mm de ancho en la marca (unos 0,15 mm de cada lado). Por eso:
- un espacio de 0,40 deja una rayita y uno de 0,55 queda limpio;
- un ojo, que es un cono, necesita más (unos 0,7 mm).

En profundidad de la app (punta configurada 0,2): un espacio se separa desde **~0,22 mm** y un ojo se ve bien desde **~0,43 mm**. Hoy la app usa 0,3 mm para los dos.

❓ Si manda la punta real (0,1) o la configurada (0,2) no cambia nada de esta guía: las reglas están en **ancho**, que es lo que se mide en el vector.

---

## 6. Qué decía la app antes, comparado con la marca

| Caso | App antes | En la marca | Diferencia |
|---|---|---|---|
| Espacio de 0,45–0,55 (rayado G2, celda A entre 0,40 y 0,55) | Grave | Se separa | **Avisa de más** |
| Letras que se tocan en un punto, letra grande y ojos abiertos («Rabeg8» 2,5 y 3,2) | Grave (7 lugares) | Se lee bien | **Avisa de más**: debería ser «se nota» |
| Ojo de 0,55–0,7 (celda C6, a de 2,5 mm, e de 3,2 mm) | OK | Puntito o ranurita | **Avisa de menos**: debería ser «se nota» |
| Ojo de menos de 0,55 | Grave | Tapado | Bien |
| Letra muy chica (Rabe 1,0–1,3) | Grave en cada par y cada ojo (muchos lugares sueltos) | No se lee la palabra | Bien en el fondo, pero no dice **«la letra es demasiado chica»**, que es la causa |
| Texto calado fino («ALCOHN») | Grave | Apenas se lee | Bien |
| Trazo negro fino (fila B) | No mira | Marca | Bien (falta durabilidad) |
| Rincones y V | Baja/OK | No se nota | Bien |

✅ **Aplicado en el chequeo (2026-10-31, aprobado por el dueño)**, con dos ajustes al comprobarlo contra la placa: el corte de grave del espacio quedó en **0,35 mm** (con 0,30 la celda A5, que se pegó entera, salía como «se nota») y los ojos sin repaso en 0,75 / 0,95 mm (el dibujo redondea el de 1,0 a 0,99). Detalle técnico en [chequeo-de-fresa](chequeo-de-fresa.md). Con eso el chequeo marca en la placa lo mismo que se vio sellando. Lo que se aplicó:
1. **Espacio entre piezas**, tres niveles: grave por debajo de 0,35 mm, «se nota» entre 0,35 y 0,45 (hasta ~0,22 de profundidad), OK desde 0,45.
2. **Letras que se tocan**: «se nota» cuando el tramo pegado es a lo sumo el 50 % de la altura de la pieza más baja y esa pieza mide 1 mm o más (los ojos se avisan aparte). Si no, grave.
3. **Ojos**, umbral propio: grave por debajo de 0,45 mm (profundidad ~0,22), «se nota» entre 0,45 y 0,7, OK desde 0,7 (~0,43). Hoy un ojo de 0,6 pasa como OK.
4. **Aviso de letra chica**: un lugar grave con 3 o más problemas en piezas de menos de 1 mm de alto se muestra como «Letra demasiado chica».
5. **Sin repaso**: los mismos niveles con los anchos de la 0,6 (espacio OK desde 0,8, grave por debajo de 0,65; ojo OK desde 0,95, grave por debajo de 0,75). Se usan en la comparación de pasadas.
6. **Trazo negro mínimo de la corrección (0,4 mm)**: sin cambios hasta saber la durabilidad (Q-VEC-018).
7. **Alimento**: sin cambios (no se sella en cuero ni madera).

---

## 7. Qué no sabemos todavía

- ❓ **Qué se acepta entregar**: ¿«se nota» se fabrica sin corregir? ¿Qué pasa con una inicial suelta con el ojo tapado? ([Q-VEC-017](../../14-open-questions/vectorizacion.md#q-vec-017))
- ❓ **Durabilidad** de trazos negros de 0,15–0,3 mm con el uso ([Q-VEC-018](../../14-open-questions/vectorizacion.md#q-vec-018)).
- ❓ **Otras tipografías y casos** ([Q-VEC-019](../../14-open-questions/vectorizacion.md#q-vec-019)):
  - letra de palo seco, negrita y cursiva;
  - espacio entre palabras y entre renglones;
  - ojos entre 0,6 y 0,8 mm y espacios entre 0,40 y 0,50 mm (entre celdas no hay dato);
  - madera solo con la 0,6;
  - cómo se selló cada material (temperatura, presión, rodillo): los límites valen para esa forma de sellar.
