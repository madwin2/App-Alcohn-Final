# 13. Economía y Gastos

[← Volver al índice](README.md)

Son las pantallas de números del negocio. En el menú **solo le aparecen a Julián**.

## Economía

**Panel ejecutivo**: ventas, costos, márgenes y tendencias. Se calcula con todos los pedidos. Fechas y meses en hora Argentina.

### Tarjetas de arriba

| Tarjeta | Qué muestra |
|---|---|
| Mes actual | Sellos vendidos, **Ventas brutas**, **Rentabilidad** en pesos y en USD |
| **Pendiente de cobro** | Lo que falta cobrar. Clic para el **Desglose pendiente de cobro** por estado de venta (Deudor, Foto enviada, Señado) |
| **Flujo / caja** | Saldos por caja (efectivo, Mercado Pago, cuentas bancarias). Clic para cargar los montos. ⚠️ Se cargan a mano: si no se actualizan, quedan viejos |
| **Dólar referencia** | Cotización para pasar a USD |

### Cómo se calcula

- **Ventas brutas**: total del pedido; el envío se suma solo cuando el pedido ya está **Despachado** o **Seguimiento enviado**.
- **Transferido**: lo cobrado por ítem en estado Transferido, más ese envío.
- **Costos ventas**: el costo de fabricación de cada ítem (bronce, piezas, amortización), que la app calcula sola con los parámetros de Gastos.
- **Rentabilidad** = ventas − fijos − costos ventas − gastos extras − publicidad − envíos (el monto manual de Gastos).

### Movimientos reales

Para ver la **Rentabilidad tras ajustes** (la **Rentabilidad teórica** menos los **Ajustes acumulados** da la **Rentabilidad real**), cargá:

- **Compra de USD (ahorro)**: **Fecha**, **USD comprados**, **Precio por USD (ARS)**.
- **Inversiones**: **Inversión empresa (ARS)** e **Inversión Cyprea (ARS)** (Cyprea es la marca paralela de sellos de lacre).

Aparecen en **Movimientos cargados**; **Quitar** para borrar uno.

### Pestañas

| Pestaña | Qué muestra |
|---|---|
| **Ventas mensuales** | **Sellos vendidos por mes**, **Ventas brutas por mes** y el **Detalle mes a mes** (sellos, pedidos, unidades, ventas, ticket promedio, rentabilidad y comparación con el mes anterior) |
| **Desglose productos** | Ventas por producto: sellos chicos, medianos, grandes y XL (misma clasificación que Precios), 3 mm, lacre, alimento, abecedarios, soldadores y accesorios. Tabla **mes × producto** |
| **Mensual** | **Registro por mes**: Transferido menos los gastos del mes |
| **Mix de ítems** | Qué proporción de cada tipo de ítem se vende |
| **Tendencias** | Ticket promedio, unidades por pedido, pedidos, venta bruta y rentabilidad en USD a lo largo del tiempo |

## Gastos

Carga mensual de los costos, que después usa Economía.

### Elegir el mes

Arriba: **Mes a editar** (**Calendario**, **Mes actual**). En un mes nuevo, **Inicializar vacío**. La tarjeta **Gasto proyectado** muestra fijos + extras del mes (clic para el desglose).

### Costos fijos

- **Sueldos**: una fila por persona (**+ Sueldo** para agregar), con **Monto ARS** y si está **Pagado**. El **Aguinaldo** se calcula solo (sueldos ÷ 12).
- **Monotributos**, **Contador**, **Alquiler**, **Seguro**, **Crédito**.
- **Servicios**: **Electricidad**, **Agua**, **Internet**.

### Gastos extras del mes

**Publicidad**, **Envíos** (monto manual), **Inversiones de la empresa**, **Compra de dólares**, **Gastos varios**, **Automatizaciones**, **Remodelaciones**, **Impuestos**, **Inversiones en Cyprea**.

**Seguimiento de pagos**: marcá **Pagado** en cada gasto para controlar qué falta pagar. No afecta Economía.

### Costos variables de fabricación

Los costos por unidad con los que la app calcula el costo de cada ítem:

- **Ítems terminados**: soldadores, base, mango de golpe.
- **Bronce / planchuela ($ por cm)**: por tamaño de planchuela.
- **Packaging**: tubos, caja de abecedario.
- **Piezas — sello**: mango de madera, varilla, prisionero, amortización de la fresa, pérdida de corte.
- **Piezas — abecedario**: soporte, material.

Al guardar se crea una **versión nueva** de los costos, con fecha **Vigente desde** (vacío = ahora). Los ítems nuevos se costean con la versión vigente cuando se cargaron; los viejos no cambian.

Conviene actualizarlos **cuando los costos cambian significativamente**.

⚠️ Hoy, guardar estos costos borra los largos máximos de planchuela de cada máquina que usa Programas (vuelve a los valores por defecto, que por ahora coinciden). Es un error conocido.
