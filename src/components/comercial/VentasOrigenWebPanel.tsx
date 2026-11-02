import { useEffect, useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatArs } from '@/lib/comercial/utils';
import {
  fetchVentasOrigenWebMensual,
  type VentasOrigenWebMes,
  type VentasOrigenWebResult,
} from '@/lib/supabase/services/comercialOrigenWeb.service';

const MES_LABEL = new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' });

function mesLabel(mes: string): string {
  const d = new Date(`${mes}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? mes : MES_LABEL.format(d);
}

function pct(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)} %` : '—';
}

/** Barra apilada: checkout web, WhatsApp con muestra web y resto de WhatsApp. */
function CanalBar({ mes }: { mes: VentasOrigenWebMes }) {
  const total = mes.ventasWebCheckout + mes.ventasWhatsappDesdeMuestraWeb + mes.ventasWhatsappResto;
  if (total === 0) return <div className="h-2 w-full rounded-sm bg-muted" />;
  const w = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-sm bg-muted" aria-hidden="true">
      <div className="bg-primary" style={{ width: w(mes.ventasWebCheckout) }} />
      <div className="bg-primary/50" style={{ width: w(mes.ventasWhatsappDesdeMuestraWeb) }} />
    </div>
  );
}

/**
 * Ventas que la web origina: checkout pagado + pedidos por WhatsApp de clientes que
 * hicieron una muestra web en los 60 días previos. Independiente del filtro de fechas
 * de la pantalla: siempre muestra los últimos 6 meses.
 */
export function VentasOrigenWebPanel() {
  const [result, setResult] = useState<VentasOrigenWebResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchVentasOrigenWebMensual(6)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setResult({ available: false, reason: e instanceof Error ? e.message : 'Error desconocido' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Globe className="size-4" />
          <CardTitle className="text-base">Ventas originadas en la web</CardTitle>
        </div>
        <CardDescription>
          Checkout web pagado más pedidos por WhatsApp de clientes que hicieron una muestra en la web
          en los 60 días previos. Últimos 6 meses.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!result ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Cargando…
          </div>
        ) : !result.available ? (
          <p className="text-sm text-muted-foreground">No disponible: {result.reason}</p>
        ) : result.meses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ventas en el período.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm bg-primary" /> Checkout web
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm bg-primary/50" /> WhatsApp con muestra web
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm bg-muted" /> Resto de WhatsApp
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Mes</th>
                    <th className="py-2 pr-3 text-right font-medium">Checkout web</th>
                    <th className="py-2 pr-3 text-right font-medium">WhatsApp con muestra</th>
                    <th className="py-2 pr-3 text-right font-medium">Total web</th>
                    <th className="py-2 pr-3 text-right font-medium">% de ventas</th>
                    <th className="py-2 pr-3 text-right font-medium">Facturación web</th>
                    <th className="w-40 py-2 font-medium">
                      <span className="sr-only">Composición</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {result.meses.map((m) => {
                    const ventasTotal =
                      m.ventasWebCheckout + m.ventasWhatsappDesdeMuestraWeb + m.ventasWhatsappResto;
                    return (
                      <tr key={m.mes} className="border-b last:border-0">
                        <td className="py-2 pr-3 capitalize">{mesLabel(m.mes)}</td>
                        <td className="py-2 pr-3 text-right">{m.ventasWebCheckout}</td>
                        <td className="py-2 pr-3 text-right">{m.ventasWhatsappDesdeMuestraWeb}</td>
                        <td className="py-2 pr-3 text-right font-semibold">{m.ventasOriginadasWeb}</td>
                        <td className="py-2 pr-3 text-right">{pct(m.ventasOriginadasWeb, ventasTotal)}</td>
                        <td className="py-2 pr-3 text-right">
                          {formatArs(m.facturacionOriginadaWeb)}
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({pct(m.facturacionOriginadaWeb, m.facturacionTotal)})
                          </span>
                        </td>
                        <td className="py-2">
                          <CanalBar mes={m} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
