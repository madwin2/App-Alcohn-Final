# Usuarios y preferencias

| Tabla | Qué es |
|---|---|
| `auth.users` | Cuentas de Supabase Auth (7). |
| `solicitudes_registro` | Solicitud de acceso por usuario: `estado` (`PENDIENTE`,`APROBADO`,`RECHAZADO`), nombre, apellido, email, aprobado por/en, motivo de rechazo. **Fuente del nombre visible** de cada usuario. RLS desactivado. |
| `usuario_area` | Áreas de notificación por usuario (`produccion`,`logistica`,`ventas`). |
| `changelog_visto` | Último id de novedades visto por usuario. |
| `vistas_tabla` | Configuración de tablas (Pedidos, Producción) por usuario. |
| `economia_settings`, `economia_gastos_mensuales` | Datos de economía por usuario (en la práctica, solo el dueño). |

Ver [09-roles-permissions](../../09-roles-permissions/README.md).
