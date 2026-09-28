# SOP (esqueleto) · Armar un programa y prepararlo en Aspire

> Workflow: [WF-04](../03-workflows/WF-04-programa-y-fabricacion-cnc.md) · Módulo: [Programas](../02-modules/programas/README.md) · Gadget: [gadget-aspire.md](../02-modules/programas/gadget-aspire.md)

**Responsable**: Fede · **Criterio**: un programa por día por máquina; primero prioritarios, después los más viejos, y aprovechar la planchuela completa.

## En Alcohn AI
1. Programas → revisar el panel **Vectores** (prioritarios en rojo; badge del menú = urgentes).
2. Arrastrar diseños a la columna de la máquina (bolsillo vacío = programa nuevo) o abrir una hoja → **+** → filtrar planchuela → **Sugerir** → confirmar.
3. Revisar la **carga** por planchuela (no puede superar el máximo).

## En la PC de la máquina
4. En la PC de la CNC (hay una por máquina), abrir Aspire con el `.crv3d` **base** de esa máquina. `[REQUIERE INFORMACIÓN DEL EQUIPO: dónde está guardado]`
5. Toolpaths → Gadgets → "Armar Programa Chica/Grande/XL" (según máquina).
6. Primera vez en la PC: ingresar la **clave de instalación** (la tiene Julián).
7. Elegir el programa de la lista. Si no hay internet: descargar el ZIP en Alcohn AI, descomprimir y elegir la carpeta.
8. Elegir modo: **Actualizar** (por defecto), **Rehacer desde cero** o **Solo recalcular**. Si faltan sellos que estaban antes, indicar si se borraron por falta de material, se perdieron (reimportar) o decidir después.
9. Leer el resumen: errores arriba. Sellos con ".eps, re-vectorizalo" → re-vectorizar en Alcohn AI y volver a correr **Actualizar**.
10. `[REQUIERE INFORMACIÓN DEL EQUIPO]` Correcciones manuales en Aspire (qué se revisa).
11. El gadget guarda y sube el `.crv3d`: en Alcohn AI la hoja pasa a **Listo para Fabricar**. Si la subida falla: guardar el `.crv3d` y subirlo a mano (vista lista de Programas).
12. Guardar trayectorias en pendrive (ver [fabricar-un-sello.md](fabricar-un-sello.md)). Se usa siempre con internet; la subida manual del `.crv3d` es excepción.
