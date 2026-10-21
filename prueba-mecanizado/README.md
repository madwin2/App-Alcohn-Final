# Placa de prueba de mecanizado

Un sello más, en bronce, con filas de pruebas para encontrar dos límites:

- **Límite de mecanizado**: qué llega a cortar la fresa (se mira el bronce con lupa).
- **Límite de uso**: qué marca bien al sellar en **cuero** y en **madera**.

Archivo: [`placa-prueba-34x34.svg`](placa-prueba-34x34.svg). Se regenera con [`generar-placa.mjs`](generar-placa.mjs).

## Cómo fabricarla

| | |
|---|---|
| Medida | **34 × 34 mm**, sin escalar (el dibujo ocupa exacto esa caja) |
| Planchuela | 38 (40 mm real, tope 36,5) |
| Receta | **Clásico**: primera fresa «0,5» a 1,7 mm + repaso con la «0,1» a 0,6 mm |
| Vector | Usar el **original**: si pasa por Revisión, elegir «Original» (la corrección automática lo modificaría y arruina la prueba). No retocar en Aspire. |
| Espejo | Lo hace el gadget, como en cualquier sello: el SVG está al derecho. |

Negro = relieve (lo que queda y marca). Blanco = lo que saca la fresa.

## Qué hay en cada fila

Las celdas se cuentan de **izquierda a derecha** (1 a 8). La letra de la fila está grabada a la izquierda.

**Predicción**: profundidad a la que llega la fresa fina en ese hueco, según la app (V-carve, 30° por lado), en mm. Dos números: con la punta **configurada** (0,2 mm, la que usa el chequeo) / con la punta **física** (0,1 mm). La app hoy exige **0,3 mm** para que se separe bien. La prueba dice cuál de los dos se parece a la realidad y si 0,3 es el mínimo correcto.

### A · Espacio entre trazos
Dos barras negras de 0,7 × 4 mm con un hueco blanco entre medio (como dos letras juntas).

| Celda | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Hueco (mm) | 0,10 | 0,15 | 0,20 | 0,25 | 0,30 | 0,40 | 0,55 | 0,80 |
| Predicción (mm) | 0 / 0 | 0 / 0,04 | 0 / 0,09 | 0,04 / 0,13 | 0,09 / 0,17 | 0,17 / 0,26 | 0,30 / 0,39 | 0,52 / 0,60 |
| La app dice | no entra | no entra | no entra | no entra | se pega | se pega | ok | ok |

### B · Grosor de trazo negro
Líneas negras sueltas de 4 mm de alto (relieve fino). La app hoy no deja afinar por debajo de **0,4 mm**.

| Celda | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Grosor (mm) | 0,15 | 0,20 | 0,25 | 0,30 | 0,40 | 0,50 | 0,60 | 0,80 |

### C · Ojos
Cuadrado negro de 2,8 mm con un agujero blanco redondo (como el ojo de una «e» o una «a»).

| Celda | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Diámetro (mm) | 0,20 | 0,25 | 0,30 | 0,40 | 0,50 | 0,60 | 0,80 | 1,00 |
| Predicción (mm) | 0 / 0,09 | 0,04 / 0,13 | 0,09 / 0,17 | 0,17 / 0,26 | 0,26 / 0,35 | 0,35 / 0,43 | 0,52 / 0,60 | 0,60 / 0,60 |

### D · Recovecos y puntas
Celdas 1-4: ranura blanca en V que entra 2,6 mm en un bloque negro. Celdas 5-8: punta negra de 3 mm de alto.

| Celda | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Ángulo | 20° | 30° | 45° | 60° | 20° | 30° | 45° | 60° |

Qué mirar: hasta dónde llega la fresa dentro de la V (se mide desde la boca, en mm) y si las puntas negras quedan enteras o se redondean / quiebran.

### E y F · Letras Times
La palabra en negro, por alto de la mayúscula. E: «Rabe». F: «Rabeg8».

| Celda | E1 | E2 | E3 | E4 | F1 | F2 |
|---|---|---|---|---|---|---|
| Alto de mayúscula (mm) | 1,0 | 1,3 | 1,6 | 2,0 | 2,5 | 3,2 |

Qué mirar: si se leen, si se pegan las letras, si se tapan los ojos de «a», «e», «g», «8» y si quedan los remates (serif).

### G · Uso real (cuero y madera)
| Celda | Qué es | Qué mirar al sellar |
|---|---|---|
| G1 | Lleno negro de 6 × 5,6 mm | Si marca parejo (sin manchas ni bordes quemados de más) |
| G2 | Rayado: 0,4 mm negro / 0,5 mm blanco | Si las rayas se ven separadas o se empastan |
| G3 | «ALCOHN» en blanco sobre negro (Times, 2,6 mm) | Si se leen las letras huecas |

## Cómo anotar

Para cada celda, en el bronce y en cada material, una nota:

- **0** = no se separa / no se ve
- **1** = se separa apenas (se ve, pero empasta o se corta)
- **2** = bien

Si tienen cómo medir la profundidad en el bronce (comparador, corte, molde), anotarla al lado: es lo que más ayuda a calibrar la simulación. Una foto macro de cada fila también sirve.

| Fila | Celda | Bronce (0-2) | Profundidad (mm) | Cuero (0-2) | Madera (0-2) | Notas |
|---|---|---|---|---|---|---|
| A | 1 | | | | | |
| A | 2 | | | | | |
| … | | | | | | |

## Qué se hace con los resultados

1. Se compara cada celda con la **predicción**: si la realidad se parece a la punta física (0,1) o a la configurada (0,2), y si la profundidad mínima es 0,3 o otra.
2. Se ajustan los umbrales del chequeo de fresa (`src/lib/fresa/config.ts`): espacio mínimo entre letras, ojo mínimo, trazo mínimo (hoy 0,4) y alto mínimo de letra.
3. Con esos números reales, la corrección automática deja de corregir lo que no hace falta y empieza a corregir lo que de verdad se pierde.
