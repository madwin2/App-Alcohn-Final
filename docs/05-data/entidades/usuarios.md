# Usuarios y preferencias

| Tabla | Qué es |
|---|---|
| `auth.users` | Cuentas de Supabase Auth (7). |
| `solicitudes_registro` | Solicitud de acceso por usuario: `estado` (`PENDIENTE`,`APROBADO`,`RECHAZADO`), nombre, apellido, email, aprobado por/en, motivo de rechazo. **Fuente del nombre visible** de cada usuario. RLS desactivado. |
| `usuario_area` | Áreas de notificación por usuario (`produccion`,`logistica`,`ventas`). |
| `perfiles_equipo` | Perfil laboral de la página **Mi perfil** (`/perfil`): puesto, área principal, fechas de ingreso/nacimiento, color, vacaciones (saldo base + sin límite), `es_admin`, `activo`. **1 fila por usuario.** RLS activado: SELECT para `authenticated`; INSERT/UPDATE solo si `es_admin_equipo()`. Sin DELETE (se desactiva). Función `es_admin_equipo()`. Migración: `migration_equipo_perfiles.sql`. |
| `changelog_visto` | Último id de novedades visto por usuario. |
| `vistas_tabla` | Configuración de tablas (Pedidos, Producción) por usuario. |
| `economia_settings`, `economia_gastos_mensuales` | Datos de economía por usuario (en la práctica, solo el dueño). |

Ver [09-roles-permissions](../../09-roles-permissions/README.md) · [módulo perfil](../../02-modules/perfil/README.md).
