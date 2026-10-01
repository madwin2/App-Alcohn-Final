import { useEffect, useState } from 'react';
import { Link2, Link2Off } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  applyAspectRatioLock,
  clampToTopePreservingAspect,
  fitAspectInBox,
  scaleMinorSideToTope,
} from '@/lib/programas/fabricationSize';
import type { FabricationSizeResolution } from '@/lib/programas/fabricationSize';

/** "36,5" o "36.5" → 36.5. Vacío / inválido / ≤0 → null. */
function parseMm(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (normalized === '') return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Muestra hasta 1 decimal sin ceros de más: 36.5 → "36.5", 40 → "40". */
function formatMm(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(Math.round(n * 10) / 10);
}

interface VectorSizeConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  previewUrl?: string | null;
  requestedWidthMm: number;
  requestedHeightMm: number;
  resolution: FabricationSizeResolution; // ya viene con needsReview: true
  svgAspectRatio: number | null;
  onConfirm: (result: { widthMm: number; heightMm: number }) => void | Promise<void>;
}

export function VectorSizeConfirmDialog({
  open,
  onOpenChange,
  fileName,
  previewUrl,
  requestedWidthMm,
  requestedHeightMm,
  resolution,
  svgAspectRatio,
  onConfirm,
}: VectorSizeConfirmDialogProps) {
  const [widthMm, setWidthMm] = useState(resolution.widthMm);
  const [heightMm, setHeightMm] = useState(resolution.heightMm);
  const [widthText, setWidthText] = useState(formatMm(resolution.widthMm));
  const [heightText, setHeightText] = useState(formatMm(resolution.heightMm));
  const [locked, setLocked] = useState(true);
  const [saving, setSaving] = useState(false);

  // Proporción del diseño real (SVG); si no se pudo medir, la de la sugerencia.
  const lockRatio =
    svgAspectRatio != null && svgAspectRatio > 0
      ? svgAspectRatio
      : resolution.heightMm > 0
        ? resolution.widthMm / resolution.heightMm
        : 1;

  const setBoth = (w: number, h: number) => {
    setWidthMm(w);
    setHeightMm(h);
    setWidthText(formatMm(w));
    setHeightText(formatMm(h));
  };

  useEffect(() => {
    if (open) {
      setBoth(resolution.widthMm, resolution.heightMm);
      setLocked(true);
    }
    // setBoth is stable for this purpose; we intentionally sync from resolution on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resolution.widthMm, resolution.heightMm]);

  const onWidthText = (raw: string) => {
    setWidthText(raw);
    const n = parseMm(raw);
    if (n == null) return;
    if (locked) {
      const next = applyAspectRatioLock('width', n, lockRatio);
      setWidthMm(next.widthMm);
      setHeightMm(next.heightMm);
      setHeightText(formatMm(next.heightMm));
    } else {
      setWidthMm(n);
    }
  };

  const onHeightText = (raw: string) => {
    setHeightText(raw);
    const n = parseMm(raw);
    if (n == null) return;
    if (locked) {
      const next = applyAspectRatioLock('height', n, lockRatio);
      setWidthMm(next.widthMm);
      setHeightMm(next.heightMm);
      setWidthText(formatMm(next.widthMm));
    } else {
      setHeightMm(n);
    }
  };

  /** Encaja lo pedido en la proporción del SVG (no deforma). */
  const handleUseRequested = () => {
    const max = resolution.maxUsableMm;
    const reqMinor = Math.min(requestedWidthMm, requestedHeightMm);
    if (max != null && reqMinor > max + 0.05) {
      const s = scaleMinorSideToTope(lockRatio, 1, max);
      setBoth(s.widthMm, s.heightMm);
      return;
    }
    const fitted = fitAspectInBox(lockRatio, requestedWidthMm, requestedHeightMm);
    const clamped = clampToTopePreservingAspect(fitted.widthMm, fitted.heightMm, max);
    setBoth(clamped.widthMm, clamped.heightMm);
  };

  const handleUseMeasured = () => {
    if (resolution.measuredWidthMm == null || resolution.measuredHeightMm == null) return;
    const clamped = clampToTopePreservingAspect(
      resolution.measuredWidthMm,
      resolution.measuredHeightMm,
      resolution.maxUsableMm,
    );
    setBoth(clamped.widthMm, clamped.heightMm);
  };

  const measureValid =
    parseMm(widthText) != null && parseMm(heightText) != null && widthMm > 0 && heightMm > 0;

  const handleConfirm = async () => {
    if (!measureValid) return;
    setSaving(true);
    try {
      await onConfirm({
        widthMm: Math.round(widthMm * 10) / 10,
        heightMm: Math.round(heightMm * 10) / 10,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const reviewMessage =
    resolution.reviewReason === 'large_diff' ? (
      <div className="text-xs rounded bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 px-3 py-2">
        El vector se desvía ≥6mm de la medida pedida. Se sugiere la medida del diseño
        (misma proporción del SVG, sin deformar).
      </div>
    ) : resolution.reviewReason === 'tope_long_side_diff' ? (
      <div className="text-xs rounded bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 px-3 py-2">
        Lo pedido supera el tope de la planchuela {resolution.tipoPlanchuela}mm ({resolution.maxUsableMm}mm).
        Se llevó el lado chico a {resolution.maxUsableMm}mm y el largo quedó en{' '}
        {Math.max(resolution.widthMm, resolution.heightMm).toFixed(1)}mm, que se aleja 6mm o más de lo
        pedido. Revisá la medida.
      </div>
    ) : (
      <div className="text-xs rounded bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 px-3 py-2">
        El vector supera el máximo de la planchuela {resolution.tipoPlanchuela}mm ({resolution.maxUsableMm}
        mm). Se sugiere el diseño recortado al tope, sin deformar.
      </div>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="pb-2 border-b">
          <DialogTitle className="text-lg font-semibold">Confirmar medida de fabricación</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1 truncate">{fileName}</p>
        </DialogHeader>

        <div className="space-y-4">
          {previewUrl && (
            <div className="flex items-center justify-center rounded border bg-white p-4 h-32">
              <img src={previewUrl} alt="Vector" className="max-h-full max-w-full object-contain" />
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            Medida pedida:{' '}
            <span className="font-medium text-foreground">
              {requestedWidthMm.toFixed(1)} × {requestedHeightMm.toFixed(1)} mm
            </span>
            {resolution.measuredWidthMm != null && resolution.measuredHeightMm != null && (
              <>
                {' · '}Vector medido:{' '}
                <span className="font-medium text-foreground">
                  {resolution.measuredWidthMm.toFixed(1)} × {resolution.measuredHeightMm.toFixed(1)} mm
                </span>
              </>
            )}
          </div>

          {reviewMessage}

          {svgAspectRatio == null && (
            <div className="text-xs rounded bg-muted px-3 py-2 text-muted-foreground">
              No se pudo medir el SVG automáticamente; revisá la proporción a mano.
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="fab-width">Ancho (mm)</Label>
              <Input
                id="fab-width"
                type="text"
                inputMode="decimal"
                value={widthText}
                onChange={(e) => onWidthText(e.target.value)}
                onBlur={() => setWidthText(formatMm(widthMm))}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && measureValid) {
                    e.preventDefault();
                    void handleConfirm();
                  }
                }}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mb-1"
              title={locked ? 'Proporción bloqueada (click para editar libre)' : 'Proporción libre (click para bloquear)'}
              onClick={() => setLocked((v) => !v)}
            >
              {locked ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
            </Button>
            <div className="flex-1 space-y-1">
              <Label htmlFor="fab-height">Alto (mm)</Label>
              <Input
                id="fab-height"
                type="text"
                inputMode="decimal"
                value={heightText}
                onChange={(e) => onHeightText(e.target.value)}
                onBlur={() => setHeightText(formatMm(heightMm))}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && measureValid) {
                    e.preventDefault();
                    void handleConfirm();
                  }
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-between items-center gap-2 pt-2">
            <div className="flex flex-wrap gap-1">
              <Button type="button" variant="link" size="sm" className="px-0" onClick={handleUseRequested}>
                Acercar a lo pedido
              </Button>
              {resolution.measuredWidthMm != null && resolution.measuredHeightMm != null ? (
                <Button type="button" variant="link" size="sm" className="px-0" onClick={handleUseMeasured}>
                  Usar vector medido
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={saving || !measureValid}>
                {saving ? 'Guardando…' : 'Confirmar medida'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
