# Decisión — Control de gastos y publicidad (2026-10-05)

Contexto: la ganancia real se conocía recién con los resúmenes de tarjeta; la publicidad se cargaba como un número por mes; se usan varias tarjetas familiares con gastos mezclados y cierres variables.

| Tema | Alternativas | Elegida (dueño) | Por qué |
|---|---|---|---|
| Fuente del gasto | Resumen de tarjeta (conciliar) · Plataformas | **Plataformas** (Meta, Google, OpenAI) | Tarjetas mezcladas y cierres variables hacen inviable conciliar |
| Mes al que pertenece | Mes de pago · Mes del gasto | **Mes del gasto** | La rentabilidad de un mes debe incluir la publicidad que lo generó |
| Cotización | Oficial · Blue del día del gasto · Blue del día del pago | **Blue del día del pago**; sin pagar → blue de hoy | No se compran dólares con cada gasto; el costo real es el dólar billete al pagar |
| Impuestos USD | Solo IVA + manual · 23 % junto · IVA en la categoría + 2 % en impuestos | **IVA + 2 % separado** | Publicidad queda «gasto + IVA»; recargos visibles y ajustables |
| Objetivo | — | **25 % de rentabilidad** | 10 % no deja margen para un mes malo ni para reinvertir |
| Transición | — | Automático desde **29/09/2026** (el resumen de septiembre cerró el 28/09) | Evita huecos y duplicados |
| Días del mes (2026-10-06) | Corridos · Hábiles | **Ventas por día hábil** (lun–vie sin `feriados`; lo no hábil al hábil siguiente) y **publicidad por día corrido** | El equipo no trabaja fines de semana ni feriados, pero las campañas sí corren; pedido del dueño |
| Fijos sin cargar en el mes en curso | Todo o nada · Línea por línea | **Línea por línea** con el mes anterior | Con «todo o nada», cargar un solo fijo hacía que la proyección ignorara los sueldos |
| Meta/Google en pesos (2026-10-06) | Tratar como pesos · Pasar a USD | **Pasar a USD con el oficial del día del gasto** y seguir el circuito de dólares (IVA + 2 %, blue del día del pago) | La cuenta de Meta factura en ARS pero a la tarjeta llega en dólares (dueño) |
| Meta de ventas (2026-10-06) | Fija 200 ítems/mes · Dinámica | **Dinámica en sellos**: equilibrio (ganancia 0) y objetivo (25 %) desde las ventas necesarias en pesos ÷ venta promedio por sello del mes (los accesorios compensan solos). Zonas: pérdida / aceptable / ideal. La proyección en sellos sale de la misma proyección en pesos que la ganancia | Llegar a 200 y perder plata no es un objetivo (dueño). Inicio también (opción A): Economía publica la meta del mes en `metas_ventas` (solo sellos) e Inicio calcula lo diario en vivo; un solo cálculo, sin duplicar lógica en el servidor |
