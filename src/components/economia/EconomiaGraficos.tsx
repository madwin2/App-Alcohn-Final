/**
 * Gráficos y tablas de Economía con el lenguaje de «Mes en curso» (controlGastosUi):
 * barras neutras, línea base continua, el mes actual destacado, números arriba de la barra.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export type BarraMes = {
  key: string;
  label: string;
  valor: number;
  /** Mes actual (incompleto): se dibuja con borde punteado. */
  actual?: boolean;
  tooltip?: string;
};

/** Cada cuántos meses poner etiqueta para que no se amontonen. */
function cadaCuantos(n: number): number {
  if (n <= 13) return 1;
  if (n <= 26) return 3;
  return 6;
}

/** Barras por mes. `referencia` = línea punteada (ej. objetivo o promedio). */
export function BarrasMes({
  datos,
  formato,
  alto = 180,
  referencia,
  className,
}: {
  datos: BarraMes[];
  formato: (n: number) => string;
  alto?: number;
  referencia?: { valor: number; label: string };
  className?: string;
}) {
  if (!datos.length) return <p className="py-10 text-center text-sm text-muted-foreground">Sin datos en el período.</p>;
  const max = Math.max(1, referencia?.valor ?? 0, ...datos.map((d) => d.valor)) * 1.15;
  const conValores = datos.length <= 13;
  const paso = cadaCuantos(datos.length);

  return (
    <div className={className}>
      <div className="relative border-b border-white/15" style={{ height: alto }}>
        {referencia ? (
          <div className="absolute inset-x-0 border-t border-dashed border-white/30" style={{ bottom: (referencia.valor / max) * alto }}>
            <span className="absolute -top-5 right-0 bg-background/70 px-1 text-[11px] text-muted-foreground">{referencia.label}</span>
          </div>
        ) : null}
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {datos.map((d) => {
            const h = Math.max(d.valor > 0 ? 3 : 0, (Math.max(0, d.valor) / max) * alto);
            return (
              <div key={d.key} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={d.tooltip ?? `${d.label}: ${formato(d.valor)}`}>
                {conValores ? (
                  <span className={cn('mb-1.5 truncate text-[11px] font-medium tabular-nums', d.actual ? 'text-foreground' : 'text-muted-foreground')}>
                    {formato(d.valor)}
                  </span>
                ) : null}
                <div
                  className={cn(
                    'w-full max-w-[3.25rem] rounded-t-[5px] transition-colors',
                    d.actual
                      ? 'border border-b-0 border-dashed border-[#e0812f] bg-[#e0812f]/20'
                      : 'bg-white/45 group-hover:bg-white/70',
                  )}
                  style={{ height: h }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex gap-[3px]">
        {datos.map((d, i) => (
          <span
            key={d.key}
            className={cn('min-w-0 flex-1 truncate text-center text-[11px] capitalize', d.actual ? 'text-foreground' : 'text-muted-foreground')}
          >
            {i % paso === 0 || i === datos.length - 1 ? d.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

export type SerieApilada = { key: string; label: string; color: string };

/** Barras apiladas por mes (ej. productos). */
export function BarrasApiladasMes({
  filas,
  series,
  formato,
  actualKey,
  alto = 200,
}: {
  filas: Array<{ key: string; label: string; valores: Record<string, number> }>;
  series: SerieApilada[];
  formato: (n: number) => string;
  actualKey?: string;
  alto?: number;
}) {
  if (!filas.length || !series.length) return <p className="py-10 text-center text-sm text-muted-foreground">Sin datos en el período.</p>;
  const totales = filas.map((f) => series.reduce((s, k) => s + (f.valores[k.key] || 0), 0));
  const max = Math.max(1, ...totales) * 1.12;
  const paso = cadaCuantos(filas.length);
  const conValores = filas.length <= 13;

  return (
    <div>
      <div className="relative border-b border-white/15" style={{ height: alto }}>
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {filas.map((f, i) => {
            const total = totales[i];
            const actual = f.key === actualKey;
            return (
              <div
                key={f.key}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                title={`${f.label}: ${formato(total)}\n${series
                  .filter((s) => (f.valores[s.key] || 0) > 0)
                  .map((s) => `${s.label}: ${formato(f.valores[s.key])}`)
                  .join('\n')}`}
              >
                {conValores ? (
                  <span className={cn('mb-1.5 truncate text-[11px] font-medium tabular-nums', actual ? 'text-foreground' : 'text-muted-foreground')}>
                    {formato(total)}
                  </span>
                ) : null}
                <div
                  className={cn('flex w-full max-w-[3.25rem] flex-col-reverse overflow-hidden rounded-t-[5px]', actual && 'opacity-60')}
                  style={{ height: Math.max(total > 0 ? 3 : 0, (total / max) * alto) }}
                >
                  {series.map((s) => {
                    const v = f.valores[s.key] || 0;
                    if (v <= 0 || total <= 0) return null;
                    return <div key={s.key} style={{ height: `${(v / total) * 100}%`, backgroundColor: s.color }} />;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex gap-[3px]">
        {filas.map((f, i) => (
          <span
            key={f.key}
            className={cn('min-w-0 flex-1 truncate text-center text-[11px] capitalize', f.key === actualKey ? 'text-foreground' : 'text-muted-foreground')}
          >
            {i % paso === 0 || i === filas.length - 1 ? f.label : ''}
          </span>
        ))}
      </div>
      <Leyenda series={series} className="mt-4" />
    </div>
  );
}

export function Leyenda({ series, className }: { series: SerieApilada[]; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-x-4 gap-y-1.5', className)}>
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Línea simple para tendencias. */
export function Sparkline({ valores, alto = 64, className }: { valores: number[]; alto?: number; className?: string }) {
  if (valores.length < 2) return <div className={cn('text-xs text-muted-foreground', className)} style={{ height: alto }}>Sin datos</div>;
  const max = Math.max(...valores);
  const min = Math.min(0, ...valores);
  const span = Math.max(1, max - min);
  const pts = valores.map((v, i) => `${(i / (valores.length - 1)) * 100},${100 - ((v - min) / span) * 100}`).join(' ');
  const cero = 100 - ((0 - min) / span) * 100;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={cn('w-full', className)} style={{ height: alto }}>
      {min < 0 ? <line x1="0" x2="100" y1={cero} y2={cero} stroke="white" strokeOpacity="0.15" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" /> : null}
      <polyline points={pts} fill="none" stroke="#e0812f" strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- Tablas ---------- */

export const tablaCls = 'w-full text-sm';
export const theadCls = 'sticky top-0 z-10 bg-[#0b0b0b]';
export const thCls = 'px-3 py-3 text-right text-[13px] font-normal text-muted-foreground first:pl-0 first:text-left';
export const tdCls = 'px-3 py-2.5 text-right tabular-nums first:pl-0 first:text-left';
export function filaCls(actual = false) {
  return cn('border-t border-white/[0.05] transition-colors hover:bg-white/[0.025]', actual && 'bg-white/[0.035]');
}
export const pieCls = 'border-t border-white/15 font-medium';

/** Celda de mes con marca de «en curso». */
export function CeldaMes({ label, actual, extra }: { label: string; actual?: boolean; extra?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 capitalize">
      {actual ? <span className="size-1.5 rounded-full bg-[#e0812f]" aria-hidden /> : null}
      <span className={actual ? 'text-foreground' : 'text-foreground/85'}>{label}</span>
      {actual ? <span className="text-[11px] normal-case text-muted-foreground">en curso</span> : null}
      {extra}
    </span>
  );
}

/** Variación porcentual con color (verde sube / rojo baja). */
export function Variacion({ pct, invertir }: { pct: number | null; invertir?: boolean }) {
  if (pct == null || !Number.isFinite(pct)) return <span className="text-muted-foreground/60">—</span>;
  const bueno = invertir ? pct < 0 : pct >= 0;
  return (
    <span className={cn('tabular-nums', bueno ? 'text-emerald-400/90' : 'text-red-400/90')}>
      {pct >= 0 ? '+' : '−'}
      {Math.abs(pct).toFixed(0)} %
    </span>
  );
}
