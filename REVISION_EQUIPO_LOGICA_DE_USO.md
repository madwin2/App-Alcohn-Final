# Revisión de lógica de uso — rama `feature/equipo` (Mi perfil + Corcho)

> Fecha: 2026-10-05 · Alcance: todo lo que agrega la rama (`/perfil`, `/corcho`, servicios `equipo*.service.ts`, `src/lib/equipo/*`, migraciones `migration_equipo_*.sql`).
> Método: recorrer cada acción del usuario ("cuando hago X → qué pasa → ¿es correcto?") contra el código, la RLS y [`PLAN_PAGINA_PERSONAL.md`](PLAN_PAGINA_PERSONAL.md).
> Destinatario: **Cursor** (u otro agente) que aplica las correcciones.

---

## 0. Cómo usar este documento (para el agente)

1. Leé [`AGENTS.md`](AGENTS.md) y [`docs/02-modules/perfil/README.md`](docs/02-modules/perfil/README.md) antes de tocar nada.
2. Trabajá **por bloques en orden de prioridad** (P0 → P1 → P2). Cada ítem tiene: escenario, qué pasa hoy, qué debería pasar, dónde está y cómo arreglarlo, y el test a sumar.
3. Las preguntas de negocio (Q-EQ-007 a 016) **ya las respondió el dueño el 2026-10-05** (sección 5). Cada ítem afectado dice "✅ Decidido" con la instrucción concreta. Al implementar cada una, pasar su estado a "documentada" en `docs/14-open-questions/equipo.md` y sumar la regla en `docs/04-business-rules/politicas-confirmadas.md` (POL-056 en adelante).
4. **Base de datos = producción** (compartida con la tienda web). Cualquier cambio de RLS / trigger va en un **archivo de migración nuevo** en la raíz (`migration_equipo_fix_*.sql`) y **no se aplica** sin OK explícito del dueño. No editar las migraciones ya aplicadas.
5. Al terminar: `npm run typecheck`, `npm run lint`, `npm test`; actualizar docs (sección 6) y `src/lib/changelog/entries.ts` si el cambio es visible.

### Estado verificado (2026-10-05, solo lectura)

- ✅ Las 6 migraciones `migration_equipo_*.sql` **ya están aplicadas** en Supabase (tablas, RLS y las 3 funciones existen). La doc todavía dice "pendiente de aplicar" → corregir (sección 6).
- ✅ `perfiles_equipo` tiene **1 fila** (el admin). Fede, Cachi y Juli B **todavía no tienen perfil**: casi nada de la página se usó con datos reales. Buen momento para corregir antes de que se cargue información.
- ⚠️ Feriados nacionales: 20 de 2026, **0 de 2027**.
- ✅ `npx vitest run src/lib/equipo` → 95/95 tests OK. `npm run typecheck` tiene errores **preexistentes** en otros módulos; ninguno en archivos de esta rama.

---

## 1. Resumen

| Prioridad | Cantidad | Qué tipo |
|---|---|---|
| **P0** | 10 | Pérdida de datos, datos ajenos mostrados como propios, saldos de vacaciones mal calculados, acciones que "dicen que funcionaron" y no hicieron nada, admin que se puede dejar afuera |
| **P1** | 12 | Huecos de flujo (cosas que el usuario espera poder hacer y no puede, o que pasan sin aviso) |
| **P2** | 11 | Robustez, escalabilidad, prolijidad de UX |
| ✅ | 10 decisiones | Preguntas de negocio respondidas por el dueño (2026-10-05), sección 5 |

Los cinco más graves:

1. **Anotaciones pierden texto** (autoguardado con carrera + timer que se cancela al cambiar de pestaña). → EQ-R01
2. **"Lo que necesito" del admin muestra los pedidos de todos como si fueran suyos**, con botones de editar/borrar. → EQ-R02
3. **Borrar/pausar/desactivar "funciona" aunque la RLS no haya borrado nada** (toast "Borrado", la fila sigue). → EQ-R03
4. **El admin no tiene cómo corregir vacaciones/cambios de otro**, aunque la UI le dice al equipo "los pasados solo los corrige el admin". → EQ-R04
5. **El saldo de vacaciones se va a calcular mal** (feriados de 2027 sin importar, vista previa con feriados del mes en pantalla, y a partir de 2028 se ignoran feriados viejos). → EQ-R07, EQ-R08, EQ-R09

---

## 2. P0 — Errores que hay que corregir primero

### EQ-R01 · Anotaciones: se pierde texto escrito

**Archivo**: `src/components/perfil/AnotacionesTab.tsx`

**Escenario A (carrera del autoguardado)**
1. Escribo "Hola", paro 1 s → se dispara el guardado de "Hola".
2. Mientras viaja el request, sigo escribiendo " mundo" (queda otro guardado programado).
3. Vuelve la respuesta del primer guardado → `persist` hace `setNotas(...)` → el `useEffect([selectedId, notas])` **pisa el editor** con `n.contenido` = "Hola".
4. Escribo "!" → el editor arma "Hola!" y reprograma el guardado → **" mundo" se pierde para siempre**.

Con conexión lenta (taller, celular) esto pasa seguido; además el cursor salta al final.

**Escenario B (salir antes de 800 ms)**
Escribo y en menos de 800 ms cambio de pestaña (Radix desmonta `TabsContent`), voy a otra pantalla o cierro la pestaña → el `useEffect` de limpieza hace `clearTimeout` **sin guardar** → se pierde lo último escrito.

**Qué debería pasar**: nunca se pierde texto; el editor no se actualiza desde el servidor mientras el usuario está escribiendo en esa nota.

**Cómo arreglarlo**
- El efecto que carga título/contenido/fijada al editor debe depender **solo de `selectedId`** (cuando cambio de nota), no de `notas`. Al recibir la respuesta de `persist`, actualizar la lista (`setNotas`) **sin** tocar `titulo`/`contenido` del editor.
- Guardar el `id` y el patch pendientes en un ref (`pendingRef = { id, patch }`) y agregar `flushPendiente()` que, si hay timer, lo cancela y llama `persist` ya. Llamarlo:
  - en el cleanup del unmount (fire-and-forget),
  - antes de cambiar `selectedId` (al hacer clic en otra nota, en "Nueva" y en "Borrar"),
  - en `visibilitychange` (hidden) y `pagehide`.
- Evitar respuestas viejas: guardar un contador de versión por nota; si llega la respuesta de una versión anterior a la última enviada, ignorarla para `saveState`.
- Mostrar "Error al guardar · Reintentar" y no marcar "Guardado" si falló.

**Test**: extraer la lógica de cola de guardado a `src/lib/equipo/autoguardado.ts` (pura: `encolar`, `flush`, respuesta fuera de orden) y testearla con timers falsos de Vitest.

---

### EQ-R02 · "Lo que necesito": el admin ve los pedidos de todos como propios

**Archivos**: `src/lib/supabase/services/equipoNecesidades.service.ts` (`getMisNecesidades`), `src/components/perfil/NecesidadesTab.tsx`

**Escenario**: Fede pide "guantes talla M". Julián (admin) abre **su** pestaña *Lo que necesito* → aparece "guantes talla M" en **"Pendientes"** como si fuera suyo, con ✏️ y 🗑️.
- ✏️ **sí funciona** (la RLS deja al admin editar): Julián puede cambiar el texto del pedido de Fede sin querer.
- 🗑️ no borra (la RLS solo deja borrar al dueño) pero la UI lo saca de la lista sin error (ver EQ-R03).

**Causa**: `getMisNecesidades()` no filtra por usuario; la RLS de SELECT deja al admin ver todo.

**Arreglo**: filtrar por `user_id = auth.uid()` (mismo patrón que `getMisObjetivos` / `getMiFeedback`). Revisar que **todo** servicio "mis …" filtre explícitamente por el usuario logueado (no confiar en la RLS, porque el admin ve más).

**Test**: test de servicio con mock de supabase que verifique el `.eq('user_id', uid)`, o al menos revisión manual con usuario admin y no admin.

---

### EQ-R03 · Acciones que "funcionan" pero no hicieron nada (RLS filtra en silencio)

**Archivos**: todos los `equipo*.service.ts`.

Con RLS, un `DELETE`/`UPDATE` sobre una fila que no te corresponde **no da error**: afecta 0 filas. El código hace `.delete().eq('id', id)` y si no hay `error` muestra "Borrado".

| Función | Cuándo pasa |
|---|---|
| `borrarAusencia` | vacaciones que empiezan hoy / ya empezaron (no admin), cambio de fecha entre que se cargó la pantalla y el clic (cruce de medianoche) |
| `borrarNecesidadPendiente` | el admin resolvió el pedido mientras la persona lo tenía abierto; admin borrando pedido ajeno (EQ-R02) |
| `borrarIdeaCorcho` | el admin aprobó/descartó la idea mientras el autor la miraba |
| `borrarTareaRecurrente`, `pausarTareaRecurrente`, `reordenarTareasRecurrentes` | sesión de otro usuario / perfil desactivado |
| `borrarFeedback`, `borrarFeriado`, `desactivarPerfil` | admin desactivado en otra pestaña |

Los `update(...).select().single()` en cambio fallan con un error críptico de PostgREST (`PGRST116 … 0 rows`).

**Arreglo**
- En deletes/updates sin retorno: agregar `.select('id')` y si vuelve `[]` lanzar `new Error('No se pudo: puede que ya no tengas permiso o que haya cambiado. Recargá.')`.
- Crear un helper común `asegurarFilaAfectada(data, mensaje)` en `src/lib/supabase/services/` y usarlo en todos.
- Mapear `PGRST116` a ese mismo mensaje legible.
- En la UI, **no** sacar el ítem de la lista hasta que el servicio confirme; si falla, recargar.

---

### EQ-R04 · El admin no puede corregir ausencias de otro

**Archivos**: `src/components/perfil/EquipoTab.tsx`, `src/components/perfil/CalendarioTab.tsx`

**Escenario**: Cachi cargó por error vacaciones del 6 al 10 (ya empezaron). La pantalla le dice: *"Podés borrar los futuros. Los pasados solo los corrige el admin."* Julián va a **Equipo** → solo hay botones para **cargar** vacaciones/cambio de día de Cachi. No hay lista ni edición/borrado de las ausencias de otra persona. En su propio Calendario solo ve "Mis vacaciones y cambios" (las suyas).

**Qué debería pasar** (S5 + plan §6.4: "poder cargar o corregir por cualquiera"): el admin puede ver, editar y borrar ausencias de cualquiera.

**Arreglo**
- En `EquipoTab`, por persona: botón "Ver ausencias" que abre un diálogo con la misma lista "Próximos / Pasados" de `CalendarioTab` (extraer a un componente `ListaAusencias` reutilizable) con editar/borrar habilitados para el admin, reutilizando `CargarVacacionesDialog` / `CambioDiaDialog` en modo edición.
- Alternativa más simple: en el calendario, clic en un chip de ausencia → si sos admin o es tuya y futura, abre edición.
- Cambiar el texto para el no admin: "Para corregir algo que ya empezó, pedíselo a {nombre del admin}".

---

### EQ-R05 · Trampa de fechas pasadas: cargo algo y ya no lo puedo tocar

**Archivos**: `CargarVacacionesDialog.tsx`, `CambioDiaDialog.tsx`, RLS `ausencias_update` en `migration_equipo_calendario.sql`

**Escenarios**
- Un no admin carga vacaciones o un cambio de día con **fecha de hoy o pasada** (la RLS de INSERT lo permite). Al instante queda **bloqueado**: no lo puede editar ni borrar. Un error de tipeo (elegí 2025 en vez de 2026) queda trabado hasta que el admin lo arregle — y hoy el admin tampoco puede (EQ-R04).
- Editar unas vacaciones futuras y moverlas a una fecha pasada también se permite (`WITH CHECK` solo controla `user_id`), y después quedan bloqueadas.

**✅ Decidido (Q-EQ-007)**: la persona **solo carga a futuro**. Lo de hoy o retroactivo lo carga el admin.

**Qué hacer**
- UI (`CargarVacacionesDialog`, `CambioDiaDialog`): si quien carga **no** es admin, los date pickers no permiten elegir días `<= hoy` (hora AR) y, si llega una fecha así, el botón queda deshabilitado con el texto *"Para hoy o días que ya pasaron, pedíselo a {admin}."* Vale para crear y para editar (no se puede mover una ausencia al pasado). El recupero de un cambio de día **sí** puede ser cualquier fecha (Q-EQ-012).
- El admin puede cargar/editar cualquier fecha (para sí y para otros).
- RLS (migración nueva, con OK): para no admin, `ausencias_insert` y el `WITH CHECK` de `ausencias_update` exigen `fecha_desde > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`.

---

### EQ-R06 · Crecimiento: editar un objetivo logrado le cambia la fecha de logro

**Archivos**: `src/components/perfil/CrecimientoTab.tsx` (guardar edición), `equipoObjetivos.service.ts` (`actualizarObjetivo`)

**Escenario**: logré "Aprender Illustrator" el 10/03. En noviembre le corrijo un typo del título → el formulario siempre manda `estado` → el servicio pone `logrado_at = now()` → en "Logrados" figura logrado en noviembre y cambia el orden.

**Arreglo**: en el servicio, setear/limpiar `logrado_at` **solo si el estado cambia** (leer el estado anterior o recibir `estadoAnterior`); en la UI, mandar `estado` solo si cambió. Test unitario de la regla (extraer `patchEstadoObjetivo(anterior, nuevo, ahora)` a `src/lib/equipo/crecimiento.ts`).

---

### EQ-R07 · Saldo de vacaciones: feriados y ausencias cargados con ventanas fijas

**Archivos**: `src/app/perfil/index.tsx` (`loadSaldo`), `EquipoTab.tsx` (`load` + `saldosPorUser`), `CalendarioTab.tsx`, `TareasTab.tsx`

El saldo se calcula desde `vacaciones_saldo_base_fecha` (hoy 2026-10-02) **hasta siempre**, pero:
- `loadSaldo` trae feriados de `año-1` a `año+1`. En **2028**, las vacaciones de nov-2026 siguen restando pero ya no se cargan los feriados de 2026 → un feriado dentro de esas vacaciones pasa a contar como día hábil → **el saldo baja solo, de un año para otro**.
- `EquipoTab` trae **ausencias** solo de `año-1` a `año+1` → en 2028 las vacaciones de 2026 posteriores a la fecha base desaparecen del cálculo → **el saldo sube solo**. El encabezado de la persona y la columna del admin muestran números distintos.

**Arreglo**
- Una sola función de carga, p. ej. `getDatosSaldoVacaciones(userIds)` en `equipoCalendario.service.ts`, que traiga:
  - todas las ausencias de tipo `vacaciones` con `fecha_hasta > saldo_base_fecha` de esas personas (sin ventana de años),
  - feriados desde la **menor** `saldo_base_fecha` (o la menor `fecha_desde`) hasta la mayor `fecha_hasta`.
- Usarla en el encabezado, en `EquipoTab` y en el diálogo de carga. Test de regresión en `vacaciones.test.ts`: vacaciones en nov-2026 con feriado adentro, `hoy = 2028-03-01` → mismo descuento que en 2026.

---

### EQ-R08 · Diálogo "Cargar vacaciones": la vista previa y el aviso de superposición usan los datos del mes en pantalla

**Archivos**: `CalendarioTab.tsx` (props que le pasa al diálogo), `CargarVacacionesDialog.tsx`

**Escenarios**
- Estoy viendo **octubre 2026** y cargo vacaciones del 15 al 19 de **febrero 2027** (Carnaval). El calendario cargó feriados solo de `2025-12-01` a `2027-01-31` → Carnaval no está → *"Son 5 días hábiles · Te quedarían X"* cuando en realidad son 3. Después el encabezado (con otra ventana de feriados) muestra otro número.
- El aviso *"Fede también está de vacaciones…"* compara contra `ausenciasMes` (las del **mes que está en pantalla**) + las mías → si Fede tiene vacaciones en febrero y yo estoy mirando octubre, **no avisa**.

**Arreglo**: el diálogo no debe depender de lo que el calendario tenga cargado. Al elegir el rango, buscar (con debounce) feriados y ausencias de **todo el equipo** que toquen `[desde, hasta]` (`getAusencias({desde, hasta})`, `getFeriados({desde, hasta})`) + los datos de saldo de EQ-R07. Mostrar un spinner chico mientras calcula.

---

### EQ-R09 · Feriados de 2027 no importados → vacaciones de enero–marzo mal contadas

**Verificado**: 0 feriados nacionales 2027 en la base.

**Escenario**: alguien carga vacaciones en enero/febrero 2027 → los feriados no se descuentan → se resta de más. Cuando el admin importe 2027, el saldo **cambia solo** sin aviso. Solo el admin ve la advertencia "Faltan feriados…", y solo si abre la pestaña Equipo.

**Arreglo**
- En `CargarVacacionesDialog` / `CambioDiaDialog`: si el rango toca un año sin feriados nacionales cargados, mostrar *"Todavía no están cargados los feriados de 2027; el número puede cambiar."*
- En el encabezado del admin (o en su Inicio del perfil) mostrar el aviso de feriados faltantes, no solo dentro de Equipo.
- Operativo (no código): pedirle al admin que importe 2027 apenas la fuente lo publique.
- Si la API devuelve lista vacía, hoy el toast dice *"Ya estaban cargados (0 en la fuente)"* → cambiar a *"La fuente todavía no publicó feriados de 2027"*.

---

### EQ-R10 · Vacaciones superpuestas o sin días hábiles

**Archivos**: `CargarVacacionesDialog.tsx`, `vacaciones.ts`

**Escenarios**
- Cargo dos veces el mismo rango (doble clic lento, o edito y creo otro) → no hay validación → `saldoVacaciones` cuenta **dos veces** los mismos días.
- Cargo un rango que es solo sábado y domingo (0 días hábiles) → se guarda y **se notifica a todo el equipo** "Fede se toma vacaciones del 10/10 al 11/10".
- Cargo un cambio de día en un día en que ya estoy de vacaciones.

**Arreglo**
- En el diálogo: si el rango se superpone con **mis** vacaciones o cambios de día → error bloqueante "Ya tenés cargado algo esos días" (admin incluido, para la persona destino).
- Si `diasHabiles === 0` → no permitir guardar ("Ese rango no tiene días hábiles").
- Defensa en profundidad en `saldoVacaciones`: deduplicar días por fecha (un `Set` de días ya contados) para que una superposición que se cuele no reste dos veces. Test.
- Opcional (migración nueva, con OK): `EXCLUDE USING gist (user_id WITH =, daterange(fecha_desde, fecha_hasta, '[]') WITH &&)` en `ausencias_equipo` (requiere `btree_gist`). Preguntar al dueño antes.
- Bloquear el botón "Cargar" mientras `saving` ya está; asegurar que el doble clic no crea dos filas.

---

### EQ-R11 · El admin se puede dejar afuera a sí mismo (y a todos)

**Archivos**: `EquipoTab.tsx` (`handleSave`, `handleDesactivar`), RLS `perfiles_equipo`

**Escenarios**
- Julián edita **su propio** perfil y destilda "Administrador del equipo" (o se desactiva con el botón 👤−) → `es_admin_equipo()` pasa a `false` → pierde la pestaña Equipo, nadie más es admin y **ya no se puede revertir desde la app** (la RLS exige ser admin para escribir `perfiles_equipo`). Hay que ir a SQL.
- `handleSave` siempre manda `activo: true` → editar el perfil de alguien **inactivo** lo reactiva sin querer.

**Arreglo**
- UI: en tu propia fila, deshabilitar "Desactivar" y el checkbox de admin (con tooltip "No podés quitarte el rol a vos mismo").
- No mandar `activo` en `handleSave` (solo en Reactivar/Desactivar).
- DB (migración nueva, con OK): trigger `BEFORE UPDATE` en `perfiles_equipo` que rechace el cambio si deja **cero** filas con `es_admin AND activo`.

---

## 3. P1 — Huecos de flujo ("¿qué pasa cuando…?")

### EQ-R12 · Corcho: las ideas que llegan en vivo nunca aparecen como "Nueva"

**Archivo**: `src/components/corcho/CorchoBoard.tsx`

`nuevasSesion` se calcula solo en la carga inicial. Con Realtime se recarga con `preserveNuevasSesion: true`, así que una idea que Juli pincha **mientras yo tengo el corcho abierto**:
- no muestra el cartel "Nueva",
- no se marca como vista (el `IntersectionObserver` solo corre si `mostrarNueva`),
- sigue sumando en el badge del menú hasta que recargue la página.

**Arreglo**: en la recarga silenciosa, agregar a `nuevasSesion` los ids que son nuevos para mí (`esIdeaNuevaParaMi`) y que no estaban en la lista anterior. Test de la función de merge (extraerla a `corcho.ts`).

---

### EQ-R13 · Un integrante desactivado sigue teniendo acceso a todo lo del equipo

**Migraciones**: todas las políticas usan `TO authenticated` (cualquier usuario logueado), no "miembro activo del equipo".

**Escenario**: alguien se va de Alcohn, el admin lo desactiva. Mientras su cuenta siga viva puede: ver el calendario y cumpleaños de todos, cargar ausencias, pinchar ideas, votar, crear pedidos en "Lo que necesito". En la UI ve "Tu perfil todavía no está armado" pero el **Corcho** del menú le sigue funcionando.

Además, sus ausencias futuras siguen en el calendario como chips grises "Integrante" (las personas se cargan solo activas, las ausencias no se filtran).

**Arreglo**
- Ya: filtrar en el calendario las ausencias de personas que no están en `miembros` activos; en el corcho, mostrar el nombre real aunque esté inactivo (pedir miembros con `incluirInactivos`) con un "(ya no está)".
**✅ Decidido (Q-EQ-008)**: se corta el acceso. Solo los integrantes **activos** ven y usan lo del equipo; un usuario aprobado **sin** perfil tampoco.

- UI: ocultar "Corcho" del menú y bloquear `/corcho` para quien no tenga perfil activo (estado vacío: "El corcho es para el equipo. Pedile al admin que arme tu perfil."). En `/perfil`, mensaje distinto para perfil desactivado ("Tu perfil está desactivado").
- `useSidebarNotifications`: no consultar el badge del corcho si no hay perfil activo.
- RLS (migración nueva, con OK): función `public.es_miembro_equipo()` (`SECURITY DEFINER`, `STABLE`, `search_path = public`: existe fila en `perfiles_equipo` con `user_id = auth.uid() AND activo`). Sumarla (AND) a SELECT/INSERT/UPDATE/DELETE de `feriados` (SELECT), `ausencias_equipo`, `tareas_recurrentes`, `notas_personales`, `necesidades_equipo`, `objetivos_personales`, `feedback_equipo` (SELECT del destinatario), `ideas_corcho`, `ideas_corcho_votos`, `ideas_corcho_vistas`. `perfiles_equipo` SELECT: miembro activo **o** la propia fila (para que el desactivado vea su estado). `es_admin_equipo()` ya exige `activo`.
- Notas personales de un desactivado: quedan en la base, inaccesibles mientras esté inactivo (si se reactiva, las recupera).

---

### EQ-R14 · Cambiar o cancelar vacaciones no le avisa a nadie

**Archivo**: `CalendarioTab.tsx` (`handleVacaciones` en edición, `handleBorrar`)

Cargar vacaciones notifica a todo el equipo (`e1`). Pero si las **muevo** o las **cancelo**, el equipo se queda con el aviso viejo ("Cachi se toma vacaciones del 12/01 al 16/01") y nadie se entera del cambio.

**✅ Decidido (Q-EQ-009)**: sí, se avisa en los dos casos, al mismo público que `e1` (equipo activo menos la persona).

- Nuevas funciones en `src/lib/notificaciones/events.ts`: `notifyVacacionesCambiadas` (tipo `e1_vacaciones_cambiadas`, "Cachi cambió sus vacaciones: ahora del 19/01 al 23/01") y `notifyVacacionesCanceladas` (tipo `e1_vacaciones_canceladas`, "Cachi canceló sus vacaciones del 12/01 al 16/01"). Sumar los tipos a `src/lib/notificaciones/types.ts` y al catálogo de `docs/02-modules/notificaciones/README.md`.
- Disparar desde **todos** los lugares donde se edita/borra una ausencia de tipo vacaciones (Calendario y la corrección del admin de EQ-R04). Al editar, avisar solo si cambiaron las fechas (no por cambiar la nota).
- Cambios de día: siguen sin notificar (S6).

---

### EQ-R15 · Feedback editado después de leído: la persona no se entera

**Archivos**: `EquipoFeedbackDialog.tsx`, `equipoFeedback.service.ts`

El admin puede editar tipo, título y texto de un feedback ya leído. No se marca como no leído, no hay aviso, no queda "editado". La persona cree que sigue diciendo lo que leyó (y una **corrección** puede cambiar de sentido).

**✅ Decidido (Q-EQ-010)**: al editar un feedback (tipo, título o texto), **vuelve a Nuevo**, se muestra "Editado" y se avisa a la persona.

- Migración nueva (con OK): columna `editado_at timestamptz` en `feedback_equipo`.
- `actualizarFeedback`: si cambió tipo/título/texto, setear `editado_at = now()` y `leido_at = null` (la RLS de admin lo permite).
- Notificación nueva `e4_feedback_editado`: "{admin} editó un feedback que te dejó" (sin contenido, igual que `e4`).
- `FeedbackTab`: mostrar "Editado el {fecha}" cuando `editado_at` no es null; el contador de no leídos lo cuenta de nuevo.

---

### EQ-R16 · "Lo que necesito" solo tiene Pendiente / Resuelta

**Escenario**: Fede pide un repuesto. Julián quiere decir "lo pedí, llega el jueves" o "esto no se puede". Hoy la única acción es **Marcar resuelta** (con respuesta opcional). Para responder tiene que cerrar el pedido; para decir que no, también lo marca "resuelto" y a Fede le llega *"Julián resolvió tu pedido"* (y en su lista aparece **tachado**).

Además: si Fede edita el texto mientras está pendiente, el admin no se entera.

**✅ Decidido (Q-EQ-011)**: se mantiene **Pendiente / Resuelta**, sin estados nuevos.

- Solo mejoras sin cambio de regla: `notifyNecesidadResuelta` incluye la respuesta del admin en el `cuerpo` si la hay; en la lista de la persona, el pedido resuelto **no** se tacha cuando tiene respuesta (se ve la respuesta destacada), para no dar a entender "conseguido" si la respuesta fue negativa.

---

### EQ-R17 · La pestaña "Inicio del perfil" está vacía

`src/app/perfil/index.tsx` — la primera pestaña (y la que se abre por defecto) es un párrafo explicando las otras pestañas. Es lo primero que ve cada uno y no le dice nada de **él**.

**Propuesta (dentro del plan: "Inicio del perfil (resumen)")**, solo lectura y con datos que ya se cargan:
- Próximas vacaciones / cambio de día propios y saldo.
- "Hoy no están: …".
- Feedback sin leer (con link).
- Tareas que me tocan hoy (de `ocurrenciasEnSemana`).
- Ideas nuevas en el corcho.
- Pedidos pendientes (para mí) / bandeja de necesidades (para el admin).

No integra nada al Inicio de la app (eso sigue siendo futuro, §10 del plan).

---

### EQ-R18 · "Mi semana" muestra tareas en días en que estoy de vacaciones

**Archivo**: `TareasTab.tsx` (`semanaCols`)

La vista semanal no mira las ausencias de la persona: si estoy de vacaciones el miércoles, igual aparece "Limpiar CNC" ese día. Los feriados se marcan pero las vacaciones no.

**Arreglo**: cargar las ausencias de la persona para la semana visible y marcar el día "🏖 Vacaciones" / "↔ Cambio de día" (sin mover ni ocultar tareas: mover tareas por vacaciones no está definido).

---

### EQ-R19 · Cambio de día: el día de recupero no se valida

**Archivo**: `CambioDiaDialog.tsx`

Se puede elegir como recupero: el mismo día que falto, un día anterior a la falta, un feriado, un día en que estoy de vacaciones, o una fecha de otro año. Nada avisa.

**✅ Decidido (Q-EQ-012)**: el recupero **puede ser antes** del día que se falta (adelantar).

**Arreglo**: sin bloqueos; solo avisos si recupero = falta, si es feriado o si cae en vacaciones propias. El recupero puede ser pasado o futuro (no le aplica la regla de EQ-R05, que es sobre el día que se falta).

---

### EQ-R20 · Saldo base: la fecha base siempre es "hoy" y el texto es ambiguo

**Archivo**: `EquipoTab.tsx`

- Al crear un perfil o corregir el saldo, la fecha base se fuerza a hoy. Los saldos acordados son **al 2026-10-02**; si el admin crea los perfiles el 2026-10-10 y alguien ya cargó vacaciones en el medio, no hay forma de expresar "3 días al 2 de octubre".
- El texto *"Le quedan X días al día de hoy"* no dice si incluye o no las vacaciones ya **planificadas a futuro** (que se siguen restando aparte). El admin puede cargar el saldo "ya descontado" y se descuenta dos veces.

**Arreglo**: permitir elegir la **fecha base** (default hoy) y aclarar en el diálogo: *"Días disponibles a esa fecha, sin contar las vacaciones futuras ya cargadas (esas se restan solas). Hoy tiene N días planificados."* Sacar del subtítulo de Equipo los nombres y saldos hardcodeados (Fede 10, Cachi 0, Juli B 3) una vez creados los perfiles (dejarlos solo en la doc).

---

### EQ-R21 · Notificación con la misma pestaña abierta no refresca

**Archivo**: `src/app/perfil/index.tsx`

Si ya estoy en `/perfil?tab=feedback` y me llega "Julián te dejó una felicitación", al hacer clic la URL no cambia → no se recarga la lista ni el contador. Lo mismo con necesidades/tareas.

**Arreglo**: que las pestañas reciban una `refreshKey` que cambie al navegar desde una notificación (p. ej. `location.key`), o refrescar al recuperar foco (`visibilitychange`). El contador de feedback no leído también debería refrescarse con el foco.

---

### EQ-R22 · Mis números: comparación injusta y etiquetas contadas de más

**Archivos**: `equipoNumeros.service.ts`, `src/lib/equipo/misNumeros.ts`

- **Comparación**: el período actual se recorta a hoy (`clampRangoHastaHoy`), pero el anterior es completo. Un lunes a la mañana dice *"3 · −37 vs la semana anterior"*; el 2 del mes, *"−180 vs septiembre"*. Desmotiva y no es real.
  **Arreglo**: comparar contra el mismo tramo transcurrido del período anterior (lunes→lunes, 1→2 del mes, 1/1→misma fecha del año pasado) y decir "a esta altura de la semana pasada". Test en `misNumeros.test.ts`.
- **Etiquetas**: se cuentan **eventos** `csv_generado` + `etiqueta_descargada` (uno por orden y por evento). Una misma orden a la que le generé el CSV y le bajé la etiqueta cuenta **2**; si la bajé dos veces, 3.
  **✅ Decidido (Q-EQ-013)**: contar **envíos distintos** (órdenes distintas por período). Cambiar `countEnvioEventos` a traer `orden_id` en el rango y contar distintos (o RPC `count(DISTINCT orden_id)`); título de la tarjeta: "Envíos con etiqueta".
- **D11 con dos personas en producción**: ambas ven el mismo total (todo Hecho se atribuye al área). Mostrar la aclaración "Todo lo que se terminó en el taller (todavía no se registra quién)" para no confundir.

---

### EQ-R23 · El admin no se entera de cambios en lo que asignó / lo que se logra

- Si la persona **borra o pausa** una tarea que le sumó el admin, el admin no se entera (S7 corregido permite borrarla; no se definió aviso).
- Si alguien marca un objetivo como **Logrado**, nadie se entera (y la página quiere "orgullo por lo que se logra").

**✅ Decidido (Q-EQ-014)**: **no** se avisa en ninguno de esos casos. No hay nada que implementar; solo documentar la regla.

---

## 4. P2 — Robustez y prolijidad

| ID | Qué | Dónde | Arreglo |
|---|---|---|---|
| EQ-R24 | **`.in()` con todos los ids** → con ~150–200 ideas la URL supera el límite de PostgREST y el corcho / el badge del menú (que corre cada 60 s) fallan. Lo mismo la galería de envíos en período "año" (`.in('orden_id', …)` con cientos de órdenes). | `equipoCorcho.service.ts` (`fetchVotosPorIdea`, `fetchMisVistas`, `contarIdeasCorchoNuevas`), `equipoNumeros.service.ts` (`getGaleriaEnvios`) | Vistas: filtrar solo por `user_id` (son mías) y cruzar en memoria. Votos: traer todos (son pocos) o paginar por lotes de 100. Galería: join `sellos` → `ordenes!inner` con filtro por `envio_datos_cargado_por` y rango, paginado en servidor. |
| EQ-R25 | Pestaña inválida en `?tab=` o en `localStorage` → pantalla sin contenido. | `src/app/perfil/index.tsx` | Validar contra la lista de pestañas; si no existe, `inicio`. |
| EQ-R26 | Perfil **desactivado** ve "Tu perfil todavía no está armado. Pedile a Julián que lo complete." | idem | Mensaje distinto para `activo = false`. |
| EQ-R27 | Textos con "Julián" fijo ("Pedile a Julián", "Lo ves vos y Julián", badge "Sumada por Julián" si no encuentra el nombre). Si cambia el admin o hay dos, queda mal. | varios | Tomar el nombre del/los admin activos desde `getMiembrosEquipo`. Fallback "el admin". |
| EQ-R28 | Feriados nacionales: no se pueden ver ni borrar desde la UI (solo el conteo); si el gobierno mueve un feriado trasladable, la reimportación agrega el nuevo y deja el viejo. | `EquipoFeriadosPanel.tsx`, `importarFeriadosNacionales` | Listar nacionales del año con borrar; al importar, ofrecer "sincronizar" (borrar nacionales del año que ya no vienen en la fuente, con confirmación mostrando cuáles). |
| EQ-R29 | Mis números: cambiar de período rápido → una respuesta vieja puede pisar a la nueva. Miniaturas de la galería se resuelven de a una (24 llamadas en serie). | `MisNumerosTab.tsx`, `mapSellosGaleria` | Ignorar respuestas de un período que ya no es el actual (id de request). `Promise.all` con límite de concurrencia (p. ej. 6). |
| EQ-R30 | Feedback: la lista colapsada muestra el **Markdown crudo** (`**bien**`) y deja leer el texto sin "abrirlo" (el "leído" pierde sentido). | `FeedbackTab.tsx` | Mostrar solo el título/tipo hasta abrir, o texto plano sin marcas. |
| EQ-R31 | "Nueva" anotación crea una fila vacía en la base aunque no escriba nada; se acumulan notas "Sin título" vacías. | `AnotacionesTab.tsx` | Al cambiar de nota / salir, borrar la nota si sigue con título y contenido vacíos. |
| EQ-R32 | Calendario: los chips de vacaciones se dibujan también en sábado/domingo (ruido; esos días no cuentan). | `calendarioEquipo.ts` | Mostrar en fin de semana con menor opacidad o solo en días hábiles (decisión visual, no de negocio). |
| EQ-R33 | `perfiles_equipo` es legible por todo usuario logueado con **fecha de nacimiento con año** y saldos. D16 dice "se muestra sin el año" (solo UI). | RLS | **✅ Decidido (Q-EQ-015)**: puede quedar visible. **No se cambia nada.** |
| EQ-R34 | Votar idea **descartada** está bloqueado solo en la UI; la RLS lo permite. | `migration_equipo_corcho.sql` | Migración nueva: sumar `AND i.estado <> 'descartada'` al `WITH CHECK` de `votos_write`. |

---

## 5. Decisiones del dueño (respondidas el 2026-10-05)

Registradas en [`docs/14-open-questions/equipo.md`](docs/14-open-questions/equipo.md) (estado "respondida"). Al implementar: pasar a "documentada" y crear POL-056+.

| ID | Pregunta | Respuesta | Ítem |
|---|---|---|---|
| Q-EQ-007 | ¿Ausencias retroactivas (hoy o pasado)? | **No.** La persona solo carga a futuro; lo de hoy/pasado lo carga el admin. | EQ-R05 |
| Q-EQ-008 | ¿Al desactivar se corta el acceso? ¿Aprobado sin perfil usa el corcho? | **Se corta.** Solo integrantes activos; sin perfil tampoco. | EQ-R13 |
| Q-EQ-009 | ¿Avisar si cambian o cancelan vacaciones? | **Sí, en los dos casos.** | EQ-R14 |
| Q-EQ-010 | ¿Feedback editado vuelve a Nuevo y avisa? | **Sí:** vuelve a Nuevo, muestra "Editado" y notifica. | EQ-R15 |
| Q-EQ-011 | ¿Estados nuevos en "Lo que necesito"? | **No.** Se queda Pendiente / Resuelta. | EQ-R16 |
| Q-EQ-012 | ¿Recupero antes de la falta? | **Sí**, se puede adelantar. Solo avisos. | EQ-R19 |
| Q-EQ-013 | ¿"Etiquetas" = envíos o acciones? | **Envíos distintos** por período. | EQ-R22 |
| Q-EQ-014 | ¿Avisar al admin por tareas borradas/pausadas u objetivos logrados? | **No**, en ningún caso. | EQ-R23 |
| Q-EQ-015 | ¿Año de nacimiento visible por API? | **Sí**, no es problema. Sin cambios. | EQ-R33 |
| Q-EQ-016 | ¿Seguimiento de ideas aprobadas? | **Nada por ahora**; queda Aprobada. | — |

Sigue pendiente de OK (no es regla de negocio, es técnica): la restricción en base contra vacaciones superpuestas (EQ-R10, requiere extensión `btree_gist`). Mientras tanto, la validación de UI + deduplicación en el cálculo alcanzan.

---

## 6. Documentación a corregir en el mismo cambio

- `PLAN_PAGINA_PERSONAL.md` (tabla Avance) y `docs/02-modules/perfil/README.md`: las migraciones **ya están aplicadas** (verificado 2026-10-05); sacar "pendiente de aplicar".
- `docs/04-business-rules/politicas-confirmadas.md`: POL-042, 043, 044, 046, 048, 049 figuran "Pendiente (Etapa N)" aunque están implementadas → actualizar la columna.
- `docs/05-data/entidades/equipo.md`: documentar las reglas nuevas (no superposición de vacaciones, último admin, `WITH CHECK` de fechas) cuando se apliquen.
- `docs/manual/18-mi-perfil.md`: actualizar textos de botones/avisos que cambien (corrección de ausencias por el admin, avisos de feriados faltantes, Inicio del perfil).
- `docs/audits/`: registrar EQ-R03 (patrón "delete silencioso con RLS") como hallazgo general; probablemente aplica a otros módulos con RLS (tareas_dashboard, innovación).
- Changelog (`src/lib/changelog/entries.ts`): una entrada por bloque visible (p. ej. "Anotaciones: ya no se pierde lo que escribís", "El admin puede corregir vacaciones de cualquiera").

---

## 7. Orden sugerido de trabajo

1. **EQ-R01, EQ-R02, EQ-R03, EQ-R06** (sin migraciones, solo código; arreglan pérdida de datos y datos ajenos).
2. **EQ-R07, EQ-R08, EQ-R09, EQ-R10** (saldo de vacaciones correcto; conviene antes de que el admin cree los perfiles de Fede, Cachi y Juli B).
3. **EQ-R04, EQ-R11 (parte UI), EQ-R12, EQ-R17–R22** (huecos de flujo sin decisiones pendientes).
4. Migración `migration_equipo_fix_rls.sql` con: fechas futuras para no admin en `ausencias_insert` y `ausencias_update` (EQ-R05), `es_miembro_equipo()` en todas las políticas del equipo (EQ-R13), columna `feedback_equipo.editado_at` (EQ-R15), trigger de último admin (EQ-R11), votos sobre descartadas (EQ-R34) y, si se aprueba, exclusión de superposición (EQ-R10). **Pedir OK al dueño antes de aplicar.** Después, la UI que depende de esa migración (feedback editado, EQ-R15). Los avisos de vacaciones cambiadas/canceladas (EQ-R14) y el conteo de envíos distintos (EQ-R22) no necesitan migración: van en el bloque 3.
5. Documentar las decisiones (Q-EQ-007 a 016 → "documentada", POL-056+, manual de uso).
6. P2 restante.

Criterio de cierre por bloque: typecheck/lint/tests verdes, prueba en el navegador con un usuario **admin** y uno **no admin** recorriendo los escenarios de cada ítem, docs y changelog actualizados.
