# Revisión de usabilidad — Mi perfil, calendario y tareas (rama `feature/equipo`)

> Fecha: 2026-10-05 · Complementa [`REVISION_EQUIPO_LOGICA_DE_USO.md`](REVISION_EQUIPO_LOGICA_DE_USO.md) (errores de lógica). Este documento mira **el uso real**: qué viene a hacer cada persona, cuántos pasos le lleva, qué espera encontrar y no está.
> Destinatario: **Cursor**. Revisado contra el código **actual** del working tree (incluye lo que Cursor ya aplicó del primer documento: `InicioPerfilTab`, `ListaAusencias`, tareas "Un solo día", etc.).
> Limitación: la revisión es sobre el código; no se pudo navegar la app logueado.

---

## 0. Lo que cambia respecto del plan original (decisiones del dueño, 2026-10-05)

Estas decisiones **cambian el plan** ([`PLAN_PAGINA_PERSONAL.md`](PLAN_PAGINA_PERSONAL.md) D9 y §10 decían "marcar hechas va en el Inicio, más adelante"). Ahora se adelanta.

| ID | Decisión |
|---|---|
| Q-EQ-017 | **Un solo calendario.** Lo público del equipo (vacaciones, cambios de día, feriados, días de la empresa, cumpleaños) lo ven todos; encima, cada uno ve **sus cosas privadas** (sus tareas). Todo en la misma grilla: "si no, es imposible usar la app". |
| Q-EQ-018 | **Todas las tareas** (las que se repiten y las de un solo día) se **marcan**. Opciones por ocurrencia: **Hecha**, **Posponer** al día siguiente, **Mover a otro día**, **No hecha** (en las que se repiten: se deja y se hace la próxima vez que toque). |
| Q-EQ-019 | Si una tarea **no se marca**, **se arrastra al día siguiente** ("atrasada desde el jueves") hasta que se marque. Vale para las de un solo día y para las que se repiten. |
| Q-EQ-020 | **Post-its y tareas son cosas separadas** (corrección del dueño, 2026-10-05). Los post-its del Inicio son **notas / avisos** (para uno mismo o para un compañero); las **tareas** viven en Mi perfil y el calendario. **No se unifican**: los post-its siguen como hoy, no crean tareas ni aparecen en el calendario. |
| Q-EQ-021 | ~~Fecha de la tarea creada desde un post-it~~ → **anulada** por Q-EQ-020. |
| Q-EQ-022 | ~~Sincronía post-it ↔ tarea~~ → **anulada** por Q-EQ-020. |
| Q-EQ-023 | **Quién marca una tarea**: la persona dueña y el admin. Quien la asignó (el admin) ve el estado. |

Registrar en `docs/14-open-questions/equipo.md` (estado "respondida") y, al implementar, en `politicas-confirmadas.md` (POL nuevas) y en D9 / §10 del plan.

### Detalle de las reglas (confirmado por el dueño, 2026-10-05)

| # | Regla | Notas |
|---|---|---|
| S13 | Una ocurrencia que cae en **feriado**, en **mis vacaciones** o en un **día que falto** (cambio de día) **se mueve al día hábil siguiente** que yo trabaje (salteando feriados, fines de semana y mis ausencias encadenadas). Si en ese período la misma tarea tenía **varias** ocurrencias (p. ej. una diaria durante 2 semanas de vacaciones), **se mueve solo una**; las demás quedan "No aplica" (gris). | Vale para todas las frecuencias. Es la misma idea que D21 (mensual en fin de semana/feriado → hábil siguiente), ahora extendida a ausencias personales. |
| S14 | Si una tarea que se repite tiene **varias ocurrencias atrasadas** (sin marcar), se muestra **una sola tarjeta** "Limpiar CNC · atrasada (3 veces, desde el lunes)" con acciones "Hecha" (cierra la más vieja) y "Dar por no hechas las anteriores". | — |
| S15 | El arrastre **empieza a contar desde el día en que se publica esta función** (o desde que se creó la tarea, lo que sea posterior). No se generan atrasos retroactivos. | — |
| S16 | ~~Migración de post-its viejos~~ → **ya no aplica**: los post-its no se tocan (Q-EQ-020). | — |
| S17 | Las tareas automáticas de **reposición de stock** (`tareas_dashboard` con payload `parseStockReplenishTask`) **quedan como hoy**: no van al calendario. | — |

Registrar S13–S15 y S17 como POL nuevas junto con Q-EQ-017, 018, 019, 020 y 023.

---

## 1. Diagnóstico general (uso real)

La página hoy está armada como **10 secciones separadas** (11 para el admin) que no se hablan entre sí:

- El **calendario** muestra feriados, vacaciones, cambios de día y cumpleaños, pero **no muestra nada de lo que yo tengo que hacer**. Para ver mis tareas tengo que ir a otra pestaña ("Mis tareas → Mi semana"), que a su vez no muestra a quién le falta el día ni el mes.
- **No se puede hacer nada desde el calendario**: ni hacer clic en un día, ni en un chip, ni abrir el "+2". Para cargar vacaciones uso botones de arriba que abren formularios en blanco (tengo que volver a elegir las fechas que estaba mirando).
- **Notas y tareas se confunden en los nombres**: los post-its del Inicio son notas/avisos (para uno o para un compañero), pero el botón y la notificación dicen "tarea" ("Te asignó: …", tipo `t1_tarea_asignada`). Las tareas de verdad están en Mi perfil. La persona no sabe dónde anotar "llamar al proveedor el jueves" (eso es una **tarea**: Mi perfil / calendario) y dónde "avisale a Fede que llegó el bronce" (eso es una **nota**: post-it). Ver UX-07.
- Las tareas **no se pueden tildar**. Una lista de pendientes que no se puede marcar no se usa.

La dirección (decidida arriba): **el calendario pasa a ser el centro** ("Mi día / mi semana / el equipo"), las tareas se ven y se marcan ahí, y desde ahí se carga todo.

---

## 2. Calendario: de vista a herramienta (P0 de usabilidad)

### UX-01 · Mis tareas en el calendario (Q-EQ-017)

**Hoy**: `CalendarioTab` / `armarMesCalendario` solo arma eventos de ausencias, feriados y cumpleaños.

**Qué hacer**
- Sumar a `armarMesCalendario` un tipo de evento `tarea` (privado) que recibe las ocurrencias de **mis** tareas en el rango de la grilla. Reutilizar `ocurrenciasEnSemana` semana por semana (o crear `ocurrenciasEnRango(tarea, desde, hasta, feriados)` en `tareasRecurrentes.ts`, con tests).
- Cada chip de tarea: "☐ Limpiar CNC" con estado: ☐ pendiente, ✅ hecha (tachada), ↷ movida (se ve en el día nuevo), ⏭ no hecha (gris), ⚠ atrasada (en el día de hoy, con "desde el jueves").
- Las tareas son **privadas**: se ven solo en el calendario de su dueño. El **admin** ve las suyas y puede activar "Ver tareas de…" (selector de persona) porque la RLS ya se lo permite.
- Interruptor "Mostrar mis tareas" (recordado en `localStorage` con try/catch) para quien quiera ver solo lo del equipo.
- Con muchos eventos el mes se satura: en la vista **mes**, si hay más de 2 tareas en el día mostrar "☐ 3 tareas" en un solo chip; el detalle va en el panel del día (UX-03).

### UX-02 · Un botón "+ Agregar" con opciones, y acciones sobre el día (pedido del dueño)

**Hoy**: dos botones fijos ("Cargar vacaciones", "Cambiar un día"); para tareas hay que ir a otra pestaña.

**Qué hacer**
- Un solo botón principal **"+ Agregar"** con menú: **Tarea** · **Vacaciones** · **Cambio de día** · (admin) **Día de la empresa** · (admin) **Ausencia de otra persona**.
- **Clic derecho** (o botón "⋯" que aparece al pasar el mouse, y mantener apretado en celular) sobre cualquier día → el mismo menú, **con la fecha ya cargada**: "Tarea para el jue 9", "Vacaciones desde el jue 9", "Faltar el jue 9". El repo ya tiene `src/components/ui/context-menu.tsx` (se usa en Pedidos: "Sumar regalo desde el menú contextual").
- **Arrastrar sobre varios días** (mousedown → mouseup) selecciona un rango → abre "Vacaciones del 12 al 16" ya completo.
- Todos los diálogos (`CargarVacacionesDialog`, `CambioDiaDialog`, `TareaRecurrenteDialog`) aceptan `fechaInicial` / `rangoInicial`.
- En "Tarea" desde un día: preseleccionar "Un solo día" con esa fecha y ofrecer "Repetir todos los {jueves}" como atajo (pasa a semanal con ese día marcado).

### UX-03 · Clic en un día → panel del día

**Hoy**: las celdas no hacen nada; se muestran hasta 4 chips y después "+2" que **no se puede abrir** (información escondida).

**Qué hacer**: clic en un día abre un panel lateral (o `Sheet`) "Jueves 9 de octubre" con:
- **Mis tareas** del día, cada una con sus acciones (UX-06).
- **Quién no está** (vacaciones, cambios de día, recuperos).
- Feriado / día de la empresa, cumpleaños.
- Botones "+ Tarea", "Tomarme este día", "Vacaciones desde acá".
- Admin: lo mismo para cargar a otra persona (selector).

### UX-04 · Clic en un chip → detalle y edición

**Hoy**: el chip solo tiene un `title` que repite el texto truncado. Para editar mis vacaciones tengo que bajar a "Mis vacaciones y cambios".

**Qué hacer**: clic en un chip abre un popover con el detalle (quién, desde/hasta, **cuántos días hábiles**, nota, "cargado por") y, si puedo, **Editar / Borrar**. Para tareas: título, descripción, frecuencia ("Todos los jueves"), quién la sumó, y las acciones de marcado.

### UX-05 · Detalles de la grilla que traban el uso

| ID | Qué pasa hoy | Arreglo |
|---|---|---|
| UX-05a | Cambiar de mes muestra el **spinner de página completa** y desarma todo (parpadeo, se pierde la posición). | Mantener la grilla y mostrar un indicador chico mientras carga el mes nuevo. |
| UX-05b | El filtro por persona funciona al revés de lo que parece: todos los chips se ven "encendidos" y el primer clic deja **solo** a esa persona. | Chips con estado claro + atajos "Todos" / "Solo yo". El filtro aplica a lo público; mis tareas se controlan con su interruptor. |
| UX-05c | En celular la grilla tiene `min-w-[640px]` (scroll horizontal) y chips de 9 px ilegibles. | Debajo de `sm`: vista **Agenda** (lista de días con sus eventos, próximos 14 días) en lugar de la grilla. Botones "Mes / Semana / Agenda" en escritorio también. |
| UX-05d | No hay vista **semana**. La semana es la unidad de trabajo de las tareas ("todos los jueves"). | Vista Semana (lun–dom en columnas, todos los eventos sin recortar). Reemplaza a "Mi semana" de la pestaña Tareas (UX-08). |
| UX-05e | El saldo de vacaciones solo está en el encabezado; al planificar en el calendario no se ve. | Mostrar "Te quedan N días" junto al botón "+ Agregar" (o en el panel del día). |
| UX-05f | "Hoy no están" del calendario incluye cambios de día; el de **Inicio del perfil** solo vacaciones y dice "Todos en la oficina" también un sábado o un feriado. | Una sola función (`quienesFaltanHoy`) para los dos; en fin de semana/feriado decir "Hoy no se trabaja (feriado: …)". |
| UX-05g | Cumpleaños de hoy: solo un chip chico. La empresa quiere celebrar a la gente. | Destacar el día en la grilla y en Inicio del perfil ("🎂 Hoy cumple Juli B"). Próximos cumpleaños (14 días) en Inicio. |

---

## 3. Tareas: que se puedan hacer (Q-EQ-018 a 023)

### UX-06 · Marcar ocurrencias: Hecha / Posponer / Mover / No hecha

**Modelo de datos** (migración nueva, **pedir OK antes de aplicar**):

```sql
-- Registro por ocurrencia (una fila cuando se marca algo; sin fila = pendiente).
CREATE TABLE public.tareas_registro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL REFERENCES public.tareas_recurrentes(id) ON DELETE CASCADE,
  fecha_programada date NOT NULL,          -- la ocurrencia original (ej. el jueves)
  estado text NOT NULL CHECK (estado IN ('hecha','no_hecha','movida')),
  fecha_destino date,                      -- solo 'movida' (posponer = hábil siguiente; mover = la que elija)
  marcado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  marcado_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tarea_id, fecha_programada),
  CHECK (estado <> 'movida' OR fecha_destino IS NOT NULL)
);
-- RLS: SELECT dueño de la tarea, admin, o quien la creó (Q-EQ-023: solo ve);
--      INSERT/UPDATE/DELETE solo dueño de la tarea o admin. Más es_miembro_equipo() si se aplicó EQ-R13.
```

**Reglas** (lógica pura nueva en `src/lib/equipo/tareasAgenda.ts`, con tests):
- `ocurrenciasPendientes(tareas, registros, desde, hasta, hoy, feriados, misAusencias)` devuelve, por día, las ocurrencias con su estado:
  - si cae en feriado / mis vacaciones / día que falto → se corre al próximo hábil que trabajo (S13; si son varias de la misma tarea en ese período, solo una se corre, el resto "No aplica");
  - sin registro y fecha < hoy → **atrasada** → se muestra **hoy** (Q-EQ-019);
  - `movida` → se muestra en `fecha_destino` (y si esa fecha también pasó sin marcar, vuelve a arrastrarse);
  - `hecha` / `no_hecha` → cerrada.
- **Posponer** = `movida` al próximo día hábil (salteando feriados y mis ausencias).
- **No hecha** solo se ofrece en tareas que se repiten (en las de un solo día, las opciones son Hecha / Posponer / Mover / Borrar).
- Agrupar atrasadas de la misma tarea (S14). Arranque del arrastre (S15).
- Deshacer: una marca se puede quitar (borra el registro) desde el mismo menú ("Desmarcar").

**Dónde se marca**: chip de tarea en el calendario (UX-04), panel del día (UX-03) y "Tareas de hoy" del Inicio del perfil (UX-10). Siempre el mismo componente `AccionesTarea`. Los post-its **no** (son notas, UX-07).

**Notificaciones**: ninguna nueva por marcar (Q-EQ-014 dijo no avisar al admin).

### UX-07 · Post-its = notas, no tareas (Q-EQ-020): separar bien los dos conceptos

**Decisión**: los post-its del Inicio son **notas / avisos** (para uno o entre compañeros) y quedan **separados** de las tareas. **No** crean tareas, **no** van al calendario, **no** se marcan como hechas/pospuestas. No se toca su funcionamiento.

**Hoy**
- Post-it personal: `useStickyNotes` en `src/app/home/index.tsx`, en `localStorage` (`dashboard_notes_{userId}`).
- Post-it para un compañero: `AddTaskToColleagueDialog` → `tareas_dashboard`; se cierra borrando la fila; notificación `t1_tarea_asignada` ("Te asignó: …"). La misma tabla lleva las tareas automáticas de reposición de stock (S17).

**Qué hacer (solo claridad, sin cambiar el modelo)**
- **Nombres**: lo que es nota no debería llamarse "tarea". En el Inicio, el botón / diálogo de compañero pasa a "Dejar una nota a…" y la notificación a "{nombre} te dejó una nota: …" (el `tipo` interno `t1_tarea_asignada` puede quedar para no romper historial; cambiar solo textos visibles). En Mi perfil, "Tareas" se mantiene.
- **Admin "Sumar tarea"** (Equipo) sigue siendo una **tarea** (va al calendario de la persona y se marca).
- Nada de `origen`, ni RLS para que compañeros creen tareas, ni migración de `tareas_dashboard`: **descartado**.
- Changelog y manual: explicar la diferencia en una línea ("Notas = avisos del Inicio. Tareas = lo que tenés que hacer, en tu calendario").

> Pendiente de criterio del dueño (no implementar sin preguntar): los post-its personales viven solo en el navegador (se pierden si cambiás de compu o borrás datos). Si se quiere que viajen entre dispositivos, habría que guardarlos en la base. Es otra decisión.

### UX-08 · La pestaña "Mis tareas" pasa a ser la de **gestión**

- La vista "Mi semana" se reemplaza por la vista Semana del calendario (UX-05d) para no tener dos semanas distintas. "Mis tareas" queda como lista para **crear, editar, ordenar y pausar** las que se repiten.
- Las de **un solo día** no se acumulan en la lista: se muestran "Próximas" (fecha ≥ hoy o atrasadas sin marcar) y "Hechas" colapsado (últimos 30 días). Hoy quedan para siempre bajo "Un solo día".
- El texto "Completar/posponer va en el Inicio (futuro)" de docs y comentarios queda obsoleto: actualizar.

### UX-09 · Deuda técnica de "Un solo día"

`migration_equipo_tareas_unicas.sql` **ya está aplicada** y guarda la fecha en `semana_inicio` (columna pensada para "lunes de referencia quincenal"). Ahora que las tareas de un solo día se marcan y se arrastran, conviene una columna propia:
- En la migración de UX-06: `ADD COLUMN fecha date`, `UPDATE ... SET fecha = semana_inicio, semana_inicio = NULL WHERE frecuencia = 'unica'`, y cambiar el CHECK a `frecuencia <> 'unica' OR fecha IS NOT NULL`. Hoy hay 1 fila en la tabla: es barato hacerlo ya.
- `TareaRecurrenteDialog` deja elegir sábado/domingo para un solo día, pero "Mi semana" solo muestra lunes a viernes: con la vista Semana del calendario (lun–dom) se resuelve; si no, avisar.

---

## 4. Inicio del perfil: de resumen a "mi día" (UX-10)

**Hoy** (`InicioPerfilTab`): seis tarjetas de texto. Problemas de uso:
- "Tareas de hoy" no se puede tildar y **ignora feriados** (llama a `ocurrenciasEnSemana` con `[]`): un feriado muestra tareas como si tocaran.
- "Corcho · N ideas nuevas → Ver ideas" lleva a **Mis ideas** (mis propias ideas), no al corcho donde están las nuevas.
- "Hoy no están" difiere del calendario (UX-05f) y dice "Todos en la oficina" un domingo.
- No hay ninguna acción: para cargar algo hay que ir a otra pestaña.

**Qué hacer**
- Primer bloque: **Mi día** — tareas de hoy + atrasadas con `AccionesTarea` (UX-06), y "+ Tarea para hoy".
- Atajos: "+ Vacaciones", "+ Cambio de día", "Pedir algo", "Pinchar una idea" (abren los diálogos ahí mismo).
- "Hoy no están" y "🎂 cumpleaños de hoy / próximos" con la misma lógica que el calendario.
- Corcho → `/corcho` (con "Solo nuevas" activado).
- Pasar feriados y mis ausencias a la lógica de ocurrencias.

---

## 5. Estructura y navegación

| ID | Qué pasa hoy | Propuesta |
|---|---|---|
| UX-11 | **10 pestañas** en una fila (11 el admin). En pantallas chicas se cortan; varias son de uso esporádico. "Mis ideas" duplica al corcho. | Reagrupar en 4: **Mi día** (inicio + calendario), **Tareas** (gestión), **Lo mío** (anotaciones, lo que necesito, crecimiento, feedback como sub-secciones), **Mis números**; "Mis ideas" pasa a ser el filtro "Mías" dentro de `/corcho`. Admin: **Equipo**. Cambiar `TABS_BASE` + redirecciones para los `?tab=` viejos que usan las notificaciones (`calendario`, `tareas`, `necesidades`, `feedback`, `ideas`, `equipo`). |
| UX-12 | Para cargar vacaciones o anotar una tarea desde cualquier pantalla hay que ir a Mi perfil → pestaña → botón. | Acceso rápido global (botón en el menú lateral o atajo de teclado) que abre el mismo menú "+ Agregar" de UX-02. |
| UX-13 | Admin: gestionar a una persona = tabla de 1020 px con **6 íconos sin texto** por fila (calendario, flechas, lista, corazón, lápiz, persona−). Difícil saber qué hace cada uno. | Clic en la fila → **ficha de la persona** (panel) con pestañas Datos · Ausencias · Tareas · Feedback · Objetivos · Pedidos. La tabla queda solo como lista. |
| UX-14 | Admin quiere cargarle algo a alguien mientras mira el calendario: tiene que irse a Equipo. | En el menú "+ Agregar" y en el panel del día, selector "Para: yo / {persona}". |
| UX-15 | "Objetivos" del Inicio de la app (metas de ventas) y "Mis objetivos" de Crecimiento usan la misma palabra para cosas distintas. | Renombrar en Crecimiento a "Mis metas" (o el término que elija el dueño) — **preguntar antes de cambiar textos visibles del Inicio**. |

---

## 6. Formularios y detalles

| ID | Qué pasa hoy | Propuesta |
|---|---|---|
| UX-16 | Vacaciones con **dos selectores separados** (Desde / Hasta): al elegir "Desde", "Hasta" queda vacío; si queda antes, el botón se deshabilita sin explicar. | Un solo calendario de **rango** que marque feriados, mis vacaciones ya cargadas y las de los demás; "Hasta" arranca en "Desde". Mensaje si el rango es inválido. |
| UX-17 | Borrar usa `window.confirm` (cuadro nativo del navegador) y no hay deshacer. | Diálogo de la app + toast con **Deshacer** (5 s) para borrar tarea, nota, ausencia, idea. |
| UX-18 | Crecimiento: los objetivos con **fecha** no aparecen en ningún lado más que en su tarjeta. | Mostrar mis fechas de objetivo como evento privado en el calendario ("🎯 Aprender Illustrator"). Opcional, confirmar con el dueño. |
| UX-19 | "Lo que necesito" no tiene fecha ni urgencia ("lo necesito para el viernes"). | Campo opcional "Para cuándo" — **es regla de negocio nueva: preguntar al dueño** antes de agregarlo. |
| UX-20 | El feedback recién llega como notificación; dentro de la pestaña no hay forma de agradecer o confirmar ("lo vi, gracias"). Por S10 no hay respuestas. | Dejar como está (decisión S10). Solo anotar que "leído" ya funciona como acuse. |

---

## 7. Orden sugerido

1. **Modelo de tareas** (UX-06, UX-09): una migración con `tareas_registro` y la columna `fecha`, con su RLS. **Pedir OK al dueño antes de aplicar.** Lógica pura `tareasAgenda.ts` con tests (arrastre, posponer, S13–S15).
2. **Calendario como centro** (UX-01 a UX-05): tareas en la grilla, "+ Agregar" con menú, clic derecho y arrastre, panel del día, detalle de chip, vista Semana/Agenda.
3. **Inicio del perfil = Mi día** (UX-10) y textos de notas vs tareas en el Inicio de la app (UX-07).
4. **Reestructura de pestañas y ficha de persona del admin** (UX-11, UX-13, UX-14).
5. Resto (UX-12, UX-15 a UX-19) según prioridad del dueño.

Por cada bloque: typecheck/lint/tests, prueba en el navegador con admin y no admin **recorriendo un día real** ("llego, veo qué tengo, marco, pospongo, cargo vacaciones desde el calendario, el admin me suma una tarea y la veo en mi calendario; le dejo una nota a un compañero y le llega como nota, no como tarea"), docs (módulo perfil, inicio, manual, políticas, open-questions) y changelog.
