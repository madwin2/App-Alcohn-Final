import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StampThumb } from '@/components/programas/StampThumb';
import type { ProgramStamp } from '@/lib/types/index';
import { chequearSvg, type FresaReport } from '@/lib/fresa/chequeoFresa';
import { fetchSvgText, isSvgUrl } from '@/lib/fresa/useFresaReport';
import { guardarVectorCorregido } from '@/lib/fresa/guardarCorregido';
import { FresaChip } from './FresaChip';
import { FresaVectorDialog, fresaTargetFor } from './FresaVectorDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programName: string;
  stamps: ProgramStamp[];
  /** Avisar al padre que cambió el vector de un sello (para recargar). */
  onVectorReplaced?: (stampId: string, url: string) => void;
}

type Row = { stamp: ProgramStamp; report: FresaReport | null; noSvg: boolean };

function stampSize(s: ProgramStamp) {
  // widthMm/heightMm ya priorizan la medida de fabricación; si no está
  // confirmada, se usa la pedida (igual que al confirmar el vector).
  const fabW = s.fabricationWidthMm ?? null;
  const fabH = s.fabricationHeightMm ?? null;
  return {
    fabricationWidthMm: fabW,
    fabricationHeightMm: fabH,
    requestedWidthMm: s.anchoRealCm != null ? s.anchoRealCm * 10 : s.widthMm,
    requestedHeightMm: s.largoRealCm != null ? s.largoRealCm * 10 : s.heightMm,
    stampType: s.stampType,
  };
}

/**
 * Chequeo de fresa de todos los sellos de un programa, para revisarlos antes
 * de correr el gadget en Aspire.
 */
export function FresaProgramaDialog({ open, onOpenChange, programName, stamps, onVectorReplaced }: Props) {
  const [reports, setReports] = useState<Record<string, FresaReport | null>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<ProgramStamp | null>(null);

  const vectorUrl = (s: ProgramStamp) => urls[s.id] ?? s.vectorPreviewUrl ?? null;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    for (const s of stamps) {
      const url = vectorUrl(s);
      const target = fresaTargetFor(stampSize(s));
      if (!url || !isSvgUrl(url) || !target) continue;
      void fetchSvgText(url)
        .then((txt) => chequearSvg(txt, target))
        .then((r) => alive && setReports((prev) => ({ ...prev, [s.id]: r })))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
    // vectorUrl depende de `urls`: re-chequear cuando se reemplaza un vector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stamps, urls]);

  const rows: Row[] = useMemo(
    () =>
      stamps
        .map((stamp) => {
          const url = urls[stamp.id] ?? stamp.vectorPreviewUrl;
          return { stamp, report: reports[stamp.id] ?? null, noSvg: !isSvgUrl(url) };
        })
        .sort((a, b) => {
          const score = (r: Row) =>
            r.noSvg ? 3 : !r.report ? 2 : r.report.status === 'revisar' ? (r.report.groupCounts.alta ? 0 : 1) : 2.5;
          return score(a) - score(b);
        }),
    [stamps, reports, urls],
  );

  const analyzed = rows.filter((r) => r.report).length;
  const withIssues = rows.filter((r) => r.report?.status === 'revisar').length;
  const svgCount = rows.filter((r) => !r.noSvg).length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[88vh] w-[min(720px,96vw)] max-w-none flex-col gap-3 sm:max-w-none">
          <DialogHeader>
            <DialogTitle>Chequeo de fresa — {programName}</DialogTitle>
            <DialogDescription>
              Compará la primera pasada con el repaso fino a la medida de fabricación. Las sugerencias de zonas
              requieren comprobar la selección y las trayectorias en Aspire.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-0.5 text-sm">
            {svgCount === 0 ? (
              <p className="text-muted-foreground">
                Ningún sello tiene vector SVG: el chequeo solo puede leer SVG.
              </p>
            ) : analyzed < svgCount ? (
              <p className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Analizando {analyzed} de {svgCount}…
              </p>
            ) : withIssues ? (
              <p className="text-rose-700 dark:text-rose-300">
                {withIssues} de {svgCount} sellos tienen lugares donde se pierde el diseño.
              </p>
            ) : (
              <p className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-4" /> La fresa llega bien en {svgCount === 1 ? 'el sello' : `los ${svgCount} sellos`}{' '}
                con SVG.
              </p>
            )}
            {svgCount > 0 && svgCount < rows.length ? (
              <p className="text-xs text-muted-foreground">
                {rows.length - svgCount} sin SVG (por ejemplo EPS): no se pueden chequear.
              </p>
            ) : null}
          </div>
          <ul className="min-h-0 flex-1 divide-y overflow-y-auto rounded-md border">
            {rows.map(({ stamp, report, noSvg }) => (
              <li key={stamp.id} className="flex items-center gap-3 px-3 py-2">
                <StampThumb stamp={stamp} prefer="vector" className="h-12 w-12" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{stamp.designName}</p>
                  <p className="text-xs text-muted-foreground">
                    {Math.round(stamp.widthMm)} × {Math.round(stamp.heightMm)} mm
                  </p>
                </div>
                {noSvg ? (
                  <span className="text-xs text-muted-foreground" title="El chequeo solo lee vectores SVG.">
                    No es SVG
                  </span>
                ) : (
                  <FresaChip report={report} onClick={() => setDetail(stamp)} />
                )}
                {!noSvg ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => setDetail(stamp)}>
                    Ver
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      {detail ? (
        <FresaVectorDialog
          open={Boolean(detail)}
          onOpenChange={(o) => !o && setDetail(null)}
          vectorUrl={vectorUrl(detail)}
          title={detail.designName}
          size={stampSize(detail)}
          registro={{ selloId: detail.id, origen: 'programas' }}
          onSaveCorrected={async (file, fab) => {
            const url = await guardarVectorCorregido(detail.id, file, vectorUrl(detail), fab);
            setUrls((prev) => ({ ...prev, [detail.id]: url }));
            setReports((prev) => ({ ...prev, [detail.id]: null }));
            onVectorReplaced?.(detail.id, url);
          }}
        />
      ) : null}
    </>
  );
}
