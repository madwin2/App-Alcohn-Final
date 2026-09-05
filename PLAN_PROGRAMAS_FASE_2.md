# Plan funcional — Programas, Fase 2 (sugerencia automática + alertas de cambios)

> Continuación de `PLAN_PROGRAMAS.md` (Fase 1), ya implementada y commiteada (`dafc99a feat(programas): habilitar módulo de programas con UI y paquetes Aspire`). Este documento parte de esa base real (no de un prototipo) y agrega tres features nuevas conversadas después de esa implementación. Para que Cursor lo implemente sin re-explorar el código, cada sección cita el archivo/función real donde engancha.

---

## 0. Contexto: qué hay hoy (verificado en el código actual)

- El módulo real vive en: `src/lib/supabase/services/programs.service.ts` (funciones `getPrograms`, `getProgramById`, `createProgram`, `updateProgram`, `deleteProgram`, `getEligibleStamps`, `addStampsToProgram`, `removeStampFromProgram`, `lockProgram`/`unlockProgram`, `getBaseFileUrl`, `markProgramPackageReady`, `releaseStampFromAnyProgram`, `canDownloadPackage`, `getMachineMaxLengthMm`), `src/lib/programas/material.ts` (cálculo de largo por planchuela + límite máximo por máquina) y `src/lib/programas/packageZip.ts` (generación del ZIP).
- El ciclo de vida, el bloqueo, el cálculo de material y el pop-up al quitar un sello (`RemoveStampDialog.tsx`) de la Fase 1 ya están andando. El esquema de `migration_programas_modulo.sql` ya está aplicado (columnas `dirty`, `estado_programa`, `bloqueado`, `estado_fabricacion_previo`, etc., y el trigger `mark_programa_dirty_on_sello_delete` que marca `programa.dirty = true` cuando se borra un sello asignado).
- `getEligibleStamps({ machine, excludeStampIds })` (línea ~498 de `programs.service.ts`) ya devuelve los sellos candidatos **filtrados y ordenados** (prioridad → fecha límite → FIFO) — este orden es la base de la Fase 2, no hay que rehacerlo.
- `ProgramCard.tsx` ya muestra un badge "Editado, falta regenerar" y el texto "Desactualizado desde la última descarga" (`showStaleZip`, línea ~99) cuando `program.dirty && program.archivoZipUrl` — **esto ya es la UI de alerta que necesita la Fase 2**, no hace falta construir nada nuevo del lado del front para eso (ver sección 2).
- La pestaña ya está habilitada en `Sidebar.tsx` (sin `disabled`), pero **no tiene badge** en el nav todavía (a diferencia de Pedidos/Comercial, que sí — ver `useSidebarNotifications.ts` y `sidebarNotifications.service.ts`).

Las tres cosas conversadas y que faltan:
1. **Sugerir armado** (híbrido): un botón que pre-selecciona sellos automáticamente respetando prioridad/fecha límite y el límite de largo de planchuela, para que el usuario revise y confirme en vez de elegir sello por sello.
2. **Alerta cuando cambia algo de un sello ya asignado a un programa** (vector reemplazado, fecha límite editada, medidas/tipo cambiados) — hoy solo se detecta el *borrado* del sello, no una edición.
3. **Badge de "urgentes sin programar"** en el nav — para que el usuario de Producción se entere de que apareció un pedido prioritario/con fecha límite próxima que todavía no está en ningún programa, sin tener que acordarse de revisar manualmente.

---

## 1. Feature A — "Sugerir armado" (selección híbrida)

### Dónde
Todo pasa por `StampsSelectionDialog.tsx` (el mismo diálogo se usa desde `NewProgramForm.tsx` con `programId="new"` y desde `ProgramCard.tsx` con el programa real ya creado — ambos casos hay que cubrir).

### Diseño
No hace falta backend nuevo: `getEligibleStamps` ya trae la lista candidata correctamente ordenada, y `src/lib/programas/material.ts` ya expone `resolvePlanchuelaRef`, `stampLengthAlongMm` y `getMaxLengthMmForMachine`. La sugerencia es un **cálculo greedy 100% client-side** sobre esos datos que ya están cargados en el diálogo:

1. Agregar un prop nuevo a `StampsSelectionDialog`: `initialLengthByPlanchuela?: ProgramLengthByPlanchuela` (default `{}`).
   - Desde `ProgramCard.tsx` (línea ~379): pasar `initialLengthByPlanchuela={program.lengthByPlanchuela}` (el programa ya puede tener sellos cargados, hay que arrancar el acumulado desde ahí, no desde cero).
   - Desde `NewProgramForm.tsx` (línea ~247): no pasar nada (arranca en `{}`, programa nuevo sin sellos).
2. Agregar un botón **"Sugerir armado"** en el header del diálogo (al lado del buscador), deshabilitado si `machine === 'ABC'` (no tiene límite de largo modelado — ABC sigue siendo 100% manual, ver Fase 1 sección 6.10) o si `loading`/`availableStamps.length === 0`.
3. Al hacer click, recorrer `availableStamps` **en el orden en que ya vienen** (ya están ordenados por prioridad/fecha límite/FIFO) y, para cada sello:
   - Calcular `ref = resolvePlanchuelaRef(stamp)` y `extraMm = stampLengthAlongMm(stamp)`.
   - Si `ref` es null o `extraMm <= 0`, incluirlo igual (no tiene planchuela conocida, no hay nada que validar) — no bloquear la sugerencia por falta de dato.
   - Si no, verificar contra un acumulador local (arrancado en `initialLengthByPlanchuela`) usando la misma cuenta que ya hace `validatePlanchuelaLengthLimit` (podés llamar a esa función tal cual, ya está exportada desde `material.ts`, para no duplicar la regla del límite). Si entra, sumarlo al acumulador y agregarlo a la selección; si no entra, saltearlo (sigue disponible para agregarlo a mano después, o para arrancar otro programa).
   - Actualizar `setSelectedStamps` con los IDs resultantes (reemplaza la selección actual completa — no es un "agregar a lo que ya había tildado a mano", es una sugerencia fresca cada vez que se aprieta el botón).
4. Mostrar un texto breve debajo del botón: `"Se preseleccionaron N sellos según prioridad y largo disponible. Revisá y confirmá."` — el usuario sigue pudiendo destildar/tildar a mano antes de apretar "Agregar" (el flujo de confirmación real no cambia, sigue siendo `handleAddSelected` → `onAddStamps`, sin tocar la persistencia).

### Casos borde de esta feature
- Si al apretar "Sugerir armado" **ningún** sello entra (todas las planchuelas ya están al límite), no vaciar la selección existente — dejarla como estaba y mostrar un toast "No hay más sellos que entren en el largo disponible para esta máquina".
- Si el usuario ya había tildado sellos a mano y después aprieta "Sugerir armado", la sugerencia **reemplaza** la selección (comportamiento simple y predecible) — dejarlo documentado en el tooltip del botón para que no sorprenda.
- No hace falta persistir nada de esto en Supabase: si el usuario cierra el diálogo sin confirmar "Agregar", no pasó nada.

---

## 2. Feature B — Alerta cuando cambia algo de un sello ya programado

### Lo que ya existe (no tocar)
`mark_programa_dirty_on_sello_delete` (trigger `BEFORE DELETE ON sellos`) ya marca `programa.dirty = true` (y baja `estado_programa` de `LISTO` a `BORRADOR`) cuando se **borra** un sello que estaba asignado a un programa. Y `ProgramCard.tsx` ya muestra el aviso visible ("Desactualizado desde la última descarga") en base a `dirty` — con lo cual, **una vez que el trigger nuevo exista, no hace falta tocar ni una línea de UI**: el aviso ya está construido y ya reacciona a `dirty`.

### Lo que falta
Un trigger análogo, pero para **UPDATE** de los campos que importan, mientras el sello sigue asignado al mismo programa (si se lo está agregando o quitando de un programa en esa misma operación, no debe disparar — esos casos ya marcan `dirty` explícitamente desde `programs.service.ts`).

```sql
CREATE OR REPLACE FUNCTION mark_programa_dirty_on_sello_relevant_update() RETURNS trigger AS $$
BEGIN
  IF OLD.programa_id IS NOT NULL AND NEW.programa_id IS NOT NULL AND OLD.programa_id = NEW.programa_id THEN
    UPDATE programa
    SET
      dirty = true,
      estado_programa = CASE
        WHEN estado_programa = 'LISTO' THEN 'BORRADOR'
        ELSE estado_programa
      END,
      updated_at = now()
    WHERE id = NEW.programa_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_mark_programa_dirty_on_sello_relevant_update ON sellos;
CREATE TRIGGER trigger_mark_programa_dirty_on_sello_relevant_update
  BEFORE UPDATE OF
    archivo_vector_preview, archivo_base, ancho_real, largo_real,
    tipo, tipo_planchuela, maquina, fecha_limite, es_prioritario
  ON sellos
  FOR EACH ROW
  EXECUTE FUNCTION mark_programa_dirty_on_sello_relevant_update();
```

Por qué estas columnas y no otras:
- `archivo_vector_preview` / `archivo_base`: el vector cambió (re-vectorización, corrección) → el DXF que se empaquetó puede ya no corresponder.
- `ancho_real` / `largo_real` / `tipo_planchuela`: cambia el material/la escala esperada → afecta el cálculo de largo de planchuela y la validación de escala del Gadget (sección 6.8/9 de la Fase 1).
- `maquina`: si se corrige a mano fuera de este flujo, el programa puede haber quedado con un sello que ya no corresponde a esa máquina.
- `fecha_limite` / `es_prioritario`: no invalida el paquete en sí, pero es información valiosa para que el usuario sepa que la prioridad de ese sello cambió mientras ya estaba metido en una tanda — se prefiere avisar de más a no avisar.

No hace falta agregar `estado_fabricacion` a la lista: ese campo ya lo maneja `programs.service.ts` explícitamente como parte del alta/baja del programa (no debería cambiar por fuera mientras `programa_id` esté seteado, salvo por el propio flujo de Producción marcando avance de fabricación — que no debería ensuciar el ZIP).

### Caso borde
Si el trigger de UPDATE y el de creación de programa (`addStampsToProgram`) llegaran a pisarse (por ejemplo, un `UPDATE` que cambia `maquina` **y** `programa_id` en la misma sentencia), el `WHEN` (`OLD.programa_id IS NOT NULL AND NEW.programa_id IS NOT NULL AND OLD.programa_id = NEW.programa_id`) ya lo cubre: si `programa_id` pasó de null a un valor, o de un valor a null, este trigger no dispara (son los casos que ya maneja `programs.service.ts` explícitamente).

---

## 3. Feature C — Badge "urgentes sin programar" en el nav

### Patrón a reusar (ya existe para Pedidos/Comercial)
`src/lib/supabase/services/sidebarNotifications.service.ts` ya tiene `fetchPedidosMissingFilesBadgeCount` (cuenta simple, sin dismissal) y `fetchComercialPagosNuevosBadgeCount` (con dismissal por localStorage). Para este caso conviene el patrón **sin dismissal** (como Pedidos): es un conteo del backlog actual, no "novedades" que haya que marcar como vistas.

### Función nueva en `sidebarNotifications.service.ts`
```ts
const URGENTE_DIAS_FECHA_LIMITE = 3; // umbral configurable

export async function fetchProgramasUrgentesSinProgramarBadgeCount(): Promise<number> {
  const limiteFecha = new Date();
  limiteFecha.setDate(limiteFecha.getDate() + URGENTE_DIAS_FECHA_LIMITE);
  const limiteFechaStr = limiteFecha.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('sellos')
    .select('id, es_prioritario, fecha_limite')
    .is('programa_id', null)
    .eq('item_type', 'SELLO')
    .eq('estado_vectorizacion', 'VECTORIZADO')
    .not('archivo_vector_preview', 'is', null)
    .in('estado_fabricacion', ['Sin Hacer', 'Prioridad', 'Rehacer'])
    .or(`es_prioritario.eq.true,fecha_limite.lte.${limiteFechaStr}`);

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
```
(El filtro de elegibilidad es el mismo que ya usa `getEligibleStamps` en `programs.service.ts` — mantenerlos consistentes si alguno de los dos cambia a futuro.)

### Wiring (mismo patrón que `pedidosBadge`)
- `useSidebarNotifications.ts`: agregar `programasBadge` state + `refreshProgramas` callback (mismo try/catch/console.warn que `refreshPedidos`), sumarlo a los dos `useEffect` (mount y poll de `POLL_MS`) y al de `visibilitychange`, y devolverlo en el return del hook.
- `Sidebar.tsx`: destructurar `programasBadge` de `useSidebarNotifications()` y agregar en `badgeForPath`: `if (path === '/programas') return programasBadge;`.

### Casos borde
- Umbral de "próximo" (`URGENTE_DIAS_FECHA_LIMITE = 3`): es un valor de arranque razonable, no viene de una decisión explícita del usuario — dejarlo como constante fácil de ajustar, no hardcodeado en tres lugares.
- Un sello ABC nunca debería contar para este badge en la práctica (no se programa por este módulo), pero no hace falta un filtro especial: como nunca tienen `programa_id` seteado por este flujo, ya quedarían incluidos si cumplen prioridad/fecha — a decidir si se excluye explícitamente `tipo != 'ABC'` o `maquina != 'ABC'` si en la práctica generan ruido en el badge (ver nota abajo).
- Este badge cuenta sellos, no pedidos (a diferencia del badge de Pedidos que cuenta órdenes) — si en el uso real resulta confuso, se puede migrar a contar órdenes distintas fácilmente (mismo query, `select('orden_id')` + `Set`).

---

## 4. Plan de implementación por pasos

1. **SQL**: agregar el trigger de la sección 2 (una migración nueva, ej. `migration_programas_fase2_alertas.sql`, no tocar `migration_programas_modulo.sql` que ya se aplicó).
2. **Feature A**: modificar `StampsSelectionDialog.tsx` (prop nuevo + botón + lógica greedy) y `ProgramCard.tsx` (pasar `initialLengthByPlanchuela`). `NewProgramForm.tsx` no necesita cambios (usa el default `{}`).
3. **Feature C**: función nueva en `sidebarNotifications.service.ts`, wiring en `useSidebarNotifications.ts` y `Sidebar.tsx`.
4. **Probar de punta a punta**: crear un programa con "Sugerir armado", editar el vector de un sello ya asignado desde Producción y verificar que aparece "Desactualizado desde la última descarga" en la card, y confirmar que el badge del nav sube al marcar un sello como prioritario sin programa.

No quedan decisiones de negocio abiertas para esta fase — el único parámetro libre es `URGENTE_DIAS_FECHA_LIMITE` (arrancar en 3 y ajustar según feedback de uso real).
