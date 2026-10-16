# Revisión de Programas para automatizar la preparación

Fecha: 2026-10-15. **Hallazgos del análisis previo; sin consultar DB en vivo ni ejecutar Aspire.** La resolución local posterior está indicada al final; no implica despliegue en producción.

Propuesta relacionada: [preparación y sincronización](../02-modules/programas/propuesta-preparacion-y-sync.md).

## AUD-PROG-001 · Anchos útiles diferentes entre app y gadgets

✅ `KNOWN_MAX_FABRICATION_MM` en `fabricationSize.ts` usa 11,5 / 18 / 24 / 36,5 mm para 12 / 19 / 25 / 38. `COLUMNS` del gadget Chica usa efectivos 11,7 / 18 / 24,2 / 37; Grande usa 11,7 / 37. XL define ancho 63; la app no define tope útil de fabricación para 63.

✅ `resolvePlanchuelaRef` usa además umbrales nominales de clasificación y prioriza `tipoPlanchuela` existente; no demuestra encaje físico de la geometría final.

🔶 Son definiciones con propósitos distintos que podrían ser deliberadas; no se concluye cuál es físicamente correcta. Impiden usar una única de ellas como certificado de apoyo sobre el material sin confirmar Q-PROG-013.

❓ Definir con Fede contorno de pieza terminada, márgenes y área útil por montaje. No cambiar los valores sin esa información. La divergencia de largos máximos ya está en AUD-INC-011.

## AUD-PROG-002 · Alimento no tiene rama propia en la automatización del gadget

✅ `mapStampType` de `programa-sync` puede enviar `ALIMENTO`, y el manifest incluye nombres de plantillas según tipo. Sin embargo, `runTypeAutomation` de los gadgets C/G/XL distingue `3MM` y usa la rama general para los demás tipos; no consume esas plantillas para seleccionar una receta específica de Alimento.

✅ El recálculo posterior usa las trayectorias existentes del archivo base. Por eso el tipo en el manifest no basta para demostrar que se aplicaron operaciones de Alimento.

🔶 La descripción general de «trayectorias según tipo» de la documentación necesita esta precisión. El resultado real también depende de las bases instaladas, no inspeccionadas en esta revisión.

❓ Comprobar la receta y las bases reales antes de ofrecer selección de mecanizado con garantía automática. Q-VEC-011 confirma profundidad de Alimento, no la implementación de todas sus operaciones.

## AUD-PROG-003 · Presencia por marca de Corte no equivale a geometría completa

✅ `createAdditionalElements` etiqueta la línea de Corte con `ALCOHN_SELLO_ID`. `sellosPresentes` usa esas marcas como fuente principal; Actualizar omite el sello reconocido. Los contornos del diseño y taladrados no tienen en ese flujo una asociación completa demostrada equivalente.

🔶 Borrar o alterar solo parte de un sello puede dejar una marca que siga contando como presente. Sin una identificación completa no se puede mover toda la instancia ni comprobar su integridad con certeza.

Esto no invalida el objetivo actual de evitar reimportaciones; delimita lo que falta para editar desde ambos lados conservando correcciones.

## AUD-PROG-004 · LISTO no acredita controles de la revisión final

✅ `validateAndFixScale` compara solo el lado mayor al importar, con tolerancia del 2 %. Los existentes omitidos por Actualizar no pasan de nuevo por ese control.

✅ `runPaso3AndRecalculate` devuelve un mensaje ante fallo de recálculo. `main` guarda ese mensaje para el resumen, pero no lo utiliza para impedir el reporte y la subida. `confirmar-upload` marca `dirty=false` y puede pasar BORRADOR a LISTO sin verificar un informe de geometría apta. Generar ZIP también permite LISTO.

✅ El contrato actual no vincula la confirmación a una revisión de contenido descargada por el gadget.

🔶 En consecuencia, un archivo subido no demuestra ausencia de errores; además, una subida de un armado anterior podría limpiar cambios posteriores. La propuesta requiere separar archivo recibido, sincronización y validación de una revisión concreta.

## AUD-PROG-005 · El perfil fino de Alimento usa la profundidad del mecanizado principal

✅ `FRESA_ALIMENTO` en `src/lib/fresa/config.ts` está configurado con `finalDepthMm: 3` y `minDepthMm: 1`, compartiendo punta 0,1 mm y 30° por lado con la fina general. Se utiliza en el análisis y la vista de relieve.

👥 Q-PROG-018 confirma que **la fina de punta 0,1 mm llega hasta 0,6 mm también en Alimento**. Los 3 mm corresponden al mecanizado principal; Alimento agrega corte perimetral con fresa de 6 mm. La primera fresa se llama «0,5», pero está configurada como 0,6 mm y tiene 15° laterales.

El perfil implementado no representa la pasada fina confirmada. No basta con cambiar solo el final a 0,6 y conservar la mínima de 1 mm: no es alcanzable por esa pasada.

👥 **Criterio aclarado en Q-VEC-011/POL-085**: el ≈1 mm era referencia de buen grabado para la primera fresa; en Alimento se prefiere no necesitar la fina. Si hace falta repaso, se busca que alcance unos 0,4–0,5 mm, con final máximo 0,6 mm. Por tanto hay que distinguir herramientas y resultado acumulado, en vez de tratar 3 mm/1 mm como perfil de la fina. El rango está confirmado; el corte rígido de aprobación y la política de advertencias requieren calibración (Q-VEC-007/009). No se modificó el motor en esta tarea de análisis.

**Impacto**: el chequeo y la vista de relieve de Alimento pueden evaluar una operación distinta de la real; además, no simulan la secuencia de herramientas para decidir el repaso localizado. Resolver antes de usar ese perfil para aprobar automáticamente la selección fina de Alimento.

## Resolución local posterior al análisis (2026-10-15)

Los hallazgos anteriores describen el estado previo. AUD-PROG-003/004 tienen implementación local por identidad/propiedad y revisión/archivo; AUD-PROG-005 se corrigió: fina física 0,1/configurada 0,2, Alimento final 0,6, referencia 0,4 y comparación 0,5, con principal separada. AUD-PROG-001/002 requieren verificar el soporte físico y confirmar plantillas; el editor lo exige. Se completaron cinco sincronizaciones nativas ficticias en C/Aspire 10.514, con importación, CAM, movimiento/escala, Alimento, selección interior y guardado; informe/subida se simularon sin red. Siguen pendientes validación operativa con programas representativos, G/XL y selección parcial automática sin contactos. [Estado implementado](../02-modules/programas/preparacion-visual.md). Ninguna migración se ejecutó en producción durante este trabajo.

## Alcance de la revisión

Fuentes: `src/lib/programas/{material,fabricationSize,packageZip}.ts`, `src/lib/types/index.ts` (`ProgramStamp`, `Program`), `src/lib/supabase/services/programs.service.ts`, `aspire-gadgets/ArmarPrograma_{Chica,Grande,XL}.lua`, `supabase/functions/programa-sync/index.ts`.

No se verifica aquí cuál de las bases o versiones de gadget está instalada en cada PC. La documentación describe parte del estado de septiembre; las referencias a despliegues y cantidades no se trataron como una comprobación actual de producción.
