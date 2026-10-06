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

- **Ventas brutas**: total del pedido; el envío se suma solo cuando el pedido ya está **Despachado** o **Seguimiento enviado**. Si el envío es **Andreani con link** (el cliente paga en la página de Andreani), ese monto **no** se suma.
- **Transferido**: lo cobrado por ítem en estado Transferido, más ese envío (misma regla de Andreani con link).
- **Costos ventas**: el costo de fabricación de cada ítem (bronce, piezas, amortización), que la app calcula sola con los parámetros de Gastos. Solo entra en el total de gastos si el mes está cargado en **detalle**.
- **Rentabilidad** (mes en detalle) = ventas − fijos − costos ventas − gastos extras − publicidad − envíos.
- **Rentabilidad** (mes en **resumen histórico**, p. ej. cierre Excel): ventas − **gastos reales** del mes (ese total ya incluye publicidad; no se resta otra vez la fabricación).

### Movimientos reales

Para ver la **Rentabilidad tras ajustes** (la **Rentabilidad teórica** menos los **Ajustes acumulados** da la **Rentabilidad real**), cargá:

- **Compra de USD (ahorro)**: **Fecha**, **USD comprados**, **Precio por USD (ARS)**.
- **Inversiones**: **Inversión empresa (ARS)** e **Inversión Cyprea (ARS)** (Cyprea es la marca paralela de sellos de lacre).

Aparecen en **Movimientos cargados**; **Quitar** para borrar uno.

### Pestañas

| Pestaña | Qué muestra |
|---|---|
| **Mes en curso** (se abre por defecto) | Ganancia a hoy, proyección a fin de mes y **publicidad por día** que permite llegar al 25 % (en pesos y USD aprox.), con la publicidad por plataforma |
| **Volumen** | Cards con **teórica** y **ganancia real** por año (desglose USD / inversiones), gráficos y tabla mes a mes |
| **Por producto** | Ventas por producto: sellos chicos, medianos, grandes y XL (misma clasificación que Precios), 3 mm, lacre, alimento, abecedarios, soldadores y accesorios. Tabla **mes × producto** |
| **P&L mensual** | **Registro por mes**: ventas, gastos y transferido. Tocá **Gastos** o **Ganancias** en el encabezado de la tabla para ver el desglose (y otra vez para contraer) |
| **Mix** | Qué proporción de cada tipo de ítem se vende |
| **Por año** | Análisis anual: sellos, ticket, margen, teórica, dólares/inversiones, ganancia real, ritmo mensual, % sobre ventas, mix dólares vs inversiones y tendencias |

## Gastos

Carga mensual de los costos, que después usa Economía.

### Elegir el mes

Arriba: **Mes a editar** (**Calendario**, **Mes actual**). En un mes nuevo, **Inicializar vacío**. La tarjeta **Gasto proyectado** muestra fijos + extras del mes (o el **gasto real** si el mes es un resumen histórico); clic para el desglose.

### Meses con resumen histórico

Algunos meses viejos (antes de la carga fina) tienen un **gasto real** único tomado del cierre en Excel, más publicidad / dólares / inversión como desglose. En esos meses Economía no suma otra vez la fabricación de los pedidos. Si abrís uno, vas a ver un aviso y el campo **Gastos reales**.

### Costos fijos

- **Sueldos**: una fila por persona (**+ Sueldo** para agregar), con **Monto ARS** y si está **Pagado**. El **Aguinaldo** se calcula solo (sueldos ÷ 12).
- **Monotributos**, **Contador**, **Alquiler**, **Seguro**, **Crédito**.
- **Servicios**: **Electricidad**, **Agua**, **Internet**.

### Gastos extras del mes

**Publicidad**, **Envíos** (monto manual), **Inversiones de la empresa**, **Compra de dólares**, **Gastos varios**, **Automatizaciones**, **Remodelaciones**, **Impuestos**, **Inversiones en Cyprea**.

**Seguimiento de pagos**: marcá **Pagado** en cada gasto para controlar qué falta pagar. No afecta Economía.

### Gastos automáticos (desde octubre 2026)

La publicidad de **Meta** y **Google**, el gasto de **OpenAI** y los **gastos recurrentes** (apps, servidor) se cargan solos todos los días a las 7:00. También podés tocar **Actualizar ahora**.

- **No cargues a mano la publicidad del resumen de la tarjeta** desde octubre 2026: se duplicaría.
- Los dólares se muestran **estimados al blue de hoy** hasta que marcás el pago. Cuando pagás, tocá **Marcar pago**, poné la fecha (trae el blue de ese día; lo podés corregir) y los USD. Desde ahí el mes queda fijo con esa cotización. Si pagás en partes, cargá cada pago.
- En **Gastos recurrentes** tocá **Agregar** y das de alta una vez cada suscripción (nombre, moneda, monto, día del mes, si suma IVA). Tocá una fila para editarla o pausarla.
- Arriba de la página está el bloque **Gastos automáticos**: total del mes con IVA y cada plataforma (tocá una para ver sus campañas). Si dice «Sin conectar», falta cargar el acceso de esa plataforma.

En **Economía → Mes en curso** se lee de arriba hacia abajo:
1. **Al ritmo actual, el mes cierra con…**: la ganancia proyectada y la barra contra el objetivo del 25 %.
2. **Publicidad**: cuánto podés gastar **por día** (en USD, para comparar con los presupuestos de Meta y Google) contra lo que se gasta hoy.
3. **Ventas**: cuánto vendés por día contra cuánto haría falta para el 25 % (y cuántos pedidos más por día).
4. **De dónde sale la ganancia**: cada gasto como % de lo vendido (fin de mes o a hoy).
5. **Ventas por día**: barras de cada día del mes con la línea de lo necesario.
6. **Publicidad del mes**: cuánto fue a cada plataforma, cuánta publicidad costó cada pedido y el ticket promedio.
7. **Últimos meses**: la ganancia de los últimos 6 meses contra el 25 %, con ventas y % de publicidad, y el mes en curso proyectado.

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
