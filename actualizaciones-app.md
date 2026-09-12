# Aviso de actualización + "Qué hay de nuevo" — plan de implementación

## 1. Objetivo

Hoy, cuando se despliega un cambio, el navegador de cada usuario sigue corriendo el bundle viejo hasta que recarga la página a mano. En la práctica la gente no lo hace (o se olvida), así que usan la app con código desactualizado y no ven los cambios — a veces ni se enteran de que hubo cambios.

Esto se resuelve con dos piezas separadas que trabajan juntas:

- **A. Aviso de actualización disponible**: detecta que el navegador tiene cargado un build viejo y avisa con un diálogo tipo "hay una versión nueva, actualizá" — el botón lleva a una recarga completa (a Inicio).
- **B. "Qué hay de nuevo"**: una vez que el usuario está en la versión nueva, si esa versión trae novedades relevantes para el equipo, se le muestra un carrusel simple explicándolas (con ícono/imagen + texto por cada novedad).

Son independientes en su mecanismo (una compara versiones de build, la otra compara contenido curado a mano) pero se coordinan para no pisarse (sección 5.3).

## 2. Referencias tomadas

| Referencia | Para qué se usa | Qué tomamos |
|---|---|---|
| [v-alert-dialog-8 de cnippet-dev](https://21st.dev/@cnippet-dev/components/v-alert-dialog-8) | Diálogo de actualización (Parte A) | Ícono en círculo arriba, título + chip de versión/fecha, texto explicativo, dos botones al pie ("Recordar más tarde" / "Actualizar ahora") sin más ruido visual. |
| [onboarding-dialog de originui](https://21st.dev/@originui/components/dialog/onboardin-dialog) | Carrusel de novedades (Parte B) | Bloque visual grande arriba (imagen/ícono), título + descripción abajo, indicador de puntos, "Saltar" / "Siguiente" (y "Entendido" en el último paso). |

Igual que en los documentos anteriores de notificaciones, se adapta a la estética oscura "glass" ya usada en la app (`rounded-[20px]`, `border-white/10`, `bg-gradient-to-br from-zinc-900/95 via-black/70 to-black/95`, `backdrop-blur-sm`, `shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)]` — ver [StockReplenishSection.tsx](src/components/home/StockReplenishSection.tsx:80)) y a los primitivos ya existentes (`Dialog` en [dialog.tsx](src/components/ui/dialog.tsx:1), que ya usa Radix + `tailwindcss-animate`).

A diferencia del resto de la app, acá **sí** tiene sentido un acento de color con identidad propia (azul, como en la referencia) porque es un mensaje de sistema, no un dato con severidad — igual se mantiene sobrio (`text-blue-400` sobre `bg-blue-500/10`, nada saturado).

---

## 3. Parte A — Aviso de actualización disponible

### 3.1 Cómo se sabe que hay una versión nueva

El proyecto es un SPA de Vite sin versionado real hoy (`package.json` quedó fijo en `"0.0.0"`, nunca se bumpea). En vez de depender de que alguien recuerde subir un número de versión a mano, la detección se basa en un **identificador de build generado automáticamente en cada `vite build`**:

1. **Nuevo script**: `scripts/generate-version.mjs`. Se ejecuta antes del build y escribe `public/version.json`:
   ```json
   { "version": "a1b2c3d", "builtAt": "2026-09-12T14:03:00.000Z" }
   ```
   - `version`: hash corto de git (`git rev-parse --short HEAD`), con fallback a un timestamp en base36 si no hay `.git` disponible en el entorno de build (por si el hosting clona sin historia).
   - `builtAt`: fecha ISO del build, para mostrarla en el diálogo ("Se generó hoy a las...").
2. **`package.json`**: el script de build pasa a ser
   ```json
   "build": "node scripts/generate-version.mjs && vite build"
   ```
   Como `public/` se copia tal cual al `dist/` (`publicDir: 'public'` en [vite.config.ts](vite.config.ts:18)), `version.json` queda publicado junto al `index.html` de ese build específico — no hace falta tocar la config de Vite para nada más.

### 3.2 Cómo lo detecta el cliente

No hace falta inyectar la versión dentro del bundle de JS (nada de `define` en Vite): alcanza con leer el mismo archivo estático dos veces y compararlo.

- **Al montar la app** (una sola vez): `fetch('/version.json')` normal (con cache del navegador, no importa) → esa respuesta es "la versión con la que se cargó esta pestaña" (`versionInicial`).
- **Chequeo periódico**: `fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })` → "la versión que hay ahora mismo en el servidor" (`versionServidor`). El query param + `cache: 'no-store'` evitan que el navegador o un CDN devuelvan una copia vieja cacheada del propio `version.json`.
- Si `versionServidor.version !== versionInicial.version` → hay una build nueva → se muestra el diálogo.

**Cuándo se chequea**:
- Cada 10 minutos mientras la pestaña está abierta.
- Al volver a la pestaña (`document.visibilitychange` → `visible`), con un throttle de ~60s para no repetir el fetch si ya se hizo hace poco (cubre el caso típico: alguien tiene la app en una pestaña de fondo todo el día).
- No hace falta nada más agresivo (websockets, SW) para esta v1.

**Implementación sugerida**: un hook `useAppVersionCheck()` en `src/lib/hooks/useAppVersionCheck.ts`, que devuelve `{ updateAvailable, builtAt, dismiss, applyUpdate }`. Se monta una sola vez en `App.tsx`, igual que los otros overlays globales ya existentes (`<OrderTasksOverlay />`, `<FabricationSizeDialogHost />` en [App.tsx](src/App.tsx:27)).

### 3.3 El diálogo

Nuevo componente: `src/components/global/AppUpdateDialog.tsx`, montado en `App.tsx` como `<AppUpdateDialog />`.

- Modal centrado (`Dialog` de Radix, igual que el resto de la app), overlay con blur.
- **Sin botón de cerrar (X)** — a diferencia del `DialogContent` genérico que sí trae una X ([dialog.tsx](src/components/ui/dialog.tsx:45)), acá se arma un content propio sin ella, para que las únicas dos salidas sean los botones del pie (igual que en la referencia).
- Cerrar con `Esc` o click afuera del modal se comporta **igual que "Recordar más tarde"** (no es una acción destructiva, así que no hace falta bloquear la salida).
- **Estructura**:
  - Ícono arriba, centrado, en un círculo (`h-14 w-14 rounded-full bg-blue-500/10 border border-blue-500/20`) — un `ShieldCheck` o `Sparkles` de `lucide-react`, `text-blue-400`.
  - Título: **"Hay una actualización disponible"**.
  - Chip debajo del título con la fecha del build nuevo (no un número de versión inventado, ya que no manejamos semver): *"Build del 12/09/2026"*, estilo pill sutil (`bg-white/[0.06] text-muted-foreground text-xs`).
  - Texto: *"Alcohn AI tiene cambios nuevos listos. Actualizá para usarlos y evitar errores por trabajar con una versión vieja."*
  - Separador (`border-t border-white/[0.06]`).
  - Footer con dos botones: **"Recordar más tarde"** (texto, `text-muted-foreground hover:text-white`) y **"Actualizar ahora"** (botón sólido blanco, mismo estilo que el resto de CTAs primarios de la app).

### 3.4 Acciones

- **Actualizar ahora**: `window.location.assign('/')`. Navegación completa (no `router.push`), así se descarta cualquier JS viejo en memoria y se vuelve a pedir `index.html` + bundle actual — de paso, lleva al usuario a Inicio, tal como pediste. *(Nota: si el usuario estaba a mitad de completar un formulario largo en otra pantalla, ese progreso se pierde — es un trade-off consciente por simplicidad; se puede sumar el texto "Guardá cualquier cambio en curso antes de actualizar" en el cuerpo del diálogo si te parece necesario.)*
- **Recordar más tarde**: cierra el diálogo y guarda un "snooze" en `localStorage` (p. ej. 30 minutos) para no volver a mostrarlo en el chequeo inmediatamente siguiente. Importante: **no es un "no molestar" permanente** — pasado el snooze, si la pestaña sigue en la versión vieja, se vuelve a mostrar. Es intencional: el problema que esto resuelve es justamente que la gente posterga el refresh indefinidamente.

### 3.5 Decisiones a confirmar / fuera de alcance de esta v1

- No se distingue "actualización crítica" de "actualización común" — todas se avisan igual. Si en algún momento hace falta una actualización que no se pueda posponer (ej. rotación de credenciales, breaking change urgente), habría que sumar un modo "forzado" sin botón de posponer — no es parte de esta v1.
- No se coordina entre pestañas: si el usuario tiene 3 pestañas abiertas, puede ver el diálogo en cada una por separado. Aceptable para un equipo chico.
- No se pausa el aviso si el usuario está en medio de una acción sensible (ej. subiendo un archivo) — se podría agregar más adelante si molesta en la práctica.

---

## 4. Parte B — "Qué hay de nuevo"

### 4.1 Cuándo se dispara

Al cargar la app (una vez resuelta la sesión), se compara el **id de la última novedad publicada** contra el **último id que ese usuario ya vio**. Si hay una novedad más nueva sin ver, se muestra el carrusel.

Esto es independiente del build-hash de la Parte A — una build nueva no siempre trae una "novedad" digna de mostrarse (puede ser un fix invisible). Por eso el contenido de esta parte se cura **a mano** (sección 4.4), no se genera solo.

**Orden respecto al diálogo de actualización (Parte A)**: nunca se muestran los dos a la vez.
- Si hay una actualización pendiente (build vieja cargada) → se prioriza el diálogo de "Actualizar ahora". El carrusel de novedades no tiene sentido todavía porque el usuario ni siquiera está corriendo la versión que trae la novedad.
- Una vez que el usuario actualiza (o ya estaba en la versión más reciente porque recién hizo login), si hay una novedad sin ver para esa versión → se muestra el carrusel, con un pequeño delay (~800ms) después de que cargó la pantalla, para que no "salte" antes de que la página termine de pintarse.

### 4.2 Contenido: cómo se define cada novedad

Nuevo archivo de contenido: `src/lib/changelog/entries.ts`.

```ts
export interface ChangelogSlide {
  heading: string;
  body: string;
  icon?: keyof typeof import('lucide-react'); // para novedades simples
  image?: string;                              // ruta en /public/changelog/... si amerita una captura real
}

export interface ChangelogEntry {
  id: number;        // entero incremental manual — no es la versión de build
  date: string;       // 'YYYY-MM-DD', para mostrar
  title: string;       // título corto de la tanda de novedades
  slides: ChangelogSlide[];
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  // el más nuevo va último en el array (o primero, a elección — pero consistente)
];
```

- `id` es manual e incremental (1, 2, 3...), desacoplado del hash de git — así quien escribe la novedad no tiene que pensar en versionado semántico, solo en "esta es la siguiente".
- Cada entrada puede tener 1 a 4 `slides`. Cada slide es una "pantalla" del carrusel: encabezado corto + 1-2 frases en lenguaje simple (no técnico) + un ícono grande (lo más barato de producir, usando el mismo estilo de chip de ícono que ya usa la app) o, si vale la pena, una imagen/captura real en `public/changelog/<id>/`.
- Solo se muestra la **entrada más reciente que el usuario no vio**, no se hace "maratón" de todas las que se acumularon — si alguien no entra en un mes y se perdió 3 tandas de novedades, ve solo la última. Las anteriores quedan accesibles desde un historial (ver 4.5).

### 4.3 Persistencia de "ya lo vi"

Igual que se definió para el estado leído/no-leído de las notificaciones (ver [notificaciones-ui.md](notificaciones-ui.md) sección 6), esto vive en la base, no en `localStorage`, para que sea consistente si el usuario entra desde otra máquina.

Tabla nueva sugerida: `changelog_visto`
| columna | tipo | notas |
|---|---|---|
| `user_id` | uuid | PK junto con nada más (una fila por usuario) |
| `ultimo_id_visto` | integer | el `id` de `ChangelogEntry` más alto que ya vio |
| `updated_at` | timestamptz | |

Servicio: `src/lib/supabase/services/changelog.service.ts` con `getUltimoVisto(userId)` y `marcarVisto(userId, id)` (upsert).

### 4.4 El diálogo (carrusel)

Nuevo componente: `src/components/global/WhatsNewDialog.tsx`, montado en `App.tsx` junto a `<AppUpdateDialog />`.

- Mismo `Dialog` base, mismo lenguaje visual oscuro/glass que el resto.
- **Estructura por slide** (inspirado en el onboarding de originui, adaptado a la estética de Alcohn):
  - Bloque visual arriba, más grande que el resto del contenido (`aspect-[16/10]` aprox., `rounded-2xl`, fondo `bg-white/[0.03]` con un patrón sutil de puntos o gradiente radial de fondo): adentro, el ícono grande centrado (`h-16 w-16`, mismo tratamiento de chip que usa el resto de la app) o la imagen del slide si se definió una.
  - Debajo: `heading` en `text-lg font-semibold text-white`, y `body` en `text-sm text-muted-foreground` (1-2 líneas, directo).
  - Indicador de progreso: puntos (`●`) uno por slide, el activo más grande/blanco, el resto `bg-white/20` — misma idea que la referencia.
  - Footer: **"Saltar"** (texto, cierra todo el carrusel de una y marca la entrada completa como vista) a la izquierda; **"Siguiente"** a la derecha (avanza un slide). En el último slide, "Siguiente" cambia a **"Entendido"** (cierra y marca como visto).
  - X arriba a la derecha también cierra y marca como visto — a diferencia del diálogo de actualización, acá no hay nada que "posponer": es informativo, no urgente, así que cualquier forma de cerrarlo equivale a "ya me enteré".

### 4.5 Regla a partir de ahora: cómo se genera contenido para este modal

Esto es lo que pediste explícitamente — a partir de ahora, **cada actualización significativa del producto** (una funcionalidad nueva visible para el equipo, un cambio de flujo que cambia cómo alguien hace su trabajo diario) debe venir acompañada de una entrada en `src/lib/changelog/entries.ts`:

1. Agregar un objeto nuevo a `CHANGELOG_ENTRIES` con el siguiente `id` (el actual + 1), la fecha de hoy, y 1-4 `slides` con:
   - Un título corto y claro (no jerga técnica — pensado para quien va a usar la función, no para quien la programó).
   - Una descripción de 1-2 frases: qué cambia y por qué le sirve a esa persona.
   - Un ícono de `lucide-react` que represente la novedad, o una captura real si el cambio es muy visual (guardada en `public/changelog/<id>/`).
2. No hace falta tocar nada más — el mecanismo de "última vista" hace que a cada usuario le aparezca sola la próxima vez que entre.

**Qué SÍ amerita una entrada**: una función nueva, un cambio de flujo, algo que si no se explica la gente no lo va a descubrir sola (ej. "ahora hay notificaciones por área", "el flujo de Rehacer ahora pide motivo").
**Qué NO amerita una entrada**: fixes de bugs invisibles, refactors internos, cambios de performance, ajustes de estilos menores.

Para que esta regla no se pierda con el tiempo, conviene dejarla anotada en el `CLAUDE.md` del proyecto (o el archivo de convenciones que uses con Cursor) como un paso más del checklist de "features listas para deployar", junto con lint/tests.

### 4.6 Historial de novedades (opcional, no bloqueante para esta v1)

Un link chico en `/configuracion` ("Ver novedades anteriores") que abra el mismo componente de carrusel pero recorriendo todas las `CHANGELOG_ENTRIES` en orden, sin afectar el estado de "visto". Útil para cuando alguien nuevo se suma al equipo y quiere ver qué fue cambiando. Se puede sumar después de la v1 sin tocar el resto del diseño.

---

## 5. Plan de implementación (orden sugerido para Cursor)

1. `scripts/generate-version.mjs` — genera `public/version.json` con hash de git + timestamp.
2. `package.json` — el script `build` corre el paso anterior antes de `vite build`.
3. `src/lib/hooks/useAppVersionCheck.ts` — fetch inicial + polling + comparación + snooze en `localStorage`.
4. `src/components/global/AppUpdateDialog.tsx` — diálogo de la Parte A, usando el hook anterior.
5. Migración SQL: tabla `changelog_visto`.
6. `src/lib/changelog/entries.ts` — estructura de contenido + (vacío o con la primera entrada real, ej. anunciando el propio sistema de notificaciones si todavía no se anunció).
7. `src/lib/supabase/services/changelog.service.ts` — `getUltimoVisto` / `marcarVisto`.
8. `src/lib/hooks/useWhatsNew.ts` — resuelve qué entrada mostrar (o ninguna) y expone `dismiss`/`markSeen`.
9. `src/components/global/WhatsNewDialog.tsx` — el carrusel de la Parte B.
10. `App.tsx` — montar `<AppUpdateDialog />` y `<WhatsNewDialog />` junto a los overlays globales existentes, con la lógica de prioridad de la sección 4.1 (no mostrar los dos a la vez).
11. (Opcional, después) link "Ver novedades anteriores" en `/configuracion`.

## 6. Fuera de alcance de este documento

- Diseño de un sistema de versionado semántico real (`1.4.0`, etc.) — se optó por hash de build + id manual de changelog, que es suficiente para el problema planteado y no agrega proceso manual salvo escribir la novedad en sí.
- Actualizaciones forzadas / no pospuestas.
- Coordinación entre pestañas o service worker.
