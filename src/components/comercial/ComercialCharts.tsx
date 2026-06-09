import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DailyTrendPoint, FunnelStep, MaterialBreakdown, PaymentStatusBreakdown } from '@/lib/comercial/types';
import { MATERIAL_LABELS, conversionRate, formatArs } from '@/lib/comercial/utils';

export function TinyLineChart({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  if (values.length === 0) {
    return <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">Sin datos</div>;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - ((v - min) / span) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className={className}>
      <svg viewBox="0 0 100 100" className="h-28 w-full">
        <line x1="0" y1="100" x2="100" y2="100" stroke="currentColor" className="text-border" strokeWidth="1" />
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.2" className="text-primary" />
      </svg>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Mín {min}</span>
        <span>Máx {max}</span>
      </div>
    </div>
  );
}

export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.value), 1);

  return (
    <div className="flex flex-col gap-3">
      {steps.map((step, index) => {
        const widthPct = Math.max((step.value / max) * 100, step.value > 0 ? 8 : 2);
        const prev = index > 0 ? steps[index - 1].value : null;
        const conv = prev != null ? conversionRate(step.value, prev) : null;

        return (
          <div key={step.key} className="grid grid-cols-[120px_1fr_72px] items-center gap-3">
            <div className="text-sm font-medium">{step.label}</div>
            <div className="relative h-8 overflow-hidden rounded-md bg-muted/40">
              <div
                className="flex h-full items-center rounded-md px-2 text-xs font-semibold text-white transition-all"
                style={{ width: `${widthPct}%`, backgroundColor: step.color, minWidth: step.value > 0 ? '2.5rem' : '0' }}
              >
                {step.value > 0 ? step.value : ''}
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              {conv != null ? `${conv.toFixed(1)}%` : '—'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DonutChart({
  data,
  centerLabel,
  centerValue,
}: {
  data: Array<{ key: string; label: string; count: number; color: string }>;
  centerLabel: string;
  centerValue: string;
}) {
  const total = data.reduce((acc, d) => acc + d.count, 0);
  if (total <= 0) {
    return <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">Sin datos</div>;
  }

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let acc = 0;

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center">
      <svg viewBox="0 0 120 120" className="mx-auto size-44 shrink-0">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="14" />
        {data.map((slice) => {
          const fraction = slice.count / total;
          const length = circumference * fraction;
          const offset = -acc;
          acc += length;
          return (
            <circle
              key={slice.key}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth="14"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={offset}
              transform="rotate(-90 60 60)"
            />
          );
        })}
        <circle cx="60" cy="60" r="28" fill="hsl(var(--background))" />
        <text x="60" y="56" textAnchor="middle" className="fill-muted-foreground text-[8px]">
          {centerLabel}
        </text>
        <text x="60" y="68" textAnchor="middle" className="fill-foreground text-[10px] font-semibold">
          {centerValue}
        </text>
      </svg>
      <div className="flex flex-1 flex-col gap-2">
        {data.map((slice) => (
          <div key={slice.key} className="flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
              <span>{slice.label}</span>
            </div>
            <span className="font-medium">
              {slice.count} ({((slice.count / total) * 100).toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrendPanel({ dailyTrend }: { dailyTrend: DailyTrendPoint[] }) {
  const labels = dailyTrend.map((d) => d.date.slice(5));

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Visitantes / día</CardTitle>
        </CardHeader>
        <CardContent>
          <TinyLineChart values={dailyTrend.map((d) => d.visitantes)} />
          <p className="mt-2 text-[11px] text-muted-foreground">{labels[0]} → {labels[labels.length - 1]}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Muestras / día</CardTitle>
        </CardHeader>
        <CardContent>
          <TinyLineChart values={dailyTrend.map((d) => d.muestras)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ventas web / día</CardTitle>
        </CardHeader>
        <CardContent>
          <TinyLineChart values={dailyTrend.map((d) => d.ventas)} />
        </CardContent>
      </Card>
    </div>
  );
}

export function MaterialPanel({ data }: { data: MaterialBreakdown[] }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Materiales solicitados</CardTitle>
          <CardDescription>Sin muestras en el período seleccionado.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Materiales solicitados</CardTitle>
        <CardDescription>Distribución de mockups en el período.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {data.map((item) => (
          <div key={item.material} className="grid grid-cols-[100px_1fr_40px] items-center gap-3">
            <span className="text-sm">{MATERIAL_LABELS[item.material] ?? item.material}</span>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
            <span className="text-right text-sm font-medium">{item.count}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function PaymentPanel({ data }: { data: PaymentStatusBreakdown[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Estados de pago web</CardTitle>
        <CardDescription>Pedidos web en el período por estado de pago.</CardDescription>
      </CardHeader>
      <CardContent>
        <DonutChart
          data={data.map((d) => ({ key: d.estado, label: d.label, count: d.count, color: d.color }))}
          centerLabel="Pedidos"
          centerValue={String(data.reduce((a, d) => a + d.count, 0))}
        />
      </CardContent>
    </Card>
  );
}

export function MockupToVentaKpi({
  muestrasCompletadas,
  ventas,
}: {
  muestrasCompletadas: number;
  ventas: number;
}) {
  const rate = muestrasCompletadas > 0 ? (ventas / muestrasCompletadas) * 100 : null;

  return (
    <Card>
      <CardHeader>
        <CardDescription>KPI estrella</CardDescription>
        <CardTitle className="text-2xl">{rate != null ? `${rate.toFixed(1)}%` : '—'}</CardTitle>
        <CardDescription>Tasa mockup → venta ({ventas} ventas / {muestrasCompletadas} muestras listas)</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Referencia del período: cuántas muestras terminadas terminaron en una venta pagada.
        </p>
      </CardContent>
    </Card>
  );
}

export function formatTrendValue(value: number, isCurrency = false) {
  return isCurrency ? formatArs(value) : String(value);
}
