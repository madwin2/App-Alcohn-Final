import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { useDraggable } from '@dnd-kit/core';
import {
  Lock,
  Unlock,
  Download,
  AlertTriangle,
  FileCheck2,
  Plus,
  X,
} from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  FabricationState,
  Program,
  ProgramLifecycleState,
  ProgramStamp,
} from '@/lib/types/index';
import {
  formatLengthByPlanchuela,
  computeProgramLoad,
  accumulateLengthByPlanchuela,
  type ProgramLoad,
} from '@/lib/programas/material';
import { StampThumb } from '@/components/programas/StampThumb';
import { HojaInlineStampPicker } from './HojaInlineStampPicker';
import {
  RemoveStampDialog,
  type RemoveStampChoice,
} from '@/components/programas/RemoveStamp/RemoveStampDialog';
import { ConfirmDialog } from '@/components/programas/ConfirmDialog';
import {
  canDownloadPackage,
  parseSellosNoImportados,
  parseSellosEnOtraPlanchuela,
  ProgramServiceError,
  type SoloEnAppDecision,
  type SoloEnArchivoDecision,
  type SyncProgramFromFileResult,
} from '@/lib/supabase/services/programs.service';
import { parseOrderDateLocal } from '@/lib/utils/format';
import { toast } from '@/components/ui/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

function formatStampSizeMm(stamp: ProgramStamp): string | null {
  if (!(stamp.widthMm > 0) || !(stamp.heightMm > 0)) return null;
  return `${Math.round(stamp.widthMm)} × ${Math.round(stamp.heightMm)} mm`;
}

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function finalSheetRect() {
  const width = Math.min(window.innerWidth * 0.96, 36 * 16);
  const height = Math.min(window.innerHeight * 0.92, 52 * 16);
  return {
    left: (window.innerWidth - width) / 2,
    top: (window.innerHeight - height) / 2,
    width,
    height,
  };
}

/**
 * Tarjetero con SVG de diseño (Illustrator):
 * - Espalda / frente fijos
 * - Hoja asoma en reposo, sube al hover
 * - Click: la hoja sale y se abre en grande (modal)
 */
export interface ProgramCardDesignProps {
  program: Program;
  className?: string;
  /** Arrastrar solo la hoja (board) hacia carpeta/papelera. */
  enableBoardDrag?: boolean;
  /** Oculta la hoja en el bolsillo (p. ej. mientras termina el suck-in al soltar). */
  forceHideSheet?: boolean;
  onRefresh?: () => Promise<void> | void;
  onAddStamps?: (programId: string, stampIds: string[]) => Promise<void>;
  onRemoveStamp?: (
    programId: string,
    stampId: string,
    choice: RemoveStampChoice,
  ) => Promise<void>;
  onDelete?: (programId: string, choice: RemoveStampChoice) => Promise<void>;
  onLock?: (programId: string) => Promise<void>;
  onUnlock?: (programId: string) => Promise<void>;
  onDownload?: (programId: string) => Promise<void>;
  onUpdateProgram?: (programId: string, updates: Partial<Program>) => Promise<void>;
  onSyncAspireFile?: (programId: string, file: File) => Promise<SyncProgramFromFileResult>;
  onApplyReconciliation?: (
    programId: string,
    decisions: {
      soloEnApp: SoloEnAppDecision[];
      soloEnArchivo: SoloEnArchivoDecision[];
    },
  ) => Promise<void>;
  onSetFabricationState?: (programId: string, state: FabricationState) => Promise<void>;
  onSetStampFabricationStates?: (
    programId: string,
    assignments: { stampId: string; state: FabricationState }[],
  ) => Promise<void>;
}

const lifecycleLabel = (estado: ProgramLifecycleState, dirty: boolean): string => {
  if (estado === 'LISTO' && dirty) return 'Editado, falta regenerar';
  const map: Record<ProgramLifecycleState, string> = {
    BORRADOR: 'Borrador',
    LISTO: 'Listo',
    BLOQUEADO: 'Bloqueado',
    EN_FABRICACION: 'En fabricación',
    FINALIZADO: 'Finalizado',
  };
  return map[estado] || estado;
};

/**
 * Colores con más presencia, pero aún de “papel teñido” (no neón).
 */
function lifecycleStatusTone(
  estado: ProgramLifecycleState,
  dirty: boolean,
): { sheet: string; text: string; edge: string } {
  if (dirty && (estado === 'LISTO' || estado === 'BORRADOR')) {
    return {
      sheet: 'bg-[#d4a84a]',
      text: 'text-[#2a2110]',
      edge: 'border-[#b8923c]',
    };
  }
  switch (estado) {
    case 'LISTO':
      return {
        sheet: 'bg-[#5f9a72]',
        text: 'text-white',
        edge: 'border-[#4a7d5a]',
      };
    case 'BLOQUEADO':
      return {
        sheet: 'bg-[#b65c5c]',
        text: 'text-white',
        edge: 'border-[#954848]',
      };
    case 'EN_FABRICACION':
      return {
        sheet: 'bg-[#5a7eab]',
        text: 'text-white',
        edge: 'border-[#476891]',
      };
    case 'FINALIZADO':
      return {
        sheet: 'bg-[#7c8088]',
        text: 'text-white',
        edge: 'border-[#63666e]',
      };
    case 'BORRADOR':
    default:
      return {
        sheet: 'bg-[#9a9488]',
        text: 'text-white',
        edge: 'border-[#7e796e]',
      };
  }
}

function lifecycleTabLabel(estado: ProgramLifecycleState, dirty: boolean): string {
  if (dirty && (estado === 'LISTO' || estado === 'BORRADOR')) return 'Falta regenerar';
  return lifecycleLabel(estado, dirty);
}

/**
 * Segunda hoja detrás: casi tan ancha como la de producción, un poco torcida.
 */
function LifecycleStatusSheet({
  estado,
  dirty,
  size = 'peek',
  motion = false,
}: {
  estado: ProgramLifecycleState;
  dirty: boolean;
  size?: 'peek' | 'full';
  motion?: boolean;
}) {
  const tone = lifecycleStatusTone(estado, dirty);
  const label = lifecycleTabLabel(estado, dirty);
  const fullLabel = lifecycleLabel(estado, dirty);
  const full = size === 'full';
  const reduce = prefersReducedMotion();

  return (
    <div
      className={cn(
        'pointer-events-none absolute z-0 origin-[50%_85%]',
        // Un poco más angosta que la blanca + torcida
        full ? 'inset-x-[2%] top-0 bottom-3' : 'inset-x-[2.5%] top-0 bottom-2',
        'rounded-[3px] border',
        tone.sheet,
        tone.edge,
        'shadow-[1px_2px_8px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.22)]',
        full ? 'rotate-[0.9deg]' : 'rotate-[1.15deg]',
        motion &&
          !reduce &&
          cn(
            'transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] delay-75',
            'group-hover/pocket:rotate-[1.85deg] group-hover/pocket:scale-[1.01]',
          ),
      )}
      aria-hidden
    >
      <div
        className={cn(
          'flex items-center justify-center px-2',
          full ? 'h-5' : 'h-[1.15rem]',
          tone.text,
        )}
      >
        <span
          title={fullLabel}
          className={cn(
            'truncate font-semibold uppercase leading-none tracking-[0.12em]',
            full ? 'text-[10px]' : 'text-[9px]',
          )}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

/** Contenedor: hoja de estado detrás + hoja blanca encima. */
function HojaStack({
  program,
  size = 'peek',
  className,
  style,
  children,
  sheetClassName,
  statusMotion = false,
}: {
  program: Program;
  size?: 'peek' | 'full';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  sheetClassName?: string;
  statusMotion?: boolean;
}) {
  const full = size === 'full';
  const hasPreview = Boolean(program.previewUrl);

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-visible',
        full ? 'pt-5' : 'pt-[1.2rem]',
        statusMotion &&
          !prefersReducedMotion() &&
          'transition-[padding-top] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] delay-75 group-hover/pocket:pt-[1.4rem]',
        className,
      )}
      style={style}
    >
      <LifecycleStatusSheet
        estado={program.estadoPrograma}
        dirty={program.dirty}
        size={size}
        motion={statusMotion}
      />
      {/* Preview fuera de la hoja blanca para que no lo recorte ningún overflow interno */}
      {hasPreview && program.previewUrl ? (
        <ClippedProgramPreview
          src={program.previewUrl}
          alt={`Preview de ${program.name}`}
          size={size}
        />
      ) : null}
      <div
        className={cn(
          'relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden',
          'bg-[#f4f4f5] text-zinc-900',
          'rounded-[3px] border border-zinc-300/80',
          'shadow-[0_-5px_12px_rgba(0,0,0,0.18),0_1px_2px_rgba(0,0,0,0.05)]',
          sheetClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

const POCKET_VB = '52 50 123 132';

const PATH_BACK =
  'M157.94,175.84H68.83c-3.99,0-7.27-3.15-7.44-7.13L57.12,66.56c-0.24-5.64,4.27-10.33,9.91-10.33h92.7c5.64,0,10.14,4.7,9.91,10.33l-4.27,102.14C165.21,172.69,161.93,175.84,157.94,175.84z';

const PATH_FRONT =
  'M163.07,71.58c3.26-0.71,6.3,1.86,6.16,5.18l-3.84,91.94c-0.17,3.98-3.45,7.13-7.44,7.13H68.83c-3.99,0-7.27-3.15-7.44-7.13l-3.84-91.94c-0.14-3.33,2.9-5.89,6.16-5.18l11.99,2.6c2.66,0.58,5.1,1.91,7.03,3.84l6.21,6.21c2.13,2.13,5.01,3.32,8.02,3.32h32.87c3.01,0,5.89-1.19,8.02-3.32l6.21-6.21c1.93-1.93,4.37-3.26,7.03-3.84L163.07,71.58z';

/** Sombras suaves que siguen la silueta (superposición entre ranuras). */
const POCKET_BACK_FILTER =
  'drop-shadow(0 1px 3px rgba(0,0,0,0.4))';
const POCKET_FRONT_FILTER =
  'drop-shadow(0 -6px 10px rgba(0,0,0,0.35)) drop-shadow(0 4px 8px rgba(0,0,0,0.3))';

function PocketBack({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  const uid = useId().replace(/:/g, '');
  const fillId = `pb-fill-${uid}`;

  return (
    <svg
      className={className}
      style={style}
      viewBox={POCKET_VB}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        {/* Casi plano: diferencia mínima de valor, sin bombeo */}
        <linearGradient id={fillId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#141416" />
          <stop offset="100%" stopColor="#0c0c0e" />
        </linearGradient>
      </defs>
      <path d={PATH_BACK} fill={`url(#${fillId})`} />
      {/* Relieve plano: solo filete fino, sin wash */}
      <path
        d={PATH_BACK}
        fill="none"
        stroke="#2a2a2e"
        strokeOpacity={0.7}
        strokeWidth={0.9}
        strokeMiterlimit={10}
      />
      <path
        d={PATH_BACK}
        fill="none"
        stroke="#000"
        strokeOpacity={0.5}
        strokeWidth={1.5}
        strokeMiterlimit={10}
      />
    </svg>
  );
}

function PocketFront({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  const uid = useId().replace(/:/g, '');
  const fillId = `pf-fill-${uid}`;

  return (
    <svg
      className={className}
      style={style}
      viewBox={POCKET_VB}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        {/* Degradado suave y corto: casi negro, apenas más claro en el labio */}
        <linearGradient id={fillId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1a1a1d" />
          <stop offset="28%" stopColor="#121214" />
          <stop offset="100%" stopColor="#0a0a0b" />
        </linearGradient>
      </defs>

      <path d={PATH_FRONT} fill={`url(#${fillId})`} />

      {/* Contorno + highlight mínimo en el borde (relieve plano) */}
      <path
        d={PATH_FRONT}
        fill="none"
        stroke="#000"
        strokeOpacity={0.7}
        strokeWidth={1.4}
        strokeMiterlimit={10}
      />
      <path
        d={PATH_FRONT}
        fill="none"
        stroke="#3f3f46"
        strokeOpacity={0.28}
        strokeWidth={0.75}
        strokeMiterlimit={10}
      />
    </svg>
  );
}

const POCKET_H = 'h-[12.5rem]';

export type ProgramSheetDragOrigin = {
  programId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  liftNeeded: number;
  /** Línea del labio del bolsillo en viewport (para clip de salida). */
  lipY: number;
};

export function ProgramCardDesign({
  program,
  className,
  enableBoardDrag = false,
  forceHideSheet = false,
  onRefresh,
  onAddStamps,
  onRemoveStamp,
  onLock,
  onUnlock,
  onDownload,
}: ProgramCardDesignProps) {
  /**
   * Fase A (en el bolsillo): la hoja sube detrás del labio.
   * Fase B (portal en body): flyer encima de TODO (z alto) + overlay.
   * Nunca subimos el z-index del slot (eso tapaba la hoja de abajo).
   */
  const [busy, setBusy] = useState(false);
  const [flyerOn, setFlyerOn] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [stampToRemove, setStampToRemove] = useState<ProgramStamp | null>(null);
  const [pickingStamps, setPickingStamps] = useState(false);

  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragNodeRef,
    isDragging,
  } = useDraggable({
    id: `program-drag:${program.id}`,
    data: {
      type: 'program',
      programId: program.id,
      getDragOrigin: () => dragOriginCacheRef.current,
    },
    disabled: !enableBoardDrag || flyerOn || busy,
  });

  const sheetGone = isDragging || forceHideSheet;

  const pocketRef = useRef<HTMLDivElement>(null);
  const peekRef = useRef<HTMLElement>(null);
  const flyerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const liftYRef = useRef(0);
  const dragOriginCacheRef = useRef<ProgramSheetDragOrigin | null>(null);
  const exitRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(
    null,
  );
  const animatingRef = useRef(false);

  const cacheDragOrigin = () => {
    const peek = peekRef.current;
    const pocket = pocketRef.current;
    if (!peek || !pocket) return;
    const pr = peek.getBoundingClientRect();
    const pocketR = pocket.getBoundingClientRect();
    if (pr.width < 4 || pr.height < 4) return;
    dragOriginCacheRef.current = {
      programId: program.id,
      left: pr.left,
      top: pr.top,
      width: pr.width,
      height: pr.height,
      liftNeeded: Math.max(8, pr.bottom - pocketR.top + 12),
      // Labio del frente (~40% desde arriba del bolsillo).
      lipY: pocketR.top + pocketR.height * 0.4,
    };
  };

  const locked = Boolean(program.bloqueado);
  const lengthLines = formatLengthByPlanchuela(program.lengthByPlanchuela);
  const load = computeProgramLoad(program.machine, program.lengthByPlanchuela);
  const loadPctLabel =
    load == null ? null : `${Math.round(Math.min(999, load.pct))}%`;
  const showStaleZip = Boolean(program.archivoZipUrl) && program.dirty;
  const canDownload = canDownloadPackage(program.machine) && program.stamps.length > 0;
  const productionDateObj = parseOrderDateLocal(program.productionDate);
  const sellosNoImportados = parseSellosNoImportados(program.syncPayload);
  const sellosEnOtraPlanchuela = parseSellosEnOtraPlanchuela(program.syncPayload);
  const dateLabel = Number.isNaN(productionDateObj.getTime())
    ? '—'
    : format(productionDateObj, 'dd/MM/yyyy');
  const dateShort = Number.isNaN(productionDateObj.getTime())
    ? '—'
    : format(productionDateObj, 'dd MMM', { locale: es }).toUpperCase();
  const hasAlert =
    showStaleZip || sellosNoImportados.length > 0 || sellosEnOtraPlanchuela.length > 0;

  const runAction = async (fn: () => Promise<void>, successMsg?: string) => {
    setActionBusy(true);
    try {
      await fn();
      if (successMsg) toast({ title: successMsg });
    } catch (e) {
      toast({
        title: 'Error',
        description:
          e instanceof ProgramServiceError || e instanceof Error
            ? e.message
            : 'Operación fallida',
        variant: 'destructive',
      });
      try {
        await onRefresh?.();
      } catch {
        /* ignore */
      }
    } finally {
      setActionBusy(false);
    }
  };

  const hojaProps: HojaBodyProps = {
    program,
    locked,
    dateLabel,
    hasAlert,
    showStaleZip,
    sellosNoImportados,
    sellosEnOtraPlanchuela,
    load,
    lengthLines,
    canDownload,
    actionBusy,
    onDownload: onDownload
      ? () => {
          void runAction(() => onDownload(program.id), 'Paquete descargado');
        }
      : undefined,
    onToggleLock:
      onLock || onUnlock
        ? () => {
            if (actionBusy) return;
            if (program.bloqueado) {
              if (onUnlock) setShowUnlockDialog(true);
            } else if (onLock) {
              void runAction(() => onLock(program.id), 'Programa bloqueado');
            }
          }
        : undefined,
    onAddStampsClick:
      onAddStamps && !locked
        ? () => {
            if (!actionBusy) setPickingStamps((v) => !v);
          }
        : undefined,
    pickingStamps,
    onCancelPickingStamps: () => setPickingStamps(false),
    onConfirmAddStamps:
      onAddStamps && !locked
        ? (selected: ProgramStamp[]) => {
            setPickingStamps(false);
            void runAction(
              () =>
                onAddStamps(
                  program.id,
                  selected.map((s) => s.id),
                ),
              selected.length === 1 ? 'Sello agregado' : 'Sellos agregados',
            );
          }
        : undefined,
    onRemoveStampClick:
      onRemoveStamp && !locked
        ? (stamp) => {
            if (!actionBusy) setStampToRemove(stamp);
          }
        : undefined,
  };

  const clearPeekMotion = (peek: HTMLElement) => {
    peek.style.maxHeight = '';
    peek.style.overflow = '';
    peek.style.transition = '';
    peek.style.visibility = '';
    gsap.set(peek, { clearProps: 'transform,x,y,scale,scaleX,scaleY' });
  };

  /** Cierra sin frame intermedio sin max-height (eso hacía el microsalto “arriba → guardado”). */
  const finishClose = (peek: HTMLElement) => {
    const pocket = pocketRef.current;
    const restH = pocket
      ? Math.max(48, pocket.getBoundingClientRect().height * 0.86)
      : 120;

    // Mantener altura de reposo en inline hasta que React pinte busy=false
    peek.style.transition = 'none';
    peek.style.maxHeight = `${restH}px`;
    peek.style.overflow = 'hidden';
    peek.style.visibility = '';
    gsap.set(peek, { y: 0, x: 0, scaleX: 1, scaleY: 1 });

    liftYRef.current = 0;
    exitRectRef.current = null;
    setFlyerOn(false);
    setBusy(false);

    // Tras el paint con clases de reposo, soltar inline sin transición
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!peekRef.current) {
          animatingRef.current = false;
          return;
        }
        clearPeekMotion(peekRef.current);
        animatingRef.current = false;
      });
    });
  };

  const handoffToFlyer = (peek: HTMLElement) => {
    const r = peek.getBoundingClientRect();
    exitRectRef.current = {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
    };
    gsap.set(peek, { visibility: 'hidden', scaleX: 1, scaleY: 1 });
    setFlyerOn(true);
  };

  // Flyer montado en body: posicionar YA (antes del paint) y expandir
  useLayoutEffect(() => {
    if (!flyerOn) return;
    const flyer = flyerRef.current;
    const overlay = overlayRef.current;
    const from = exitRectRef.current;
    if (!flyer || !from) return;

    const to = finalSheetRect();

    gsap.set(flyer, {
      position: 'fixed',
      left: from.left,
      top: from.top,
      width: from.width,
      height: from.height,
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      borderRadius: 3,
      overflow: 'hidden',
      transformOrigin: '50% 50%',
      zIndex: 45,
      boxShadow: '0 14px 32px rgba(0,0,0,0.28)',
      force3D: true,
    });

    if (overlay) {
      gsap.set(overlay, { opacity: 0 });
    }

    if (prefersReducedMotion()) {
      gsap.set(flyer, {
        left: to.left,
        top: to.top,
        width: to.width + FLYER_PREVIEW_GUTTER,
        height: to.height,
        paddingRight: FLYER_PREVIEW_GUTTER,
        boxSizing: 'border-box',
        borderRadius: 0,
        overflow: 'visible',
        boxShadow: 'none',
      });
      if (overlay) gsap.set(overlay, { opacity: 1 });
      animatingRef.current = false;
      return;
    }

    const tl = gsap.timeline({
      defaults: { overwrite: 'auto', force3D: true },
      onComplete: () => {
        gsap.set(flyer, {
          overflow: 'visible',
          borderRadius: 0,
          scaleX: 1,
          scaleY: 1,
          boxShadow: 'none',
          width: to.width + FLYER_PREVIEW_GUTTER,
          paddingRight: FLYER_PREVIEW_GUTTER,
          boxSizing: 'border-box',
        });
        animatingRef.current = false;
      },
    });

    if (overlay) {
      tl.to(overlay, { opacity: 1, duration: 0.45, ease: 'power2.out' }, 0);
    }

    // Nace un poco aplastada y se estira al abrir (legible, no brusco)
    tl.fromTo(
      flyer,
      { scaleX: 1.06, scaleY: 0.92 },
      {
        left: to.left,
        top: to.top,
        width: to.width + FLYER_PREVIEW_GUTTER,
        height: to.height,
        paddingRight: FLYER_PREVIEW_GUTTER,
        boxSizing: 'border-box',
        scaleX: 1,
        scaleY: 1,
        borderRadius: 0,
        boxShadow: 'none',
        duration: 0.72,
        ease: 'power3.out',
      },
      0.04,
    );

    return () => {
      tl.kill();
    };
  }, [flyerOn]);

  const openSheet = () => {
    if (busy || animatingRef.current || flyerOn) return;
    const peek = peekRef.current;
    const pocket = pocketRef.current;
    if (!peek || !pocket) return;

    animatingRef.current = true;
    setBusy(true);

    const now = peek.getBoundingClientRect();
    peek.style.transition = 'none';
    peek.style.maxHeight = `${Math.max(now.height, 48)}px`;
    peek.style.overflow = 'hidden';

    const pocketRect = pocket.getBoundingClientRect();
    const liftNeeded = Math.max(8, now.bottom - pocketRect.top + 12);
    liftYRef.current = liftNeeded;

    if (prefersReducedMotion()) {
      gsap.set(peek, { y: -liftNeeded });
      handoffToFlyer(peek);
      return;
    }

    gsap.set(peek, { transformOrigin: '50% 100%', force3D: true });

    const tl = gsap.timeline({
      defaults: { overwrite: 'auto', force3D: true },
    });

    // Anticipación: se aplasta y hunde en el bolsillo (bien legible)
    tl.to(peek, {
      scaleX: 1.1,
      scaleY: 0.84,
      y: 12,
      duration: 0.22,
      ease: 'power2.inOut',
    });
    // Un instante en el squash para que el ojo lo registre
    tl.to({}, { duration: 0.06 });

    // Rebound: se estira hacia arriba y alimenta el lift
    tl.to(peek, {
      scaleX: 0.94,
      scaleY: 1.1,
      y: -liftNeeded * 0.45,
      duration: 0.28,
      ease: 'power2.out',
    });

    // Sale del bolsillo y se asienta
    tl.to(peek, {
      scaleX: 1,
      scaleY: 1,
      y: -liftNeeded,
      duration: 0.48,
      ease: 'power3.out',
      onComplete: () => handoffToFlyer(peek),
    });
  };

  const closeSheet = () => {
    if (!flyerOn || animatingRef.current) return;
    setPickingStamps(false);
    const flyer = flyerRef.current;
    const peek = peekRef.current;
    const overlay = overlayRef.current;
    const pocket = pocketRef.current;
    if (!flyer || !peek || !pocket) return;

    animatingRef.current = true;
    gsap.set(flyer, { overflow: 'hidden' });

    const exit = exitRectRef.current;

    const finish = () => finishClose(peek);

    if (!exit || prefersReducedMotion()) {
      gsap.set(peek, { y: 0, visibility: 'visible', scaleX: 1, scaleY: 1 });
      finish();
      return;
    }

    const tl = gsap.timeline({ defaults: { overwrite: 'auto', force3D: true } });

    if (overlay) {
      tl.to(overlay, { opacity: 0, duration: 0.35, ease: 'power2.inOut' }, 0);
    }

    // Encoger con squash más legible al llegar al borde del bolsillo
    tl.to(
      flyer,
      {
        left: exit.left,
        top: exit.top,
        width: exit.width,
        height: exit.height,
        scaleX: 1.08,
        scaleY: 0.9,
        borderRadius: 3,
        boxShadow: '0 14px 32px rgba(0,0,0,0.28)',
        duration: 0.55,
        ease: 'power2.inOut',
      },
      0,
    );

    // Handoff: medir flyer y clavar peek en el mismo rect (evita salto)
    tl.add(() => {
      const fr = flyer.getBoundingClientRect();
      const pocketEl = pocketRef.current;
      if (!pocketEl) return;
      const pr = pocketEl.getBoundingClientRect();

      // Top en reposo (bottom 8% + altura del flyer) → y necesario para coincidir con flyer
      const peekRestTop = pr.bottom - pr.height * 0.08 - fr.height;
      const yLift = peekRestTop - fr.top;

      peek.style.maxHeight = `${fr.height}px`;
      peek.style.overflow = 'hidden';
      peek.style.transition = 'none';
      gsap.set(peek, {
        transformOrigin: '50% 100%',
        y: -yLift,
        scaleX: 1.08,
        scaleY: 0.9,
        visibility: 'visible',
        opacity: 1,
      });
      liftYRef.current = yLift;
      gsap.set(flyer, { autoAlpha: 0, pointerEvents: 'none' });
    });

    // Baja y aterriza con squash, luego se asienta suave
    tl.to(peek, {
      y: 0,
      scaleX: 1.1,
      scaleY: 0.86,
      duration: 0.42,
      ease: 'power2.in',
    });
    tl.to(peek, {
      scaleX: 1,
      scaleY: 1,
      duration: 0.28,
      ease: 'power2.out',
      onComplete: finish,
    });
  };

  useEffect(() => {
    if (!flyerOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSheet();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flyerOn]);

  return (
    <>
      <div
        ref={pocketRef}
        data-program-pocket={program.id}
        className={cn(
          'group/pocket relative w-full overflow-visible',
          POCKET_H,
          className,
        )}
      >
        <PocketBack
          className="pointer-events-none absolute inset-0 z-0"
          style={{ filter: POCKET_BACK_FILTER }}
        />

        <article
          ref={peekRef}
          data-program-peek={program.id}
          role="button"
          tabIndex={0}
          aria-label={`Abrir hoja de producción ${program.name}. Estado: ${lifecycleLabel(program.estadoPrograma, program.dirty)}`}
          aria-expanded={flyerOn}
          onClick={(e) => {
            e.stopPropagation();
            if (sheetGone) return;
            openSheet();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!sheetGone) openSheet();
            }
          }}
          className={cn(
            'absolute z-[1] flex cursor-pointer flex-col',
            'left-[10%] right-[10%]',
            'bottom-[8%]',
            'overflow-hidden',
            // Al arrastrar / suck-in: ocultar en el bolsillo pero conservar el tamaño del hover
            sheetGone && 'invisible pointer-events-none max-h-[22rem] pb-16',
            !busy && !sheetGone && 'max-h-[86%]',
            !busy &&
              !sheetGone &&
              'transition-[max-height,box-shadow] duration-500 ease-[cubic-bezier(0.33,1,0.68,1)]',
            !busy && !sheetGone && 'group-hover/pocket:max-h-[22rem]',
            !busy && !sheetGone && 'group-hover/pocket:pb-16',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40',
            locked && !busy && 'opacity-95',
          )}
          style={
            program.previewUrl
              ? {
                  // Deja respirar arriba y a la derecha el preview rotado; abajo sigue recortado (bolsillo)
                  clipPath: 'inset(-52px -44px 0px -10px)',
                }
              : undefined
          }
        >
          <HojaStack
            program={program}
            size="peek"
            statusMotion={!busy && !sheetGone}
            className="min-h-0 flex-1"
            sheetClassName={cn(
              !busy &&
                !sheetGone &&
                'transition-shadow duration-500 ease-[cubic-bezier(0.33,1,0.68,1)]',
              !busy &&
                !sheetGone &&
                'group-hover/pocket:shadow-[0_-10px_20px_rgba(0,0,0,0.28),0_1px_2px_rgba(0,0,0,0.06)]',
            )}
          >
            <HojaBody {...hojaProps} size="peek" />
          </HojaStack>
        </article>

        <PocketFront
          className="pointer-events-none absolute inset-0 z-[2]"
          style={{ filter: POCKET_FRONT_FILTER }}
        />

        <div
          className="pointer-events-none absolute inset-x-[14%] bottom-[13%] z-[3] grid grid-cols-3 gap-1"
          aria-hidden
        >
          <div className="min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              Fecha
            </p>
            <p className="mt-0.5 truncate text-[12px] font-semibold tabular-nums leading-none text-zinc-200">
              {dateShort}
            </p>
          </div>
          <div className="min-w-0 text-center">
            <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              Sellos
            </p>
            <p className="mt-0.5 inline-flex items-center justify-center gap-1 text-[12px] font-semibold tabular-nums leading-none text-zinc-200">
              {program.stampCount}
              {hasAlert && (
                <AlertTriangle className="h-3 w-3 text-amber-500" aria-hidden />
              )}
            </p>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              Carga
            </p>
            <div className="mt-0.5 flex items-center justify-end gap-1.5 leading-none">
              {load ? (
                <>
                  <LoadDonut pct={load.pct} />
                  <span className="text-[12px] font-semibold tabular-nums text-zinc-200">
                    {loadPctLabel}
                  </span>
                </>
              ) : (
                <span className="text-[12px] font-semibold text-zinc-500">—</span>
              )}
            </div>
          </div>
        </div>

        {!busy && !flyerOn && (
          <button
            type="button"
            ref={enableBoardDrag ? setDragNodeRef : undefined}
            aria-label={`Abrir o arrastrar hoja de producción ${program.name}`}
            onClick={(e) => {
              e.stopPropagation();
              if (sheetGone) return;
              openSheet();
            }}
            className={cn(
              'absolute inset-0 z-[5] bg-transparent',
              enableBoardDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
              sheetGone && 'opacity-0',
            )}
            {...(enableBoardDrag ? dragAttributes : {})}
            {...(enableBoardDrag ? dragListeners : {})}
            onPointerDown={(e) => {
              if (enableBoardDrag) cacheDragOrigin();
              if (enableBoardDrag) {
                dragListeners?.onPointerDown?.(e);
              }
            }}
          />
        )}
      </div>

      {flyerOn &&
        createPortal(
          <>
            <div
              ref={overlayRef}
              className="fixed inset-0 z-[40] bg-black/50"
              onClick={closeSheet}
              aria-hidden
            />
            <div
              ref={flyerRef}
              role="dialog"
              aria-modal="true"
              aria-label={`Hoja de producción ${program.name}`}
              className="fixed z-[45] flex flex-col overflow-visible bg-transparent outline-none"
            >
              <HojaStack
                program={program}
                size="full"
                className="min-h-0 flex-1"
                sheetClassName="border-zinc-300/80 shadow-[0_22px_50px_rgba(0,0,0,0.28)]"
              >
                <button
                  type="button"
                  onClick={closeSheet}
                  className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-zinc-200/80 hover:text-zinc-800"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
                <HojaBody {...hojaProps} size="full" />
              </HojaStack>
            </div>
          </>,
          document.body,
        )}

      {onRemoveStamp && (
        <RemoveStampDialog
          open={Boolean(stampToRemove)}
          onOpenChange={(open) => {
            if (!open) setStampToRemove(null);
          }}
          stamp={stampToRemove}
          onConfirm={(choice) => {
            const stamp = stampToRemove;
            setStampToRemove(null);
            if (!stamp) return;
            void runAction(
              () => onRemoveStamp(program.id, stamp.id, choice),
              'Sello quitado del programa',
            );
          }}
        />
      )}

      {onUnlock && (
        <ConfirmDialog
          open={showUnlockDialog}
          onOpenChange={setShowUnlockDialog}
          title="Desbloquear programa"
          description="¿Desbloquear el programa? Podrá editarse de nuevo."
          confirmLabel="Desbloquear"
          onConfirm={() =>
            void runAction(() => onUnlock(program.id), 'Programa desbloqueado')
          }
        />
      )}
    </>
  );
}



type HojaBodyProps = {
  program: Program;
  locked: boolean;
  dateLabel: string;
  hasAlert: boolean;
  showStaleZip: boolean;
  sellosNoImportados: ReturnType<typeof parseSellosNoImportados>;
  sellosEnOtraPlanchuela: ReturnType<typeof parseSellosEnOtraPlanchuela>;
  load: ProgramLoad | null;
  lengthLines: string[];
  canDownload: boolean;
  size?: 'peek' | 'full';
  actionBusy?: boolean;
  onDownload?: () => void;
  onToggleLock?: () => void;
  onAddStampsClick?: () => void;
  pickingStamps?: boolean;
  onCancelPickingStamps?: () => void;
  onConfirmAddStamps?: (stamps: ProgramStamp[]) => void;
  onRemoveStampClick?: (stamp: ProgramStamp) => void;
};

/** Medidas del A4 clippeado en hoja full (para no superponer diseños). */
const FULL_CLIP_PREVIEW = {
  cardW: 112,
  cardH: 158,
  clearancePx: 112,
} as const;

/** Espacio extra a la derecha del flyer para que el preview rotado no se corte. */
const FLYER_PREVIEW_GUTTER = 36;

function HojaBody({
  program,
  locked,
  dateLabel,
  hasAlert,
  showStaleZip,
  sellosNoImportados,
  sellosEnOtraPlanchuela,
  load,
  lengthLines,
  canDownload,
  size = 'peek',
  actionBusy = false,
  onDownload,
  onToggleLock,
  onAddStampsClick,
  pickingStamps = false,
  onCancelPickingStamps,
  onConfirmAddStamps,
  onRemoveStampClick,
}: HojaBodyProps) {
  const full = size === 'full';
  const hasPreview = Boolean(program.previewUrl);
  const designsBlockRef = useRef<HTMLDivElement>(null);
  const pickerSlotRef = useRef<HTMLDivElement>(null);
  const loadBlockRef = useRef<HTMLDivElement>(null);
  const pickerTweenRef = useRef<gsap.core.Tween | gsap.core.Timeline | null>(null);
  const [pickerMounted, setPickerMounted] = useState(false);
  const [pendingAddStamps, setPendingAddStamps] = useState<ProgramStamp[]>([]);

  useEffect(() => {
    if (!pickingStamps) setPendingAddStamps([]);
  }, [pickingStamps]);

  const pendingLengths = useMemo(
    () => accumulateLengthByPlanchuela(pendingAddStamps),
    [pendingAddStamps],
  );
  const pendingTotalMm = useMemo(
    () => Object.values(pendingLengths).reduce((sum, mm) => sum + (mm || 0), 0),
    [pendingLengths],
  );

  useLayoutEffect(() => {
    if (!full) return;
    if (pickingStamps) setPickerMounted(true);
  }, [pickingStamps, full]);

  useLayoutEffect(() => {
    if (!full || !pickerMounted) return;
    const slot = pickerSlotRef.current;
    if (!slot) return;

    pickerTweenRef.current?.kill();

    if (prefersReducedMotion()) {
      gsap.set(slot, {
        height: pickingStamps ? 'auto' : 0,
        opacity: pickingStamps ? 1 : 0,
        marginTop: pickingStamps ? 12 : 0,
        marginBottom: pickingStamps ? 4 : 0,
      });
      if (designsBlockRef.current) gsap.set(designsBlockRef.current, { y: 0 });
      if (loadBlockRef.current) gsap.set(loadBlockRef.current, { y: 0 });
      if (!pickingStamps) setPickerMounted(false);
      return;
    }

    if (pickingStamps) {
      gsap.set(slot, { height: 'auto', opacity: 0, overflow: 'hidden' });
      const targetH = Math.max(slot.scrollHeight, 180);
      gsap.set(slot, { height: 0, marginTop: 0, marginBottom: 0 });

      const tl = gsap.timeline({ defaults: { overwrite: 'auto' } });
      if (designsBlockRef.current) {
        tl.to(
          designsBlockRef.current,
          { y: -6, duration: 0.42, ease: 'power3.out' },
          0,
        );
      }
      if (loadBlockRef.current) {
        tl.to(
          loadBlockRef.current,
          { y: 8, duration: 0.42, ease: 'power3.out' },
          0,
        );
      }
      tl.to(
        slot,
        {
          height: targetH,
          opacity: 1,
          marginTop: 12,
          marginBottom: 4,
          duration: 0.48,
          ease: 'power3.out',
          onComplete: () => {
            gsap.set(slot, { height: 'auto', overflow: 'visible' });
          },
        },
        0,
      );
      pickerTweenRef.current = tl;
    } else {
      const currentH = slot.offsetHeight || slot.scrollHeight;
      gsap.set(slot, { height: currentH, overflow: 'hidden' });
      const tl = gsap.timeline({
        defaults: { overwrite: 'auto' },
        onComplete: () => setPickerMounted(false),
      });
      if (designsBlockRef.current) {
        tl.to(
          designsBlockRef.current,
          { y: 0, duration: 0.34, ease: 'power2.inOut' },
          0,
        );
      }
      if (loadBlockRef.current) {
        tl.to(
          loadBlockRef.current,
          { y: 0, duration: 0.34, ease: 'power2.inOut' },
          0,
        );
      }
      tl.to(
        slot,
        {
          height: 0,
          opacity: 0,
          marginTop: 0,
          marginBottom: 0,
          duration: 0.36,
          ease: 'power2.inOut',
        },
        0,
      );
      pickerTweenRef.current = tl;
    }

    return () => {
      pickerTweenRef.current?.kill();
    };
  }, [pickingStamps, pickerMounted, full]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Scroll interno */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      <header
        className={cn(
          'relative z-[1] border-b border-zinc-200',
          full ? 'px-5 py-3' : 'px-3 py-2',
        )}
      >
        {(() => {
          const titleBlock = (
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1">
                <span className="truncate text-[9px] uppercase tracking-[0.12em] text-zinc-500">
                  Hoja de producción
                </span>
                {hasAlert && (
                  <AlertTriangle
                    className="h-3 w-3 shrink-0 text-amber-600"
                    aria-label="Tiene avisos"
                  />
                )}
              </div>
              <h3
                className={cn(
                  'truncate font-bold leading-tight tracking-tight text-zinc-900',
                  full ? 'text-lg' : 'text-sm',
                )}
              >
                {program.name}
              </h3>
            </div>
          );

          const lockControl = (
            <div
              className={cn(
                'flex shrink-0 items-center',
                hasPreview ? 'justify-center' : 'justify-end',
              )}
            >
              {onToggleLock ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLock();
                  }}
                  disabled={actionBusy}
                  className="rounded p-0.5 transition-colors hover:bg-zinc-200/70 disabled:opacity-50"
                  aria-label={locked ? 'Desbloquear' : 'Bloquear'}
                >
                  {locked ? (
                    <Lock className={cn(full ? 'h-4 w-4' : 'h-3.5 w-3.5', 'text-red-500')} />
                  ) : (
                    <Unlock
                      className={cn(full ? 'h-4 w-4' : 'h-3.5 w-3.5', 'text-zinc-400')}
                    />
                  )}
                </button>
              ) : locked ? (
                <Lock className={cn(full ? 'h-4 w-4' : 'h-3.5 w-3.5', 'text-red-500')} />
              ) : (
                <Unlock className={cn(full ? 'h-4 w-4' : 'h-3.5 w-3.5', 'text-zinc-400')} />
              )}
            </div>
          );

          // Con preview a la derecha: 1fr|auto|1fr centra el candado en la hoja.
          // Sin preview: título + candado a la derecha (esquina).
          if (hasPreview) {
            return (
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1">
                {titleBlock}
                {lockControl}
                <div aria-hidden />
              </div>
            );
          }

          return (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1">
              {titleBlock}
              {lockControl}
            </div>
          );
        })()}
      </header>

      <div className={cn(full ? 'space-y-4 px-5 py-4' : 'space-y-2.5 px-3 py-2.5')}>
        {/* En full+preview: fecha/avisos al costado; los diseños van debajo del A4 */}
        <div
          className={cn(
            full && hasPreview && 'grid grid-cols-[minmax(0,1fr)_7.5rem] gap-x-3',
          )}
          style={
            full && hasPreview
              ? { minHeight: FULL_CLIP_PREVIEW.clearancePx }
              : undefined
          }
        >
          <div className={cn(full && hasPreview && 'space-y-3')}>
            <dl className={cn('grid grid-cols-2 gap-2', full ? 'text-sm' : 'text-[11px]')}>
              <div>
                <dt className="text-zinc-500">Fecha</dt>
                <dd className="font-medium tabular-nums text-zinc-900">{dateLabel}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Aspire</dt>
                <dd className="font-medium">
                  {program.archivoAspireUrl ? (
                    <span className="inline-flex items-center gap-0.5 text-emerald-600">
                      <FileCheck2 className="h-3 w-3" /> OK
                    </span>
                  ) : (
                    <span className="text-zinc-400">Sin archivo</span>
                  )}
                </dd>
              </div>
            </dl>

            {showStaleZip && (
              <AlertLine>Desactualizado desde la última descarga</AlertLine>
            )}
            {sellosNoImportados.length > 0 && (
              <AlertLine>
                {sellosNoImportados.length === 1
                  ? `No entró: ${sellosNoImportados[0].diseno || 'sello'}`
                  : `${sellosNoImportados.length} sellos no entraron al Aspire`}
              </AlertLine>
            )}
            {sellosEnOtraPlanchuela.length > 0 && (
              <AlertLine>
                {sellosEnOtraPlanchuela.length === 1
                  ? `${sellosEnOtraPlanchuela[0].diseno}: planchuela ${sellosEnOtraPlanchuela[0].real} (plan. ${sellosEnOtraPlanchuela[0].planificada})`
                  : `${sellosEnOtraPlanchuela.length} sellos en otra planchuela`}
              </AlertLine>
            )}
          </div>
          {full && hasPreview && <div aria-hidden />}
        </div>

        <div ref={designsBlockRef} className="space-y-2 will-change-transform">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            Diseños
          </p>
          {full ? (
            <TooltipProvider delayDuration={200}>
            <div className="flex w-full flex-wrap gap-3">
              {program.stamps.map((s) => {
                const note = s.notes?.trim() || '';
                const sizeLabel = formatStampSizeMm(s);
                return (
                <div key={s.id} className="group/stamp relative">
                  {sizeLabel ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help">
                          <StampThumb
                            stamp={s}
                            className="h-[4.75rem] w-[4.75rem] rounded-md border-0 bg-transparent"
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="border-zinc-800 bg-zinc-900 text-xs text-white"
                      >
                        {sizeLabel}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <StampThumb
                      stamp={s}
                      className="h-[4.75rem] w-[4.75rem] rounded-md border-0 bg-transparent"
                    />
                  )}
                  {note ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          role="img"
                          aria-label="Tiene nota del pedido"
                          className={cn(
                            'absolute -left-1.5 -top-1.5 z-[3] flex h-4 w-4 cursor-help',
                            'items-center justify-center rounded-full bg-zinc-900',
                            'text-[10px] font-bold leading-none text-white',
                            'ring-2 ring-white shadow-sm',
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          !
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-[16rem] border-zinc-800 bg-zinc-900 whitespace-pre-wrap text-left text-xs leading-snug text-white"
                      >
                        {note}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                  {onRemoveStampClick && !pickingStamps && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveStampClick(s);
                      }}
                      disabled={actionBusy}
                      className="absolute -right-1 -top-1 z-[2] flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-white opacity-0 shadow transition-opacity group-hover/stamp:opacity-100 disabled:opacity-40"
                      aria-label={`Quitar ${s.designName}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                );
              })}
              {onAddStampsClick ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddStampsClick();
                  }}
                  disabled={actionBusy}
                  className={cn(
                    'flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-md border border-dashed transition-colors disabled:opacity-40',
                    pickingStamps
                      ? 'border-zinc-400 bg-zinc-100 text-zinc-700'
                      : 'border-zinc-300/80 bg-transparent text-zinc-400 hover:border-zinc-400 hover:text-zinc-600',
                  )}
                  aria-label={pickingStamps ? 'Cerrar agregar sellos' : 'Agregar sellos'}
                  aria-expanded={pickingStamps}
                >
                  {pickingStamps ? (
                    <X className="h-5 w-5" />
                  ) : (
                    <Plus className="h-5 w-5" />
                  )}
                </button>
              ) : (
                !locked && (
                  <div className="flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-md border border-dashed border-zinc-300/80 bg-transparent text-zinc-400">
                    <Plus className="h-5 w-5" />
                  </div>
                )
              )}
              {program.stamps.length === 0 && (
                <span className="text-xs text-zinc-500">Sin sellos</span>
              )}
            </div>
            </TooltipProvider>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {program.stamps.slice(0, 6).map((s) => (
                <StampThumb key={s.id} stamp={s} className="h-11 w-11" />
              ))}
              {program.stamps.length > 6 && (
                <span className="flex h-11 w-11 items-center justify-center rounded border border-zinc-200 text-[10px] text-zinc-500">
                  +{program.stamps.length - 6}
                </span>
              )}
              {!locked && (
                <div className="flex h-11 w-11 items-center justify-center rounded border border-dashed border-zinc-300 text-zinc-400">
                  <Plus className="h-4 w-4" />
                </div>
              )}
              {program.stamps.length === 0 && (
                <span className="text-xs text-zinc-500">Sin sellos</span>
              )}
            </div>
          )}
        </div>

        {full && onConfirmAddStamps && pickerMounted && (
          <div
            ref={pickerSlotRef}
            className="overflow-hidden"
            style={{ height: 0, opacity: 0 }}
            aria-hidden={!pickingStamps}
          >
            <HojaInlineStampPicker
              machine={program.machine}
              excludeStampIds={program.stamps.map((s) => s.id)}
              initialLengthByPlanchuela={program.lengthByPlanchuela}
              busy={actionBusy || !pickingStamps}
              onCancel={() => onCancelPickingStamps?.()}
              onConfirm={onConfirmAddStamps}
              onSelectionChange={setPendingAddStamps}
            />
          </div>
        )}

        <div ref={loadBlockRef} className="will-change-transform">
          {load && (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                  Carga por planchuela
                </p>
                <p className="text-[11px] font-semibold tabular-nums text-zinc-700">
                  {pendingTotalMm > 0 ? (
                    <>
                      {Math.round(load.pct)}%
                      <span className="mx-0.5 font-normal text-zinc-400">→</span>
                      <span
                        className={cn(
                          (load.totalUsedMm + pendingTotalMm) / load.totalCapacityMm > 1.005
                            ? 'text-amber-700'
                            : 'text-zinc-700',
                        )}
                      >
                        {Math.round(
                          ((load.totalUsedMm + pendingTotalMm) / load.totalCapacityMm) * 100,
                        )}
                        %
                      </span>
                      <span className="ml-1 font-normal text-zinc-400">
                        ({Math.round(load.totalUsedMm)}
                        <span className="text-zinc-400">+</span>
                        <span className="text-zinc-500">{Math.round(pendingTotalMm)}</span>
                        /{load.totalCapacityMm} mm)
                      </span>
                    </>
                  ) : (
                    <>
                      {Math.round(load.pct)}% total
                      <span className="ml-1 font-normal text-zinc-400">
                        ({Math.round(load.totalUsedMm)}/{load.totalCapacityMm} mm)
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div className="space-y-1.5">
                {load.byPlanchuela.map((row) => (
                  <PlanchuelaLoadBar
                    key={row.tipo}
                    row={row}
                    pendingMm={pendingLengths[row.tipo as keyof typeof pendingLengths] || 0}
                  />
                ))}
              </div>
            </div>
          )}

          {!load && lengthLines.length > 0 && (
            <div className="font-mono text-[11px] leading-relaxed text-zinc-500">
              {lengthLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-zinc-200 pt-2">
          <span className="text-[10px] text-zinc-500">
            {program.syncOrigen === 'GADGET'
              ? 'Sync gadget'
              : program.syncOrigen === 'ARCHIVO_SUBIDO'
                ? 'Sync archivo'
                : '—'}
          </span>
          <button
            type="button"
            disabled={!canDownload || actionBusy || !onDownload}
            onClick={(e) => {
              e.stopPropagation();
              onDownload?.();
            }}
            className={cn(
              'inline-flex items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-500',
              full ? 'h-9 w-9' : 'h-7 w-7',
              'hover:border-green-500/50 hover:bg-green-50 hover:text-green-700',
              'disabled:opacity-40',
            )}
            title={canDownload ? 'Descargar' : 'No disponible'}
          >
            <Download className={full ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
          </button>
        </footer>
      </div>
      </div>
    </div>
  );
}

/**
 * Preview A4 vertical, enganchado con clip metálico en la esquina.
 */
function ClippedProgramPreview({
  src,
  alt,
  size,
}: {
  src: string;
  alt: string;
  size: 'peek' | 'full';
}) {
  const uid = useId().replace(/:/g, '');
  const full = size === 'full';
  // Proporción ~A4 (1 : √2), más grande para llenar el blanco de la esquina
  const cardW = full ? FULL_CLIP_PREVIEW.cardW : 78;
  const cardH = full ? FULL_CLIP_PREVIEW.cardH : 110;
  const pad = full ? 4 : 3;
  const clipW = full ? 26 : 18;

  return (
    <div
      className={cn(
        'pointer-events-none absolute z-30',
        // Asoma un poco a la derecha (el flyer/peek dejan gutter / clip-path)
        full ? 'right-[-14px] top-[1.05rem]' : 'right-[-10px] top-[0.85rem]',
      )}
      style={{ width: cardW + 10 }}
      aria-hidden
    >
      <div
        className="relative mx-auto origin-top"
        style={{
          width: cardW,
          transform: `rotate(${full ? -7 : -6}deg)`,
        }}
      >
        {/* Alambre detrás del papel */}
        <PaperclipMetal
          idPrefix={`${uid}-b`}
          part="back"
          className="absolute left-1/2 z-0 -translate-x-1/2"
          style={{
            width: clipW,
            top: full ? -12 : -8,
            height: full ? 40 : 30,
          }}
        />

        {/* Mini hoja A4 */}
        <div
          className={cn(
            'relative z-[1] bg-white',
            'shadow-[0_8px_22px_rgba(0,0,0,0.2),0_2px_4px_rgba(0,0,0,0.1)]',
            'ring-1 ring-zinc-900/[0.07]',
            full ? 'rounded-[3px]' : 'rounded-[2px]',
          )}
          style={{ padding: pad }}
        >
          <img
            src={src}
            alt={alt}
            className="block bg-zinc-100 object-cover"
            style={{ width: cardW - pad * 2, height: cardH - pad * 2 }}
            draggable={false}
          />
        </div>

        {/* Alambre delante + sombra sobre el papel */}
        <PaperclipMetal
          idPrefix={`${uid}-f`}
          part="front"
          className="absolute left-1/2 z-[2] -translate-x-1/2"
          style={{
            width: clipW,
            top: full ? -12 : -8,
            height: full ? 40 : 30,
            filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.28))',
          }}
        />
      </div>
    </div>
  );
}

function PaperclipMetal({
  idPrefix,
  part,
  className,
  style,
}: {
  idPrefix: string;
  part: 'back' | 'front';
  className?: string;
  style?: CSSProperties;
}) {
  const gid = `${idPrefix}-g`;
  // Clip vertical tipo alambre: back = tramo inferior (detrás del papel), front = lazos superiores
  const dBack =
    'M9.2 18.5 V28.2 C9.2 33.4 14.8 33.4 14.8 28.2 V20.5';
  const dFront =
    'M9.2 20.8 V11.2 C9.2 5.6 14.8 5.6 14.8 11.2 V27.6 C14.8 32.2 9.2 32.2 9.2 27.6 V16.5 C9.2 13.2 11.6 12.2 13.2 12.2';

  return (
    <svg
      viewBox="0 0 24 40"
      className={className}
      style={style}
      aria-hidden
      fill="none"
    >
      <defs>
        <linearGradient id={gid} x1="4" y1="4" x2="20" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="28%" stopColor="#cbd5e1" />
          <stop offset="52%" stopColor="#94a3b8" />
          <stop offset="72%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>
      </defs>
      <path
        d={part === 'back' ? dBack : dFront}
        stroke={`url(#${gid})`}
        strokeWidth={part === 'back' ? 2.35 : 2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={part === 'back' ? 0.72 : 1}
      />
      {part === 'front' && (
        <path
          d="M10.1 14.2 V11.6 C10.1 8.2 13.9 8.2 13.9 11.6 V14"
          stroke="#ffffff"
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity="0.55"
        />
      )}
    </svg>
  );
}
function LoadDonut({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const r = 5.5;
  const c = 2 * Math.PI * r;
  const filled = (clamped / 100) * c;
  const tone =
    pct >= 90 ? '#f59e0b' : pct >= 60 ? '#22c55e' : '#a1a1aa';

  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0">
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        stroke="#3f3f46"
        strokeWidth="2.2"
      />
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        stroke={tone}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${c - filled}`}
        transform="rotate(-90 7 7)"
      />
    </svg>
  );
}

function PlanchuelaLoadBar({
  row,
  pendingMm = 0,
}: {
  row: { tipo: number; usedMm: number; maxMm: number; pct: number };
  pendingMm?: number;
}) {
  const basePct = row.maxMm > 0 ? (row.usedMm / row.maxMm) * 100 : 0;
  const pendingPct = row.maxMm > 0 ? (pendingMm / row.maxMm) * 100 : 0;
  const totalMm = row.usedMm + pendingMm;
  const totalPct = row.maxMm > 0 ? (totalMm / row.maxMm) * 100 : 0;
  const baseClamped = Math.min(100, Math.max(0, basePct));
  const pendingClamped = Math.min(Math.max(0, 100 - baseClamped), Math.max(0, pendingPct));
  const over = totalPct > 100.5;
  const hasPending = pendingMm > 0.5;

  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-2 text-[10px]">
        <span className="font-medium text-zinc-700">{row.tipo} mm</span>
        <span className="tabular-nums text-zinc-500">
          {hasPending ? (
            <>
              {Math.round(row.usedMm)}
              <span className="text-zinc-400">+</span>
              <span className="text-zinc-500">{Math.round(pendingMm)}</span>
              /{row.maxMm} mm
            </>
          ) : (
            <>
              {Math.round(row.usedMm)}/{row.maxMm} mm
            </>
          )}
          <span
            className={cn(
              'ml-1.5 font-semibold',
              over ? 'text-amber-700' : 'text-zinc-700',
            )}
          >
            {Math.round(totalPct)}%
          </span>
        </span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-200">
        <div
          className={cn(
            'h-full',
            over && !hasPending
              ? 'bg-amber-500'
              : row.pct >= 60
                ? 'bg-emerald-500'
                : 'bg-zinc-500',
          )}
          style={{ width: `${baseClamped}%` }}
        />
        {hasPending && (
          <div
            className={cn('h-full', over ? 'bg-amber-300' : 'bg-zinc-300')}
            style={{ width: `${pendingClamped}%` }}
          />
        )}
      </div>
    </div>
  );
}

function AlertLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/**
 * Fantasma de arrastre: la hoja completa (mismo contenido que al hover), no el resumen corto.
 */
export function ProgramSheetDragPreview({
  program,
  className,
  style,
}: {
  program: Program;
  className?: string;
  style?: CSSProperties;
}) {
  const locked = Boolean(program.bloqueado);
  const lengthLines = formatLengthByPlanchuela(program.lengthByPlanchuela);
  const load = computeProgramLoad(program.machine, program.lengthByPlanchuela);
  const showStaleZip = Boolean(program.archivoZipUrl) && program.dirty;
  const canDownload = canDownloadPackage(program.machine) && program.stamps.length > 0;
  const productionDateObj = parseOrderDateLocal(program.productionDate);
  const sellosNoImportados = parseSellosNoImportados(program.syncPayload);
  const sellosEnOtraPlanchuela = parseSellosEnOtraPlanchuela(program.syncPayload);
  const dateLabel = Number.isNaN(productionDateObj.getTime())
    ? '—'
    : format(productionDateObj, 'dd/MM/yyyy');
  const hasAlert =
    showStaleZip || sellosNoImportados.length > 0 || sellosEnOtraPlanchuela.length > 0;

  return (
    <HojaStack
      program={program}
      size="peek"
      className={cn(
        'pointer-events-none w-full max-w-[min(20rem,78vw)]',
        'max-h-[22rem]',
        className,
      )}
      style={style}
      sheetClassName="shadow-[0_22px_50px_rgba(0,0,0,0.38)] border-zinc-300/80"
    >
      <HojaBody
        program={program}
        locked={locked}
        dateLabel={dateLabel}
        hasAlert={hasAlert}
        showStaleZip={showStaleZip}
        sellosNoImportados={sellosNoImportados}
        sellosEnOtraPlanchuela={sellosEnOtraPlanchuela}
        load={load}
        lengthLines={lengthLines}
        canDownload={canDownload}
        size="peek"
      />
    </HojaStack>
  );
}

export type DockMagnetTarget = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Capa de arrastre propia: arranca en el rect del peek, anima la salida del
 * bolsillo y después baja suave hasta alinear con el cursor (lift → 0).
 * Sobre carpeta/tacho: se encoge e imanta; al soltar completa el suck-in.
 */
export function ProgramSheetDragLayer({
  program,
  origin,
  delta,
  magnetTarget = null,
  commitTarget = null,
  onCommitComplete,
}: {
  program: Program;
  origin: ProgramSheetDragOrigin;
  delta: { x: number; y: number };
  magnetTarget?: DockMagnetTarget | null;
  commitTarget?: DockMagnetTarget | null;
  onCommitComplete?: () => void;
}) {
  const [liftY, setLiftY] = useState(0);
  const [pocketCleared, setPocketCleared] = useState(false);
  const [magnet, setMagnet] = useState({ pull: 0, scale: 1, opacity: 1 });
  const magnetRef = useRef({ pull: 0, scale: 1, opacity: 1 });
  const liftTweenRef = useRef<gsap.core.Timeline | gsap.core.Tween | null>(null);
  const magnetTweenRef = useRef<gsap.core.Tween | null>(null);
  const commitStartedRef = useRef(false);
  const onCommitCompleteRef = useRef(onCommitComplete);
  onCommitCompleteRef.current = onCommitComplete;

  useLayoutEffect(() => {
    liftTweenRef.current?.kill();
    setLiftY(0);
    setPocketCleared(false);
    commitStartedRef.current = false;
    magnetRef.current = { pull: 0, scale: 1, opacity: 1 };
    setMagnet({ pull: 0, scale: 1, opacity: 1 });

    if (prefersReducedMotion()) {
      setLiftY(0);
      setPocketCleared(true);
      return;
    }

    const state = { y: 0 };
    const tl = gsap.timeline({
      onUpdate: () => setLiftY(state.y),
    });

    tl.to(state, {
      y: -origin.liftNeeded,
      duration: 0.36,
      ease: 'power3.out',
      onComplete: () => setPocketCleared(true),
    });
    tl.to(state, {
      y: 0,
      duration: 0.34,
      ease: 'power2.inOut',
    });

    liftTweenRef.current = tl;

    return () => {
      liftTweenRef.current?.kill();
      liftTweenRef.current = null;
    };
  }, [origin.programId, origin.liftNeeded, origin.left, origin.top]);

  useEffect(() => {
    if (commitTarget) return;
    magnetTweenRef.current?.kill();
    const active = Boolean(magnetTarget);
    magnetTweenRef.current = gsap.to(magnetRef.current, {
      pull: active ? 0.82 : 0,
      scale: active ? 0.18 : 1,
      opacity: active ? 0.94 : 1,
      duration: active ? 0.34 : 0.24,
      ease: active ? 'power2.out' : 'power2.inOut',
      onUpdate: () =>
        setMagnet({
          pull: magnetRef.current.pull,
          scale: magnetRef.current.scale,
          opacity: magnetRef.current.opacity,
        }),
    });
    return () => {
      magnetTweenRef.current?.kill();
    };
  }, [magnetTarget?.id, commitTarget]);

  useEffect(() => {
    if (!commitTarget || commitStartedRef.current) return;
    commitStartedRef.current = true;
    setPocketCleared(true);
    magnetTweenRef.current?.kill();
    magnetTweenRef.current = gsap.to(magnetRef.current, {
      pull: 1,
      scale: 0.04,
      opacity: 0,
      duration: prefersReducedMotion() ? 0.01 : 0.4,
      ease: 'power3.in',
      onUpdate: () =>
        setMagnet({
          pull: magnetRef.current.pull,
          scale: magnetRef.current.scale,
          opacity: magnetRef.current.opacity,
        }),
      onComplete: () => onCommitCompleteRef.current?.(),
    });
  }, [commitTarget]);

  const dock = commitTarget ?? magnetTarget;
  const baseLeft = origin.left + delta.x;
  const baseTop = origin.top + delta.y + liftY;
  const sheetCx = baseLeft + origin.width / 2;
  const sheetCy = baseTop + origin.height / 2;
  let tx = 0;
  let ty = 0;
  if (dock && magnet.pull > 0) {
    const tCx = dock.left + dock.width / 2;
    const tCy = dock.top + dock.height / 2;
    tx = (tCx - sheetCx) * magnet.pull;
    ty = (tCy - sheetCy) * magnet.pull;
  }

  return createPortal(
    <div
      className="pointer-events-none fixed z-[50] will-change-transform"
      style={{
        left: baseLeft,
        top: baseTop,
        width: origin.width,
        opacity: magnet.opacity,
        transform: `translate(${tx}px, ${ty}px) scale(${magnet.scale})`,
        transformOrigin: 'center center',
        clipPath: (() => {
          if (pocketCleared || magnet.pull > 0.05) return undefined;
          const bottom = baseTop + origin.height;
          const tucked = Math.max(0, bottom - origin.lipY);
          if (tucked < 1) return undefined;
          return `inset(0px 0px ${tucked}px 0px)`;
        })(),
      }}
    >
      <ProgramSheetDragPreview
        program={program}
        className={magnet.scale < 0.5 ? 'shadow-[0_8px_24px_rgba(0,0,0,0.35)]' : undefined}
        style={{ width: origin.width, maxHeight: Math.max(origin.height, 48) }}
      />
    </div>,
    document.body,
  );
}

/** Mide el rect de carpeta/tacho para el efecto imán. */
export function measureDockMagnetTarget(id: string): DockMagnetTarget | null {
  const el = document.querySelector(`[data-dock-target="${id}"]`) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  return { id, left: r.left, top: r.top, width: r.width, height: r.height };
}

/** Mide peek + bolsillo para arrancar el fantasma sin salto. */
export function measureProgramSheetDragOrigin(
  programId: string,
): ProgramSheetDragOrigin | null {
  const peek = document.querySelector(
    `[data-program-peek="${programId}"]`,
  ) as HTMLElement | null;
  const pocket = document.querySelector(
    `[data-program-pocket="${programId}"]`,
  ) as HTMLElement | null;
  if (!peek || !pocket) return null;

  const pr = peek.getBoundingClientRect();
  const pocketR = pocket.getBoundingClientRect();
  if (pr.width < 4 || pr.height < 4) return null;

  return {
    programId,
    left: pr.left,
    top: pr.top,
    width: pr.width,
    height: pr.height,
    liftNeeded: Math.max(8, pr.bottom - pocketR.top + 12),
    lipY: pocketR.top + pocketR.height * 0.4,
  };
}

export function ProgramSlotEmpty({
  label,
  onCreate,
  disabled,
}: {
  label?: string;
  onCreate?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn('relative w-full overflow-visible opacity-55', POCKET_H)}>
      <PocketBack
        className="pointer-events-none absolute inset-0 z-0 opacity-60"
        style={{ filter: POCKET_BACK_FILTER }}
      />
      <PocketFront
        className="pointer-events-none absolute inset-0 z-[2] opacity-70"
        style={{ filter: POCKET_FRONT_FILTER }}
      />
      <div className="absolute inset-0 z-[1] flex items-center justify-center">
        {onCreate ? (
          <button
            type="button"
            onClick={onCreate}
            disabled={disabled}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full',
              'text-zinc-400/70 transition',
              'hover:bg-zinc-800/40 hover:text-zinc-200',
              'disabled:opacity-30',
            )}
            aria-label={label ?? 'Agregar programa'}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
          </button>
        ) : (
          <span className="text-xs text-zinc-500">{label ?? 'Ranura libre'}</span>
        )}
      </div>
    </div>
  );
}
