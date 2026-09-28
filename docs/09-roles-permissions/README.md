# Roles y permisos

## Resumen

✅ **Alcohn AI no tiene un sistema de roles.** Todo usuario aprobado puede ver y hacer todo en la interfaz, con tres excepciones puntuales. Las "áreas" (`produccion`, `logistica`, `ventas`) **no** dan ni quitan permisos: solo deciden quién recibe qué notificación.

## Matriz real

| Capacidad | Usuario aprobado | Cuenta dueña (email hardcodeado) | Cuenta FBTEST | Usuario pendiente / cualquiera con la anon key |
|---|---|---|---|---|
| Entrar a la app | ✅ | ✅ | ✅ (solo `/whatsapp`) | ❌ en la UI (se cierra la sesión) |
| Todas las pantallas operativas | ✅ | ✅ | ❌ | — |
| Ver Economía/Gastos en el menú | ❌ (pero la URL funciona) | ✅ | ❌ | — |
| Editar Precios | ❌ (falla por RLS) | ✅ | ❌ | — |
| Datos de Economía propios | ✅ los suyos | ✅ los suyos | — | — |
| Leer/escribir `ordenes`, `sellos`, `clientes`, `direcciones`, `programa`, `solicitudes_registro`, `webhook_logs`… por API | ✅ | ✅ | ✅ | 🔴 **Sí.** Verificado 2026-09-27: RLS **desactivado** en esas tablas y el rol `anon` tiene SELECT/INSERT/UPDATE/DELETE. La anon key es pública (va en el bundle). Incluye poder aprobar usuarios escribiendo en `solicitudes_registro` ([AUD-SEC-001](../audits/seguridad.md#aud-sec-001)) |
| Subir/borrar en buckets `base`, `foto`, `vector` | ✅ | ✅ | ✅ | ⚠️ políticas para rol `public` |
| Aprobar usuarios | ❌ (no hay UI) | ❌ (no hay UI) | ❌ | — |

## Dónde está cada control

| Control | Implementación | Nivel |
|---|---|---|
| Aprobación de usuario | `useAuth.signIn` consulta `solicitudes_registro` | Cliente |
| Rutas protegidas | `ProtectedRoute` (solo "hay sesión") | Cliente |
| FBTEST solo `/whatsapp` | `isPathAllowedForUser` | Cliente |
| Economía/Gastos en el menú | `Sidebar.tsx` (`isEconomiaUser`) | Cliente (solo visibilidad) |
| Precios | Políticas RLS con email en el JWT | Base de datos |
| Economía por usuario | Políticas RLS `user_id = auth.uid()` | Base de datos |
| Notificaciones propias | RLS en `notificacion_destinatarios` | Base de datos |
| Tareas del dashboard / post-its | RLS por asignado/creador | Base de datos |
| Gadget de Aspire | Clave de instalación + token por programa | Edge function |
| Workers | API key por worker (en las funciones `/api`) | Servidor |
| Funciones `/api` | **Ninguno** | — |

## Qué no se sabe

❓ Si el negocio necesita permisos por área (p. ej. que Producción no vea Economía, que solo Ventas confirme pagos) → [Q-USR-005](../14-open-questions/usuarios-permisos.md#q-usr-005). ❓ Quién aprueba usuarios y cómo → [Q-USR-003](../14-open-questions/usuarios-permisos.md#q-usr-003).
