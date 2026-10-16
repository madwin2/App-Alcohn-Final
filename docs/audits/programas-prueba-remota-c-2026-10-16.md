# Prueba remota de preparación en máquina C

Fecha: **2026-10-16**. Autorizada por el usuario: programa de prueba en producción con datos ficticios, sincronización con el gadget 3.2 y limpieza posterior. **Sin TXT ni CNC.** Complementa la [conexión validada en local](programas-conexion-validacion-2026-10-16.md) y la [prueba nativa C](programas-aspire-real-2026-10-16.md).

## Datos de prueba

- Cliente interno `PRUEBA CLAUDE` y pedido **tipo `Prueba`, origen `App`**. Antes de crearlo se revisaron los triggers de `ordenes`/`sellos`: la conversión Meta solo dispara con `Venta`, la confirmación web solo con `Web` pagado y el consumo de bronce solo al pasar a `Hecho`. Ninguno se activó.
- Programa `PRUEBA CLAUDE C - borrar`, con 4 sellos a $0: Clásico (p19 y p12), 3 mm (p19) y Alimento (p25). Los SVG ficticios y las plantillas nativas son los de la calificación C.
- La r1 se generó con `createPreparation`/`arrangePreparation`/`validatePreparation` reales (0 observaciones) y se guardó con `guardar_programa_preparacion` desde el editor SQL.
- 🔶 El permiso automático de la sesión del agente bloqueó las escrituras en producción (SQL, Storage con service role) y el control del escritorio. El usuario ejecutó los scripts/SQL preparados y corrió el gadget en Aspire.

## Recorrido

1. Primer intento sobre una copia de `Downloads\Archivo Base Maq C.crv3d`: el gadget rechazó con **«El archivo pertenece a otro programa»**. ✅ Rechazo correcto. Ese archivo **no es una base limpia**: tiene el marcador `ALCOHN_PROGRAMA_V1` de un programa del 17 de septiembre y 7 sellos etiquetados.
2. La base oficial (`programas-base/C/programa-base.crv3d`, la que la app pone en el ZIP) está limpia: no tiene marcadores ni sellos etiquetados.
3. Sincronizar sobre la base oficial: importó y ubicó los 4 sellos, pero falló con **«Hay trayectorias previas sin identidad»**. El informe llegó al servidor sin recálculo, con 6 observaciones, y el programa siguió en Borrador.
4. **Preparar base**: hizo un respaldo, retiró las trayectorias y auxiliares de la base y conservó los dibujos.
5. Sincronizar de nuevo: **15 trayectorias** (taladrado, roscado, planeado, cajeados, perfilados 0,5, tres repasos 0,1, corte y **Corte Forma** después del repaso), guardado y subida.

## Resultado verificado en la base

- `revision_sincronizada = 1`, `archivo_revision = 1`, `recalculated = true`, `execution.verified = true`.
- 0 errores. 4 avisos `FINE_FALLBACK`: la r1 no tenía análisis de repaso, así que el gadget incluyó el sello completo como respaldo.
- Programa en **LISTO** con `dirty = false`, 181,7 min de maquinado y miniatura. El archivo quedó en `programas-aspire/<programa>/r1/<evento>/…` (4,4 MB, descargable).
- El evento fallido y el bueno quedaron en `eventos_procesados`: el intento anterior no pisó al vigente.

## Hallazgos

- **No usar `Archivo Base Maq C.crv3d` de Descargas como base**: es un programa ya sincronizado.
- La primera sincronización sobre la base de producción siempre necesita **Preparar base**. Hoy el gadget importa primero y falla al final. Mejora: detectar las trayectorias sin identidad antes de importar y ofrecer Preparar base en el mismo paso.
- El diálogo de Aspire muestra «Panadera» en lugar de «Panadería»: las tildes se pierden en los mensajes del gadget. Es solo de presentación.

## Limpieza

- Storage: 34 objetos borrados (28 plantillas, 4 SVG, el `.crv3d` y la miniatura), verificado en `storage.objects`.
- Base: `_prueba-c-limpieza.sql` prueba **Descartar preparación** sobre el programa real y después borra cliente, pedido (con sellos e historial en cascada) y programa (con preparación, revisiones, eventos y token en cascada).

✅ Limpieza verificada en solo lectura: 0 filas de prueba en `clientes`, `ordenes`, `sellos`, `programa`, `programa_preparacion(_revisiones)`, `programa_eventos`, `programa_sync_token` y `estado_historial`, y 0 objetos en Storage. Producción vuelve a tener 0 preparaciones.

Pendiente: G/XL, programas representativos del operario, certificación de selección parcial y contactos, y validación física.
