# Perfil (página personal del equipo)

> Ruta: `/perfil` · Página: `src/app/perfil/index.tsx` · Componentes: `src/components/perfil/*`
> Corcho: `/corcho` · `src/app/corcho/index.tsx` · `src/components/corcho/*`
> Plan de diseño: [`PLAN_PAGINA_PERSONAL.md`](../../../PLAN_PAGINA_PERSONAL.md)
> Última verificación contra código: 2026-10-02 (Etapa 7)

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
- Notificación `e1_vacaciones_cargadas` al resto del equipo.
- Feriados: importación desde ArgentinaDatos (`api.argentinadatos.com`) + días de la empresa (admin).
- **Tareas recurrentes** (`tareas_recurrentes`): diaria / semanal / quincenal / mensual. Vista lista (reordenar, pausar) y “Mi semana”. Cada uno crea y edita **sus** tareas; el admin también puede sumarles (badge “Sumada por…”, notificación `e2_tarea_recurrente_asignada`). Completar/posponer queda para el Inicio (futuro).
- **Anotaciones** (`notas_personales`, D3): solo las ve quien las escribe; ni el admin. Lista + editor Markdown con vista previa, autoguardado (~800 ms), fijar y buscar. Los post-its del Inicio **no** se migran.
- **Lo que necesito** (`necesidades_equipo`, S8): la persona carga pedidos; los ve el admin. Notificación `e3_necesidad_nueva` al admin; al resolver, `e3_necesidad_resuelta` a la persona. Bandeja **Necesidades pendientes** en la pestaña Equipo.
- **Crecimiento** (`objetivos_personales`, S9): dos columnas **Mis objetivos** / **Quiero aprender**; estados Pendiente → En curso → Logrado (y Abandonado); sección Logrados. Lo ven la persona y el admin; solo la persona edita.
- **Feedback** (`feedback_equipo`, S10): lo escribe solo el admin (felicitación / mejora / corrección, Markdown); lo ven admin y destinatario. La persona marca leído (RPC `marcar_feedback_leido`); sin hilo de respuestas. Notificación `e4_feedback_nuevo` (dice el **tipo**, no el contenido). Contador de no leídos en la pestaña.
- **Corcho de ideas** (`ideas_corcho` + votos + vistas, D13–D15, S11–S12): ruta compartida `/corcho` (menú **Corcho**, badge si hay ideas nuevas) y pestaña **Mis ideas** en el perfil. Fondo de corcho, chinche/borde del color del autor, cartel **Nueva** (IntersectionObserver ~1 s; desaparece en la siguiente visita), votos 👍/👎 (no se vota la propia; descartadas no votan), filtros por persona/estado/solo nuevas, orden nuevas+puntaje o más recientes. Admin aprueba/descarta/vuelve a propuesta. Notificaciones `e5_idea_nueva` / `e5_idea_estado`. Separado de Innovación (D22). Realtime en ideas y votos.
- **Mis números** (D10–D12, Etapa 7): sin tablas nuevas. Solo lectura. Cada uno ve **solo los suyos**.
  - Área **producción**: sellos a `Hecho` y a `VECTORIZADO` vía `estado_historial` (campo `estado_fabricacion` / `estado_vectorizacion`; por ahora todos los Hecho se atribuyen a quien tiene área producción, D11). Se muestran aparte cuántos fueron de pedidos **Prueba** (`ordenes.tipo_pedido`).
  - Todos: datos de envío cargados (`ordenes.envio_datos_cargado_por`) y etiquetas generadas/descargadas (`envio_eventos.created_by`, tipos `csv_generado` / `etiqueta_descargada`).
  - **Sin métrica de ventas** hasta que exista “vendido por” (D12).
  - Período semana / mes / año, comparación con el período anterior, gráfico de barras de los últimos 6 meses.
  - **Galería**: miniaturas de sellos del período (`foto_sello` o preview PNG de vector), lazy y paginada. Producción = sellos que pasaron a Hecho; no producción = sellos de pedidos cuyo envío cargó la persona (atribución real). Clic → diseño, cliente y fecha.
- Entrada desde el menú lateral (**Mi perfil**) y desde la propia foto en el Inicio.

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

[Q-EQ-*](../../14-open-questions/equipo.md) (todas respondidas al 2026-10-02).

## Implementación relacionada

- `migration_equipo_perfiles.sql`, `migration_equipo_calendario.sql`, `migration_equipo_tareas_recurrentes.sql`, `migration_equipo_notas_necesidades.sql`, `migration_equipo_crecimiento_feedback.sql`, `migration_equipo_corcho.sql` (⚠️ no aplicar sin OK del dueño)
- `src/lib/supabase/services/equipo.service.ts`, `equipoCalendario.service.ts`, `equipoTareas.service.ts`, `equipoNotas.service.ts`, `equipoNecesidades.service.ts`, `equipoObjetivos.service.ts`, `equipoFeedback.service.ts`, `equipoCorcho.service.ts`, `equipoNumeros.service.ts`
- `src/lib/equipo/` (antigüedad, cumpleaños, colores, días hábiles, vacaciones, calendario, tareasRecurrentes, notasPersonales, crecimiento, feedback, corcho, misNumeros)
- `src/lib/hooks/useEquipoRol.ts`
- `src/app/perfil/index.tsx`, `src/app/corcho/index.tsx`, `src/components/perfil/*`, `src/components/corcho/*`
