import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { resumenDiferencias, type ComparacionOriginal } from '@/lib/vectorizacion/comparacionOriginal';

interface Props {
  /** null = comparando. */
  result: ComparacionOriginal | null;
  onClick?: () => void;
  className?: string;
}

/**
 * Comparación del vector con la imagen original en una línea: si puede faltar
 * algo (un punto de i, una pieza), lo dice; clic → abre el editor con el
 * original debajo.
 */
export function OriginalChip({ result, onClick, className }: Props) {
  const base = cn(
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
    onClick && 'cursor-pointer hover:brightness-95',
    className,
  );
  if (!result) {
    return (
      <span className={cn(base, 'border-border bg-muted/50 text-muted-foreground')} title="Comparando con la imagen original…">
        <Loader2 className="size-3 animate-spin" /> Original…
      </span>
    );
  }
  // Sin alinear o error: no se afirma nada (no es un problema del vector).
  if (result.status !== 'diferencias') {
    if (result.status !== 'ok') return null;
    return (
      <button type="button" onClick={onClick} className={cn(base, 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200')} title="No se perdió nada respecto de la imagen original. Clic: ver el original debajo del vector.">
        <CheckCircle2 className="size-3" /> Original
      </button>
    );
  }
  const n = result.diferencias.length;
  const resumen = resumenDiferencias(result.diferencias);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(base, 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900 dark:bg-fuchsia-950/40 dark:text-fuchsia-100')}
      title={`Comparado con la imagen original: ${resumen.toLowerCase()}. Clic: verlo en el editor con el original debajo.`}
    >
      <AlertTriangle className="size-3" />
      {result.diferencias.every((d) => d.punto)
        ? n === 1
          ? 'Falta un punto de i'
          : `Faltan ${n} puntos de i`
        : `Puede faltar algo${n > 1 ? ` · ${n}` : ''}`}
    </button>
  );
}
