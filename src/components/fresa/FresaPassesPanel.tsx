import type { FresaReport } from '@/lib/fresa/chequeoFresa';
import { PASS_OUTCOME_LABEL } from '@/lib/fresa/passes';
import { mm } from '@/lib/fresa/textos';
import { Button } from '@/components/ui/button';
import type { PassView } from '@/lib/fresa/passReport';

export function FresaPassesPanel({ report, view, onView }: {
  report: FresaReport; view: PassView; onView: (view: PassView) => void;
}) {
  const p = report.passes;
  if (!p) return null;
  return (
    <div className="shrink-0 space-y-2 rounded-md border bg-muted/30 p-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>{PASS_OUTCOME_LABEL[p.outcome]}</strong>
        <span>{p.candidates.length} {p.candidates.length === 1 ? 'zona candidata' : 'zonas candidatas'}</span>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Comparar pasadas">
        <Button type="button" size="sm" variant={view === 'primary' ? 'default' : 'outline'} disabled={!p.primary} aria-pressed={view === 'primary'} onClick={() => onView('primary')}>Primera fresa</Button>
        <Button type="button" size="sm" variant={view === 'fine' ? 'default' : 'outline'} aria-pressed={view === 'fine'} onClick={() => onView('fine')}>Repaso fino{p.recipe === 'ALIMENTO' ? ' · 0,4 mm' : ''}</Button>
        {p.preferredFine ? <Button type="button" size="sm" variant={view === 'preferred' ? 'default' : 'outline'} aria-pressed={view === 'preferred'} onClick={() => onView('preferred')}>Referencia 0,5 mm</Button> : null}
      </div>
      <p className="text-muted-foreground">
        {p.primaryProfile ? `Primera «0,5»: configurada 0,6 mm, 15° por lado, hasta ${mm(p.primaryProfile.finalDepthMm, 1)} mm. ` : 'Falta el tipo de mecanizado para comparar la primera pasada. '}
        Fina «0,1»: configurada 0,2 mm, 30° por lado, hasta 0,6 mm desde el planeado.
      </p>
      {p.recipe === 'ALIMENTO' ? <p>Alimento: preferir la primera fresa (referencia 1 mm); para repaso, comparar el rango 0,4–0,5 mm. Son referencias para revisar.</p> : null}
      <p className="text-muted-foreground">Sugerencia geométrica. La selección parcial y sus contactos se deben comprobar en Aspire; estas zonas no son trayectorias aprobadas.</p>
    </div>
  );
}
