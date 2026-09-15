import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { fetchVectorizerAccount } from '@/lib/vectorizacion/vectorizerApi';
import { useVectorizacionStore } from '@/lib/state/vectorizacion.store';

export function VectorizacionHeader() {
  const includeRehacer = useVectorizacionStore((s) => s.includeRehacerPrioridad);
  const setIncludeRehacer = useVectorizacionStore((s) => s.setIncludeRehacerPrioridad);
  const maximize = useVectorizacionStore((s) => s.maximizeResolution);
  const setMaximize = useVectorizacionStore((s) => s.setMaximizeResolution);
  const padding = useVectorizacionStore((s) => s.cropPaddingPct);
  const setPadding = useVectorizacionStore((s) => s.setCropPaddingPct);
  const reviewCount = useVectorizacionStore((s) => s.reviewQueue.length);
  const [credits, setCredits] = useState<number | null>(null);
  const [creditError, setCreditError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchVectorizerAccount()
      .then((account) => {
        if (!cancelled) setCredits(account.credits);
      })
      .catch((error: unknown) => {
        if (!cancelled) setCreditError(error instanceof Error ? error.message : 'Sin saldo');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vectorización</h1>
          <p className="text-sm text-muted-foreground">
            Varios logos en una hoja = un crédito. Revisá el SVG antes de asignarlo al pedido.
            {reviewCount > 0 ? ` · ${reviewCount} en revisión` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge
            variant={creditError ? 'destructive' : 'secondary'}
            className="rounded-full border border-white/10 bg-white/5 text-foreground"
          >
            {creditError ? creditError : credits == null ? 'Saldo…' : `${credits} créditos`}
          </Badge>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={maximize} onChange={(e) => setMaximize(e.target.checked)} />
            Maximizar resolución
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={includeRehacer}
              onChange={(e) => setIncludeRehacer(e.target.checked)}
            />
            Incluir Rehacer / Prioridad
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Padding
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={Math.round(padding * 100)}
              onChange={(e) => setPadding(Number(e.target.value) / 100)}
              className="w-24"
            />
            <span className="w-8 tabular-nums text-foreground/80">{Math.round(padding * 100)}%</span>
          </label>
        </div>
      </div>
    </div>
  );
}
