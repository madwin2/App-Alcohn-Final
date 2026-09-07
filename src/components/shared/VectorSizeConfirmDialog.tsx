import { useEffect, useState } from 'react';
import { Link2, Link2Off } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { applyAspectRatioLock } from '@/lib/programas/fabricationSize';
import type { FabricationSizeResolution } from '@/lib/programas/fabricationSize';

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
  const [locked, setLocked] = useState(true);
  const [saving, setSaving] = useState(false);

  // Ratio para el bloqueo: preferí la del SVG medido; si no hay, la de la sugerencia ya resuelta.
  const lockRatio = svgAspectRatio ?? (resolution.heightMm > 0 ? resolution.widthMm / resolution.heightMm : 1);

  useEffect(() => {
    if (open) {
      setWidthMm(resolution.widthMm);
      setHeightMm(resolution.heightMm);
      setLocked(true);
    }
  }, [open, resolution.widthMm, resolution.heightMm]);

  const handleWidthChange = (value: number) => {
    if (locked) {
      const next = applyAspectRatioLock('width', value, lockRatio);
      setWidthMm(next.widthMm);
      setHeightMm(next.heightMm);
    } else {
      setWidthMm(value);
    }
  };

  const handleHeightChange = (value: number) => {
    if (locked) {
      const next = applyAspectRatioLock('height', value, lockRatio);
      setWidthMm(next.widthMm);
      setHeightMm(next.heightMm);
    } else {
      setHeightMm(value);
    }
  };

  const handleUseRequested = () => {
    setWidthMm(requestedWidthMm);
    setHeightMm(requestedHeightMm);
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm({ widthMm, heightMm });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

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
          </div>

          <div className="text-xs rounded bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 px-3 py-2">
            El vector mide más que el máximo de la planchuela {resolution.tipoPlanchuela}mm
            ({resolution.maxUsableMm}mm) — se recortó al tope. Revisá si el resultado te sirve.
          </div>

          {svgAspectRatio == null && (
            <div className="text-xs rounded bg-muted px-3 py-2 text-muted-foreground">
              No se pudo medir la proporción del SVG automáticamente; se usa la del pedido.
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="fab-width">Ancho (mm)</Label>
              <Input
                id="fab-width"
                type="number"
                step="0.1"
                min="0"
                value={widthMm.toFixed(1)}
                onChange={(e) => handleWidthChange(parseFloat(e.target.value) || 0)}
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
                type="number"
                step="0.1"
                min="0"
                value={heightMm.toFixed(1)}
                onChange={(e) => handleHeightChange(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-2">
            <Button type="button" variant="link" size="sm" className="px-0" onClick={handleUseRequested}>
              Usar medida pedida
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={saving}>
                {saving ? 'Guardando…' : 'Confirmar medida'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
