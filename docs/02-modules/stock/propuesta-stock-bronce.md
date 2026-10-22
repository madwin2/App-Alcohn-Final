# Propuesta: stock de planchuelas de bronce

Fecha: 2026-10-22. **Implementado (2026-10-22).** Migración `migration_bronce_stock_piezas.sql` aplicada en Supabase el 2026-10-22 (con autorización del usuario); el stock arranca con el conteo inicial. Responde [Q-STK-001](../../14-open-questions/stock.md#q-stk-001) en la parte de bronce (packaging sigue pendiente) y detalla el ítem B-15 del [backlog](../../16-backlog/README.md).

## 1. Problema

✅ Hoy la app registra solo el **consumo** de bronce: `bronce_consumo` guarda, al pasar un SELLO a `Hecho`, el lado mayor + 0,8 cm en la planchuela que le corresponde (BR-MAT-001/002). No hay stock.

Lo que el equipo necesita saber:

- cuánto bronce se gasta y cuánto queda, por ancho;
- **cuánto queda para mecanizar**. Llevarlo solo en centímetros engaña: 400 mm repartidos en dos piezas de 200 no sirven para una fila de 400, porque en un programa cada fila usa una sola pieza (POL-093);
- cuándo y qué pedir a Buenos Aires.

Condición del usuario: **que no se convierta en una tarea más.** No tiene que depender de cargar a cada rato lo que hay ni obligar a elegir la pieza correcta.

## 2. Reglas confirmadas por el usuario (2026-10-21)

| Regla | Detalle |
|---|---|
| POL-091 | Se compra **por metro**, pidiendo el corte: p. ej. «1 m de 25: 2 × 400 + 1 × 200». Llegan piezas de 400 (para la Chica) y de 200/250. Anchos reales 12,7 / 19 / 25 / 38 / 63; en la app siguen las referencias actuales 12 / 19 (20) / 25 / 38 (40) / 63, que **no se cambian** (sirven para que 40×40 se fabrique como 36,5×36,5). |
| POL-092 | Largo **máximo** que se usa por fila: **C 400 mm, G 250 mm, XL 250 mm**. Se puede usar cualquier pieza más corta, incluidos restos de otra máquina (p. ej. 180 mm que sobraron de la C, en la G). En la G **no conviene que la pieza sobresalga**, pero se hace si no hay una más corta. |
| POL-093 | **No se unen dos piezas en una misma fila.** |
| POL-094 | Al usar una parte, la pieza queda más corta y se sigue usando. **No se pierde nada al principio ni al final de la pieza**: lo que gasta una fila es Σ (lado mayor + 8 mm), igual que BR-MAT-002. Amplía POL-079, que no asumía uso de recortes. |
| POL-095 | Una pieza **sirve hasta 25 mm**; por debajo es retazo. |

## 3. Idea central: stock por pieza

El stock es una **lista de piezas**, cada una con ancho y largo actual, no un total de centímetros.

Ejemplo, 25 mm: piezas de 400, 180, 120 y 20 mm.

- **Total**: 720 mm (para costo y compra).
- **Útil para mecanizar**: en la C, 1 fila completa + 2 parciales (180 y 120). La de 20 mm es retazo (POL-095) y no cuenta.

La pantalla muestra las dos cosas por ancho.

## 4. Flujo propuesto (solo la compra se carga a mano)

1. **Llega el bronce** (cada tantas semanas). Formulario con el mismo formato del pedido: ancho + lista de cortes. Antes de sumar, la app muestra las piezas que cree que hay de ese ancho para tildar o corregir (conteo rápido, opcional).
2. **Termina el programa**. La app ya sabe cuánto ocupó cada fila del programa: Σ (lado mayor + 8 mm). **Asigna sola** la pieza con la regla de la sección 5 y descuenta. Nadie elige nada.
3. **Retazo**. Si a la pieza le quedan menos de 25 mm, sale del stock útil y se cuenta como desperdicio.
4. **Corrección solo cuando hace falta**. Si el operario usó otra pieza, el total por ancho sigue siendo correcto; solo se desacomoda qué pieza es cuál. La app pide un conteo rápido de un ancho únicamente cuando: llega una compra, o se fabricó una fila para la que no había ninguna pieza que alcanzara (señal de inventario desfasado).
5. **Mesa de armado**: dato informativo en el encabezado de cada planchuela («para esta fila hay piezas de 180 y 400») y aviso si no hay ninguna que alcance. **No bloquea ni obliga a elegir.**
6. **Compra sugerida** (aviso a Julián y Producción): con el consumo mensual por ancho (ya está en `bronce_consumo`), separado por destino (filas de C hasta 400, de G/XL hasta 250), y la demora del envío (FR-11: 2–3 días), la app propone el pedido en el formato de POL-091.

## 5. Asignación automática de pieza

Para cada fila terminada, de ancho A, en la máquina M, que ocupó L mm:

1. Entre las piezas de ancho A con largo ≥ L y ≤ máximo de M, tomar **la más corta**. Así se gastan primero los restos y quedan las enteras para filas largas.
2. Solo en G/XL: si no hay ninguna, tomar la más corta de las que superan 250 (sobresale; se marca con aviso, POL-092).
3. Si no hay ninguna que alcance: registrar el consumo igual (contra el total del ancho) y pedir conteo rápido de ese ancho.
4. Descontar L; si el resto es < 25 mm, pasa a retazo.

🔶 Que el taller elija físicamente la pieza más corta que alcanza no está confirmado; si no coincide, la regla igual mantiene el total correcto y el conteo ocasional lo reacomoda.

### 5.1 Cuándo se descuenta

✅ Confirmado (Q-STK-007): **al terminar el programa**, una vez por fila. Un sello que salió mal y se marca `Rehacer` **cuenta como gastado en esa corrida** (el bronce se cortó) y, cuando se vuelve a fabricar en otro programa, gasta de nuevo, como un sello nuevo.

Cuidados que salen del código:

- «Terminado» se calcula mirando los sellos, no el estado mostrado: `FINALIZADO` exige todos `Hecho`/`Verificar` y un sello en `Rehacer` que sigue atado al programa viejo (AUD-INC-013) lo impediría; el candado muestra `BLOQUEADO` aunque todo esté hecho. ✅ Confirmado (usuario, 2026-10-22): terminado = todos los sellos del programa en `Hecho`, `Verificar` o `Rehacer`.
- El descuento es **idempotente** por programa: si después se edita o se vuelve a marcar, no se descuenta dos veces.
- ✅ Sellos `Hecho` **sin programa** (confirmado 2026-10-22): no descuentan pieza; siguen en `bronce_consumo` (costo) y la diferencia se corrige en el próximo conteo.

## 6. Datos e implementación

✅ Aplicado en la base (2026-10-22). Verificado con transacciones revertidas: compra, conteo (retazo < 25 mm), descuento de un programa C real (filas iguales a Σ lado mayor + 8 mm), G con pieza que sobresale, fila sin pieza, idempotencia y trigger ejecutado como usuario `authenticated`. Advisors: `trg_bronce_descontar_programa` sin `EXECUTE` público y `search_path` fijo.

- `migration_bronce_stock_piezas.sql`: `bronce_compras`, `bronce_piezas` (`ancho_ref`, `largo_mm`, `largo_inicial_mm`, `estado` `disponible`/`retazo`/`baja`), `bronce_movimientos` (`INGRESO`, `CONSUMO`, `AJUSTE`, `RETAZO`, `BAJA`, `CONTEO`; `sobresale`, `sin_pieza`). RLS: lectura para logueados; escritura solo por RPC.
- Trigger `trigger_zz_bronce_descontar_programa` → `bronce_descontar_programa` (sección 5; idempotente por `(programa_id, ancho_ref)`). Corre después de `trigger_registrar_bronce_consumo`. Mientras no exista ninguna pieza cargada, no registra nada: **el stock arranca con el conteo inicial**.
- RPC `bronce_registrar_compra` (ingreso) y `bronce_guardar_conteo` (lista completa de un ancho; lo que falta se da de baja).
- Lógica pura: `src/lib/bronce/stock.ts` (misma regla de asignación que el SQL, resumen por máquina, compra sugerida, lectura de cortes) con tests en `stock.test.ts`.
- Servicio `src/lib/supabase/services/bronceStock.service.ts`; panel `src/components/stock/BronceStockPanel.tsx` en `/stock`; dato en la mesa (`MesaSummary`, vía `MesaProgramas`); aviso `p8_bronce_comprar` (`notifyBronceComprar`) a Producción + admin, sincronizado al abrir Stock o el Inicio, con `dedup` por ancho.
- 🔶 Valores iniciales a ajustar con el uso: aviso si el bronce útil alcanza para **menos de 7 días** (envío 2–3 días + margen), compra sugerida para **30 días**, consumo promedio de los **últimos 60 días** (`bronce_consumo`). Corte pedido: 400 mm para anchos que usa la C; 250 mm para 63.

## 7. Etapas

Las tres etapas están implementadas:

1. **Inventario por pieza**: carga de compra, conteo, descuento automático por fila, retazos, pantalla en Stock.
2. **Mesa**: dato y aviso de material bajo cada planchuela del resumen.
3. **Compra sugerida** y aviso a Julián y Producción (Fede).

## 8. Preguntas resueltas y pendientes

- ✅ [Q-STK-007](../../14-open-questions/stock.md#q-stk-007): descuento al terminar el programa; sellos sin programa no descuentan pieza.
- ✅ [Q-STK-008](../../14-open-questions/stock.md#q-stk-008): el aviso de compra va a **Julián y Producción (Fede)**.
- Pendiente: hacer el **conteo inicial** de todas las piezas y publicar el frontend. No se modificaron `registrar_bronce_consumo_sello` ni el estado derivado del programa (BR-PROG-010).
