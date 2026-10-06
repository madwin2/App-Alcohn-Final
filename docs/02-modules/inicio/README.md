# Inicio (dashboard personal)

> Ruta: `/` · Página: `src/app/home/index.tsx` · Componentes: `src/components/home/*`
> Nota: después del login la app redirige a `/pedidos` (`getPostLoginPath`), no al Inicio.

## Propósito

✅ Pantalla personal de cada usuario con: metas de venta, compañeros, notas y tareas, reposición de stock y las **colas operativas** de sellos terminados.

## Contenido

| Bloque | Qué muestra | Fuente |
|---|---|---|
| Hero | Imagen o video de bienvenida del usuario. Los medios están **hardcodeados por nombre** de 4 personas en `src/lib/utils/userImages.ts` (`public/usuarios/`). | ✅ |
| **Objetivos** | **Meta dinámica en sellos** (2026-10-06): «Sellos del mes» vs objetivo (marca de equilibrio) y «Sellos de hoy» vs lo necesario por día hábil. La meta del mes la publica Economía en `metas_ventas` (solo sellos; lectura para todos, escritura solo dueño); lo diario se calcula en vivo (`src/lib/metas/dinamica.ts`, días hábiles con `feriados`). Si no hay meta publicada: la del mes anterior; si no hay ninguna, la fija 200/10 (`src/lib/metas`) | ✅ |
| Usuarios | Cápsula con los usuarios aprobados que tienen foto; video de hover. | ✅ |
| Notas personales | Post-its arrastrables guardados **solo en el navegador** (`localStorage` `dashboard_notes_<userId>`). | ✅ |
| Tareas de compañeros | `tareas_dashboard` asignadas al usuario (arrastrables, posición persistida). "Asignar tarea a compañero" crea la tarea y notifica **t1**. Completar = borrar. | ✅ |
| Reposición de stock | Tareas `[STOCK_REPLENISH]` (ver [stock](../stock/README.md)). Tarjeta compacta; permite cargar el ingreso. | ✅ |
| **Sellos listos** | 4 colas: **Enviar foto** (Hecho + venta Señado), **Esperando pago** (Hecho + Foto enviada), **Para enviar** (Hecho + Transferido + envío Sin envío), **Deudores** (venta Deudor). | ✅ |
| Prioritarios y con fecha límite | Ítems prioritarios o con fecha límite. | ✅ |

🔶 Las cuatro colas de "Sellos listos" son la vista más clara de **qué tiene que hacer Ventas** con los sellos terminados: fotografiar/enviar foto, cobrar, pasar a envío, perseguir deudores.

## Datos

Usa el `OrdersProvider` (mismas órdenes que Pedidos), `tareas_dashboard`, `stock_*`, `solicitudes_registro` (usuarios aprobados).
