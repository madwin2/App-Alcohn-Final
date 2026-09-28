# SOP · Preparar la máquina y fabricar

> Workflow: [WF-04](../03-workflows/WF-04-programa-y-fabricacion-cnc.md) · Frontera: [FR-04](../10-operational-boundaries/README.md#fr-04)

**Responsable**: Fede (operario). **Ritmo**: un programa por día por máquina (Chica ~24 h de corrida; Grande 10–12 h o menos).

## Datos del sistema útiles
- Cada sello ocupa su lado mayor + 0,8 cm en la planchuela; máximo 400 mm (Chica) y 250 mm (Grande/XL) por planchuela.
- Trayectorias por tipo de sello: Clásico (desbaste recto 6 mm + cónico 1,7 mm), 3 mm (desbaste 3 mm + cónico 3 mm), Alimento (3 mm y corte con la forma del diseño), Lacre (cabezal torneado especial).

## Pasos

1. **Alcohn AI**: el programa está **Listo para Fabricar** (gadget corrido y `.crv3d` subido); revisar alertas de la hoja (sellos que no entraron, en otra planchuela, sobrantes).
2. En Aspire, guardar las trayectorias en un **pendrive**. `[REQUIERE INFORMACIÓN DEL EQUIPO: postprocesador y qué trayectorias se agrupan]`
3. Llevar el pendrive a la CNC y cargar las trayectorias.
4. Colocar las **planchuelas** (vienen ya cortadas). Si no alcanza el material: avisar para comprar (Buenos Aires, 2–3 días) y sacar el sello del programa en el gadget como "sin material". `[REQUIERE INFORMACIÓN DEL EQUIPO: fresas, cero de pieza, sujeción]`
5. Dejar la máquina corriendo → **Alcohn AI**: menú del programa → **Haciendo**.
6. Al terminar: cortar los sellos de la planchuela, sacarlos y **probarlos en cuero**.
7. **Alcohn AI**:
   - Todo bien → arrastrar el programa a **Terminados** (todos Hecho). Juli B recibe el aviso y saca las fotos.
   - Detalle corregible → **Retocar**.
   - Duda → **Verificar** (lo chequea Ventas).
   - Falla → **Rehacer** con motivo desde Pedidos/Producción (desde el programa hoy no pide motivo; ver backlog).
8. El armado final (varilla, mango, prisionero) lo hace Cachi al despachar.
