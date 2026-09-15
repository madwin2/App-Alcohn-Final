import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { StorageUrlImage } from '@/components/shared/StorageUrlImage';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { baseFileUtil } from '@/lib/vectorizacion/baseFile';
import type { PendingSello, PreparedImage } from '@/lib/vectorizacion/types';
import { Check, Loader2 } from 'lucide-react';
import { CardImageContextMenu } from '../shared/CardImageContextMenu';

gsap.registerPlugin(useGSAP);

interface Props {
  sello: PendingSello;
  selected: boolean;
  prepared?: PreparedImage;
  preparing: boolean;
  onToggle: (shift: boolean) => void;
  onCrop: () => void;
  onReplaced: () => void | Promise<void>;
  onRestored: () => void;
}

export function PendienteThumb({
  sello,
  selected,
  prepared,
  preparing,
  onToggle,
  onCrop,
  onReplaced,
  onRestored,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const displayUrl = baseFileUtil(sello);

  useGSAP(
    () => {
      const el = rootRef.current;
      if (!el) return;
      gsap.fromTo(
        el,
        { opacity: 0, y: 28, scale: 0.88 },
        { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out' },
      );
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} data-thumb className="relative will-change-transform">
      <CardImageContextMenu
        imageUrl={displayUrl}
        mockupSolicitudId={sello.mockupSolicitudId}
        fileName={sello.designName}
        onCrop={onCrop}
        onReplaced={onReplaced}
        hasMejorada={Boolean(sello.archivoBaseMejorado)}
        onRestoreOriginal={onRestored}
        selloId={sello.id}
        orderId={sello.orderId}
        className="[&_img]:pointer-events-none"
      >
        <button
          type="button"
          title={`${sello.designName} — ${sello.clienteNombre}`}
          onClick={(e) => onToggle(e.shiftKey)}
          onMouseEnter={(e) => {
            gsap.to(e.currentTarget, {
              y: -14,
              scale: 1.12,
              duration: 0.55,
              ease: 'power3.out',
              overwrite: 'auto',
            });
          }}
          onMouseLeave={(e) => {
            gsap.to(e.currentTarget, {
              y: 0,
              scale: 1,
              duration: 0.9,
              ease: 'elastic.out(1, 0.5)',
              overwrite: 'auto',
            });
          }}
          className={cn(
            'group relative aspect-square w-full overflow-hidden rounded-[1.15rem] bg-white text-left',
            'shadow-[0_8px_28px_-12px_rgba(0,0,0,0.45),0_1px_0_rgba(255,255,255,0.06)_inset]',
            'ring-1 ring-black/5 transition-[box-shadow] duration-300',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selected && 'ring-2 ring-emerald-400/70 shadow-[0_12px_36px_-10px_rgba(16,185,129,0.55)]',
          )}
        >
          <div className="flex h-full w-full items-center justify-center p-2">
            {prepared && !prepared.empty ? (
              <img src={prepared.previewDataUrl} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <StorageUrlImage
                url={displayUrl}
                mockupSolicitudId={sello.mockupSolicitudId}
                alt={sello.designName}
                className="h-full w-full object-contain"
                imgClassName="h-full w-full object-contain"
              />
            )}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 bg-gradient-to-t from-black/65 to-transparent px-2 pb-2 pt-8 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <p className="truncate text-[10px] font-medium text-white/95">{sello.designName}</p>
          </div>

          {selected ? (
            <span className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md">
              <Check className="size-3" strokeWidth={3} />
            </span>
          ) : null}

          {sello.esPrioritario || sello.estadoFabricacion === 'Prioridad' ? (
            <Badge className="absolute right-1.5 top-1.5 h-4 px-1 text-[9px]" variant="destructive">
              Prio
            </Badge>
          ) : null}

          {preparing ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[2px]">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : null}
        </button>
      </CardImageContextMenu>
    </div>
  );
}
