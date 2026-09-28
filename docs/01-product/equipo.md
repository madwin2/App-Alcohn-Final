# Equipo y responsabilidades

Confirmado por el equipo el 2026-09-28 ([Q-USR-001](../14-open-questions/usuarios-permisos.md#q-usr-001)). Actualizar cuando cambien las personas o los roles.

| Persona | Rol | Qué hace en Alcohn AI | Fuera de Alcohn AI |
|---|---|---|---|
| **Julián Moreno** | Dueño / administración | Único usuario de Economía y Gastos; dueño del catálogo de Precios; administra el VPS (bot, workers), Supabase, Vercel y la app de Meta; aprueba usuarios en Supabase; actualiza `costos_de_envio`; a veces ayuda en ventas | Desarrollo de la app (con Cursor/Claude) |
| **Lautaro "Cachi" Albornoz** | Ventas y **logística** | Ventas y cobros; carga datos de envío; descarga el PDF de MiCorreo y lo carga en "Cargar seguimientos"; envíos Andreani; genera links Andreani | Arma los sellos al despachar (varilla, tuerca, mango, prisionero); imprime etiquetas (Zebra ZD220); lleva los paquetes al correo |
| **Julián "Juli B" Bobasso** | Ventas | Ventas y cobros; **sube las fotos** de los sellos terminados; genera links Andreani | Saca las fotos |
| **Federico "Fede" Minuto** | Producción (operario) | **Vectorización** (principal); arma los **programas**; corre el gadget de Aspire; marca Haciendo/Hecho; mantiene los `.crv3d` base | Prepara y opera las **dos CNC**; guarda trayectorias en pendrive; corta y prueba los sellos en cuero |

Ayuda cruzada: en picos de vectorización puede ayudar otra persona; el túnel de Andreani lo abre quien lo necesite.

## Áreas de notificación vs personas

`usuario_area` (Configuración) define quién recibe cada notificación; hoy: ventas 3, logística 2, producción 2. Verificar que coincida con la tabla de arriba.

## Implicancias para el diseño

- Producción es **una sola persona** que vectoriza, programa y opera las máquinas: cualquier mejora en Vectorización/Programas impacta directo en su jornada.
- Ventas y logística se superponen (Cachi hace ambas).
- No hay roles ni permisos en la app y el equipo **no los necesita por ahora** ([Q-USR-005](../14-open-questions/usuarios-permisos.md#q-usr-005)).
