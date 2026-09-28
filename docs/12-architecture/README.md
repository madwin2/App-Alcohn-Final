# Arquitectura técnica

## 1. Stack (✅ `package.json`)

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript 5 + Vite 5, React Router 6, Tailwind CSS 3 + Radix UI (componentes estilo shadcn en `src/components/ui`), lucide-react, GSAP (animaciones), dnd-kit (drag & drop), TanStack Table |
| Estado | Zustand (`src/lib/state/*.store.ts`: orders, production, programs, vectorizacion, fabricationSizeDialog) + React Context (`OrdersProvider`) |
| Formularios | React Hook Form + Zod |
| Datos | Supabase JS v2 (Postgres, Auth, Storage, Realtime, Edge Functions) — **sin backend propio**: el navegador habla directo con la base |
| Archivos/PDF | pdf-lib (armar etiquetas y hojas), pdfjs-dist (leer PDFs de etiquetas), JSZip (paquetes), cfb (leer `.crv3d`) |
| Serverless | Funciones `/api/*.js` (🔶 Vercel) para proxy a Vectorizer.AI, OpenAI y workers |
| Edge | Deno (Supabase Edge Functions) |
| Workers | Node + Playwright (MiCorreo, Andreani), Python + FastAPI (vector-worker) |
| CAD/CAM | Lua (gadgets de Vectric Aspire) |
| Tests | Vitest (lógica pura) |

## 2. Estructura del repositorio

```
src/
  App.tsx                 rutas
  app/<pagina>/index.tsx  una carpeta por pantalla (orquestador)
  components/<modulo>/    UI por módulo (pedidos, produccion, programas, envios, vectorizacion, …)
  components/ui/          primitivas (shadcn/Radix)
  components/shared/      diálogos compartidos (Rehacer, medida de fabricación, no-SVG, imágenes)
  components/global/      overlays globales (tareas, novedades, versión)
  lib/supabase/services/  ACCESO A DATOS + REGLAS DE NEGOCIO (1 archivo por dominio)
  lib/supabase/mappers.ts conversión DB (español) ↔ TS (constantes)
  lib/supabase/types.ts   tipos generados (desactualizados)
  lib/<dominio>/          lógica pura testeable (programas, vectorizacion, abecedario, precios, comercial, economia, gastos, notificaciones)
  lib/utils/              utilidades (PDF, CSV, normalización, storage)
  lib/hooks/, lib/state/, lib/context/
  lib/types/index.ts      tipos de dominio
supabase/functions/       edge functions (Deno)
api/                      funciones serverless (Vercel)
services/                 workers externos (andreani, micorreo, micorreo-api, vector)
aspire-gadgets/           gadgets Lua
scripts/, sql/            importación y diagnóstico
migration_*.sql           migraciones aplicadas a mano (historia)
*.md (raíz)               planes y propuestas de diseño (historia de decisiones)
docs/                     esta base de conocimiento
```

## 3. Patrones

- **Servicio por dominio** (`orders.service.ts`, `programs.service.ts`, …): cada función hace varias llamadas a Supabase en secuencia (no transaccional) y aplica reglas. Las reglas que deben ser atómicas se movieron a RPCs (`registrar_rehacer`, funciones de Andreani).
- **Mappers**: la DB guarda textos en español (`'Sin Hacer'`); TS usa constantes (`SIN_HACER`). Hay mappers **duplicados** (en `mappers.ts`, `programs.service.ts`, `production.service.ts`, edge functions, workers).
- **Lógica pura aislada y testeada** en `src/lib/programas`, `src/lib/vectorizacion`, `src/lib/abecedario`.
- **Triggers como motor de efectos**: totales, costos, historial, WhatsApp, stock → cualquier escritura los dispara.
- **Optimistic UI + realtime**: `OrdersProvider` aplica parches locales y refresca por suscripciones.
- **Colas en el navegador** para tareas lentas (MiCorreo, revisión de vectores).
- **Flags por variable de entorno** (`VITE_VECTOR_AUTO_ENABLED`).
- **Planes de implementación en Markdown** en la raíz (para Cursor) antes de cada feature grande.

## 4. Convenciones de código

- Idioma: nombres de dominio en español (`sellos`, `ordenes`, `programa`), código en inglés/español mixto.
- Guardas de arquitectura de la página Pedidos: `ARCHITECTURE_GUARDRAILS.md` (máx. ~250 líneas por archivo, celdas en `cells/`, estado UI en Zustand, RHF+Zod). ⚠️ Muchos archivos actuales las incumplen (ver [audits](../audits/observaciones-de-arquitectura.md)).
- Regla de Cursor `.cursor/rules/changelog-novedades.mdc`: toda feature visible para el equipo agrega una entrada en `src/lib/changelog/entries.ts`.
- Commits: estilo Conventional Commits en español (`feat(programas): …`).
- Alias `@/` → `src/`.

<a id="api-serverless"></a>

## 5. API serverless
| Ruta | Destino | Auth del llamador |
|---|---|---|
| `/api/vectorize`, `/api/vectorizer-account` | Vectorizer.AI | ninguna |
| `/api/optimize-logo`, `/api/simplify-logo`, `/api/suggest-mockup-name`, `/api/parse-shipping` | OpenAI | ninguna |
| `/api/micorreo-upload` | micorreo-worker | ninguna (agrega la key del worker) |
| `/api/andreani-generate`, `-sync-labels`, `-sync-tracking`, `-job-status` | andreani-worker | ninguna |
| `/api/vectorize-enqueue` | vector-worker | ninguna |
| `/api/debug-env` | — | ninguna |

En desarrollo, `vite-micorreo-proxy.ts` y `vite-vectorizer-proxy.ts` emulan estas rutas.

## 6. Autenticación

Supabase Auth (email/contraseña). El cliente usa la **anon key** (`VITE_SUPABASE_ANON_KEY`) más el JWT del usuario. Ver [09-roles-permissions](../09-roles-permissions/README.md).

## 7. Rendimiento (observado)

- Pedidos: carga paginada de 1.000 en 1.000 + sellos/tareas en lotes de 150 IDs.
- Producción: carga **todos** los sellos; cada guardado recarga todo.
- Economía: todas las órdenes con caché local.

## 8. Base de datos

Ver [base-de-datos.md](base-de-datos.md).
