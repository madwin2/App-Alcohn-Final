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
| Usuarios | Cápsula con los usuarios aprobados que tienen foto; video de hover. Clic en la **propia** foto → `/perfil`. | ✅ |
| Notas personales | Post-its arrastrables guardados **solo en el navegador** (`localStorage` `dashboard_notes_<userId>`). | ✅ |
| Tareas de compañeros | `tareas_dashboard` asignadas al usuario (arrastrables, posición persistida). "Asignar tarea a compañero" crea la tarea y notifica **t1**. Completar = borrar. | ✅ |
| Reposición de stock | Tareas `[STOCK_REPLENISH]` (ver [stock](../stock/README.md)). Tarjeta compacta; permite cargar el ingreso. | ✅ |
| **Sellos listos** | 4 colas: **Enviar foto** (Hecho + venta Señado), **Esperando pago** (Hecho + Foto enviada), **Para enviar** (Hecho + Transferido + envío Sin envío), **Deudores** (venta Deudor). | ✅ |
| Prioritarios y con fecha límite | Ítems prioritarios o con fecha límite. | ✅ |

**Home nueva (`/dev/home`, en construcción, solo desarrollo)** — cinco **cuadrados de sellos** con el conteo por condición; al tocar uno se expande solo hacia los costados (alto fijo) y muestra los sellos en fila horizontal (`src/components/home-nueva/PanelSellos.tsx`). Por sello:
- **Prioritarios**: `es_prioritario` **o** fecha límite del pedido, hasta llegar a `Seguimiento enviado` (siguen mientras están `Despachado`; decisión del dueño 2026-10-08). Una Prueba ya Hecha no cuenta. La Home actual los saca al pasar a `Despachado`.
- **Para enviar**: misma cola que "Para enviar" de la Home actual.
- **Foto pendiente**: misma cola que "Enviar foto" de la Home actual.
- **Especiales**: ❓ sin definir (Q-INI-001); cuando se defina, cuenta hasta `Seguimiento enviado`.
- **Para vectorizar**: mismo criterio que Vectorización → Pendientes (sello en Sin hacer, con archivo base y sin preview del vector). 🔶 Se calcula desde los pedidos cargados, sin mirar `estado_vectorizacion`.
Orden de las listas: con fecha límite primero (vencidos arriba), después del más viejo al más nuevo.

**Home nueva — panel de área** (`src/components/home-nueva/PanelArea.tsx` + `area/*`): pestañas Producción · Ventas · Logística · Administración · Equipo. Abre en el `area_principal` del perfil y recuerda la última pestaña (localStorage). **Administración** solo la ve el dueño (mismo email que habilita Economía).
- **Producción**: cola de fabricación por estado (sellos no Hechos y no despachados), programas de hoy o en fabricación, **bronce usado en el mes** (`bronce_consumo`). ❓ El stock de bronce **disponible** no se registra (FR-11); solo el consumo.
- **Ventas**: Esperando pago (Hecho + Foto enviada) y Deudores, por pedido con el saldo; mockups de la app sin terminar (últimos 14 días; los web en `procesando` se ignoran, Q-MOCK-001); seguimientos a clientes.
- **Logística**: pedidos por etapa de envío (Para enviar, Hacer etiqueta, Error de etiqueta —incluye `labelState=error` de MiCorreo—, Etiqueta lista, Despachado) por transporte, y la lista de errores de etiqueta con su mensaje.
- **Administración**: pedidos cargados del mes (🔶 aproximado; el exacto es el de Economía), por cobrar (solo pedidos en Esperando pago o Deudores), publicidad del mes (Control de gastos) y publicidad por sello vendido, pedidos por día (14 días).
- **Equipo**: pedidos que entraron hoy (quién los cargó / web) e ideas activas del corcho (las no vistas primero).
- Los montos no suman pedidos internacionales (otra moneda).

**Home nueva — dos modos** (selector arriba a la derecha, se recuerda en el navegador):
- **Panel**: el panel de área (pestañas) + la columna de Stock.
- **Escritorio** (`escritorio/Escritorio.tsx`): el espacio del panel de área es un escritorio con apps (Pedidos, Envíos, Producción, Programas, Corcho, Mi perfil; Economía y Gastos solo el dueño). Los íconos son de vidrio líquido (mismo material que el vidrio de prueba) y se acomodan como en una PC: chicos, desde arriba a la izquierda, en columnas. Doble click abre la ventana **ya maximizada** (se puede restaurar, arrastrar, agrandar desde la esquina, minimizar y cerrar) con una **versión mini a medida** de esa pantalla (`escritorio/apps.tsx`, con "Abrir completo"). Las mini apps permiten trabajar, usando lo mismo que las pantallas reales (`escritorio/acciones.tsx`):
  - **Pedidos**: "Nuevo pedido" (el mismo `NewOrderDialog` de Pedidos); cada pedido se despliega con sus sellos y se cambia fabricación, venta y envío por sello (mismo `updateOrder` que la tabla, sonido de Transferido y diálogo de Rehacer); perfil del cliente (`ClienteProfileDialog`).
  - **Producción**: cada sello de la etapa elegida se pasa a otro estado de fabricación.
  - **Envíos**: estado de envío del pedido (todos sus sellos, como la fila resumen de Pedidos).
  - **Corcho**: proponer una idea (`crearIdeaCorcho`), votar a favor / en contra y abrir la descripción (la marca como vista).
  - Programas, Mi perfil, Economía y Gastos siguen de solo lectura. La columna pasa a ser un **acordeón** (`ColumnaAcordeon.tsx`) con Stock y las áreas en versión compacta; cada encabezado muestra su número clave.
- Los bloques del acordeón salen de un registro (`BLOQUES`): base para que más adelante cada usuario elija y ordene los suyos (todavía no implementado).
- Los números de paneles, acordeón y ventanas salen del mismo módulo (`area/datos.ts`).

🔶 Las cuatro colas de "Sellos listos" son la vista más clara de **qué tiene que hacer Ventas** con los sellos terminados: fotografiar/enviar foto, cobrar, pasar a envío, perseguir deudores.

- **Arriba (Home nueva)**: a la izquierda el modo (Panel / Escritorio) y **Personalizar**; al centro las ventas del mes; a la derecha las notas.
- **Personalizar** (`Personalizar.tsx`, `vista.ts`): panel con interruptores para elegir qué cuadrados de sellos, qué áreas, si va Stock y (en modo escritorio) qué apps se ven. Cada persona arranca con la vista base de su rol (confirmada por el dueño, Q-INI-002; nada queda bloqueado) y lo que cambia se guarda en el navegador; "Volver a la base" lo deshace. Vista previa de cada persona en `/dev/home/fede`, `/dev/home/juli-b`, `/dev/home/lautaro` (o `cachi`), con su tarjeta y su área.
- **Movimiento (Home nueva)** (`movimiento.ts` + `movimiento.css`): todas las animaciones usan la misma curva (sale rápido y frena largo) y tres duraciones (200 ms hover, 300 ms estados, 500 ms cambios de tamaño/lugar; 700 ms para que los gráficos lleguen a su valor). Al cargar, los bloques entran en cascada; los gráficos crecen desde cero; el contenido de las pestañas entra desde el lado de la pestaña nueva; lo que se pliega (acordeón, filas de stock, pedidos de la mini app) se cierra con su contenido; las ventanas del escritorio nacen, se minimizan y se cierran hacia su ícono. Respeta "reducir movimiento" del sistema. Por fluidez solo se animan opacidad y transformación (sin desenfoques), los paneles negros no usan desenfoque de fondo (la lava animada lo obligaba a recalcularse en cada cuadro), el acordeón deja sus cuerpos armados de antemano y el vidrio de los íconos dibuja solo su zona y se pausa con una ventana maximizada encima.

## Datos

Usa el `OrdersProvider` (mismas órdenes que Pedidos), `tareas_dashboard`, `stock_*`, `solicitudes_registro` (usuarios aprobados).
