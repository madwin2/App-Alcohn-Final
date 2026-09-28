# Usuarios, acceso y Configuración

> Login: `/login` (`src/app/login/index.tsx`, `LoginForm`, `SignUpForm`) · Hook: `src/lib/hooks/useAuth.ts` · Guardas: `ProtectedRoute`, `src/lib/auth/access.ts` · Servicio: `auth.service.ts`
> Configuración: `/configuracion` (`src/app/configuracion/index.tsx`) · Permisos en general: [09-roles-permissions](../../09-roles-permissions/README.md) · Workflow: [WF-13](../../03-workflows/WF-13-alta-de-usuario.md)

## Login y registro (✅)

- Email + contraseña (Supabase Auth). El identificador `FBTEST` se traduce al email de la cuenta de revisión de Meta.
- **Registro** desde la misma pantalla: crea el usuario en Auth y una fila `solicitudes_registro` con `estado='PENDIENTE'`.
- **Inicio de sesión**: si la solicitud no está `APROBADO`, cierra la sesión y muestra "Tu cuenta está pendiente de aprobación. Contacta al administrador."
- Después del login se va a `/pedidos` (la cuenta FBTEST a `/whatsapp`).
- **No existe pantalla para aprobar o rechazar** solicitudes: las funciones existen en `auth.service.ts` pero no se usan; `/admin/registros` redirige a Pedidos. ❓ La aprobación se hace a mano en la base → [Q-USR-003](../../14-open-questions/usuarios-permisos.md#q-usr-003).
- "Olvidé mi contraseña" redirige a `/reset-password`, **ruta que no existe** ([AUD-INC-016](../../audits/inconsistencias.md#aud-inc-016)).

## Nombre visible de un usuario

✅ Se toma de `solicitudes_registro` (nombre + apellido) para "cargado por", filtros por usuario, destinatarios de tareas; en la barra lateral de `user_metadata`.

## Configuración

✅ Única función: asignar a cada usuario aprobado sus **áreas de notificación** (`produccion`, `logistica`, `ventas`) en `usuario_area`. No da permisos: solo define quién recibe qué notificaciones.
