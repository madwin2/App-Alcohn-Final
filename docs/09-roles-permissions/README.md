# Roles y permisos

## Resumen

✅ **Alcohn AI no tiene un sistema general de roles por pantalla.** Todo usuario aprobado puede ver y hacer casi todo en la interfaz, con excepciones puntuales. Las "áreas" (`produccion`, `logistica`, `ventas`) **no** dan ni quitan permisos de operación: solo deciden quién recibe qué notificación.

Hay un **rol liviano de administrador del equipo** (`perfiles_equipo.es_admin`) solo para la página personal: feedback, sumar tareas y gestionar perfiles (POL-039). No reemplaza al email hardcodeado de Economía/Precios.

## Matriz real

| Capacidad | Usuario aprobado | Admin de equipo (`es_admin`) | Cuenta dueña (email hardcodeado) | Cuenta FBTEST | Usuario pendiente / cualquiera con la anon key |
|---|---|---|---|---|---|
| Entrar a la app | ✅ | ✅ | ✅ | ✅ (solo `/whatsapp`) | ❌ en la UI (se cierra la sesión) |
| Todas las pantallas operativas | ✅ | ✅ | ✅ | ❌ | — |
| Ver Economía/Gastos en el menú | ❌ (pero la URL funciona) | ❌ (salvo que sea el dueño) | ✅ | ❌ | — |
| Editar Precios | ❌ (falla por RLS) | ❌ (salvo que sea el dueño) | ✅ | ❌ | — |
| Datos de Economía propios | ✅ los suyos | ✅ los suyos | ✅ los suyos | — | — |
| Ver `/perfil` (el propio) | ✅ si tiene fila en `perfiles_equipo` | ✅ | ✅ | ❌ | — |
| Pestaña **Equipo** en `/perfil` | ❌ | ✅ | ✅ (es el admin inicial) | ❌ | — |
| Crear/editar `perfiles_equipo` | ❌ (RLS) | ✅ | ✅ | ❌ | 🔴 no (RLS; solo authenticated + admin) |
| Escribir feedback (`feedback_equipo`) | ❌ (RLS) | ✅ | ✅ | ❌ | — |
| Ver/editar propios objetivos (`objetivos_personales`) | ✅ propios | ✅ (lee todos; escribe solo los suyos) | ✅ | ❌ | — |
| Anotaciones personales | ✅ solo las propias (ni el admin) | ✅ solo las propias | ✅ solo las propias | ❌ | — |
| Leer/escribir `ordenes`, `sellos`, `clientes`, `direcciones`, `programa`, `solicitudes_registro`, `webhook_logs`… por API | ✅ | ✅ | ✅ | ✅ | 🔴 **Sí.** Verificado 2026-09-27: RLS **desactivado** en esas tablas y el rol `anon` tiene SELECT/INSERT/UPDATE/DELETE. La anon key es pública (va en el bundle). Incluye poder aprobar usuarios escribiendo en `solicitudes_registro` ([AUD-SEC-001](../audits/seguridad.md#aud-sec-001)) |
| Subir/borrar en buckets `base`, `foto`, `vector` | ✅ | ✅ | ✅ | ✅ | ⚠️ políticas para rol `public` |
| Aprobar usuarios | ❌ (no hay UI) | ❌ (no hay UI) | ❌ (no hay UI) | ❌ | — |

## Dónde está cada control

| Control | Implementación | Nivel |
|---|---|---|
| Aprobación de usuario | `useAuth.signIn` consulta `solicitudes_registro` | Cliente |
| Rutas protegidas | `ProtectedRoute` (solo "hay sesión") | Cliente |
| FBTEST solo `/whatsapp` | `isPathAllowedForUser` | Cliente |
| Economía/Gastos en el menú | `Sidebar.tsx` (`isEconomiaUser`) | Cliente (solo visibilidad) |
| Precios | Políticas RLS con email en el JWT | Base de datos |
| Economía por usuario | Políticas RLS `user_id = auth.uid()` | Base de datos |
| Admin de equipo (perfil) | `perfiles_equipo.es_admin` + función `es_admin_equipo()`; UI en `useEquipoRol` | Base de datos (+ visibilidad cliente) |
| Escritura de `perfiles_equipo` | Políticas RLS `TO authenticated` + `es_admin_equipo()` | Base de datos |
| Feedback del equipo | RLS `feedback_equipo` (escribe admin; lee admin + destinatario); RPC `marcar_feedback_leido` | Base de datos |
| Objetivos personales | RLS `objetivos_personales` (SELECT propia o admin; escritura solo propia) | Base de datos |
| Notificaciones propias | RLS en `notificacion_destinatarios` | Base de datos |
| Tareas del dashboard / post-its | RLS por asignado/creador | Base de datos |
| Gadget de Aspire | Clave de instalación + token por programa | Edge function |
| Workers | API key por worker (en las funciones `/api`) | Servidor |
| Funciones `/api` | **Ninguno** | — |

## Qué no se sabe

❓ Si el negocio necesita permisos por área (p. ej. que Producción no vea Economía, que solo Ventas confirme pagos) → [Q-USR-005](../14-open-questions/usuarios-permisos.md#q-usr-005). ❓ Quién aprueba usuarios y cómo → [Q-USR-003](../14-open-questions/usuarios-permisos.md#q-usr-003).
