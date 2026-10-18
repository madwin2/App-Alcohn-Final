import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import type { FresaReport } from '@/lib/fresa/chequeoFresa';
import { mm } from '@/lib/fresa/textos';
import { Button } from '@/components/ui/button';
import type { PassView } from '@/lib/fresa/passReport';
import { cn } from '@/lib/utils/cn';

/**
 * Un solo veredicto para las dos fresas: qué deja la 0,6, por dónde pasa la
 * 0,2 (la selección automática) y si con las dos se separa todo. Las vistas
 * de cada fresa quedan como detalle para comparar.
 */
export function FresaPassesPanel({ report, view, onView }: {
  report: FresaReport; view: PassView; onView: (view: PassView) => void;
}) {
  const p = report.passes;
  if (!p) return null;
  const primaryIssues = p.primary ? p.primary.groups.filter((g) => g.severity !== 'baja').length : 0;
  const pieces = p.repaso.pieces, chosen = pieces.filter((x) => x.selected).length;
  const verdict = (() => {
    switch (p.outcome) {
      case 'sin_repaso': return { tone: 'ok', text: 'La fresa de 0,6 alcanza sola: no hace falta repaso.' } as const;
      case 'repaso_sugerido': return { tone: 'ok', text: `Con el repaso 0,2 se separa todo. La 0,2 pasa por ${chosen} de ${pieces.length} piezas (${p.repaso.zones.length} ${p.repaso.zones.length === 1 ? 'lugar' : 'lugares'}).` } as const;
      case 'revisar_rango': return { tone: 'warn', text: `Con el repaso 0,2 se separa a 0,4 mm, pero no llega a la referencia de 0,5 en algún lugar. La 0,2 pasa por ${chosen} de ${pieces.length} piezas.` } as const;
      case 'revisar_principal': return { tone: 'warn', text: 'La 0,6 deja lugares que la 0,2 tampoco mejora. Revisá el diseño o la primera pasada.' } as const;
      case 'revisar_diseno': return { tone: 'bad', text: 'Ni con el repaso 0,2 se separa todo: hay que corregir el diseño.' } as const;
      default: return { tone: 'warn', text: 'Falta el tipo de mecanizado para comparar las fresas.' } as const;
    }
  })();
  const Icon = verdict.tone === 'ok' ? CheckCircle2 : verdict.tone === 'bad' ? AlertTriangle : Info;
  return (
    <div className="shrink-0 space-y-2 rounded-md border bg-muted/30 p-2 text-xs">
      <p className={cn('flex items-start gap-2 text-sm', verdict.tone === 'ok' ? 'text-emerald-600 dark:text-emerald-300' : verdict.tone === 'bad' ? 'text-rose-600 dark:text-rose-300' : 'text-amber-700 dark:text-amber-200')}>
        <Icon className="mt-0.5 size-4 shrink-0" /><span className="font-medium">{verdict.text}</span>
      </p>
      {p.primary ? (
        <p className="text-muted-foreground">
          Primera fresa sola: {primaryIssues ? `${primaryIssues} ${primaryIssues === 1 ? 'lugar' : 'lugares'} donde no llega` : 'llega a todo'}.
          {p.repaso.zones.length ? ` La 0,2 se elige donde talla al menos ${mm(p.repaso.minGainMm, 2)} mm más hondo que la 0,6.` : ''}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1" role="group" aria-label="Ver cada fresa">
        <Button type="button" size="sm" variant={view === 'primary' ? 'default' : 'outline'} disabled={!p.primary} aria-pressed={view === 'primary'} onClick={() => onView('primary')}>Qué deja la 0,6</Button>
        <Button type="button" size="sm" variant={view === 'fine' ? 'default' : 'outline'} aria-pressed={view === 'fine'} onClick={() => onView('fine')}>Con el repaso 0,2{p.recipe === 'ALIMENTO' ? ' · 0,4 mm' : ''}</Button>
        {p.preferredFine ? <Button type="button" size="sm" variant={view === 'preferred' ? 'default' : 'outline'} aria-pressed={view === 'preferred'} onClick={() => onView('preferred')}>Referencia 0,5 mm</Button> : null}
      </div>
      <p className="text-muted-foreground">
        {p.primaryProfile ? `Primera: 0,6 mm, 15° por lado, hasta ${mm(p.primaryProfile.finalDepthMm, 1)} mm. ` : ''}
        Repaso: 0,2 mm, 30° por lado, hasta 0,6 mm.
      </p>
      {p.recipe === 'ALIMENTO' ? <p>Alimento: preferir la primera fresa (referencia 1 mm); para repaso, comparar el rango 0,4–0,5 mm. Son referencias para revisar.</p> : null}
    </div>
  );
}
