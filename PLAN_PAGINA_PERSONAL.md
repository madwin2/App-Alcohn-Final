# Plan — Página personal de cada integrante del equipo ("Mi perfil")

> Estado: **diseño acordado con el dueño (2026-10-02)**, para implementar **por etapas**.
> Antes de empezar cualquier etapa: leer [`AGENTS.md`](AGENTS.md), [`docs/01-product/equipo.md`](docs/01-product/equipo.md), [`docs/09-roles-permissions/README.md`](docs/09-roles-permissions/README.md), [`docs/02-modules/inicio/README.md`](docs/02-modules/inicio/README.md), [`docs/02-modules/notificaciones/README.md`](docs/02-modules/notificaciones/README.md) y [`docs/audits/seguridad.md`](docs/audits/seguridad.md).
> ⚠️ La base Supabase es **producción** y la comparte la tienda web: **cada migración se aplica solo con permiso explícito del dueño**. Nunca tocar tablas existentes salvo lo que esta guía indica.
> ⚠️ Las tablas de esta página guardan **datos personales**: **todas** nacen con RLS activado y políticas `TO authenticated`. Nada de `anon`.

---

## Cómo usar este plan (para el agente que implementa)

1. Se implementa **una etapa por vez, completa**: migración + servicio + UI + estados vacíos + errores + tests + documentación + novedades. No se pasa a la siguiente con cosas a medias.
2. Al terminar cada etapa: `npm run typecheck`, `npm run lint`, `npm test`, y probar en el navegador con un usuario **admin** y uno **no admin**.
3. Marcar la etapa como hecha en la [tabla de avance](#avance) con la fecha.
4. Si algo **no está definido acá**, no inventarlo: ver [Preguntas abiertas](#11-preguntas-abiertas) y preguntar al dueño.
5. Los "**Supuestos por defecto**" (sección 2.2) se pueden implementar tal cual, pero se le muestran al dueño al terminar la etapa para que los confirme.

### Avance

| Etapa | Qué | Estado |
|---|---|---|
| 0 | Documentación previa y preguntas | ✅ 2026-10-02 |
| 1 | Base: perfiles, rol admin, ruta `/perfil`, encabezado, panel "Equipo" | ✅ 2026-10-02 (migración pendiente de aplicar en Supabase) |
| 2 | Calendario del equipo: feriados, vacaciones, cambios de día, cumpleaños | ✅ 2026-10-02 (migración pendiente de aplicar en Supabase) |
| 3 | Tareas semanales (definición) | ✅ 2026-10-02 (migración pendiente de aplicar en Supabase) |
| 4 | Anotaciones y "Lo que necesito" | ✅ 2026-10-02 (migración pendiente de aplicar en Supabase) |
| 5 | Crecimiento y Feedback | ✅ 2026-10-02 (migración pendiente de aplicar en Supabase) |
| 6 | Corcho de ideas | ✅ 2026-10-02 (migración pendiente de aplicar en Supabase) |
| 7 | Mis números y galería | ✅ 2026-10-02 (sin migración nueva) |
| — | (Futuro, **no implementar**) Integración con Inicio | — |

---

## 1. Qué queremos (en palabras del negocio)

Alcohn quiere ser "un lugar donde la gente quiera trabajar": flexibilidad, que cada uno importe, que aprendan y crezcan, que se premie la creatividad y haya orgullo por lo que se hace ([la-empresa.md](docs/00-overview/la-empresa.md)). Hoy la app no tiene ningún espacio de la persona: solo el Inicio, con post-its guardados en el navegador.

La **página personal** es el lugar de cada integrante (Julián Moreno, Cachi, Juli B, Fede, y los que vengan):

| Sección | Para qué |
|---|---|
| **Encabezado** | Quién soy: foto, nombre, puesto, área, fecha de ingreso, antigüedad, cumpleaños, días de vacaciones que me quedan |
| **Calendario del equipo** | Cargar mis vacaciones y mis cambios de día; ver cuándo falta cada uno, los feriados y los cumpleaños |
| **Tareas semanales** | Anotar lo que tengo que hacer cada semana (o cada día, o cada mes) y qué día |
| **Anotaciones** | Notas largas y desarrolladas, **privadas** (distintas de los post-its rápidos del Inicio) |
| **Lo que necesito** | Pedir algo puntual (una herramienta, un insumo, algo personal) |
| **Crecimiento** | Mis objetivos personales y lo que quiero aprender |
| **Feedback** | Lo que me deja Julián: felicitaciones, mejoras y correcciones sobre mi trabajo |
| **Mis números + galería** | Lo que fui haciendo (solo lo veo yo) y la vista previa de mis sellos |
| **Corcho de ideas** | Un corcho **compartido** con ideas para mejorar la empresa; cada persona tiene su color; se vota 👍 / 👎 |

La página es **nueva** (`/perfil`). Más adelante se decide qué partes se muestran también en el Inicio (sección 10).

---

## 2. Decisiones

### 2.1 Decisiones tomadas con el dueño (no volver a preguntar)

| # | Decisión |
|---|---|
| D1 | Cada uno tiene **su** página y entra **solo a la suya**. No se navega al perfil de un compañero. |
| D2 | Hay un **rol de administrador** (Julián Moreno). El admin puede dejar **feedback** a cada uno y **sumarle tareas semanales**. Se implementa con un rol liviano en la base (`perfiles_equipo.es_admin`), **no** con un sistema de permisos por pantalla. Si en algún momento resulta complejo, el plan B es el email del dueño hardcodeado, como Economía ([09-roles-permissions](docs/09-roles-permissions/README.md)). |
| D3 | Las **anotaciones son privadas**: solo las ve quien las escribe. **Ni el admin.** |
| D4 | El **calendario lo ve todo el equipo** (vacaciones, cambios de día, feriados y cumpleaños de todos). |
| D5 | Todos trabajan de **lunes a viernes**. |
| D6 | Las vacaciones y los cambios de día **se cargan directamente**: no hay aprobación ni pedido. Tampoco hay que justificar el motivo. La idea es dar libertad. |
| D7 | Cada uno tiene **10 días hábiles** de vacaciones (ver Q-EQ-001 para el período). |
| D8 | **Feriados**: se traen los nacionales de una fuente pública y el admin puede agregar días propios de la empresa. |
| D9 | Las **tareas semanales** las define cada uno; el admin también puede sumarles. En esta etapa **solo se definen**: marcarlas hechas / posponer va en el Inicio, más adelante (sección 10). |
| D10 | **Mis números** son personales: cada uno ve solo los suyos. Es un detalle, no el centro de la página. |
| D11 | **Producción**: por ahora todos los sellos que pasan a `Hecho` se le suman a quien tenga el área principal **producción** (hoy Fede, que hace todo). Más adelante se hará más preciso. |
| D12 | **Ventas**: el pedido **no** es necesariamente de quien lo cargó (`ordenes.taken_by`). Por eso **no** se muestran "ventas" por persona hasta que exista un campo "vendido por" (backlog, sección 10). |
| D13 | **Corcho**: compartido, cada persona tiene un **color**. Las ideas se pueden **filtrar por color/persona**. |
| D14 | **Corcho — estados**: una idea nueva muestra un cartelito **"Nueva"** la primera vez que **cada persona** la ve. Después puede quedar **descartada** (se ve en gris) o **aprobada** ("esta está buena, la vamos a hacer"). |
| D15 | **Corcho — votos**: cada persona puede reaccionar con 👍 o 👎; se suman como votos. |
| D16 | Datos personales: solo **cumpleaños** y **fecha de ingreso** (más puesto/área). Nada de DNI, dirección, salud ni datos bancarios. |
| D17 | "Quién cubre cuando falta" **no** se hace por ahora. |
| D18 | Las vacaciones son por **año calendario**: cada 1/1 se **suman 10 días hábiles** nuevos. Los que no se usan **se acumulan** al año siguiente (Q-EQ-001). |
| D19 | **Saldo inicial** al 2026-10-02 (lo que le queda a cada uno del 2026): **Fede 10**, **Cachi 0**, **Juli B 3**. El 1/1/2027 cada uno suma 10. |
| D19b | **Julián Moreno no tiene límite de vacaciones** (`vacaciones_sin_limite = true`): sus vacaciones se ven en el calendario como las de todos, pero no se le calcula saldo ni se le muestra contador ni aviso (Q-EQ-006). |
| D19c | Un **cambio de día sin recupero** (falta y no lo recupera) **solo queda registrado**: no descuenta vacaciones (Q-EQ-002). |
| D20 | Email de login del dueño (admin inicial): `julian.475@hotmail.com` (Q-EQ-003). |
| D21 | Tarea **mensual** cuyo día cae en fin de semana o feriado: pasa al **día hábil siguiente** (Q-EQ-005). |
| D22 | El corcho y el módulo **Innovación** van **separados** (Q-EQ-004). |

### 2.2 Supuestos por defecto (implementar así; confirmar con el dueño al cerrar cada etapa)

| # | Supuesto | Etapa |
|---|---|---|
| S1 | Se entra a "Mi perfil" desde el **menú lateral** y haciendo clic en **la propia foto** en el Inicio. | 1 |
| S2 | El admin gestiona al equipo desde una pestaña **"Equipo"** dentro de su propio perfil (solo la ve él). | 1 |
| S3 | En el calendario y en el encabezado el cumpleaños se muestra **sin el año**. | 1–2 |
| S4 | Se puede cargar más vacaciones que el saldo: la app **avisa** ("te quedarían −2 días") pero **no bloquea** (D6: libertad). | 2 |
| S5 | Cada uno puede editar o borrar sus vacaciones y cambios de día **futuros**. Los pasados solo los corrige el admin. | 2 |
| S6 | Cuando alguien carga vacaciones, se avisa a todo el equipo con una notificación interna. Los cambios de día **no** notifican (son chicos y frecuentes). | 2 |
| S7 | ~~Solo pausar si la sumó el admin~~ **Corregido (dueño 2026-10-02)**: quien tiene la tarea (`user_id`) la crea, edita, pausa y borra; el admin también puede sumarle (notificación). El badge “Sumada por…” es informativo. | 3 |
| S8 | **"Lo que necesito"** lo ven la persona y el admin. Al admin le llega una notificación. El admin la marca como resuelta. | 4 |
| S9 | **Crecimiento** (objetivos y "quiero aprender") lo ven la persona y el admin, para poder ayudar. Solo la persona lo edita. | 5 |
| S10 | **Feedback**: lo escribe solo el admin; lo ven el admin y el destinatario. La persona puede marcarlo como leído, pero **no responder** (sin hilo de respuestas por ahora). Le llega una notificación. | 5 |
| S11 | **Corcho**: aprobar o descartar una idea lo hace **solo el admin**. El autor puede editar o borrar su idea mientras no esté aprobada ni descartada. **No se puede votar la idea propia.** Se muestran los conteos 👍/👎 y, al pasar el mouse, quién votó. | 6 |
| S12 | **Corcho**: las tarjetas se ordenan en una grilla (no se arrastran libremente), con aspecto de corcho y chinche del color del autor. Orden por defecto: "Nuevas para mí" primero, después las más votadas. | 6 |

---

## 3. Lo que ya existe y hay que reutilizar

| Qué | Dónde | Uso en este plan |
|---|---|---|
| Nombre visible de cada usuario | `solicitudes_registro` (`user_id`, `nombre`, `apellido`, `email`, `estado = 'APROBADO'`) | Lista de integrantes y nombres (como hace `dashboard-tasks.service.ts`) |
| Fotos de perfil | `src/lib/utils/userImages.ts` (`public/usuarios/`, por nombre) | Avatar del encabezado y del corcho. **No** mover a la base en este plan |
| Email del dueño | `Sidebar.tsx` (`isEconomiaUser`) y RLS de `precios_*` (`auth.jwt() ->> 'email'`) | Solo para el **bootstrap** del admin (Etapa 1) |
| Notificaciones internas | RPC `emitir_notificacion(..., p_user_ids uuid[])`, helper `emitNotificacionSafe` en `notificaciones.service.ts`, eventos en `src/lib/notificaciones/events.ts` | Tipos nuevos `e1`…`e5` (sección 9) |
| Fechas en hora argentina | `src/lib/utils/argentinaDate.ts` | Todo lo que sea "hoy", semana, mes |
| Calendario / date picker | `src/components/ui/calendar.tsx`, `custom-calendar.tsx`, `date-picker.tsx` (`react-day-picker`, `date-fns`) | Selector de rangos; la grilla mensual del equipo es un componente nuevo |
| Markdown | `marked` + `dompurify` (ya son dependencias) | Anotaciones y feedback con formato. **Siempre** sanitizar con DOMPurify |
| Tabs, dialog, select, badge, card, tooltip | `src/components/ui/*` (Radix) | Layout de la página |
| Historial de estados | `estado_historial` (`campo`, `estado_nuevo`, `changed_at`, `sello_id`; **no guarda el usuario**) | Métricas de producción (Etapa 7) |
| Novedades para el equipo | `src/lib/changelog/entries.ts` (regla `.cursor/rules/changelog-novedades.mdc`) | Una entrada por etapa visible |

**No reutilizar** `tareas_dashboard` para las tareas semanales: ahí "completar" es **borrar** la fila, y las semanales necesitan persistir y repetirse.

---

## 4. Etapa 0 — Documentación previa

1. Crear `docs/02-modules/perfil/README.md` con el propósito, las secciones de la tabla de la sección 1 y la frase "en construcción, ver `PLAN_PAGINA_PERSONAL.md`".
2. Agregar la fila del módulo en `docs/02-modules/README.md` y en el índice de ruteo de `docs/README.md`.
3. Crear `docs/14-open-questions/equipo.md` con las preguntas de la sección 11 (formato igual a los otros archivos) y sumarlas a la tabla de pendientes de `docs/14-open-questions/README.md`.
4. Registrar D1–D17 en `docs/04-business-rules/politicas-confirmadas.md` con IDs `POL-xxx` correlativos.

Criterio de cierre: la documentación existe y las preguntas Q-EQ están registradas.

---

## 5. Etapa 1 — Base: perfiles, admin, ruta y encabezado

### 5.1 Migración `migration_equipo_perfiles.sql` (raíz)

```sql
-- Perfil laboral de cada integrante (1 fila por usuario). Datos personales: RLS obligatorio.
CREATE TABLE IF NOT EXISTS public.perfiles_equipo (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  puesto text,                                   -- texto libre: "Ventas y logística", "Producción"...
  area_principal text CHECK (area_principal IS NULL OR area_principal IN ('ventas','logistica','produccion','administracion')),
  fecha_ingreso date,
  fecha_nacimiento date,                         -- se muestra sin el año
  color text NOT NULL DEFAULT '#9CA3AF' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),  -- color en el corcho y el calendario
  dias_vacaciones_anuales int NOT NULL DEFAULT 10 CHECK (dias_vacaciones_anuales BETWEEN 0 AND 60),
  -- Saldo de vacaciones conocido a una fecha (D19). Desde ahí la app suma 10 cada 1/1 y resta lo cargado.
  vacaciones_saldo_base numeric(5,1) NOT NULL DEFAULT 0,
  vacaciones_saldo_base_fecha date NOT NULL DEFAULT CURRENT_DATE,
  vacaciones_sin_limite boolean NOT NULL DEFAULT false,   -- D19b: el dueño
  es_admin boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,          -- false = ya no está en el equipo (no se borra)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ¿El usuario actual es admin? SECURITY DEFINER para poder usarla dentro de políticas sin recursión.
CREATE OR REPLACE FUNCTION public.es_admin_equipo()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfiles_equipo WHERE user_id = auth.uid() AND es_admin AND activo);
$$;
REVOKE ALL ON FUNCTION public.es_admin_equipo() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.es_admin_equipo() TO authenticated;

ALTER TABLE public.perfiles_equipo ENABLE ROW LEVEL SECURITY;

-- Todo el equipo lee los perfiles (hace falta para el calendario: nombre, color, cumpleaños).
CREATE POLICY perfiles_equipo_select ON public.perfiles_equipo
  FOR SELECT TO authenticated USING (true);
-- Solo el admin crea / edita / desactiva perfiles (incluido es_admin).
CREATE POLICY perfiles_equipo_admin_insert ON public.perfiles_equipo
  FOR INSERT TO authenticated WITH CHECK (public.es_admin_equipo());
CREATE POLICY perfiles_equipo_admin_update ON public.perfiles_equipo
  FOR UPDATE TO authenticated USING (public.es_admin_equipo()) WITH CHECK (public.es_admin_equipo());
-- Sin DELETE: se desactiva con activo = false.

-- Bootstrap: el dueño es el primer admin (mismo email que Economía/Precios).
INSERT INTO public.perfiles_equipo (user_id, es_admin, area_principal, puesto, vacaciones_sin_limite)
SELECT id, true, 'administracion', 'Dueño / administración', true
FROM auth.users WHERE lower(email) = 'julian.475@hotmail.com'
ON CONFLICT (user_id) DO UPDATE SET es_admin = true, vacaciones_sin_limite = true;
```

Agregar un trigger `updated_at` (como en otras tablas del repo, si existe una función genérica; si no, una función propia `set_updated_at_perfiles_equipo`).

> Revisar que `SELECT ... FROM auth.users` en la migración traiga una fila. Si trae 0, frenar y avisar al dueño (el email está confirmado, D20, así que sería otro problema).

**Saldos iniciales (D19)**: no van en la migración (los perfiles de Fede, Cachi y Juli B todavía no existen). El admin los carga al crear cada perfil en la pestaña Equipo: Fede **10**, Cachi **0**, Juli B **3**, todos con fecha base **2026-10-02**. Dejar estos valores escritos en `docs/02-modules/perfil/README.md` como referencia.

### 5.2 Servicio `src/lib/supabase/services/equipo.service.ts`

- `getMiembrosEquipo()`: une `perfiles_equipo` (activos) con `solicitudes_registro` (aprobados) → `{ userId, nombre, puesto, areaPrincipal, fechaIngreso, fechaNacimiento, color, diasVacacionesAnuales, esAdmin }`.
- `getMiPerfil(userId)`.
- `getUsuariosSinPerfil()` (solo admin): aprobados en `solicitudes_registro` sin fila en `perfiles_equipo`. Excluir la cuenta FBTEST (ver `isPathAllowedForUser`).
- `upsertPerfil(...)`, `desactivarPerfil(userId)` (solo admin).
- Mapear snake_case → camelCase como el resto de los servicios.

### 5.3 Lógica pura `src/lib/equipo/` (con tests)

- `antiguedad.ts`: `calcularAntiguedad(fechaIngreso, hoy)` → `{ anios, meses, dias }` y texto "2 años y 3 meses" / "4 meses" / "Ingresó hoy".
- `cumpleanios.ts`: `proximoCumpleanios(fechaNacimiento, hoy)`, `esCumpleaniosHoy`, formato "14 de marzo" (sin el año). Contemplar el 29/02 (en años no bisiestos → 28/02).
- Tests en `src/lib/equipo/*.test.ts`.

### 5.4 Hook de rol

`src/lib/hooks/useEquipoRol.ts`: devuelve `{ perfil, esAdmin, loading }` del usuario logueado (una sola consulta, cacheada en memoria o en un store zustand). El control real es la RLS: el hook solo decide qué se **muestra**.

### 5.5 Ruta y navegación

- `src/app/perfil/index.tsx`, ruta `/perfil` dentro de `AuthenticatedLayout` (fuera de `OrdersScopeLayout`, no necesita pedidos).
- Sin parámetro de usuario: **siempre** muestra el perfil del logueado (D1).
- Ítem **"Mi perfil"** en `Sidebar.tsx` (oculto para la cuenta FBTEST).
- En el Inicio, clic en la **propia** foto → `/perfil` (S1).
- Si el usuario no tiene perfil todavía: estado vacío "Tu perfil todavía no está armado. Pedile a Julián que lo complete." (el admin nunca ve esto porque se crea en el bootstrap).

### 5.6 Layout de la página

- **Encabezado** (`src/components/perfil/PerfilHeader.tsx`): foto (`userImages`), nombre, puesto, área, "En Alcohn desde el 3 de agosto de 2023 · 2 años y 2 meses", cumpleaños (S3) y un lugar para "Vacaciones: X de 10 días disponibles" (se llena en la Etapa 2).
- **Pestañas** (`Tabs` de Radix) con las secciones; en esta etapa solo existen **Inicio del perfil** (resumen) y, para el admin, **Equipo**. Las demás se agregan en cada etapa. Recordar la pestaña elegida en `localStorage` (con try/catch).
- Usar el estilo visual de la app (mismos tokens de Tailwind que Inicio).

### 5.7 Pestaña "Equipo" (solo admin, S2)

- Tabla de integrantes: nombre, puesto, área, ingreso, cumpleaños, color, días de vacaciones anuales, saldo base de vacaciones (días + fecha), activo.
- El saldo base se edita **solo** para corregir: al guardarlo, la fecha base pasa a ser hoy y el texto lo aclara ("Le quedan X días al día de hoy").
- Botón **"Agregar al equipo"**: elegir un usuario de `getUsuariosSinPerfil()` y completar los datos.
- Editar en un diálogo. Selector de **color** con una paleta fija de 10 colores bien distintos entre sí (definida en `src/lib/equipo/colores.ts`), sin repetir el de otro integrante activo (avisar si se repite).
- Esta pestaña es la base donde las etapas siguientes suman acciones por persona ("Dejar feedback", "Sumar tarea", "Ver necesidades").

### 5.8 Cierre de etapa

- Probar con el admin (ve "Equipo") y con un no-admin (no la ve, y si intenta escribir `perfiles_equipo` por API la RLS lo rechaza).
- Docs: `docs/02-modules/perfil/README.md`, `docs/05-data/entidades/usuarios.md` (tabla nueva), `docs/09-roles-permissions/README.md` (nuevo rol admin en la matriz y en "Dónde está cada control").
- Novedades: "Nueva página **Mi perfil**".

---

## 6. Etapa 2 — Calendario del equipo

### 6.1 Migración `migration_equipo_calendario.sql`

```sql
-- Feriados nacionales (importados) y días propios de la empresa (cargados por el admin).
CREATE TABLE IF NOT EXISTS public.feriados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL,
  nombre text NOT NULL,
  origen text NOT NULL CHECK (origen IN ('nacional','empresa')),
  tipo text,                          -- el que venga de la fuente: inamovible / trasladable / puente...
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fecha, origen, nombre)
);
ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;
CREATE POLICY feriados_select ON public.feriados FOR SELECT TO authenticated USING (true);
CREATE POLICY feriados_admin_write ON public.feriados FOR ALL TO authenticated
  USING (public.es_admin_equipo()) WITH CHECK (public.es_admin_equipo());

-- Vacaciones y cambios de día. Se cargan directo, sin aprobación (D6).
CREATE TABLE IF NOT EXISTS public.ausencias_equipo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('vacaciones','cambio_dia')),
  -- vacaciones: rango [fecha_desde, fecha_hasta]. cambio_dia: el día que falta (desde = hasta).
  fecha_desde date NOT NULL,
  fecha_hasta date NOT NULL,
  -- cambio_dia: el día en que lo recupera (sábado u otro día). Opcional: ver Q-EQ-002.
  fecha_recupero date,
  nota text,                          -- opcional, NUNCA obligatoria (D6)
  creado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fecha_hasta >= fecha_desde),
  CHECK (tipo = 'vacaciones' OR fecha_hasta = fecha_desde),
  CHECK (tipo = 'cambio_dia' OR fecha_recupero IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_ausencias_equipo_fechas ON public.ausencias_equipo (fecha_desde, fecha_hasta);
CREATE INDEX IF NOT EXISTS idx_ausencias_equipo_user ON public.ausencias_equipo (user_id, fecha_desde);
ALTER TABLE public.ausencias_equipo ENABLE ROW LEVEL SECURITY;

-- Todo el equipo ve el calendario (D4).
CREATE POLICY ausencias_select ON public.ausencias_equipo FOR SELECT TO authenticated USING (true);
-- Cada uno carga las suyas; el admin puede cargar por cualquiera.
CREATE POLICY ausencias_insert ON public.ausencias_equipo FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.es_admin_equipo());
-- Editar/borrar: las propias y futuras (S5); el admin, cualquiera.
CREATE POLICY ausencias_update ON public.ausencias_equipo FOR UPDATE TO authenticated
  USING (public.es_admin_equipo() OR (user_id = auth.uid() AND fecha_desde > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date))
  WITH CHECK (public.es_admin_equipo() OR user_id = auth.uid());
CREATE POLICY ausencias_delete ON public.ausencias_equipo FOR DELETE TO authenticated
  USING (public.es_admin_equipo() OR (user_id = auth.uid() AND fecha_desde > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date));
```

### 6.2 Feriados

- **Fuente**: una API pública de feriados de Argentina (p. ej. ArgentinaDatos, `GET https://api.argentinadatos.com/v1/feriados/{año}`). **Antes de programar, verificar en vivo** la URL, el formato de la respuesta y que permita CORS desde el navegador. Si no permite CORS, hacer el pedido desde una función de `api/` (con sesión obligatoria) o pedir al dueño otra fuente. No inventar el formato.
- **Importación**: botón del admin "Importar feriados {año}" en la pestaña Equipo (y sugerirlo automáticamente si el año actual o el siguiente no tienen feriados nacionales). Inserta con `ON CONFLICT DO NOTHING`. Mostrar cuántos se agregaron.
- **Días de la empresa**: el admin agrega o borra días con `origen = 'empresa'` (p. ej. cierre de fin de año).
- Los feriados **no se cuentan** como días hábiles de vacaciones.

### 6.3 Lógica pura `src/lib/equipo/` (con tests, es lo más delicado)

- `diasHabiles.ts`: `contarDiasHabiles(desde, hasta, feriados)` → cuenta **lunes a viernes** (D5) que **no** son feriado (de cualquier origen).
- `vacaciones.ts`: `saldoVacaciones({ saldoBase, saldoBaseFecha, diasAnuales, ausencias, feriados, hoy })` (D18, D19):
  - `acreditados` = `diasAnuales` × cantidad de **1 de enero** posteriores a `saldoBaseFecha` y hasta hoy (inclusive).
  - `usados` = días hábiles de vacaciones **posteriores** a `saldoBaseFecha` que ya pasaron (≤ hoy).
  - `planificados` = días hábiles de vacaciones futuras (> hoy).
  - `disponiblesHoy = saldoBase + acreditados − usados`; `disponiblesDespuesDePlanificadas = disponiblesHoy − planificados`.
  - Las vacaciones con días **anteriores o iguales** a `saldoBaseFecha` no restan (ya están dentro del saldo base).
  - Para avisar al cargar unas vacaciones en un año futuro (p. ej. enero 2027 cargado en noviembre 2026), sumar también los 10 que se acreditan el 1/1 de ese año: `saldoProyectado(fecha)`.
  - Ejemplo (test obligatorio): Juli B, base 3 al 2026-10-02. Carga 2 días en diciembre 2026 → le queda 1. El 1/1/2027 → 11. Cachi, base 0: carga 5 días en noviembre 2026 → −5 (aviso, no bloqueo, S4); el 1/1/2027 → 5.
- `calendarioEquipo.ts`: dado un mes, arma para cada día la lista de eventos: vacaciones (por persona), falta por cambio de día, recupero, feriado, cumpleaños. Sábados y domingos se muestran pero en otro tono; un **recupero en sábado** se ve igual.
- Tests: rango que incluye un feriado, rango sobre fin de semana, rango que cruza el año (los días de enero se cuentan después de acreditar los 10 nuevos), acumulación de dos años, vacaciones anteriores a la fecha base (no restan), 29/02, cambio de día con y sin recupero, saldo negativo.

### 6.4 UI

- **Pestaña "Calendario"** en el perfil:
  - Grilla **mensual** del equipo (componente nuevo `src/components/perfil/CalendarioEquipo.tsx`), con navegación ← mes →, botón "Hoy" y leyenda de colores por persona (`perfiles_equipo.color`).
  - Cada día muestra chips: "🏖 Cachi" (vacaciones), "↔ Fede falta" / "↔ Fede recupera" (cambio de día), "🇦🇷 Día de la Independencia" (feriado nacional), "🏢 Cierre fin de año" (empresa), "🎂 Juli B".
  - Arriba de la grilla: **"Hoy no están: …"** (dato que después va al Inicio).
  - Filtro por persona (chips de color).
- **Botones** "Cargar vacaciones" y "Cambiar un día":
  - Vacaciones: elegir rango → mostrar en vivo "Son 6 días hábiles · Te quedarían 4". Si el saldo queda negativo → aviso, **no** bloqueo (S4). Si otra persona falta esos días → aviso informativo "Fede también está de vacaciones del 12 al 16".
  - Cambio de día: elegir el día que falta (solo de lunes a viernes, que no sea feriado) y, opcional, el día de recupero. Nota opcional. Sin pedir motivo (D6).
- **Mis vacaciones y cambios** (lista en la misma pestaña): próximos y pasados del año, con editar/borrar en los futuros (S5).
- **Encabezado**: completar con `saldoVacaciones`: "Vacaciones: **X días disponibles**" y, debajo, "Y ya planificados" si hay. No mostrar "de 10", porque con la acumulación el total puede ser mayor.
- Si el perfil tiene `vacaciones_sin_limite` (D19b): no se muestra el contador, el diálogo solo dice "Son N días hábiles" (sin "te quedarían" ni aviso) y en la pestaña Equipo la columna dice "Sin límite". Sus vacaciones sí aparecen en el calendario y sí notifican (`e1`).
- Cambio de día sin recupero (D19c): se muestra en el calendario y en "Mis vacaciones y cambios", pero **nunca** entra en `saldoVacaciones`. Test que lo verifique.
- **Admin (pestaña Equipo)**: columna "Vacaciones disponibles" por persona; poder cargar o corregir por cualquiera.

### 6.5 Notificación

`e1_vacaciones_cargadas` a todo el equipo menos el autor: "Cachi se toma vacaciones del 12/01 al 16/01" (S6). Link `/perfil` (pestaña Calendario).

### 6.6 Cierre

Docs: módulo perfil, `docs/05-data/entidades/` (archivo nuevo `equipo.md` con todas las tablas de este plan), catálogo de notificaciones. Novedades: "Calendario del equipo: cargá tus vacaciones y cambios de día".

---

## 7. Etapa 3 — Tareas semanales (solo definición)

### 7.1 Migración `migration_equipo_tareas_recurrentes.sql`

```sql
CREATE TABLE IF NOT EXISTS public.tareas_recurrentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,       -- de quién es la tarea
  creado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),   -- él mismo o el admin
  titulo text NOT NULL CHECK (length(trim(titulo)) > 0),
  descripcion text,
  frecuencia text NOT NULL CHECK (frecuencia IN ('diaria','semanal','quincenal','mensual')),
  dias_semana smallint[],      -- 1=lunes … 5=viernes (semanal/quincenal; puede ser más de un día)
  dia_mes smallint CHECK (dia_mes IS NULL OR dia_mes BETWEEN 1 AND 31),   -- mensual
  semana_inicio date,          -- quincenal: un lunes de referencia para saber qué semanas tocan
  activa boolean NOT NULL DEFAULT true,     -- pausada = false
  orden int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (frecuencia <> 'semanal'   OR (dias_semana IS NOT NULL AND cardinality(dias_semana) > 0)),
  CHECK (frecuencia <> 'quincenal' OR (dias_semana IS NOT NULL AND semana_inicio IS NOT NULL)),
  CHECK (frecuencia <> 'mensual'   OR dia_mes IS NOT NULL)
);
ALTER TABLE public.tareas_recurrentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tr_select ON public.tareas_recurrentes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.es_admin_equipo());
CREATE POLICY tr_insert ON public.tareas_recurrentes FOR INSERT TO authenticated
  WITH CHECK (creado_por = auth.uid() AND (user_id = auth.uid() OR public.es_admin_equipo()));
-- Dueño (user_id): edita/borra las suyas; admin: cualquiera.
CREATE POLICY tr_update ON public.tareas_recurrentes FOR UPDATE TO authenticated
  USING (public.es_admin_equipo() OR user_id = auth.uid())
  WITH CHECK (public.es_admin_equipo() OR user_id = auth.uid());
CREATE POLICY tr_delete ON public.tareas_recurrentes FOR DELETE TO authenticated
  USING (public.es_admin_equipo() OR user_id = auth.uid());
```

- RPC `pausar_tarea_recurrente(p_id uuid, p_activa boolean)` (`SECURITY DEFINER`): permite a la persona cambiar **solo** `activa` de una tarea suya aunque la haya creado el admin.
- Pensar el modelo para el futuro (sección 10): habrá una tabla de registro por semana (`tarea_id`, período, hecha/pospuesta). **No crearla ahora**, pero no tomar decisiones que la impidan (por ejemplo, no borrar tareas: pausarlas).

### 7.2 Lógica pura (con tests)

`src/lib/equipo/tareasRecurrentes.ts`:
- `ocurrenciasEnSemana(tarea, lunesDeLaSemana, feriados)` → días de la semana en que toca. `diaria` = lunes a viernes; `quincenal` = semanas pares respecto de `semana_inicio`.
- `mensual` (D21): si `dia_mes` cae en sábado, domingo o feriado → pasa al **día hábil siguiente** (salteando también feriados encadenados). 🔶 Si el día no existe en el mes (31 en febrero), se toma el **último día del mes** y se le aplica la misma regla; puede caer en los primeros días del mes siguiente, y está bien. Test: que nunca aparezcan dos ocurrencias del mismo mes ni que se pierda una.
- Semanales y diarias que caen en feriado: se marcan "es feriado" en la vista, no se mueven (no está definido moverlas; si el dueño lo pide, se agrega).
- `describirFrecuencia(tarea)` → "Todos los lunes y jueves", "Cada 15 días, los viernes", "El 1 de cada mes", "Todos los días".
- Esta lógica la va a reutilizar el modal del Inicio: dejarla bien testeada.

### 7.3 UI — pestaña "Mis tareas"

- Lista agrupada por frecuencia, o vista "Mi semana" (lunes a viernes en columnas con las tareas que tocan cada día). Las dos vistas leen la misma lógica.
- Crear/editar en un diálogo: título, descripción opcional, frecuencia, días (botones L M X J V), día del mes, semana de inicio para quincenal.
- Reordenar con `@dnd-kit/sortable` (ya está en el repo).
- Pausar / reactivar. Las pausadas, en gris al final.
- Las que sumó el admin muestran "Sumada por Julián" (informativo); el dueño igual puede editar/borrar/pausar.
- Admin, pestaña Equipo → "Tareas de {persona}": ver la lista de la persona y **"Sumar tarea"**. Notificación `e2_tarea_recurrente_asignada`.

### 7.4 Cierre

Docs y novedades ("Anotá tus tareas de cada semana en Mi perfil").

---

## 8. Etapas 4 a 7

### 8.1 Etapa 4 — Anotaciones y "Lo que necesito"

**Migración `migration_equipo_notas_necesidades.sql`:**

```sql
CREATE TABLE IF NOT EXISTS public.notas_personales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo text NOT NULL DEFAULT '',
  contenido text NOT NULL DEFAULT '',     -- markdown
  fijada boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notas_personales ENABLE ROW LEVEL SECURITY;
-- Privadas de verdad (D3): solo el dueño de la nota. El admin NO tiene política.
CREATE POLICY notas_personales_own ON public.notas_personales FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.necesidades_equipo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  texto text NOT NULL CHECK (length(trim(texto)) > 0),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','resuelta')),
  respuesta_admin text,
  resuelta_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.necesidades_equipo ENABLE ROW LEVEL SECURITY;
CREATE POLICY nec_select ON public.necesidades_equipo FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.es_admin_equipo());
CREATE POLICY nec_insert ON public.necesidades_equipo FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
-- La persona edita/borra mientras está pendiente; el admin resuelve.
CREATE POLICY nec_update ON public.necesidades_equipo FOR UPDATE TO authenticated
  USING (public.es_admin_equipo() OR (user_id = auth.uid() AND estado = 'pendiente'))
  WITH CHECK (public.es_admin_equipo() OR (user_id = auth.uid() AND estado = 'pendiente'));
CREATE POLICY nec_delete ON public.necesidades_equipo FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND estado = 'pendiente');
```

**UI:**
- Pestaña **"Anotaciones"**: lista a la izquierda (fijadas arriba, después por última edición, con buscador por título/contenido) y editor a la derecha: título + texto en markdown con vista previa (`marked` + `DOMPurify`). Autoguardado con debounce (~800 ms) e indicador "Guardado". Confirmar antes de borrar. Texto fijo visible: "🔒 Solo vos ves tus anotaciones."
- **Migrar los post-its: NO.** Los post-its del Inicio siguen como están (son otra cosa, decisión del dueño).
- Pestaña **"Lo que necesito"**: cargar el pedido, ver pendientes y resueltos con la respuesta del admin. Notificación `e3_necesidad_nueva` al admin.
- Admin, pestaña Equipo: bandeja "Necesidades pendientes" de todos, con "Marcar resuelta" + respuesta opcional.

### 8.2 Etapa 5 — Crecimiento y Feedback

**Migración `migration_equipo_crecimiento_feedback.sql`:**

```sql
CREATE TABLE IF NOT EXISTS public.objetivos_personales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('objetivo','aprender')),
  titulo text NOT NULL CHECK (length(trim(titulo)) > 0),
  descripcion text,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_curso','logrado','abandonado')),
  fecha_objetivo date,
  logrado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.objetivos_personales ENABLE ROW LEVEL SECURITY;
CREATE POLICY obj_select ON public.objetivos_personales FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.es_admin_equipo());           -- S9
CREATE POLICY obj_write ON public.objetivos_personales FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.feedback_equipo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  para_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  autor_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  tipo text NOT NULL CHECK (tipo IN ('felicitacion','mejora','correccion')),
  titulo text,
  texto text NOT NULL CHECK (length(trim(texto)) > 0),   -- markdown
  leido_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_equipo_para ON public.feedback_equipo (para_user_id, created_at DESC);
ALTER TABLE public.feedback_equipo ENABLE ROW LEVEL SECURITY;
CREATE POLICY fb_select ON public.feedback_equipo FOR SELECT TO authenticated
  USING (para_user_id = auth.uid() OR public.es_admin_equipo());      -- S10
CREATE POLICY fb_admin_write ON public.feedback_equipo FOR ALL TO authenticated
  USING (public.es_admin_equipo()) WITH CHECK (public.es_admin_equipo() AND autor_user_id = auth.uid());
```

- RPC `marcar_feedback_leido(p_id uuid)` (`SECURITY DEFINER`): solo si `para_user_id = auth.uid()`, setea `leido_at = now()`. Así el destinatario no puede editar el texto.

**UI:**
- Pestaña **"Crecimiento"**: dos columnas, **Mis objetivos** y **Quiero aprender**. Tarjetas con estado (Pendiente → En curso → Logrado), fecha opcional; los logrados quedan en una sección "Logrados" con la fecha (orgullo por lo que se logra). Texto fijo: "Esto lo ven vos y Julián".
- Pestaña **"Feedback"**: lista cronológica, con filtro por tipo e ícono/color por tipo (🎉 felicitación, 💡 mejora, 🔧 corrección). Los no leídos destacados; al abrir uno se marca leído. Contador de no leídos en la pestaña.
- Admin, pestaña Equipo → "Dejar feedback a {persona}": tipo, título opcional, texto (markdown con vista previa). Puede editar o borrar lo que escribió. Desde ahí ve también los objetivos de cada persona (solo lectura).
- Notificaciones: `e4_feedback_nuevo` al destinatario (la notificación dice el **tipo**, no el contenido: "Julián te dejó una felicitación").

### 8.3 Etapa 6 — Corcho de ideas

**Migración `migration_equipo_corcho.sql`:**

```sql
CREATE TABLE IF NOT EXISTS public.ideas_corcho (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  autor_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo text NOT NULL CHECK (length(trim(titulo)) > 0),
  descripcion text,
  estado text NOT NULL DEFAULT 'propuesta' CHECK (estado IN ('propuesta','aprobada','descartada')),
  estado_cambiado_por uuid REFERENCES auth.users(id),
  estado_cambiado_at timestamptz,
  comentario_estado text,            -- opcional: por qué se aprobó o descartó
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ideas_corcho ENABLE ROW LEVEL SECURITY;
CREATE POLICY ideas_select ON public.ideas_corcho FOR SELECT TO authenticated USING (true);   -- corcho compartido
CREATE POLICY ideas_insert ON public.ideas_corcho FOR INSERT TO authenticated
  WITH CHECK (autor_user_id = auth.uid() AND estado = 'propuesta');
-- Autor: edita/borra solo mientras es 'propuesta'. Admin: todo (incluido el estado). S11.
CREATE POLICY ideas_update ON public.ideas_corcho FOR UPDATE TO authenticated
  USING (public.es_admin_equipo() OR (autor_user_id = auth.uid() AND estado = 'propuesta'))
  WITH CHECK (public.es_admin_equipo() OR (autor_user_id = auth.uid() AND estado = 'propuesta'));
CREATE POLICY ideas_delete ON public.ideas_corcho FOR DELETE TO authenticated
  USING (public.es_admin_equipo() OR (autor_user_id = auth.uid() AND estado = 'propuesta'));

-- Votos 👍 / 👎: uno por persona por idea; se puede cambiar o sacar.
CREATE TABLE IF NOT EXISTS public.ideas_corcho_votos (
  idea_id uuid NOT NULL REFERENCES public.ideas_corcho(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  valor smallint NOT NULL CHECK (valor IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (idea_id, user_id)
);
ALTER TABLE public.ideas_corcho_votos ENABLE ROW LEVEL SECURITY;
CREATE POLICY votos_select ON public.ideas_corcho_votos FOR SELECT TO authenticated USING (true);
-- No se vota la idea propia (S11).
CREATE POLICY votos_write ON public.ideas_corcho_votos FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.ideas_corcho i WHERE i.id = idea_id AND i.autor_user_id = auth.uid()));

-- Para el cartel "Nueva": qué ideas ya vio cada persona (D14).
CREATE TABLE IF NOT EXISTS public.ideas_corcho_vistas (
  idea_id uuid NOT NULL REFERENCES public.ideas_corcho(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  visto_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (idea_id, user_id)
);
ALTER TABLE public.ideas_corcho_vistas ENABLE ROW LEVEL SECURITY;
CREATE POLICY vistas_own ON public.ideas_corcho_vistas FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

Activar **Realtime** para `ideas_corcho` e `ideas_corcho_votos` (como `migration_programas_realtime.sql`), así los votos y las ideas nuevas aparecen sin recargar.

**Reglas:**
- "Nueva" = la idea no tiene fila en `ideas_corcho_vistas` para el usuario y no es propia. Se registra como vista cuando la tarjeta **estuvo visible en pantalla** (IntersectionObserver, ~1 s) o al abrirla; no al cargar la página entera. El cartel desaparece en la **siguiente** visita (que se alcance a ver).
- Al crear la tabla, las ideas que ya existan no aplican (está vacía). Si un usuario nuevo entra al equipo, ve todas como nuevas: es correcto.
- Votos: clic en 👍 vota; otro clic lo saca; clic en 👎 lo cambia. Puntaje = suma. Las ideas descartadas siguen pudiendo verse, pero no se votan.

**UI — ruta `/corcho`** (compartida, ítem propio en el menú lateral, con un punto si hay ideas nuevas) y, en el perfil, pestaña **"Mis ideas"** (las mías con su estado y sus votos, más un link al corcho):
- Fondo de corcho (textura CSS, sin imágenes pesadas). Tarjetas tipo papel con una **chinche del color del autor** y el borde de ese color.
- Cartel **"Nueva"** en las que no vi.
- **Descartadas** en gris y apagadas; **aprobadas** con una marca visible ("✅ La vamos a hacer").
- Filtros: por persona/color (chips con los colores del equipo), por estado (Propuestas / Aprobadas / Descartadas / Todas), "Solo nuevas". Orden: nuevas primero, después por puntaje (S12); alternativa "Más recientes".
- Botón **"Pinchar una idea"**: título y descripción.
- Admin: en cada tarjeta, "Aprobar" / "Descartar" / "Volver a propuesta", con un comentario opcional.
- Notificación `e5_idea_nueva` a todo el equipo menos el autor; y al autor cuando su idea se aprueba o descarta.

### 8.4 Etapa 7 — Mis números y galería

Sin tablas nuevas: solo lectura de datos existentes. **Cada uno ve solo los suyos** (D10). Va en una pestaña "Mis números", sin protagonismo.

| Quién | Métrica | Cómo se calcula | Nota |
|---|---|---|---|
| Área principal **producción** | Sellos terminados (semana / mes / año) | `estado_historial` con `campo = 'estado_fabricacion'` y `estado_nuevo = 'Hecho'`, por `changed_at` (hora AR). Contar `sello_id` **distintos** por período (un sello que se rehízo y volvió a Hecho cuenta una vez por período) | D11. Mostrar aparte cuántos fueron de pedidos **Prueba** (ver `PLAN_PEDIDOS_PRUEBA_Y_REGALO.md`) |
| Área principal **producción** | Sellos vectorizados | `estado_historial` con el campo de vectorización, si existe (ver `migration_estado_historial_vectorizacion.sql`) | Verificar el nombre real del campo |
| Todos | Datos de envío cargados | `ordenes.envio_datos_cargado_por = yo` | Atribución real (el campo es de quién lo hizo) |
| Todos | Etiquetas generadas / descargadas | `envio_eventos` con el usuario | Verificar la columna de usuario |
| Ventas | **Nada de "ventas"** | — | D12. Se agrega cuando exista "vendido por" |

- Vista: tarjetas con el número del período y la comparación con el período anterior ("+12 vs septiembre"), y un gráfico simple de los últimos 6 meses. Seguir la guía visual de gráficos del repo, si existe; si no, barras simples.
- **Galería**: grilla de miniaturas de los sellos **terminados** (producción) del período elegido. Imagen: `foto_sello` (bucket `foto`) si existe; si no, `archivo_vector_preview` (si es un PNG de vista previa). Carga perezosa (lazy) y paginada (las URLs de storage firmadas, como en Producción). Clic → vista grande con diseño, cliente y fecha. Para quien no es de producción, mostrar la galería de los sellos de los envíos que despachó **solo** si la atribución es real; si no, ocultar la galería con el texto "Pronto".
- Hacer las consultas en el servicio con filtros por fecha (no traer todo `estado_historial`, que tiene miles de filas). Si hace falta, una vista o RPC `SECURITY INVOKER`.

---

## 9. Notificaciones nuevas

Usar `emitNotificacionSafe` con `p_user_ids` explícitos (sin área). Agregar cada tipo al catálogo de `docs/02-modules/notificaciones/README.md`.

| Tipo | A quién | Título de ejemplo | Link |
|---|---|---|---|
| `e1_vacaciones_cargadas` | Todo el equipo menos el autor | "Cachi se toma vacaciones del 12/01 al 16/01" | `/perfil?tab=calendario` |
| `e2_tarea_recurrente_asignada` | La persona | "Julián te sumó una tarea semanal: Limpiar CNC (viernes)" | `/perfil?tab=tareas` |
| `e3_necesidad_nueva` / `e3_necesidad_resuelta` | Admin / la persona | "Fede necesita: …" / "Julián resolvió tu pedido" | `/perfil?tab=necesidades` / pestaña Equipo |
| `e4_feedback_nuevo` | La persona | "Julián te dejó una felicitación" | `/perfil?tab=feedback` |
| `e5_idea_nueva` / `e5_idea_estado` | Todo el equipo menos el autor / el autor | "Juli B pinchó una idea en el corcho" / "Tu idea fue aprobada" | `/corcho` |

La página tiene que leer `?tab=` para abrir la pestaña correcta.

---

## 10. Futuro (NO implementar en este plan)

- **Inicio**: modal "Tareas de la semana" para marcar hechas, posponer, etc. (tabla de registro por semana sobre `tareas_recurrentes`); "Hoy no están"; cumpleaños del día; feedback sin leer; ideas nuevas en el corcho.
- **"Vendido por"** al cargar un pedido (el que lo carga puede indicar que la venta es de otro) → recién ahí se suman métricas de ventas por persona (D12). Va al backlog.
- Producción más precisa: guardar **quién** cambia cada estado en `estado_historial` (D11).
- Respuestas al feedback; comentarios en las ideas del corcho; idea aprobada → proyecto de Innovación.
- Quién cubre cuando alguien falta (D17).
- Mover las fotos de `userImages.ts` a la base/storage.

---

## 11. Preguntas abiertas

| ID | Pregunta | Por qué importa | Se necesita antes de |
|---|---|---|---|
| Q-EQ-001 | ✅ **Respondida (2026-10-02)**: año calendario; los días no usados se acumulan; cada 1/1 se suman 10. Saldos iniciales: Fede 10, Cachi 0, Juli B 3 → D18, D19 | — | — |
| Q-EQ-002 | ✅ **Respondida**: solo queda registrado, no descuenta → D19c | — | — |
| Q-EQ-003 | ✅ **Respondida**: `julian.475@hotmail.com` → D20 | — | — |
| Q-EQ-004 | ✅ **Respondida**: separados por ahora → D22 | — | — |
| Q-EQ-005 | ✅ **Respondida**: pasa al día hábil siguiente → D21 | — | — |
| Q-EQ-006 | ✅ **Respondida**: Julián Moreno no tiene límite de vacaciones → D19b | — | — |
