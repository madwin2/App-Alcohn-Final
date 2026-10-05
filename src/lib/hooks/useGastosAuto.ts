import { useCallback, useEffect, useMemo, useState } from 'react';
import { valuarGastosPorMes, type ValuacionMes } from '@/lib/gastos/gastosAuto';
import { fetchGastosAutoData, type GastosAutoData } from '@/lib/supabase/services/gastosAuto.service';

/** Gastos automáticos (Meta, Google, OpenAI, recurrentes) valuados por mes. Solo cuenta dueña. */
export function useGastosAuto(enabled: boolean) {
  const [data, setData] = useState<GastosAutoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchGastosAutoData());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  const blueHoy = data?.cotizacion?.blueVenta ?? null;

  const porMes = useMemo<Record<string, ValuacionMes>>(
    () => (data ? valuarGastosPorMes(data.registros, data.pagos, blueHoy, data.config) : {}),
    [data, blueHoy],
  );

  return { data, porMes, blueHoy, loading, error, reload };
}
