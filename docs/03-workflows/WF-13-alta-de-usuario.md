# WF-13 · Alta de un usuario interno

| | |
|---|---|
| **Inicio** | Una persona nueva del equipo necesita acceso. |
| **Actores** | Persona nueva; administrador. |

## Pasos

1. ✅ En `/login` → "Registrarse": email, contraseña, nombre, apellido → usuario en Supabase Auth + `solicitudes_registro` `PENDIENTE`.
2. ✅ Si intenta entrar: "Tu cuenta está pendiente de aprobación".
3. Julián cambia `estado` a `APROBADO` **directamente en Supabase** (no hay pantalla).
4. ✅ Ya puede entrar; ve **todas** las pantallas (salvo Economía/Gastos en el menú).
5. ✅ En `/configuracion` se le asignan áreas de notificación.
6. 🔶 Para que aparezca su foto/video en el Inicio hay que agregar su nombre y archivos a `src/lib/utils/userImages.ts` + `public/usuarios/` (requiere deploy).
7. 🔶 Para sueldos en Gastos se toma la lista de usuarios aprobados.

## Baja

❓ No hay flujo de baja; habría que desactivar el usuario en Supabase Auth → [Q-USR-004](../14-open-questions/usuarios-permisos.md#q-usr-004).
