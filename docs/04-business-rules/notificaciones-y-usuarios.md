# Reglas — Notificaciones y usuarios

| ID | Regla | Dónde | Hace cumplir |
|---|---|---|---|
| BR-NOT-001 | Una notificación con área llega a todos los usuarios de esa área (`usuario_area`), excepto a su autor. | `emitir_notificacion` | DB |
| BR-NOT-002 | Una notificación con `dedup_key` ya emitida no se vuelve a emitir. | `emitir_notificacion` | DB |
| BR-NOT-003 | Vencimientos: un ítem no `Hecho` con fecha límite a ≤3 días o vencida genera p4; una orden no despachada con fecha límite a ≤3 días o vencida genera l2 (una vez cada una). | `emitir_notificaciones_vencimientos` (cron 09:10 UTC) | DB |
| BR-NOT-004 | Terminar varios sellos juntos genera una sola notificación "N sellos fueron terminados". | `notifySellosHechos` | Servicio |
| BR-USR-001 | Solo pueden iniciar sesión usuarios con `solicitudes_registro.estado='APROBADO'`. | `useAuth.signIn` | **Servicio (cliente)** |
| BR-USR-002 | La cuenta de revisión de Meta solo accede a `/whatsapp`. | `access.ts`, `ProtectedRoute` | UI |
| BR-USR-003 | Economía y Gastos aparecen en el menú solo para la cuenta del dueño. | `Sidebar.tsx` | **UI** (rutas abiertas) |
| BR-USR-004 | Datos de Economía (cajas, movimientos, gastos mensuales) son por usuario. | RLS `economia_*` | DB |
