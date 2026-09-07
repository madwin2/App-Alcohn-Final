# Análisis: medida "cargada" vs. medida real de fabricación en los sellos

## 1. El síntoma

El Lua de armado de programa (`ArmarPrograma_Chica.lua`, `_Grande.lua`, `_XL.lua`) importa el SVG de
cada sello y, si su tamaño no coincide con lo que dice el manifest, lo re-escala para que coincida
(`validateAndFixScale`, presente igual en las tres máquinas). El manifest saca `ancho_mm`/`largo_mm`
de `sellos.ancho_real` / `sellos.largo_real` (ver `packageZip.ts:55-56`).

El problema: **`ancho_real`/`largo_real` no es la medida real de fabricación** a pesar del nombre.
Es la medida que el cliente pidió (o la que se tipeó al cargar el pedido), sin ajustar por el margen
que se le recorta a cada plancha de bronce (planchuela). Cuando el vector SVG sí está bien hecho al
tamaño real de fabricación (36.5×36.5, 50×18, 50×11.5, etc.), el Lua lo "corrige" forzándolo al
tamaño nominal incorrecto (40×40, 50×20, 50×12) — es decir, el chequeo de seguridad que se agregó
para otro bug (confusión de unidades del SVG, ver `PLAN_PROGRAMAS.md:85`) hoy **rompe activamente**
los vectores que están bien.

## 2. Trazado técnico del dato

```
Pedido web / carga manual
  -> confirm-web-order/index.ts: parseVariantSizeCm() lee "40x40mm" del carrito/variante
  -> sellos.ancho_real / sellos.largo_real = 4.0 / 4.0 (cm)  <-- medida PEDIDA, tal cual
       (webCart.ts y mappers.ts hacen lo mismo desde otros orígenes de pedido)
  -> nunca se vuelve a tocar: no hay ninguna pantalla en la app que edite
     ancho_real/largo_real después de creado el sello (comprobado, no hay UI para esto)
  -> eligibility.ts / material.ts: resolvePlanchuelaRef() usa el lado menor de
     ancho_real/largo_real para decidir tipo_planchuela (12/19/25/38/63) -- esta parte
     SÍ está bien pensada y coincide con lo que contás (40 -> planchuela 38,
     50x20 -> planchuela 19, 22x21 -> planchuela 25, etc.)
  -> packageZip.ts: buildManifestLua() vuelca ancho_real/largo_real tal cual a
     ancho_mm/largo_mm del manifest.lua
  -> ArmarPrograma_*.lua: validateAndFixScale() escala el SVG importado para que su
     bbox coincida con ancho_mm/largo_mm del manifest
```

Conclusión del trazado: la selección de planchuela (`tipo_planchuela`) ya es correcta y ya vive en
la base. Lo que falta es una medida distinta — la medida a la que **debe quedar cortado el bronce**
— y hoy no existe ningún campo para eso. `ancho_real`/`largo_real` cumple otro rol (decidir
planchuela) y el Lua lo está reusando para lo que no es.

## 3. Por qué no es un problema de fórmula simple

Los casos que describís no siguen una única regla lineal:

| Planchuela (tipo_planchuela) | Ancho nominal de la plancha | Medida real de corte reportada | Margen |
|---|---|---|---|
| 12 | 12 mm | 11.5 mm | 0.5 mm |
| 19 | 20 mm | 18 mm | 2.0 mm |
| 38 | 40 mm | 36.5 mm | 3.5 mm |
| 25 | 25 mm | según el caso — a veces se deja el pedido tal cual (22×21, 20×22) | variable |

El margen no es un porcentaje constante (4% / 10% / 8.75% en los tres primeros casos) ni siquiera es
siempre el mismo valor fijo por plancha: en la planchuela 25 directamente decidís **caso por caso**
si conviene recortar o dejar la medida pedida, según cuánto sobre y cuánto cueste el desperdicio.
Esa decisión hoy vive únicamente en la cabeza de quien arma el sello a mano. Ninguna fórmula
automática en el Lua (ni en la base) puede reproducir ese criterio sin, en algún punto, que una
persona lo confirme.

Esto descarta de entrada una solución "puramente algorítmica y silenciosa": en el mejor caso
acertaría los 4 casos típicos que mencionás; en el peor, metería el mismo tipo de error que hay
hoy pero en la dirección opuesta (recortando de más un sello que en realidad convenía dejar tal
cual, como el 22×21).

## 4. Opciones

### Opción A — Tabla de márgenes fija en el Lua/DB (automática, sin intervención)
Guardar un margen fijo por `tipo_planchuela` (ej. 12→0.5, 19→2.0, 25→?, 38→3.5, 63→?) y que
`validateAndFixScale` (o un paso previo al armar el manifest) calcule `ancho_mm`/`largo_mm` real
como `medida_pedida - margen_de_su_planchuela` automáticamente, sin tocar nada en la app.

- **Ventajas**: cero pasos nuevos para quien arma el pedido; arregla ya los casos "de manual" (38,
  19, 12).
  **Desventajas**: no resuelve el caso 25 (variable), y en general congela en código una regla que
  vos mismo decís que tiene excepciones caso por caso. El día que aparezca una excepción, el
  sistema la va a "corregir" mal en piloto automático y nadie se va a enterar hasta ver el sello
  fabricado — es literalmente el mismo bug que hay hoy, solo que con una tabla mejor en vez de
  ninguna.

### Opción B — Campo "medida verificada" manual, cargado con un popup al subir el SVG
Agregar `ancho_fabricacion_mm` / `largo_fabricacion_mm` (nombre a definir) a `sellos`. Al subir el
vector SVG del sello, un popup mide el bounding box del SVG y pide confirmar/corregir esa medida
antes de guardarla. El manifest y el Lua dejan de usar `ancho_real`/`largo_real` y pasan a usar
este campo nuevo.

- **Ventajas**: la medida que usa el Lua para escalar pasa a ser la que alguien miró y confirmó —
  el chequeo de escala en Aspire vuelve a cumplir su función original (detectar SVGs mal
  exportados), en vez de "corregir" contra un valor que nunca fue la medida real.
  **Desventajas**: paso manual en el 100% de los sellos, incluso en los 3 casos de siempre (38,
  19, 12) que hoy ya sabés de memoria. Más fricción de la necesaria.

### Opción C — Híbrido: fórmula como valor sugerido + confirmación explícita (recomendada)
Mismo campo nuevo que la Opción B (`ancho_fabricacion_mm` / `largo_fabricacion_mm`), pero el popup
al subir el SVG **pre-completa** el valor sugerido usando la tabla de márgenes conocidos por
`tipo_planchuela` (Opción A) en vez de arrancar en blanco o copiar la medida pedida. Quien carga el
sello ve, por ejemplo, "sugerido: 36.5 × 36.5 (planchuela 38)" y solo tiene que aceptar con un
click en el caso típico, o corregirlo a mano en el caso "raro" (22×21 en planchuela 25, un pedido
con medida ya no estándar, etc.). El valor que queda grabado — sugerido y aceptado, o corregido —
es siempre el que confirmó una persona, nunca uno puramente calculado.

El Lua no cambia su lógica interna: sigue leyendo `ancho_mm`/`largo_mm` del manifest y sigue
haciendo el mismo chequeo de tolerancia/escala que ya tiene (bueno para agarrar SVGs realmente mal
exportados). Lo único que cambia es **qué campo de la base alimenta esos dos números** en
`packageZip.ts`.

- **Ventajas**: en el caso típico (38/19/12) el paso extra es un click, no una carga manual desde
  cero. Cubre las excepciones (25 y cualquier caso futuro) porque siempre hay una persona mirando
  el número antes de que quede fijo. Auditable: se puede saber después si un sello quedó con el
  valor sugerido o con uno corregido a mano.
  **Desventajas**: sigue siendo un paso más en el flujo (aunque liviano); requiere migrar datos
  existentes y decidir qué mostrar para sellos ya cargados sin este campo.

## 5. Recomendación

**Opción C.** Resolverlo solo del lado del Lua (Opción A) es tentador porque no toca la app, pero
significa automatizar una decisión que vos mismos me confirmás que no es 100% mecánica (el caso de
la planchuela 25). Eso deja la puerta abierta a reproducir el mismo bug con una tabla más prolija
en vez de resolverlo de raíz. Resolverlo solo con un campo 100% manual (Opción B) es más seguro pero
le suma fricción a cada sello, incluidos los 3 casos que ya se saben de memoria — desperdicia el
hecho de que la mayoría de los casos sí son mecánicos.

El híbrido es el punto donde el sistema hace el trabajo repetitivo (calcular el margen conocido) y
la persona sigue teniendo la última palabra en el 100% de los casos, con menos fricción que cargar
todo a mano. Es exactamente el balance que proponías vos ("un paso más, no el más automático, pero
más seguro").

### Pasos concretos si se avanza con la Opción C

1. **Migración**: agregar `ancho_fabricacion_mm` / `largo_fabricacion_mm` (DECIMAL) a `sellos`,
   nullable. No hace falta backfill inmediato — mientras esté null, `packageZip.ts` puede caer de
   vuelta a `ancho_real`/`largo_real` (comportamiento actual) para no romper programas en curso.
2. **Tabla de márgenes conocidos** (para el valor sugerido del popup), por `tipo_planchuela`, con
   los 3 casos ya confirmados (12→-0.5, 19→-2.0, 38→-3.5) y el caso 25 marcado explícitamente como
   "sin sugerencia automática, cargar a mano" hasta que haya un criterio más claro.
3. **Popup al subir el SVG**: mide el bounding box del SVG subido, muestra medida pedida, medida
   sugerida (si hay margen conocido para ese `tipo_planchuela`) y campo editable para confirmar.
   Guarda en `ancho_fabricacion_mm`/`largo_fabricacion_mm`.
4. **`packageZip.ts`**: `buildManifestLua()` usa `ancho_fabricacion_mm ?? ancho_real` (ídem largo)
   en vez de `ancho_real`/`largo_real` directo.
5. El Lua (`ArmarPrograma_*.lua`) **no necesita cambios** — sigue leyendo `ancho_mm`/`largo_mm` del
   manifest tal cual. Todo el arreglo queda del lado de la app/base, que es donde vive la
   ambigüedad real.
