-- Pagos de los dólares de publicidad de meses pasados (decisión del dueño 2026-10-07).
-- Regla: cada mes se considera pagado el DÍA 10 DEL MES SIGUIENTE, al blue venta de ese día.
-- Volver a correr después de cada carga histórica (p. ej. el script de Google Ads): borra y
-- recrea solo los pagos con nota "retroactivo"; los cargados a mano en Gastos no se tocan.
-- Ajustar el rango si se agregan meses (el pago tiene que haber ocurrido: día 10 <= hoy).

delete from gastos_pagos_usd where nota like 'retroactivo%';

insert into gastos_pagos_usd (mes, fecha, usd, cotizacion, nota)
select m.mes, m.fecha_pago, round(m.usd, 2), c.blue_venta,
       'retroactivo: blue del día 10 del mes siguiente (decisión 2026-10-07)'
from (
  select to_char(g.fecha, 'YYYY-MM') as mes,
         (date_trunc('month', g.fecha) + interval '1 month' + interval '9 day')::date as fecha_pago,
         -- Misma cuenta que la app: Meta/Google en pesos → USD al oficial del día del gasto.
         sum(case when g.moneda = 'USD' then g.monto
                  else g.monto / (select c2.oficial_venta from cotizaciones_usd c2
                                  where c2.fecha <= g.fecha and c2.oficial_venta is not null
                                  order by c2.fecha desc limit 1) end) as usd
  from gastos_registros g
  where g.fecha between '2025-09-01' and '2026-08-31'
    and (g.proveedor in ('meta_ads', 'google_ads') or g.moneda = 'USD')
  group by 1, 2
) m
join cotizaciones_usd c on c.fecha = m.fecha_pago;
