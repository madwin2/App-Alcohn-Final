# Perfil (página personal del equipo)

> Ruta: `/perfil` · Página: `src/app/perfil/index.tsx` · Componentes: `src/components/perfil/*`
> Corcho: `/corcho` · `src/app/corcho/index.tsx` · `src/components/corcho/*`
> Plan de diseño: [`PLAN_PAGINA_PERSONAL.md`](../../../PLAN_PAGINA_PERSONAL.md)
> Última verificación contra código: 2026-10-05 (Etapa 7 + revisión EQ-R*)

## Propósito

Espacio personal de cada integrante del equipo (Julián Moreno, Cachi, Juli B, Fede, y los que vengan): quién soy, calendario compartido, tareas, anotaciones, necesidades, crecimiento, feedback, números y el corcho de ideas. Encaja con la visión de Alcohn de ser "un lugar donde la gente quiera trabajar" ([la-empresa](../../00-overview/la-empresa.md)).

Implementado según [`PLAN_PAGINA_PERSONAL.md`](../../../PLAN_PAGINA_PERSONAL.md) (etapas 0–7). La integración con el Inicio queda para el futuro (sección 10 del plan).

## Secciones

| Sección | Para qué | Etapa |
|---|---|---|
| **Encabezado** | Quién soy: foto, nombre, puesto, área, ingreso, antigüedad, cumpleaños, vacaciones disponibles | 1–2 ✅ |
| **Calendario del equipo** | Vacaciones, cambios de día, feriados y cumpleaños | 2 ✅ |
| **Tareas semanales** | Definir lo que hay que hacer cada semana / día / mes | 3 ✅ |
| **Anotaciones** | Notas largas privadas (distintas de los post-its del Inicio) | 4 ✅ |
| **Lo que necesito** | Pedir algo puntual (herramienta, insumo, personal) | 4 ✅ |
| **Crecimiento** | Objetivos personales y lo que quiero aprender | 5 ✅ |
| **Feedback** | Felicitaciones, mejoras y correcciones que deja el admin | 5 ✅ |
| **Corcho de ideas** | Ideas compartidas para mejorar la empresa (ruta `/corcho` + pestaña Mis ideas) | 6 ✅ |
| **Mis números + galería** | Métricas personales y vista previa de sellos | 7 ✅ |

## Usuarios

Cada usuario aprobado entra **solo a su** página (`/perfil`, sin parámetro de usuario). El admin (Julián Moreno, `perfiles_equipo.es_admin`) ve además la pestaña **Equipo** para crear/editar perfiles, importar feriados, cargar ausencias, **sumar tareas**, **dejar feedback** y ver objetivos de cada uno (solo lectura).

## Qué hay hoy (Etapas 1–7)

- Tabla `perfiles_equipo` con RLS (solo authenticated; escritura solo admin).
- Encabezado con foto, nombre, puesto, área, antigüedad, cumpleaños (sin año) y **días de vacaciones disponibles** (salvo `vacaciones_sin_limite`).
- Pestañas **Inicio del perfil**, **Calendario**, **Mis tareas**, **Anotaciones**, **Lo que necesito**, **Crecimiento**, **Feedback**, **Mis ideas**, **Mis números** y, para el admin, **Equipo**.
- Calendario mensual del equipo: vacaciones, cambios de día (falta / recupero), feriados nacionales y de empresa, cumpleaños. Filtro por persona. “Hoy no están”.
- Carga directa de vacaciones y cambios de día (sin aprobación). Aviso si el saldo queda negativo (no bloquea). Editar/borrar futuros (admin: también pasados).
- Notificaciones `e1_vacaciones_cargadas`, `e1_vacaciones_cambiadas` y `e1_vacaciones_canceladas` al resto del equipo (POL-058).
- Aviso en el **encabezado** (admin) si faltan feriados nacionales del año en curso o del siguiente (EQ-R09).
- Quien no es admin solo elige fechas **futuras** al cargar vacaciones o cambio de día; el admin corrige cualquier fecha desde **Equipo** → **Ver ausencias** (POL-056).
- Feriados: importación desde ArgentinaDatos (`api.argentinadatos.com`) + días de la empresa (admin).
- **Tareas recurrentes** (`tareas_recurrentes`): diaria / semanal / quincenal / mensual / **unica** (un solo día concreto; la fecha va en `fecha` o legacy `semana_inicio`). Pestaña **Tareas** = gestión (crear, reordenar, pausar); **Mi día** = marcar ocurrencias (`AccionesTarea`). Cada uno crea y edita **sus** tareas; el admin también puede sumarles (badge “Sumada por…”, notificación `e2_tarea_recurrente_asignada`).
- **Anotaciones** (`notas_personales`, D3): solo las ve quien las escribe; ni el admin. Lista + editor Markdown con vista previa, autoguardado (~800 ms), fijar y buscar. Los post-its del Inicio **no** se migran.
- **Lo que necesito** (`necesidades_equipo`, S8): la persona carga pedidos; los ve el admin. Notificación `e3_necesidad_nueva` al admin; al resolver, `e3_necesidad_resuelta` a la persona. Bandeja **Necesidades pendientes** en la pestaña Equipo.
- **Crecimiento** (`objetivos_personales`, S9): dos columnas **Mis objetivos** / **Quiero aprender**; estados Pendiente → En curso → Logrado (y Abandonado); sección Logrados. Lo ven la persona y el admin; solo la persona edita.
- **Feedback** (`feedback_equipo`, S10): lo escribe solo el admin (felicitación / mejora / corrección, Markdown); lo ven admin y destinatario. La persona marca leído (RPC `marcar_feedback_leido`); sin hilo de respuestas. Notificación `e4_feedback_nuevo` (dice el **tipo**, no el contenido). Contador de no leídos en la pestaña.
- **Corcho de ideas** (`ideas_corcho` + votos + vistas + comentarios, D13–D15, S11–S12, POL-075–078): ruta compartida `/corcho` (menú **Corcho**, badge si hay ideas nuevas, se actualiza mientras leés) y pestaña **Mis ideas** en el perfil (cada idea abre `/corcho?idea=<id>`). Fondo de corcho (apagado para que no compita), notas de papel del color del autor con **chinche de bronce**, columnas sin huecos (reparto en orden de izquierda a derecha), sello de goma **Aprobada/Descartada**, fecha relativa, cartel **Nueva** (IntersectionObserver ~1 s; desaparece en la siguiente visita). Filtro, orden y cartel usan las mismas "Nueva" **de la sesión** (las tarjetas no saltan cuando otro vota). Votos 👍/👎 (no se vota la propia; descartadas no votan). Filtros por persona / estado (**Activas** por defecto = sin descartadas, POL-078) / solo nuevas; orden nuevas+puntaje o más recientes; si los filtros no dejan nada, mensaje con **Limpiar filtros**.
  - Todo es papel claro, también las ventanas (formulario, idea abierta, confirmaciones): piezas en `src/components/corcho/corchoUi.tsx`; chinche y sello en `src/index.css` (`.corcho-chinche`, `.corcho-sello`). Encabezado compacto: título + contador + Pinchar; una fila de filtros (personas como avatares, estado, solo nuevas, orden en menú).
  - **Idea en grande** (`IdeaCorchoDialog`): texto completo, autor y fecha, estado con quién/cuándo lo cambió y su comentario, quién votó a favor y en contra, **comentarios** (opcionales, POL-077; se borra el propio o el admin) y acciones. El autor **edita solo si no tiene votos** (POL-076) y borra mientras es propuesta. El admin aprueba / descarta / vuelve a propuesta con comentario opcional precargado con el actual (no se pierde sin querer); **no** edita ideas ajenas (POL-075).
  - Los links `?pinchar=1`, `?soloNuevas=1` e `?idea=<id>` se usan una vez y se limpian de la URL.
  - Notificaciones `e5_idea_nueva` / `e5_idea_estado` / `e5_idea_comentario`, todas a `/corcho?idea=<id>`. Separado de Innovación (D22). Realtime en ideas, votos y comentarios. Demo: `/dev/corcho` o `/corcho?demo=1`.
  - ⚠️ Comentarios y permisos endurecidos requieren `migration_equipo_corcho_v2.sql` (pendiente de OK). Sin ella el corcho funciona igual, sin comentarios.
- **Mis números** (D10–D12, Etapa 7): sin tablas nuevas. Solo lectura. Cada uno ve **solo los suyos**.
  - Área **producción**: sellos a `Hecho` y a `VECTORIZADO` vía `estado_historial` (campo `estado_fabricacion` / `estado_vectorizacion`; por ahora todos los Hecho se atribuyen a quien tiene área producción, D11). Se muestran aparte cuántos fueron de pedidos **Prueba** (`ordenes.tipo_pedido`).
  - Todos: datos de envío cargados (`ordenes.envio_datos_cargado_por`) y etiquetas generadas/descargadas (`envio_eventos.created_by`, tipos `csv_generado` / `etiqueta_descargada`).
  - **Sin métrica de ventas** hasta que exista “vendido por” (D12).
  - Período semana / mes / año, comparación con el período anterior, gráfico de barras de los últimos 6 meses.
  - **Galería**: miniaturas de sellos del período (`foto_sello` o preview PNG de vector), lazy y paginada. Producción = sellos que pasaron a Hecho; no producción = sellos de pedidos cuyo envío cargó la persona (atribución real). Clic → diseño, cliente y fecha.
- Entrada desde el menú lateral (**Mi perfil**) y desde la propia foto en el Inicio.

## Alta al equipo (perfil laboral)

Estar **aprobado para usar la app** (`solicitudes_registro.estado = APROBADO`) **no** crea el perfil de equipo. El perfil (`perfiles_equipo`) lo crea el admin desde **Equipo** con puesto, área, fechas, color y vacaciones; sin perfil activo la persona ve el aviso «Tu perfil todavía no está armado» en Mi perfil y en el corcho (POL-057). Es a propósito: no todos los usuarios aprobados son integrantes (hay cuentas de prueba o compartidas) y los datos laborales no se pueden inferir.

La pestaña **Equipo** lista arriba los **usuarios de la app sin perfil** (`getUsuariosSinPerfil`, excluye la cuenta de prueba FB) con un botón **Sumar** que abre el alta con esa persona elegida. En **Mi día**, el admin ve cuántos faltan.

Estado verificado en la base el **2026-10-06**: solo Julián Moreno tiene perfil; los demás usuarios aprobados todavía no.

## Diseño de la pantalla (2026-10-06)

Misma estética que «Mes en curso» de Economía (paneles `rounded-3xl bg-white/[0.035]` sin borde, etiquetas grises en minúscula, números grandes, estado = punto + texto, bronce solo como acento). Piezas compartidas en `src/components/perfil/perfilUi.tsx` (reutiliza `src/components/economia/controlGastosUi.tsx`).

- Página a **ancho completo** (`max-w-[1920px]`, mismo contenedor que Economía); encabezado sin tarjeta con datos a la derecha; pestañas en píldora.
- **Mi día**: grilla de 12 columnas — Hoy (tareas + atajos) a la izquierda, resumen (hoy no están, vacaciones, cumpleaños, corcho, feedback, equipo) a la derecha; abajo el calendario (9 columnas) con **Mis vacaciones y cambios** al costado (3 columnas).
- **Tareas**: un panel por grupo, 2–3 por fila en pantallas anchas (en el diálogo del admin, una columna).
- **Lo mío**: anotaciones a alto completo (lista + editor); lo que necesito en formulario + pendientes/resueltos; feedback como lista + lectura.
- **Equipo**: tarjetas por integrante (en vez de la tabla), usuarios sin perfil, pedidos y feriados lado a lado.
- Diálogos: mismo material (`DIALOGO`, campos `CAMPO`, avisos `Aviso`).

## Saldos iniciales de vacaciones (referencia para el admin)

Al crear cada perfil en la pestaña Equipo (fecha base **2026-10-02**):

| Persona | Saldo base |
|---|---|
| Fede | 10 |
| Cachi | 0 |
| Juli B | 3 |

Julián Moreno: `vacaciones_sin_limite = true` (bootstrap de la migración); no se le calcula ni muestra saldo. Sus vacaciones sí aparecen en el calendario y notifican.

## Datos

Ver [equipo](../../05-data/entidades/equipo.md) y [usuarios](../../05-data/entidades/usuarios.md). Fotos de perfil: `src/lib/utils/userImages.ts` (no en la base). Métricas: lectura de `estado_historial`, `ordenes`, `envio_eventos`, `sellos` (sin tablas nuevas).

## Preguntas abiertas

[Q-EQ-*](../../14-open-questions/equipo.md) (Q-EQ-001 a 016 documentadas al 2026-10-05).

## Implementación relacionada

- `migration_equipo_perfiles.sql`, `migration_equipo_calendario.sql`, `migration_equipo_tareas_recurrentes.sql`, `migration_equipo_notas_necesidades.sql`, `migration_equipo_crecimiento_feedback.sql`, `migration_equipo_corcho.sql` — **aplicadas en Supabase** (verificado 2026-10-05).
- `migration_equipo_fix_rls.sql` — correcciones RLS/schema (EQ-R05, R11, R13, R15, R34): **pendiente de OK del dueño** antes de aplicar en producción.
  - **Revisión 2026-10-06 (no aplicar tal como está):** (1) restringe `feriados` a integrantes activos, pero `feriados` también la leen Economía y la meta dinámica de Inicio (`fetchFeriados`): sin perfil, la consulta devuelve vacío sin error y los días hábiles se calculan sin feriados; (2) `tr_select` pasa a `es_miembro_equipo()` y cualquier integrante vería las tareas de todos (hoy: propias o admin; contradice POL-066 «sus tareas, privadas»); (3) `tr_insert` deja de exigir `creado_por = auth.uid()`; (4) `ideas_insert` deja de exigir `estado = 'propuesta'`. Aporta `editado_at` en `feedback_equipo` y el trigger de último admin, que no hacen falta para que la app funcione. Corregir antes de aplicar y recién con los perfiles del equipo cargados.
- `src/lib/supabase/services/equipo.service.ts`, `equipoCalendario.service.ts`, `equipoTareas.service.ts`, `equipoNotas.service.ts`, `equipoNecesidades.service.ts`, `equipoObjetivos.service.ts`, `equipoFeedback.service.ts`, `equipoCorcho.service.ts`, `equipoNumeros.service.ts`
- `src/lib/equipo/` (antigüedad, cumpleaños, colores, días hábiles, vacaciones, calendario, tareasRecurrentes, notasPersonales, crecimiento, feedback, corcho, misNumeros)
- `src/lib/hooks/useEquipoRol.ts`
- `src/app/perfil/index.tsx`, `src/app/corcho/index.tsx`, `src/components/perfil/*`, `src/components/corcho/*`
