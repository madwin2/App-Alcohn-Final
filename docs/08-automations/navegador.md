# Automatizaciones que corren en el navegador

Estas "automatizaciones" solo ocurren si un usuario está usando la app en ese momento (y, en algunos casos, si **no cierra la pestaña**).

| Automatización | Disparador | Qué hace | Riesgo si se cierra la pestaña / nadie la usa |
|---|---|---|---|
| Cola de subida a MiCorreo | Guardar datos de envío | Sube de a una orden al worker, con pausa | Órdenes quedan en `Hacer Etiqueta` con `micorreo_subiendo_at` y `etiqueta_estado='generando'` |
| Cola de revisión de vectores | Terminar una vectorización | Guarda resultados para revisar (IndexedDB del navegador) | Se recuperan al volver a Vectorización en la misma PC; se pierden si se borran datos del sitio o se cambia de computadora |
| Sincronización de tareas de reposición de stock | Abrir el Inicio | Crea/borra tareas `[STOCK_REPLENISH]` y notificaciones p6 | Si el responsable no abre el Inicio, no se entera |
| Persistencia de estado derivado del programa | Cargar Programas | Escribe `EN_FABRICACION`/`FINALIZADO` | El estado guardado queda desactualizado hasta que alguien abra Programas |
| Preview del `.crv3d` grande | Abrir la hoja del programa | Genera y sube el GIF | Sin preview hasta abrirla |
| Notificaciones p1/p3/v1/v3/l1/t1/p2/v2 | Acciones en la UI | Emite notificaciones | Cambios hechos por otra vía no notifican |
| WhatsApp `pedido_registrado`/`actualizado`/`sello_rehacer`/`mockups_listos` | Acciones en la UI | Llama a `webhook-bot` | — |
| Vectorización automática | Subir base (si flag ON) | Encola job | — |
| Chequeo de versión y novedades | Volver a la pestaña | Aviso de actualizar / carrusel | — |
| Realtime | Cambios en `ordenes`/`sellos`/`tareas`/`programa`/`notificaciones` | Refresca listas | — |
