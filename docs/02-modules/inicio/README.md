# Inicio (dashboard personal)

> Ruta: `/` · Página: `src/app/home/index.tsx` · Componentes: `src/components/home/*`
> Nota: después del login la app redirige a `/pedidos` (`getPostLoginPath`), no al Inicio.

## Propósito

✅ Pantalla personal de cada usuario con: metas de venta, compañeros, notas y tareas, reposición de stock y las **colas operativas** de sellos terminados.

## Contenido

| Bloque | Qué muestra | Fuente |
|---|---|---|
| Hero | Imagen o video de bienvenida del usuario. Los medios están **hardcodeados por nombre** de 4 personas en `src/lib/utils/userImages.ts` (`public/usuarios/`). | ✅ |
| **Objetivos** | "Ventas totales del mes" vs meta **200** y "Ventas del día" vs meta **10** (cantidad de ítems). Metas fijas en código (`MONTHLY_GOAL`, `DAILY_GOAL`). Vigentes; a futuro configurables y escalonadas (Q-GEN-004) | ✅ |
| Usuarios | Cápsula con los usuarios aprobados que tienen foto; video de hover. Clic en la **propia** foto → `/perfil`. | ✅ |
| Notas personales | Post-its arrastrables guardados **solo en el navegador** (`localStorage` `dashboard_notes_<userId>`). | ✅ |
| Tareas de compañeros | `tareas_dashboard` asignadas al usuario (arrastrables, posición persistida). "Asignar tarea a compañero" crea la tarea y notifica **t1**. Completar = borrar. | ✅ |
| Reposición de stock | Tareas `[STOCK_REPLENISH]` (ver [stock](../stock/README.md)). Tarjeta compacta; permite cargar el ingreso. | ✅ |
| **Sellos listos** | 4 colas: **Enviar foto** (Hecho + venta Señado), **Esperando pago** (Hecho + Foto enviada), **Para enviar** (Hecho + Transferido + envío Sin envío), **Deudores** (venta Deudor). | ✅ |
| Prioritarios y con fecha límite | Ítems prioritarios o con fecha límite. | ✅ |

🔶 Las cuatro colas de "Sellos listos" son la vista más clara de **qué tiene que hacer Ventas** con los sellos terminados: fotografiar/enviar foto, cobrar, pasar a envío, perseguir deudores.

## Datos

Usa el `OrdersProvider` (mismas órdenes que Pedidos), `tareas_dashboard`, `stock_*`, `solicitudes_registro` (usuarios aprobados).
