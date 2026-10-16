# ADR-026 · Preparación de programas por revisión

Fecha: 2026-10-15. Estado: implementada localmente, recorrido ficticio calificado en C/Aspire 10.514; migración aplicada por el usuario y verificada el 2026-10-16. Edge v31 desplegada con autorización el mismo día; instalación de gadgets y validación operativa pendientes.

## Problema

El armado previo distribuía decisiones entre app y Aspire sin una posición persistente por sello. Descargar/subir un archivo podía marcar listo sin demostrar que correspondiera al plan actual. La identidad limitada al corte no permitía modificar el dibujo existente con seguridad.

## Decisión

Persistir un documento de fabricación separado de la venta, con soporte, instancias, recetas y plantillas nativas verificadas. Guardar con revisión esperada y conservar historial. Compartir el contrato geométrico entre navegador y edge; dar identidad a dibujos y auxiliares en Aspire y guardar referencia de plan/resultado por propiedad. Solo confirmar el archivo después de un informe recalculado sin errores de la revisión vigente. El inicio se valida en DB, incluido el contenido/vector actual.

Usar plantillas nativas subidas por el operario evita inventar parámetros CAM que no están documentados. La comparación de dos herramientas es orientativa. Repaso automático: sin repaso o sello completo, con respaldo a completo si cambió la geometría; una selección parcial ajustada puede conservarse, pero su certificación automática sin contactos se difiere hasta calibración.

Q-PROG-020/021 confirma que el repaso nativo es manual: se preserva su plantilla y se restaura la selección inmediatamente antes de recalcular cada operación, porque el recálculo general cambia la selección actual. Q-PROG-022 confirma Alimento con las principales 3MM y Corte Forma posterior al fino; se adaptan únicamente los selectores de capas por SDK y se mantiene herramienta/inicio/profundidad de las plantillas originales. La inspección de etapas ordena taladrado antes de roscado y planeado antes de cajeado, con fino antes del corte.

La app ofrece decisiones de fabricación con menos complejidad que Aspire. Un conjunto versionado de reglas extraídas de los gadgets y un plan de operaciones equivalente TS/Lua conectan esas decisiones con las entidades nativas. Se valida primero la pose real, luego los auxiliares generados y por último el recálculo. Se exige esa comprobación también al confirmar archivo/iniciar, evitando aprobar por un simple indicador de recálculo. La calificación comienza en C/Aspire 10.514 con la base entregada; G/XL se posponen expresamente.

## Alternativas y consecuencias

✅ Ampliación 2026-10-16: la revisión sola no distingue dos retoques de Aspire sin cambios del plan. Se vincula también el archivo al evento UUID del informe, con ruta propia e inmutable y verificación final en DB. Se rechaza comparar solamente revisiones: se reprodujo que permitía confirmar una subida atrasada. Registrar resultados conserva las identidades procesadas para que un reintento interrumpido no sustituya un resultado nuevo. Gadget 3.2/protocolo 4, migración/edge preparados sin desplegar; [ensayo HTTP/SQL](../audits/programas-conexion-validacion-2026-10-16.md).

✅ Ampliación 2026-10-16 (b): el soporte y las plantillas se heredan de la última preparación de la misma máquina en vez de cargarse en cada programa; la disponibilidad de material sigue siendo de cada corrida. Se agrega una salida explícita al flujo legado (`descartar_programa_preparacion`) para que un programa preparado no quede trabado si el gadget 3.2 no está disponible. Se descartó marcar la fila como «descartada» porque obligaba a cambiar la edge desplegada, el trigger y cada lectura. El botón queda limitado a C hasta calificar G/XL.

- Reimportar todo simplifica el armado pero destruye correcciones: descartado por POL-081.
- Reemplazar todo el archivo con una exportación de la app no conserva ediciones nativas ni garantiza trayectorias: descartado.
- Inferir velocidades/herramientas por el nombre de la receta no está respaldado por el proceso: se usan `.ToolpathTemplate` verificados.
- Documentos por programa duplican inicialmente la configuración del soporte; permiten verificar cada montaje antes de disponer de una configuración física unificada confirmada.
- Se conservan archivos anteriores y respaldos locales para recuperación. Nuevos documentos requieren protocolo 3; programas legados mantienen su ruta anterior.
- El trigger de inicio no se basa en `dirty`: el legado lo activa al cambiar cada estado de fabricación. Revisión, archivo y pertenencia/vector proveen la comprobación pertinente.

Fuente: conversación Q-PROG-013–018 / Q-VEC-011, POL-079–085. [Implementación y límites](../02-modules/programas/preparacion-visual.md).
