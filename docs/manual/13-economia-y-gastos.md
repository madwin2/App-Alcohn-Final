# 13. Economía y Gastos

[← Volver al índice](README.md)

Son las pantallas de números del negocio. En el menú **solo le aparecen a Julián**.

## Economía

Arriba hay tres herramientas (tocá cada una para abrirla):

- **Pendiente de cobro**: lo vendido que todavía no está en Transferido, separado en deudores, foto enviada y señado.
- **Caja**: saldos de efectivo, Mercado Pago y bancos. Se cargan a mano.
- **Ahorro e inversiones**: compras de dólares e inversiones (empresa y Cyprea). No son gastos: muestran cuánto de la ganancia se separó.

Arriba a la derecha está el **dólar de referencia** (para ver montos en USD) y **Cómo se calcula**.

### Pestañas

| Pestaña | Qué muestra |
|---|---|
| **Mes en curso** (se abre por defecto) | Cómo viene el mes: ganancia proyectada, ventas por día hábil, publicidad, de dónde sale la ganancia y los **últimos meses** (elegí 6, 12, 24 meses o todo) |
| **Ventas** | Ventas por mes en pesos, sellos o pedidos, con el promedio, el mejor mes, el ticket y las unidades por pedido; abajo, la tabla mes a mes con ganancia y margen |
| **Productos** | Qué productos se venden mes a mes (unidades, ventas o margen), cómo viene este mes contra el anterior, el total del período y la tabla mes por producto |
| **Resultados por mes** | El resultado de cada mes: ventas, gastos (tocá «Gastos» para ver el detalle), ganancia, margen, cobrado y pendiente, y ahorro e inversiones |
| **Por año** | Una tarjeta por año (ventas, ganancia, margen, ahorro e inversiones), la tendencia mes a mes y la tabla año por año |

En **Ventas**, **Productos** y **Resultados por mes** se elige el período arriba a la derecha: **12 meses**, **24 meses** o **todo**. Los totales de las tablas son los del período elegido. El mes en curso se marca con un punto naranja (y punteado en los gráficos) porque todavía no terminó.

## Gastos

Se lee de arriba hacia abajo:

1. **Elegir el mes** con las flechas ‹ › de arriba a la derecha (tocá el nombre del mes para saltar a otro; «Ir al mes actual» vuelve).
2. **Resumen**: el gasto total del mes con una barra de colores (sueldos y fijos, publicidad, automatizaciones, otros) y qué parte ya está marcada como pagada. En el **mes en curso** se ve el **cierre estimado** (lo cargado + fijos que faltan cargar + publicidad al ritmo actual + recurrentes por cobrar) contra el mes anterior, y un aviso con lo que todavía no cargaste. En meses cerrados, la comparación es directa contra el mes anterior.
3. **Gastos automáticos** y **Gastos recurrentes** (ver abajo).
4. **Sueldos y gastos fijos**: sueldos (uno por persona del equipo; «Agregar otro sueldo» para alguien que no usa la app), aguinaldo (se calcula solo: sueldos ÷ 12), fijos (monotributos, contador, alquiler, seguro, crédito) y servicios (luz, agua, internet).
5. **Otros gastos del mes**: publicidad que no sea Meta/Google, automatizaciones, envíos, impuestos, varios, remodelaciones.
6. **Inversiones y ahorro**: compra de dólares e inversiones. **No son gastos**: Economía los muestra aparte y no restan de la ganancia.
7. **Costos de fabricación por unidad** (cerrado; tocá para abrir).

Los meses viejos que se cargaron como **cierre histórico** muestran arriba un aviso con un solo campo, «Gasto real del mes»: Economía usa ese total y no suma el detalle.

En cada fila escribís el monto (podés usar puntos de miles: «1.500.000») y tocás el círculo ✓ cuando está pagado. Se guarda solo.

### Gastos automáticos (desde octubre 2026)

La publicidad de **Meta** y **Google**, el gasto de **OpenAI** y los **gastos recurrentes** (apps, servidor) se cargan solos todos los días a las 7:00. También podés tocar **Actualizar ahora**.

- **No cargues a mano la publicidad del resumen de la tarjeta** desde octubre 2026: se duplicaría.
- Los dólares se muestran **estimados al blue de hoy** hasta que marcás el pago. Cuando pagás, tocá **Marcar pago**, poné la fecha (trae el blue de ese día; lo podés corregir) y los USD. Desde ahí el mes queda fijo con esa cotización. Si pagás en partes, cargá cada pago.
- En **Gastos recurrentes** tocá **Agregar** y das de alta una vez cada suscripción (nombre, moneda, monto, día del mes, si suma IVA). Tocá una fila para editarla o pausarla.
- Arriba de la página está el bloque **Gastos automáticos**: total del mes con IVA y cada plataforma (tocá una para ver sus campañas). Si dice «Sin conectar», falta cargar el acceso de esa plataforma.

En **Economía → Mes en curso** se lee de arriba hacia abajo:
1. **Al ritmo actual, el mes cierra con…**: la ganancia proyectada contra el objetivo del 25 %, lo vendido y la ganancia a hoy, y cuántos días hábiles quedan.
2. **Ventas**: el ritmo por día hábil contra lo necesario para el 25 %, con una barra por cada día hábil del mes. Sábados, domingos y feriados no aparecen: lo que entra esos días (por ejemplo, por la web) suma al día hábil siguiente (pasá el mouse por la barra para verlo).
3. **Publicidad**: cuánto podés gastar **por día corrido** (las campañas no paran el fin de semana) contra lo que se gasta hoy, en USD para comparar con Meta y Google; y en qué plataforma se fue y cuánto costó cada pedido.
4. **De dónde sale la ganancia**: cada gasto como % de lo vendido (fin de mes o a hoy).
5. **Últimos meses**: la ganancia de los últimos 6 meses contra el 25 % y el mes en curso proyectado.

Abajo aparecen los supuestos del cálculo: qué fijos todavía no se cargaron (se estiman con el mes anterior, uno por uno) y los recurrentes que faltan cobrar.

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
