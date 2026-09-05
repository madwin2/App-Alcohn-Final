# Plan funcional — Pestaña "Programas"

> Documento de diseño para que un programador (o Cursor) lo implemente paso a paso.
> No incluye código de la app todavía — es la lógica de negocio, el modelo de datos y la arquitectura de automatización con Aspire.
>
> Fuentes usadas para armar este plan:
> - Código actual de `src/components/programas/**`, `src/lib/hooks/usePrograms.ts`, `src/lib/state/programs.store.ts`, `src/lib/supabase/services/programs.service.ts` (todo es un prototipo desconectado de la realidad, ver sección 1).
> - Esquema real de Supabase (proyecto `dgbyrejfcqearevvzdmf`): tablas `programa`, `sellos`, `ordenes`, `stock_items`, `stock_movements`, `bronce_consumo`, `fabricacion_parametros`, `vector_jobs`.
> - `Vectric Lua Interface Documentation.md` (API de Lua de Aspire/VCarve — gadgets, import de vectores, plantillas de toolpath).

---

## 0. Decisiones confirmadas con el usuario

Todas las decisiones que quedaban abiertas en la primera versión de este plan ya se resolvieron. Quedan reflejadas en el resto del documento; este resumen es solo para referencia rápida:

1. **Automatización**: se va con el **Gadget en Lua** (Opción A). Descartado el ejecutable externo/UI automation.
2. **Alcance de máquinas**: el módulo automatiza **C, G y XL**. **ABC queda fuera por ahora** — los sellos ABC se siguen armando a mano, sin paquete/gadget (el módulo de Programas puede seguir permitiéndolos administrativamente si hace falta, pero sin generar ZIP para esa máquina).
3. **Largo máximo de planchuela por máquina** (validación dura, bloqueante): **C = 400mm, G = 250mm, XL = 250mm**, por cada planchuela individual (cada ancho de planchuela dentro del programa se valida contra este máximo, no es un total agregado entre anchos distintos).
4. **Archivo `.crv3d` base**: uno por máquina (C, G, XL) — el mismo archivo sirve para todos los tipos de sello (Clasico/3mm/Lacre/Alimento) dentro de esa máquina. No varía por tipo.
5. **Convivencia con el dropdown manual de Aspire**: **reemplazo total**. Programas pasa a ser el único camino para tandas de fabricación; el dropdown manual de `estado_aspire` en Producción queda solo como atajo para una pieza suelta fuera de un programa.
6. **Al quitar un sello de un programa**: se muestra un **pop-up** que deja elegir entre mantener el estado de fabricación que tenía antes de ser programado, o asignarle uno nuevo ahí mismo.
7. **Al borrar un programa**: **DELETE físico** de la fila (no se guarda como `CANCELADO`).

---

## 1. Estado actual (auditoría)

- La pestaña **existe pero está deshabilitada** en el nav: `src/components/pedidos/Sidebar/Sidebar.tsx:42` tiene `{ ..., label: 'Programas', path: '/programas', disabled: true }`. Es lo único que hay que tocar para "destaparla" cuando esté lista — no hay flag de feature en backend.
- Todo el módulo de Programas es **UI de prototipo, no funcional**:
  - `NewProgramForm.tsx` arma un objeto y hace `console.log`, nunca llama a `createProgram`.
  - `ProgramCard.tsx` guarda `isVerified`, `fabricationState`, `isLocked` en **estado local de React** (`useState`), no persiste nada en Supabase. Al refrescar la página se pierde todo.
  - `StampsSelectionDialog.tsx` muestra una lista de **8 sellos hardcodeados** (`availableStamps`), no consulta la tabla `sellos`.
  - Los botones "Eliminar programa" y "Descargar programa" del menú contextual (`ProgramCard.tsx`) solo hacen `console.log`.
  - `programs.service.ts` sí tiene CRUD real contra Supabase (`getPrograms`, `createProgram`, `updateProgram`, `deleteProgram`), pero **no está conectado a la UI** todavía, y no contempla nada de bloqueo, generación de archivo, ni consumo de material.
- **Ya existe un mecanismo paralelo y manual** para "programar" un sello, que este módulo tiene que absorber o convivir con él (ver sección 10):
  - En la tabla Producción, la celda `CellFabricacionAspire` deja elegir a mano un `estado_aspire` (`Aspire G`, `Aspire G Check`, `Aspire C`, `Aspire C Check`, `Aspire XL`) por sello.
  - Un trigger de Postgres (`migration_add_programado_retocar.sql`) fuerza `estado_fabricacion = 'Programado'` automáticamente cuando `estado_aspire` no es null.
  - Existe además una columna `sellos.programa_nombre` (texto libre) que hoy se usa solo para *mostrar* el nombre del programa en `CellFabricacion.tsx`, totalmente desacoplada de la FK real `sellos.programa_id` → `programa.id`.
  - Conclusión: hoy "programar" = tocar un dropdown por sello, sin ningún control de máquina, material ni archivo. La pestaña Programas tiene que **reemplazar esto de punta a punta** (ver sección 10 para el plan de convivencia/migración).

---

## 2. Objetivo del módulo

1. Agrupar sellos pendientes de fabricar en **Programas** (una tanda de trabajo para una máquina y una fecha).
2. Que armar un programa sea rápido y a prueba de errores: mostrar solo sellos elegibles, calcular automáticamente cuánto material (planchuela) se usa, avisar si algo no está listo (sin vectorizar, por ejemplo).
3. Al descargar un programa, entregar un paquete que permita abrir Aspire y terminar de armar el trabajo (importar vectores + aplicar toolpaths) con la mínima intervención manual posible, sin el bug de escala que tuvo la versión vieja.
4. Bloquear un programa una vez descargado/enviado a producción para que nadie lo desarme por error mientras se está fabricando, con una vía explícita de desbloqueo si hace falta corregir algo.

---

## 3. Arquitectura de automatización con Aspire (confirmada: Gadget en Lua)

Esto es lo más importante para no repetir el problema viejo. **Decisión tomada: Gadget en Lua**, sin automatización de interfaz externa. Queda documentado el razonamiento y la alternativa descartada, para no perder el contexto de por qué.

### Cómo funcionaba antes (según tu descripción)
Un ejecutable externo (probablemente automatizando la interfaz de Windows/Aspire — clicks y teclas, no la API de Lua) abría el `.crv3d` base y, por cada vector: lo importaba desde el diálogo de importar, y apretaba `F1`/`F2`/`F3` (atajos de teclado que vos habías asignado a gadgets/plantillas de toolpath) para aplicar los pasos 1-2-3. El problema: los vectores eran **SVG**, y el import de SVG en Aspire es ambiguo en unidades (px a 96dpi vs mm), por eso aparecían con otra medida.

### Lo que dice la documentación de Lua de Aspire
La API de Lua de Aspire (`VectricJob()`) permite, **dentro de un script que corre adentro de Aspire** (un Gadget):
- `job:ImportSVG(pathname)` y `job:ImportDxfDwg(pathname)` — importan vectores y **dejan la selección activa** después de importar.
- `job:ImportBitmap(pathname)` / `job:ImportSTLDirect(pathname)`.
- **No existe** un `ImportEPS`/`ImportAI`/`ImportPDF` scripteable — esos formatos solo se pueden importar a mano desde el diálogo "Import Vectors" de la interfaz.
- `ToolpathManager():LoadToolpathTemplate(template_path)` — carga y aplica una plantilla de toolpath guardada (`.ToolpathTemplate`) sobre la selección activa. Esto es probablemente lo que hacían tus atajos F1/F2/F3 manualmente; se puede invocar por código.
- `job:GetLayerWithName(...)`, `:SetLayer(...)` — para mandar cada vector a la layer correcta.
- `CreateNewJob(...)`, `OpenExistingJob(pathname)`, `SaveCurrentJob()`, `CloseCurrentJob()`.
- `DirectoryReader("NombreGadget")` — un objeto para persistir configuración del gadget en el registro de Windows entre corridas (útil para recordar la última carpeta usada, por ejemplo).
- Los Gadgets son archivos `.lua` que se instalan una sola vez en la carpeta de Gadgets de Aspire (`GetGadgetsLocation()`) o en `Documentos\Vectric Files\Gadgets\Aspire VX.X`, y se corren desde el menú Toolpaths → Gadgets (se les puede asignar un atajo de teclado nativo de Aspire).

Esto quiere decir que **sí se puede reemplazar el ejecutable externo por un Gadget de Lua real**, que corre adentro de Aspire, usa la API soportada (no clicks a ciegas) y por lo tanto es mucho más robusto.

### Opción A (confirmada) — Gadget único en Lua, sin automatización de UI externa
- El pipeline de vectorización del lado servidor exporta, además del EPS que ya genera hoy (`archivo_vector_preview` → `.eps`), una copia en **DXF** con las dimensiones reales en mm explícitas en el header (o SVG con `viewBox`/`width`/`height` en mm explícitos y sin depender del DPI). DXF es preferible porque `ImportDxfDwg` es una API estable y DXF no tiene la ambigüedad de unidades que tiene SVG.
- El ZIP que se descarga trae: el `.crv3d` base (según máquina), un DXF por sello, y un **manifest** (ver sección 7).
- Se instala **una sola vez** (no en cada descarga) un Gadget `ArmarPrograma.lua` en la carpeta de Gadgets de Aspire, junto con las plantillas `.ToolpathTemplate` necesarias por tipo de sello/planchuela.
- El operario: abre el `.crv3d` del ZIP → Toolpaths → Gadgets → `Armar Programa` (o el atajo que se le asigne) → el gadget busca el `manifest` al lado del `.crv3d`, importa cada DXF, lo manda a la layer correcta, valida el tamaño contra lo esperado (ver más abajo) y aplica las plantillas de toolpath que correspondan.
- Ventajas: nada de UI automation frágil (sin dependencia de resolución de pantalla, posición de ventanas, timing); manejo de errores real (`DisplayMessageBox`); validación de escala automática; se banca que la cantidad de sellos varíe programa a programa (no hay una secuencia fija de teclas).
- Costo: hay que construir el paso de exportación a DXF (o SVG con unidades explícitas) en el pipeline de vectorización, y escribir/mantener el Gadget. Es más trabajo inicial, pero es la solución correcta y de una sola vez.

### Opción B — descartada (mantener el ejecutable externo apuntando al diálogo real de Aspire)
- Era la alternativa: en vez de reproducir clicks a ciegas, usar automatización de UI de Windows (UI Automation / FlaUI / AutoIt) que busca los controles del diálogo "Import Vectors" por nombre, usando el EPS que ya se genera hoy.
- Se descarta porque sigue siendo automatización de interfaz (frágil ante actualizaciones de Aspire, cambios de idioma del menú, diálogos inesperados tipo "el archivo ya existe"), y no permite validar la escala del vector importado de forma confiable.

**Decisión**: Opción A (Gadget en Lua). Elimina de raíz la causa del bug de escala (ambigüedad de unidades del SVG) y la fragilidad del automatismo. Se puede shippear en dos etapas: primero el módulo de Programas funcionando con descarga de ZIP simple (sin gadget, solo para no bloquear el resto), y en paralelo desarrollar el Gadget con casos de prueba controlados antes de destaparlo a producción real.

> **Alcance**: el Gadget y el paquete de descarga aplican solo a programas de máquina **C, G o XL**. Los sellos **ABC se arman a mano, fuera de este flujo** (por ahora) — ver punto 2 de la sección 0.

---

## 4. Modelo de datos — cambios necesarios en Supabase

### Tabla `programa` — columnas a agregar
```sql
ALTER TABLE programa
  ADD COLUMN IF NOT EXISTS bloqueado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bloqueado_at timestamptz,
  ADD COLUMN IF NOT EXISTS bloqueado_por uuid,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS archivo_zip_url text,          -- último paquete generado
  ADD COLUMN IF NOT EXISTS archivo_zip_generado_at timestamptz,
  ADD COLUMN IF NOT EXISTS dirty boolean NOT NULL DEFAULT true, -- true = hay cambios sin re-empaquetar
  ADD COLUMN IF NOT EXISTS estado_programa varchar(20) NOT NULL DEFAULT 'BORRADOR'
    CHECK (estado_programa IN ('BORRADOR','LISTO','BLOQUEADO','EN_FABRICACION','FINALIZADO'));
```
Por qué: hoy no hay ninguna columna que diga si un programa fue descargado, si está bloqueado, ni si el ZIP generado sigue representando el estado actual de sus sellos (`dirty`). Sin esto no se puede implementar el bloqueo ni la re-generación (sección 6 y 8).

### Tabla `sellos` — una columna nueva
```sql
ALTER TABLE sellos
  ADD COLUMN IF NOT EXISTS estado_fabricacion_previo varchar(20);
```
Por qué: al agregar un sello a un programa se guarda ahí una foto de su `estado_fabricacion` de ese momento (ej. `Rehacer`). Cuando se lo quita del programa, el pop-up de la sección 6.2 ofrece ese valor como opción por defecto ("mantener el anterior") junto con la posibilidad de elegir uno nuevo.

Ya existen además `programa_id`, `tipo_planchuela`, `maquina`, `ancho_real`, `largo_real`, `estado_vectorizacion`, `archivo_vector_preview`, `es_prioritario`, `fecha_limite`. Lo que hay que **dejar de usar** es `programa_nombre` como fuente de verdad (ver sección 10) — se mantiene solo como cache de lectura, escrito automáticamente por trigger o por el service al asignar `programa_id`.

### Configuración de máquinas — límites de largo y archivo base
```sql
-- Un .crv3d base por máquina automatizable (C, G, XL — no ABC).
CREATE TABLE IF NOT EXISTS programa_archivos_base (
  maquina varchar(4) PRIMARY KEY CHECK (maquina IN ('C','G','XL')),
  archivo_base_url text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
Y sumar al jsonb de `fabricacion_parametros.params` (no hace falta migración de esquema, es un campo jsonb ya existente) las claves de largo máximo de planchuela por máquina, confirmadas con el usuario:
```json
{
  "largoMaximoPlanchuelaMm_C": 400,
  "largoMaximoPlanchuelaMm_G": 250,
  "largoMaximoPlanchuelaMm_XL": 250
}
```
Este límite es **por planchuela individual** (por cada ancho de planchuela usado dentro del programa), no un total agregado entre anchos distintos — ver sección 7.4.

### Trigger de sincronización `programa_nombre`
```sql
-- Mantiene sellos.programa_nombre sincronizado con programa.nombre vía programa_id,
-- para no romper CellFabricacion.tsx que hoy lee ese texto.
CREATE OR REPLACE FUNCTION sync_programa_nombre() RETURNS trigger AS $$
BEGIN
  IF NEW.programa_id IS NULL THEN
    NEW.programa_nombre := NULL;
  ELSE
    SELECT nombre INTO NEW.programa_nombre FROM programa WHERE id = NEW.programa_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_programa_nombre
  BEFORE INSERT OR UPDATE OF programa_id ON sellos
  FOR EACH ROW EXECUTE FUNCTION sync_programa_nombre();
```

### Storage
- Nuevo bucket (o carpeta dentro de uno existente) `programas-zip/{programa_id}/{timestamp}.zip` para los paquetes generados.

---

## 5. Ciclo de vida de un Programa

```
BORRADOR ──(agregar/quitar sellos, editar máquina/fecha)──> BORRADOR
   │
   │ generar paquete (ZIP)
   ▼
LISTO ──(se vuelve a tocar la lista de sellos)──> BORRADOR (dirty = true, hay que re-generar)
   │
   │ operario descarga el ZIP / marca "enviado a máquina"
   ▼
BLOQUEADO ──(desbloquear explícitamente, requiere confirmación)──> BORRADOR
   │
   │ operario marca sellos como fabricados en Producción (loop normal existente)
   ▼
EN_FABRICACION ──(todos los sellos del programa llegan a Hecho/Verificado)──> FINALIZADO
```

Reglas:
- **BORRADOR**: totalmente editable. Es el único estado en el que se pueden agregar/quitar sellos libremente.
- **LISTO**: se generó el ZIP al menos una vez y nadie lo tocó desde entonces (`dirty = false`). Sigue siendo editable, pero si se edita pasa a `BORRADOR` de nuevo (`dirty = true`) — el nombre del estado en la UI puede mostrar "Editado, falta regenerar".
- **BLOQUEADO**: se pone manualmente (el botón de candado que ya existe en `ProgramCard.tsx`, hoy es solo UI local) o automáticamente al confirmar la descarga. Bloqueado = no se pueden agregar/quitar sellos ni borrar el programa sin desbloquear antes. Sí se puede seguir viendo/descargando de nuevo el mismo ZIP.
- **EN_FABRICACION**: se detecta automáticamente cuando al menos un sello del programa cambia a `Haciendo` en Producción (evita que alguien edite el programa mientras la máquina ya está cortando, aunque nadie haya tocado el candado).
- **FINALIZADO**: todos los sellos del programa están en `Hecho` o `Verificado`. Es informativo, no bloquea nada adicional (el programa ya cumplió su función).
- Borrar un programa (sección 6.3) es un **DELETE físico** de la fila — no hay un estado `CANCELADO` intermedio, no queda historial de programas borrados.

---

## 6. Casos borde — qué hacer en cada situación

### 6.1 Agregar un sello a un programa
- Validar: `programa.estado_programa == 'BORRADOR'` o `'LISTO'` (si es `LISTO` pasa a `BORRADOR` con `dirty = true`); si está `BLOQUEADO`/`EN_FABRICACION` → rechazar con mensaje explícito.
- Validar: el sello no está ya en otro programa (`sellos.programa_id IS NULL`), si no ofrecer "mover de programa X a este" en vez de un error silencioso.
- Validar: el sello tiene vector listo (`estado_vectorizacion = 'VECTORIZADO'` y `archivo_vector_preview` no nulo). Si no, no debería aparecer en el selector como elegible (ver sección 7), pero si igual se intenta agregar (ej. vía algún atajo) bloquear con mensaje "Sello sin vectorizar".
- Si el sello no tiene `maquina` asignada todavía, se le asigna la máquina del programa al agregarlo. Si ya tiene una máquina distinta a la del programa, avisar y pedir confirmación (¿se está corrigiendo la máquina del sello, o es el programa equivocado?).
- Validar el límite de largo de planchuela (sección 7.4) para la `tipo_planchuela` de este sello: si agregarlo supera el máximo de la máquina, **bloquear la operación** (no es un warning) y sugerir arrancar/usar otro programa para esa planchuela.
- Recalcular en vivo el largo de planchuela usado por categoría (`tipo_planchuela`) — ver algoritmo en sección 7.
- Efecto en el sello: guardar `estado_fabricacion_previo = estado_fabricacion` (snapshot antes de tocar nada), `programa_id = programa.id`, `estado_fabricacion` pasa a `Programado` (reemplaza al mecanismo manual de `estado_aspire`, ver sección 10), y opcionalmente setear `estado_aspire` según la máquina+variante que use ese programa si se sigue queriendo mostrar ese chip en Producción.

### 6.2 Quitar un sello de un programa
- Mismo check de estado del programa que en 6.1.
- Antes de revertir nada, mostrar un **pop-up de confirmación** con dos opciones:
  1. **Mantener el estado anterior** — restaura `estado_fabricacion = estado_fabricacion_previo` (lo que tenía justo antes de ser programado).
  2. **Elegir un estado nuevo** — un selector con los mismos valores de `FabricationState` para que el usuario lo defina ahí mismo (por si la realidad cambió mientras estaba programado).
- Cualquiera sea la opción elegida: `programa_id = NULL`, `estado_fabricacion_previo = NULL` (se limpia, ya se usó), y se recalcula el largo de planchuela usado.
- Si el programa queda con 0 sellos, no se borra automáticamente — se deja como programa vacío en `BORRADOR` (el usuario decide si lo borra).

### 6.3 Borrar un programa
- Si `estado_programa` es `BLOQUEADO` o `EN_FABRICACION`: no permitir borrar directo — pedir desbloquear primero (evita perder el vínculo con sellos que ya están en curso de fabricación).
- Si es `BORRADOR`/`LISTO`/`FINALIZADO`: liberar todos los sellos asociados (`programa_id = NULL`, mismo pop-up de elección de estado que en 6.2, o un default razonable si se borran varios sellos a la vez — ej. "mantener estado anterior para todos") y recién ahí hacer el **DELETE físico** de la fila de `programa` (confirmado: no se guarda como `CANCELADO`).
- Borrar también el ZIP generado en Storage si existía.

### 6.4 Se cancela/edita un pedido que tiene un sello ya asignado a un programa
- Este es el caso más peligroso: el programa puede quedar desincronizado con la realidad de `ordenes`/`sellos` sin que nadie lo note.
- Regla: cualquier cambio que hoy dispare "el sello ya no se va a fabricar" (orden cancelada, sello eliminado del pedido) debe, además de lo que ya hace hoy, **liberar el sello del programa** (`programa_id = NULL`) y marcar el programa como `dirty = true` si estaba `LISTO`. Si el programa estaba `BLOQUEADO`/`EN_FABRICACION`, no desbloquearlo solo, pero sí mostrar una alerta visible en la card ("Este programa tiene un sello dado de baja, revisar antes de fabricar") — no ocultar el problema silenciosamente.
- Esto requiere modificar el flujo existente de cancelación/eliminación de sellos en `orders.service.ts` para que dispare esta limpieza (hoy no contempla `programa_id` en absoluto).

### 6.5 El programa fue descargado, pero después se edita en `BORRADOR` sin haberlo bloqueado antes
- El ZIP viejo queda "stale". Mostrar en la card un indicador claro (ej. badge "desactualizado desde la última descarga") en vez de dejar que el operario use un ZIP que ya no coincide con la lista real de sellos.
- Guardar `dirty = true` apenas se agrega/quita un sello de un programa que ya tenía `archivo_zip_url` seteado.

### 6.6 Un sello se agrega tarde (llegó su vectorización después de armado el programa)
- No pasa nada automático — el usuario lo agrega manualmente desde el selector una vez que aparece como elegible (`estado_vectorizacion = 'VECTORIZADO'`). El programa pasa a `dirty` si ya estaba `LISTO`.

### 6.7 Falla la generación del ZIP (por ejemplo, un archivo de storage no accesible)
- No dejar el programa a mitad de camino: si falla, no tocar `archivo_zip_url`/`estado_programa`, mostrar el error puntual (qué sello/archivo falló) para que se pueda arreglar y reintentar.

### 6.8 Error de escala al importar en Aspire (si se elige la Opción A del Gadget)
- El Gadget, después de importar cada vector, compara el tamaño resultante contra el `ancho_real`/`largo_real` esperado (con una tolerancia, ej. 5%). Si no coincide, no sigue con las plantillas de toolpath para ese vector: muestra `DisplayMessageBox` con el nombre del sello y las medidas esperadas vs. obtenidas, y continúa con el siguiente (no aborta todo el programa por un sello con problema).
- Al final deja un resumen (cuántos sellos se importaron bien, cuáles quedaron pendientes de revisión manual).

### 6.9 Un programa mezcla máquinas por error
- No debería ser posible: el selector de sellos para agregar a un programa solo debe mostrar sellos cuya `maquina` sea la del programa o esté sin asignar (ver 6.1). No se permite forzar un sello de otra máquina desde la UI estándar (si hace falta un override, que sea una acción explícita y con doble confirmación, no el flujo normal).

### 6.10 Programas de máquina ABC
- Confirmado: el archivo base **no varía por tipo de sello** (Clasico/3mm/Lacre/Alimento comparten el mismo `.crv3d` de su máquina), solo por máquina (C/G/XL, tabla `programa_archivos_base`). **ABC queda fuera de la automatización**: si se crea un programa para máquina ABC (por prolijidad/organización), la UI no debe ofrecer botón de "Descargar paquete" ni intentar generar ZIP — esos sellos se siguen armando a mano como hasta ahora.

---

## 7. Lógica de armado del programa (el algoritmo "práctico")

### 7.1 Pool de sellos elegibles
Un sello puede ofrecerse para agregar a un programa si:
```
sellos.programa_id IS NULL
AND sellos.item_type = 'SELLO'
AND sellos.estado_vectorizacion = 'VECTORIZADO'
AND sellos.estado_fabricacion IN ('Sin Hacer', 'Prioridad', 'Rehacer')  -- no 'Hecho'/'Verificar'/'Haciendo'
AND (sellos.maquina IS NULL OR sellos.maquina = <máquina del programa>)
```

### 7.2 Orden de sugerencia (para que el operario arme rápido, no al azar)
1. `es_prioritario` primero.
2. `fecha_limite` ascendente (nulls al final).
3. `created_at` ascendente (FIFO) como criterio final.

(Reusar la misma lógica/criterios que ya existe en `ProductionSortForm`/`ProgramsSortForm` en vez de reinventar un tercer orden distinto.)

### 7.3 Cálculo de material en vivo (reemplaza los valores hardcodeados de `ProgramCard.tsx`)
Por cada sello agregado, mapear su `tipo_planchuela` (12/19/25/38/63) a un acumulador, sumando la dimensión del sello que corre a lo largo de la planchuela **más** la pérdida de corte por pieza (`fabricacion_parametros.params.selloPerdidaCorteCm`, hoy 0.8cm). Esto reproduce el mismo criterio que ya usa el sistema de costos/consumo de bronce (`bronce_consumo`), para no inventar un segundo criterio de cálculo que después no cierre con el consumo real.
```
para cada tipo_planchuela activo en el programa:
  largo_usado[tipo] = sum(largo_a_lo_largo_de_la_planchuela(sello) + perdida_corte_cm) para cada sello de ese tipo
```
Mostrar esto en tiempo real en el formulario/card (hoy en `ProgramCard.tsx` está hardcodeado como texto fijo "38mm: 60mm / 25mm: 120mm" — tiene que salir de este cálculo).

### 7.4 Límite de largo de planchuela por máquina (bloqueo duro, confirmado)
- Valores confirmados, en `fabricacion_parametros.params` (sección 4): **C = 400mm, G = 250mm, XL = 250mm**.
- El límite aplica **por planchuela individual** dentro del programa: si el programa ya tiene, por ejemplo, sellos de planchuela 25mm sumando 380mm de largo usado en una máquina C, y se intenta agregar un sello que llevaría ese acumulado a más de 400mm, la operación se **bloquea** (no es un warning) con un mensaje tipo "Supera el largo máximo de planchuela 25mm para máquina C (400mm). Usá otro programa para el excedente." Los demás anchos de planchuela del mismo programa (12/19/38/63) tienen cada uno su propio acumulador independiente contra el mismo límite de la máquina.
- `tiempo_maximo` de la tabla `programa`: si se define, sumar un tiempo estimado por sello (si existe ese dato en `sellos.tiempo`) y avisar cuando se excede el máximo del turno — este sí queda como warning blando, no bloqueante (no hubo pedido explícito de bloquear por tiempo).

### 7.5 Nombre automático del programa
Ya existe la lógica en `NewProgramForm.tsx` (`generateProgramName`: `"15 ENE x12 yC"`), solo hay que mantenerla y recalcular `x{cantidad}` en vivo a medida que se agregan/quitan sellos (hoy se recalcula, pero contra el estado local `selectedStamps`, que hay que reemplazar por la fuente real de Supabase).

---

## 8. Generación y contenido del paquete de descarga (ZIP)

```
programa-15-ene-xC.zip
├── programa.crv3d                # copia del .crv3d base para esa máquina (nunca el original, siempre copia)
├── manifest.lua                  # ver formato abajo — el Gadget lo lee con dofile()
└── vectores/
    ├── 001_<sello_id>.dxf
    ├── 002_<sello_id>.dxf
    └── ...
```

### `manifest.lua` (elegido en vez de JSON porque el Lua de Aspire no confirma tener un parser JSON disponible, pero sí puede ejecutar un archivo Lua con `dofile` de forma nativa)
```lua
return {
  programa_id = "…uuid…",
  programa_nombre = "15 ENE x12 yC",
  maquina = "C",
  sellos = {
    {
      orden = 1,
      sello_id = "…uuid…",
      archivo = "vectores/001_<sello_id>.dxf",
      ancho_mm = 45.0,
      largo_mm = 30.0,
      tipo = "CLASICO",
      tipo_planchuela = 25,
      layer = "CLASICO",
      toolpath_templates = { "roughing_clasico.ToolpathTemplate", "profile_clasico.ToolpathTemplate" },
    },
    -- ...
  },
}
```
- `toolpath_templates` es una lista porque un sello puede necesitar más de un paso (equivalente a lo que antes eran F1+F2+F3 en secuencia).
- Este manifest lo genera el backend (Edge Function o servicio) al momento de armar el ZIP, a partir de los sellos reales del programa — no se edita a mano.

### Backend de generación
- Nueva función (Edge Function de Supabase, siguiendo el patrón de `confirm-web-order`/`webhook-bot` que ya existen) o servicio en la app: `generar-paquete-programa`.
- Pasos: validar que todos los sellos tengan vector disponible → convertir/copiar cada vector a DXF (acá es donde se resuelve la conversión EPS→DXF, probablemente con una librería server-side, no en el navegador) → armar el manifest → copiar el `.crv3d` base correcto (`programa_archivos_base` por `programa.maquina` — solo existe para C/G/XL, ABC no genera paquete) → comprimir → subir a Storage → guardar `archivo_zip_url`, `archivo_zip_generado_at`, `dirty = false`, `estado_programa = 'LISTO'` en `programa`.
- Si algo fallaba a mitad de camino, no dejar nada a medio escribir (ver 6.7).

---

## 9. El Gadget de Aspire

> Aplica solo a programas de máquina C, G o XL. Para ABC no hay gadget ni paquete (sección 6.10).

### Instalación (una sola vez, no en cada ZIP)
- El archivo `ArmarPrograma.lua` y las plantillas `.ToolpathTemplate` de cada combinación tipo/planchuela se instalan manualmente una vez en la carpeta de Gadgets de Aspire (`GetGadgetsLocation()`), y se les asigna un atajo de teclado desde el propio Aspire. El ZIP descargado **no** necesita traer el gadget ni las plantillas — solo el `.crv3d`, los vectores y el manifest.

### Lógica del gadget (pseudocódigo, a validar contra la API real al implementar)
```lua
function main()
  local job = VectricJob()
  if not job.Exists then
    DisplayMessageBox("Abrí primero el .crv3d del programa antes de correr el gadget")
    return
  end

  local job_dir = <carpeta del .crv3d abierto>
  local manifest = dofile(job_dir .. "/manifest.lua")

  local ok_count, warn_count = 0, 0
  for _, s in ipairs(manifest.sellos) do
    local path = job_dir .. "/" .. s.archivo
    local imported = job:ImportDxfDwg(path)
    if not imported then
      DisplayMessageBox("No se pudo importar: " .. s.archivo)
    else
      -- mover a la layer correcta
      local layer = job:GetLayerWithName(s.layer)
      if layer then job:SetLayer(layer) end

      -- validar escala del vector recién importado contra lo esperado (s.ancho_mm / s.largo_mm)
      -- (confirmar en la implementación cuál es la forma correcta de leer el bounding box
      --  de la selección activa — ver clases CadObject / Selection en la documentación)
      local bounds_ok = validar_escala(s.ancho_mm, s.largo_mm)
      if not bounds_ok then
        DisplayMessageBox("Posible error de escala en " .. s.sello_id)
        warn_count = warn_count + 1
      else
        local tm = ToolpathManager()
        for _, tpl in ipairs(s.toolpath_templates) do
          tm:LoadToolpathTemplate(templates_dir .. "/" .. tpl)
        end
        ok_count = ok_count + 1
      end
    end
  end

  DisplayMessageBox(string.format("Programa importado: %d ok, %d a revisar", ok_count, warn_count))
end
```
- Puntos a confirmar en la implementación real (no asumidos como 100% ciertos en este plan):
  - Cuál es la API exacta para leer el bounding box de la **selección actual** después de un import (el doc confirma `Job:GetBounds()` para el área de dibujo completa, pero para la selección puntual hay que revisar las clases de objeto CAD / `BoundingBox2D` mencionadas en el documento).
  - Si `dofile` está permitido dentro del sandbox de un Gadget (es Lua estándar, pero Vectric podría restringir IO — a probar con un gadget mínimo antes de construir todo el flujo).
  - Nombre exacto del namespace, por ejemplo si es un global `VectricJob()` o necesita `require`.

### Ventaja clave de este diseño
No depende de una secuencia fija de teclas (F1/F2/F3 repetido N veces) — cada programa puede tener una cantidad distinta de sellos y una combinación distinta de tipos/planchuelas sin romper el automatismo, porque todo sale del manifest.

---

## 10. Reconciliar con el mecanismo manual existente (`estado_aspire`) — reemplazo total (confirmado)

Hoy en Producción se puede marcar un sello como "Aspire G/C/XL (Check)" a mano, sin pasar por ningún programa. **Decisión: reemplazo total.** El flujo normal para tandas de fabricación pasa siempre por Programas; el dropdown manual de `estado_aspire` en `CellFabricacionAspire.tsx` se deja únicamente como atajo para una pieza suelta urgente que no amerita armar un programa completo, y en ese caso el sello simplemente no queda asociado a ningún `programa.id` (se mantiene el comportamiento actual tal cual para ese caso puntual).

Impacto en código a tener en cuenta durante la implementación (no tocar todavía, solo mapeo de qué va a cambiar):
- `CellFabricacionAspire.tsx` sigue existiendo para el caso de pieza suelta, pero deja de ser el camino recomendado/principal — quizás conviene un texto/tooltip que oriente a usar Programas para tandas.
- `production.service.ts` hoy setea `estado_fabricacion = 'Programado'` solo a partir de `estado_aspire` (líneas ~328-338); tiene que aceptar también que `Programado` llegue desde el service de Programas al asignar `programa_id` (sección 6.1), sin pisarse entre sí.

---

## 11. Plan de implementación por fases (para Cursor)

1. **Base de datos**: migraciones de la sección 4 (columnas nuevas en `programa` y `sellos`, tabla `programa_archivos_base`, claves nuevas en `fabricacion_parametros.params`, trigger de `programa_nombre`, bucket de Storage).
2. **Carga de configuración**: subir a Storage y registrar en `programa_archivos_base` los tres `.crv3d` base (C/G/XL) — sin esto no se puede probar la generación de ZIP de punta a punta.
3. **Servicio real de Programas**: terminar `programs.service.ts` — filtros del pool de sellos elegibles (7.1), agregar/quitar sello con el pop-up de estado previo (6.1/6.2), validación dura de largo máximo de planchuela (7.4), cálculo de material (7.3), bloquear/desbloquear, borrar con liberación de sellos y DELETE físico (6.3).
4. **Conectar la UI existente al servicio real**: `NewProgramForm`, `ProgramCard`, `StampsSelectionDialog` — sacar todos los `console.log` y estados locales, reemplazar el array hardcodeado de sellos por una consulta real filtrada, agregar el pop-up de la sección 6.2.
5. **Reglas de sincronización con Producción/Pedidos**: hook de liberación de sello al cancelar/editar una orden (6.4), reemplazo total del flujo manual de `estado_aspire` (sección 10).
6. **Generación de ZIP** (sección 8): Edge Function, sin todavía el Gadget — el operario puede al menos descargar el paquete e importar a mano mientras se valida el resto. Excluir el botón de descarga para programas de máquina ABC.
7. **Gadget de Aspire** (sección 9): desarrollar y probar contra Aspire real, en paralelo, con un programa de prueba chico (2-3 sellos) antes de usarlo con volumen real.
8. **Habilitar la pestaña**: sacar `disabled: true` en `Sidebar.tsx:42`.

---

Todas las decisiones de arquitectura y de negocio necesarias para arrancar están definidas en la sección 0 y reflejadas en el resto del documento. No quedan preguntas abiertas — cualquier duda puntual que surja durante la implementación (nombres exactos de la API de Lua, detalles del conversor EPS→DXF, etc.) queda anotada inline en la sección correspondiente (ver 9, "Puntos a confirmar en la implementación real").
