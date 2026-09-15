import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  applyHandle,
  clampCrop,
  squareCrop,
  type CropHandle,
  type CropRect,
} from '@/lib/vectorizacion/cropGeometry';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  crop: CropRect;
  onConfirm: (crop: CropRect) => void;
  onAuto: () => CropRect;
}

const HANDLES: CropHandle[] = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];

export function CropEditor({
  open,
  onOpenChange,
  imageUrl,
  naturalWidth,
  naturalHeight,
  crop,
  onConfirm,
  onAuto,
}: Props) {
  const [draft, setDraft] = useState(crop);
  const [scale, setScale] = useState(1);
  const drag = useRef<{ handle: CropHandle; x: number; y: number; crop: CropRect } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setDraft(crop);
  }, [open, crop]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 0.05 : 0.005;
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm(draft);
        onOpenChange(false);
      }
      if (e.key === 'Escape') onOpenChange(false);
      const move: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const delta = move[e.key];
      if (delta) {
        e.preventDefault();
        setDraft((prev) => clampCrop({ ...prev, x: prev.x + delta[0], y: prev.y + delta[1] }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, draft, onConfirm, onOpenChange]);

  const startDrag = (handle: CropHandle, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { handle, x: e.clientX, y: e.clientY, crop: draft };
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const dx = (e.clientX - drag.current.x) / rect.width;
    const dy = (e.clientY - drag.current.y) / rect.height;
    setDraft(applyHandle(drag.current.crop, drag.current.handle, dx, dy));
  };

  const pxW = Math.round(draft.w * naturalWidth);
  const pxH = Math.round(draft.h * naturalHeight);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Recortar</DialogTitle>
        </DialogHeader>
        <div
          ref={stageRef}
          className="relative mx-auto max-h-[60vh] overflow-hidden bg-black"
          style={{ transform: `scale(${scale})` }}
          onWheel={(e) => {
            e.preventDefault();
            setScale((s) => Math.min(3, Math.max(0.5, s + (e.deltaY > 0 ? -0.1 : 0.1))));
          }}
          onPointerMove={onMove}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          <img src={imageUrl} alt="" className="block max-h-[60vh] max-w-full" />
          <div className="pointer-events-none absolute inset-0 bg-black/50" />
          <div
            className="absolute cursor-move border-2 border-white"
            style={{
              left: `${draft.x * 100}%`,
              top: `${draft.y * 100}%`,
              width: `${draft.w * 100}%`,
              height: `${draft.h * 100}%`,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
            }}
            onPointerDown={(e) => startDrag('move', e)}
          >
            {HANDLES.map((handle) => (
              <span
                key={handle}
                className="absolute size-3 -translate-x-1/2 -translate-y-1/2 bg-white"
                style={{
                  left: handle.includes('w') ? '0%' : handle.includes('e') ? '100%' : '50%',
                  top: handle.includes('n') ? '0%' : handle.includes('s') ? '100%' : '50%',
                  cursor: `${handle}-resize`,
                }}
                onPointerDown={(e) => startDrag(handle, e)}
              />
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {pxW} × {pxH} px · {((pxW * pxH) / 1_000_000).toFixed(2)} MP
        </p>
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setDraft(onAuto())}>
              Auto
            </Button>
            <Button type="button" variant="outline" onClick={() => setDraft({ x: 0, y: 0, w: 1, h: 1 })}>
              Todo
            </Button>
            <Button type="button" variant="outline" onClick={() => setDraft(squareCrop())}>
              Cuadrado
            </Button>
          </div>
          <Button
            type="button"
            onClick={() => {
              onConfirm(draft);
              onOpenChange(false);
            }}
          >
            Aceptar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
