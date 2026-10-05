# Registro de decisiones (ADR)

Decisiones de producto/arquitectura **reconstruidas** a partir de los planes en la raíz del repo, comentarios en el código y commits. Cuando la motivación no está escrita, se marca 🔶. Nuevas decisiones: agregar un archivo `ADR-NNN-titulo.md` o una fila acá con el mismo formato.

| ID | Decisión | Estado | Fuente |
|---|---|---|---|
| ADR-001 | La tienda web y la app comparten **un solo proyecto Supabase**; la web escribe con service role desde API routes. | Implementada | `modelo-datos-web-supabase.md` §1 |
| ADR-002 | **Pedidos web ocultos** en la app hasta que el pago está confirmado ("Opción A": la web no crea sellos antes del pago; la app filtra igual por defensa). | Implementada | comentario en `orders.service.ts`, `production.service.ts`; `web-alcohn-integracion.md` |
| ADR-003 | La **prioridad** deja de ser un estado de fabricación (`'Prioridad'`) y pasa a ser un flag independiente (`es_prioritario`). | Implementada (quedan 4 datos legados) | `migration_add_es_prioritario.sql`, `migrations.ts` |
| ADR-004 | **Rehacer** exige motivo, guarda snapshot del estado previo y cobro adicional opcional; resetea foto/venta/envío; y (2026-09-14) marca prioridad. | Implementada | `PLAN_REHACER_ITEMS.md`, changelog #2 |
| ADR-005 | **Medida de fabricación** separada de la pedida; se confirma al subir SVG; tope por planchuela en vez de margen fijo; popup si desvío ≥6 mm; nunca deformar. | Implementada | `ANALISIS_MEDIDA_REAL_SELLOS.md`, `PLAN_MEDIDA_FABRICACION_SVG.md`, commits 2026-09-07 |
| ADR-006 | **Programas** como entidad real (`programa_id`) que agrupa sellos por máquina, con validación de material; el texto `programa_nombre` queda como histórico y solo lectura en Producción. | Implementada | `PLAN_PROGRAMAS.md`, `_FASE_2.md`, changelog #13 |
| ADR-007 | **"Sincronizar no es terminar"**: subir el `.crv3d` o recibir el reporte no bloquea ni verifica. El candado es solo manual; se eliminó el bloqueo automático al descargar. | Implementada | `PLAN_PROGRAMAS_FASE_3.md` §2, §3 #10; changelog #8, #9 |
| ADR-008 | Los vectores **EPS siguen fallando a propósito** en Aspire (sin conversión automática ni bloqueo); lo que cambia es que el error se vuelve visible (hoja, fila del sello, notificación). | Implementada | F3 §1.4, §3 #9 |
| ADR-009 | El **gadget baja el paquete solo** desde la app (lista de programas por máquina), con fallback al ZIP; tiene modo **Actualizar** que conserva el trabajo manual; nunca borra geometría por su cuenta. | Implementada | F3 §3 #1–#4, changelog #10, #11 |
| ADR-010 | Subir **trayectorias** a la app (sin agente local ni OneDrive; sin decidir agrupados en v1). | **Pendiente** (tabla y bucket creados, sin endpoint) | F3 §3 #5–#6, §5.8 |
| ADR-011 | Guardar tiempo de mecanizado y material real, **sin usarlos para costos** todavía. | Implementada (solo guarda) | F3 §3 #8 |
| ADR-012 | **Vectorización dentro de la app** con Vectorizer.AI, agrupando imágenes en hojas para ahorrar créditos, con revisión humana; la vectorización automática (worker Python) queda apagada. | Implementada | changelog #4, `vectorAuto.ts`, `deep-research-report.md` |
| ADR-013 | El **link de Andreani se asigna al enviar la foto** (no al crear el pedido) para que no venza mientras se fabrica (vida útil 30 h). | Implementada | comentario en `webhook-bot`, `orders.service.ts` |
| ADR-014 | **MiCorreo por automatización del portal** (Playwright) en producción; la API oficial se explora en una CLI aislada antes de tocar la app (sin cancelación posible en la API). | Implementada / en exploración | `services/micorreo-worker/README.md`, `PLAN_INTEGRACION_MICORREO_API_FASE_1.md` |
| ADR-015 | El worker de Andreani sale a internet por un **túnel desde la PC de la oficina** porque Andreani bloquea la IP del VPS ("sin pagar proxy"). | Implementada | `services/andreani-worker/README.md` |
| ADR-016 | **Notificaciones internas por área** (producción/logística/ventas), sin notificar al autor; Administración fuera de alcance. | Implementada | `notificaciones-funcional.md` |
| ADR-017 | **Aviso de versión nueva + "Qué hay de nuevo"** curado a mano; toda feature visible debe sumar una entrada. | Implementada | `actualizaciones-app.md`, `.cursor/rules/changelog-novedades.mdc` |
| ADR-018 | **Costos de fabricación versionados** por fecha de vigencia; cada ítem se costea con la versión vigente a su creación. | Implementada | `migration_fabricacion_parametros_por_fecha.sql` |
| ADR-019 | **Planchuela 19** = stock de 20 mm con 18 mm útiles: umbral de lado menor 1,8 cm (sellos de ~2 cm van a la de 25). | Implementada (2026-09-25) | `migration_planchuela_19_threshold_1_8.sql`, changelog #15 |
| ADR-020 | Datos de envío **validados contra el padrón oficial** de MiCorreo (sin texto libre) para que la etiqueta no falle; la web usa el mismo criterio. | Implementada | `PROPUESTA_PAGINA_ENVIOS_CORREO.md`, `envios-ecommerce-web.md` |
| ADR-021 | Máquina **Grande solo P12 y P38**; **XL solo P63**. | Implementada (2026-09-27) | changelog #19, `material.ts` |
| ADR-022 | Envío **gratis desde 3 sellos** en el mensaje de cobro. 🔶 Motivación comercial no escrita. | Implementada (solo en el mensaje) | `webhook-bot` |
| ADR-023 | **Centro Alcohn**: catálogo compartido (manual/búsqueda/chat), actividades diferidas, chat documental autenticado sin datos en vivo. | Implementada (2026-09-29) | `PLAN_CENTRO_INFORMACION_ALCOHN.md`, [ADR-023](ADR-023-centro-alcohn-catalogo-compartido.md) |
| — | **Control de gastos**: gasto por día desde las plataformas, USD al blue del día del pago, IVA + 2 %, objetivo 25 %. | Etapa 1 implementada en código (2026-10-05) | `PLAN_CONTROL_GASTOS.md`, [control-de-gastos](control-de-gastos.md) |

## Cómo registrar una nueva decisión

1. Contexto (qué problema), 2. Decisión, 3. Alternativas descartadas, 4. Consecuencias (qué módulos cambian), 5. Fuente (issue, plan, conversación), 6. Fecha. Actualizar módulos, reglas y estados afectados.
