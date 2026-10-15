import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ScanSearch } from 'lucide-react';
import type { FresaReport } from '@/lib/fresa/chequeoFresa';
import { cn } from '@/lib/utils/cn';

interface Props {
  report: FresaReport | null;
  /** true = todavía no se sabe qué analizar (por ejemplo, SVG sin sello asignado). */
  idle?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'xs';
  className?: string;
}

/**
 * Estado del chequeo de fresa en una línea: analizando / OK / N lugares a
 * revisar / no se pudo analizar. Clic → abre el detalle.
 */
export function FresaChip({ report, idle = false, onClick, size = 'sm', className }: Props) {
  const base = cn(
    'inline-flex items-center gap-1 rounded-full border font-medium transition-colors',
    size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-px text-[10px]',
    onClick && 'cursor-pointer hover:brightness-95',
    className,
  );
  const icon = size === 'sm' ? 'size-3' : 'size-2.5';

  let content: ReactNode;
  let tone: string;
  let title: string;
  if (idle) {
    tone = 'border-border bg-muted/50 text-muted-foreground';
    content = (
      <>
        <ScanSearch className={icon} /> Fresa
      </>
    );
    title = 'Chequeo de fresa: falta saber la medida (asigná el sello).';
  } else if (!report) {
    tone = 'border-border bg-muted/50 text-muted-foreground';
    content = (
      <>
        <Loader2 className={cn(icon, 'animate-spin')} /> Fresa…
      </>
    );
    title = 'Analizando dónde llega la fresa…';
  } else if (report.status === 'error') {
    tone = 'border-slate-300 bg-slate-50 text-slate-600 dark:bg-slate-900/40 dark:text-slate-300';
    content = (
      <>
        <ScanSearch className={icon} /> Sin chequeo
      </>
    );
    title = `No se pudo analizar: ${report.error ?? ''}`;
  } else if (report.status === 'ok') {
    tone = 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
    content = (
      <>
        <CheckCircle2 className={icon} /> Fresa OK
      </>
    );
    title = 'La fresa llega a la profundidad mínima en todo el diseño. Clic para ver.';
  } else {
    const g = report.groupCounts;
    const n = g.alta + g.media;
    const grave = g.alta > 0;
    tone = grave
      ? 'border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200'
      : 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200';
    content = (
      <>
        <AlertTriangle className={icon} /> Fresa: {n} {n === 1 ? 'lugar' : 'lugares'}
      </>
    );
    title = `${n} lugar${n === 1 ? '' : 'es'} donde se pierde el diseño${
      g.alta ? ` (${g.alta} no separa)` : ''
    }. Clic para ver y corregir.`;
  }

  if (onClick) {
    return (
      <button
        type="button"
        className={cn(base, tone)}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        {content}
      </button>
    );
  }
  return (
    <span className={cn(base, tone)} title={title}>
      {content}
    </span>
  );
}
