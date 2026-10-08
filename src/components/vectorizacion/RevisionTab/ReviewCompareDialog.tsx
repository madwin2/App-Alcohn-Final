import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { Minus, Plus, RotateCcw } from 'lucide-react';

const ZOOM_MIN = 1;
const ZOOM_MAX = 8;
const ZOOM_STEP = 0.35;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  beforeUrl: string;
  afterUrl: string;
  checker: boolean;
}

function ComparePane({
  label,
  src,
  checker,
  zoom,
  pan,
  onPanChange,
  dragging,
  setDragging,
}: {
  label: string;
  src: string;
  checker?: boolean;
  zoom: number;
  pan: { x: number; y: number };
  onPanChange: (pan: { x: number; y: number }) => void;
  dragging: boolean;
  setDragging: (v: boolean) => void;
}) {
  const last = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div
        className={cn(
          'relative min-h-[280px] flex-1 overflow-hidden rounded-md border',
          checker
            ? 'bg-[length:16px_16px] bg-[linear-gradient(45deg,#eee_25%,transparent_25%,transparent_75%,#eee_75%),linear-gradient(45deg,#eee_25%,transparent_25%,transparent_75%,#eee_75%)] bg-[position:0_0,8px_8px]'
            : 'bg-white',
          zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        )}
        onPointerDown={(e) => {
          if (zoom <= 1) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          last.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        }}
        onPointerMove={(e) => {
          if (!dragging || !last.current) return;
          onPanChange({
            x: last.current.panX + (e.clientX - last.current.x),
            y: last.current.panY + (e.clientY - last.current.y),
          });
        }}
        onPointerUp={() => {
          setDragging(false);
          last.current = null;
        }}
        onPointerCancel={() => {
          setDragging(false);
          last.current = null;
        }}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          className="pointer-events-none absolute left-1/2 top-1/2 max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
        />
      </div>
    </div>
  );
}

export function ReviewCompareDialog({
  open,
  onOpenChange,
  title,
  beforeUrl,
  afterUrl,
  checker,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!open) return;
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [open, beforeUrl, afterUrl]);

  const bumpZoom = (delta: number) => {
    setZoom((z) => {
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) * 100) / 100));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(1100px,96vw)] max-w-none flex-col gap-3 overflow-hidden sm:max-w-none">
        <DialogHeader className="shrink-0 space-y-1">
          <DialogTitle className="pr-8 text-base">{title}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Rueda del mouse para zoom · arrastrá para mover · mismo zoom en ambos lados
          </p>
        </DialogHeader>

        <div
          className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row"
          onWheel={(e) => {
            e.preventDefault();
            bumpZoom(e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
          }}
        >
          <ComparePane
            label="Base"
            src={beforeUrl}
            zoom={zoom}
            pan={pan}
            onPanChange={setPan}
            dragging={dragging}
            setDragging={setDragging}
          />
          <ComparePane
            label="Vector"
            src={afterUrl}
            checker={checker}
            zoom={zoom}
            pan={pan}
            onPanChange={setPan}
            dragging={dragging}
            setDragging={setDragging}
          />
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-8"
              onClick={() => bumpZoom(-ZOOM_STEP)}
              aria-label="Alejar"
            >
              <Minus className="size-3.5" />
            </Button>
            <span className="min-w-[3.5rem] text-center text-xs tabular-nums text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-8"
              onClick={() => bumpZoom(ZOOM_STEP)}
              aria-label="Acercar"
            >
              <Plus className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              <RotateCcw className="mr-1 size-3.5" />
              Reset
            </Button>
          </div>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
