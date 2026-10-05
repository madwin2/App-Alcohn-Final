import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PROVEEDOR_LABEL,
  calcularMesEnCurso,
  publicidadDiariaReciente,
  type ControlGastosConfig,
  type GastoProveedor,
  type GastoRegistro,
  type ValuacionMes,
} from '@/lib/gastos/gastosAuto';
import { cn } from '@/lib/utils/cn';

const formatArs = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
const formatUsd = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const formatPct = (n: number) => `${(n * 100).toFixed(1)} %`;

/** Subconjunto de la fila mensual de Economía (mismo criterio que P&L mensual). */
export type MesEnCursoRow = {
  ventasBrutas: number;
  costosVentas: number;
  costoRegalos: number;
  costoPruebas: number;
  costosFijos: number;
  gastosExtras: number;
  publicidad: number;
  enviosManual: number;
};

type Props = {
  mes: string;
  etiquetaMes: string;
  hoy: string;
  row: MesEnCursoRow | undefined;
  /** Fijos del mes anterior, para estimar si el mes en curso todavía no tiene fijos cargados. */
  fijosMesAnterior: number;
  fijosCargados: boolean;
  valuacion: ValuacionMes | undefined;
  registros: GastoRegistro[];
  config: ControlGastosConfig | null;
  blueHoy: number | null;
  loading: boolean;
};

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-xl font-bold tabular-nums tracking-tight sm:text-2xl',
          tone === 'ok' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'bad' && 'text-destructive',
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/** Ganancia a hoy, proyección a fin de mes y cuánta publicidad por día permite el objetivo. */
export function MesEnCursoPanel({
  mes,
  etiquetaMes,
  hoy,
  row,
  fijosMesAnterior,
  fijosCargados,
  valuacion,
  registros,
  config,
  blueHoy,
  loading,
}: Props) {
  const objetivo = config?.objetivoRentabilidad ?? 0.25;
  const fijos = fijosCargados ? row?.costosFijos ?? 0 : fijosMesAnterior;

  const diaria = useMemo(() => {
    if (!config || !registros.some((r) => r.categoria === 'publicidad')) return null;
    return publicidadDiariaReciente(registros, hoy, blueHoy, config);
  }, [registros, hoy, blueHoy, config]);

  const r = useMemo(
    () =>
      calcularMesEnCurso({
        mes,
        hoy,
        ventas: row?.ventasBrutas ?? 0,
        costosVariables: (row?.costosVentas ?? 0) + (row?.costoRegalos ?? 0) + (row?.costoPruebas ?? 0),
        fijos,
        fijosEstimados: !fijosCargados,
        publicidad: row?.publicidad ?? 0,
        otros: (row?.gastosExtras ?? 0) + (row?.enviosManual ?? 0),
        publicidadDiaria: diaria,
        objetivo,
      }),
    [mes, hoy, row, fijos, fijosCargados, diaria, objetivo],
  );

  const pubPorProveedor = useMemo(() => {
    const m = new Map<GastoProveedor, number>();
    for (const c of valuacion?.conceptos ?? []) {
      if (c.categoria !== 'publicidad') continue;
      m.set(c.proveedor, (m.get(c.proveedor) ?? 0) + c.ars);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [valuacion]);
  const pubAuto = valuacion?.porCategoria.publicidad ?? 0;
  const pubManual = Math.max(0, (row?.publicidad ?? 0) - pubAuto);

  const factorUsd = config && blueHoy ? blueHoy * (1 + config.ivaPct + config.otrosImpuestosUsdPct) : 0;
  const llega = r.proyeccion.rentabilidad >= objetivo;

  let consejo: { texto: string; tone: 'ok' | 'bad' };
  if (r.publicidadRestante <= 0) {
    consejo = {
      tone: 'bad',
      texto: `Con lo ya gastado, la proyección no llega al ${formatPct(objetivo)} aunque no se gaste más en publicidad este mes.`,
    };
  } else if (diaria != null && diaria > r.publicidadPorDia) {
    consejo = {
      tone: 'bad',
      texto: `Hoy se gasta ${formatArs(diaria)} por día. Para llegar al ${formatPct(objetivo)} habría que bajar a ${formatArs(r.publicidadPorDia)} por día.`,
    };
  } else {
    consejo = {
      tone: 'ok',
      texto:
        diaria != null
          ? `El gasto diario actual (${formatArs(diaria)}) entra en el presupuesto para llegar al ${formatPct(objetivo)}.`
          : `Todavía no hay gasto diario de publicidad automático para comparar.`,
    };
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/50 bg-muted/15 px-4 py-3">
          <CardTitle className="text-lg">Mes en curso — {etiquetaMes}</CardTitle>
          <CardDescription className="text-xs leading-snug">
            Día {r.diasTranscurridos} de {r.diasMes}. Mismo criterio que P&amp;L mensual. Ventas y fabricación se proyectan al
            ritmo del mes; la publicidad, al ritmo de los últimos 7 días. Los dólares sin pagar se valúan al blue de hoy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-4 py-4">
          {loading ? <p className="text-xs text-muted-foreground">Cargando gastos automáticos…</p> : null}
          {(r.pocosDatos || !fijosCargados) && (
            <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <div className="space-y-0.5">
                {r.pocosDatos ? <p>Pocos días del mes: la proyección todavía es poco confiable.</p> : null}
                {!fijosCargados ? (
                  <p>Los fijos de este mes no están cargados en Gastos: se estiman con los del mes anterior ({formatArs(fijosMesAnterior)}).</p>
                ) : null}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Ventas a hoy" value={formatArs(r.aHoy.ventas)} sub={`Proyección: ${formatArs(r.proyeccion.ventas)}`} />
            <Kpi
              label="Ganancia a hoy"
              value={formatArs(r.aHoy.ganancia)}
              sub={`${formatPct(r.aHoy.rentabilidad)} · fijos prorrateados`}
              tone={r.aHoy.ganancia >= 0 ? undefined : 'bad'}
            />
            <Kpi
              label="Ganancia proyectada"
              value={formatArs(r.proyeccion.ganancia)}
              sub={`${formatPct(r.proyeccion.rentabilidad)} · objetivo ${formatPct(objetivo)}`}
              tone={llega ? 'ok' : 'bad'}
            />
            <Kpi
              label={`Publicidad por día para el ${formatPct(objetivo)}`}
              value={r.publicidadRestante > 0 ? formatArs(r.publicidadPorDia) : formatArs(0)}
              sub={
                factorUsd > 0 && r.publicidadRestante > 0
                  ? `≈ ${formatUsd(r.publicidadPorDia / factorUsd)} por día entre Meta y Google`
                  : `Tope del mes: ${formatArs(Math.max(0, r.topePublicidad))}`
              }
              tone={consejo.tone}
            />
          </div>

          <p
            className={cn(
              'rounded-lg px-3 py-2 text-sm',
              consejo.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-destructive/10 text-destructive',
            )}
          >
            {consejo.texto}
          </p>

          <div className="grid gap-3 lg:grid-cols-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="py-1 text-left font-medium" />
                  <th className="py-1 text-right font-medium">A hoy</th>
                  <th className="py-1 text-right font-medium">Fin de mes</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <tr className="border-t border-border/50">
                  <td className="py-1">Ventas</td>
                  <td className="text-right">{formatArs(r.aHoy.ventas)}</td>
                  <td className="text-right">{formatArs(r.proyeccion.ventas)}</td>
                </tr>
                <tr className="border-t border-border/50">
                  <td className="py-1">Fabricación + regalos + pruebas</td>
                  <td className="text-right">−{formatArs(r.proyeccion.costosVariables * (r.diasTranscurridos / r.diasMes))}</td>
                  <td className="text-right">−{formatArs(r.proyeccion.costosVariables)}</td>
                </tr>
                <tr className="border-t border-border/50">
                  <td className="py-1">Publicidad (con IVA)</td>
                  <td className="text-right">−{formatArs(row?.publicidad ?? 0)}</td>
                  <td className="text-right">−{formatArs(r.proyeccion.publicidad)}</td>
                </tr>
                <tr className="border-t border-border/50">
                  <td className="py-1">Otros extras (automatizaciones, impuestos, envíos…)</td>
                  <td className="text-right">−{formatArs((row?.gastosExtras ?? 0) + (row?.enviosManual ?? 0))}</td>
                  <td className="text-right">−{formatArs((row?.gastosExtras ?? 0) + (row?.enviosManual ?? 0))}</td>
                </tr>
                <tr className="border-t border-border/50">
                  <td className="py-1">Fijos{fijosCargados ? '' : ' (estimados)'}</td>
                  <td className="text-right">−{formatArs(r.aHoy.fijosProrrateados)}</td>
                  <td className="text-right">−{formatArs(fijos)}</td>
                </tr>
                <tr className="border-t border-border font-semibold">
                  <td className="py-1">Ganancia</td>
                  <td className="text-right">{formatArs(r.aHoy.ganancia)}</td>
                  <td className="text-right">{formatArs(r.proyeccion.ganancia)}</td>
                </tr>
              </tbody>
            </table>

            <div className="space-y-2 text-xs">
              <p className="font-medium">Publicidad del mes por plataforma</p>
              <ul className="space-y-1 rounded-lg border border-border/50 px-3 py-2 tabular-nums">
                {pubPorProveedor.map(([prov, ars]) => (
                  <li key={prov} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{PROVEEDOR_LABEL[prov]}</span>
                    <span>{formatArs(ars)}</span>
                  </li>
                ))}
                {pubManual > 0 ? (
                  <li className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Cargada a mano en Gastos</span>
                    <span>{formatArs(pubManual)}</span>
                  </li>
                ) : null}
                {!pubPorProveedor.length && pubManual <= 0 ? (
                  <li className="text-muted-foreground">Sin publicidad registrada este mes.</li>
                ) : null}
              </ul>
              {valuacion && valuacion.usdBase > 0 ? (
                <p className="text-muted-foreground">
                  USD del mes {formatUsd(valuacion.usdBase)} ·{' '}
                  {valuacion.estado === 'pagado' ? 'pagado' : `valuado a ${formatArs(valuacion.cotizacionEfectiva)}`}
                </p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
