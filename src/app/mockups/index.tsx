'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Download, Plus, Search, X } from 'lucide-react';
import { AppMain } from '@/components/layout/AppMain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils/cn';
import { downloadMockupAsset, resolveMockupStorageRef } from '@/lib/utils/mockupStorage';
import { listMockupSolicitudes, type MockupSolicitudRow } from '@/lib/supabase/services/mockupSolicitudes.service';
import { MockupSlotCard, type MockupSlotHandle } from './MockupSlotCard';
import { MockupStorageImage } from './MockupStorageImage';
import {
  MOCKUP_STRIP_SHEET_MS,
  StripCardAtmosphere,
  stripFadeKindForPage,
} from './StripCardAtmosphere';
import { LS_ALT_MEDIDAS } from './mockupPageShared';
import { compactMockupSlotStorageAfterClose, MOCKUP_PAGE_SLOT_COUNT_KEY } from './mockupSlotDraft';

const SLOT_TITLES = ['Creación 1', 'Creación 2', 'Creación 3', 'Creación 4'] as const;
const MAX_MOCKUP_SLOTS = 4;

const WHEEL_COOLDOWN_MS = 750;

const MOCKUPS_SHEET_TWEEN =
  'transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform';

function readInitialSlotCount(): number {
  if (typeof window === 'undefined') return 1;
  try {
    const n = Number(localStorage.getItem(MOCKUP_PAGE_SLOT_COUNT_KEY));
    if (Number.isFinite(n) && n >= 1 && n <= MAX_MOCKUP_SLOTS) return n;
  } catch {
    /* ignore */
  }
  return 1;
}

type MockupThumbKind = 'mockup_cuero' | 'mockup_madera' | 'optimized' | 'base';

function thumbKind(item: MockupSolicitudRow): MockupThumbKind | null {
  if (resolveMockupStorageRef(item, 'mockup_cuero')) return 'mockup_cuero';
  if (resolveMockupStorageRef(item, 'mockup_madera')) return 'mockup_madera';
  if (resolveMockupStorageRef(item, 'optimized')) return 'optimized';
  if (resolveMockupStorageRef(item, 'base')) return 'base';
  return null;
}

function optimizedDownloadFilename(item: MockupSolicitudRow): string {
  const slug = (item.nombre_slug || item.nombre_muestra || `muestra-${item.id.slice(0, 8)}`)
    .trim()
    .replace(/[^\w.-]+/g, '_');
  return `${slug}_optimizado.png`;
}

function hasOptimizedAsset(item: MockupSolicitudRow): boolean {
  return Boolean(resolveMockupStorageRef(item, 'optimized'));
}

function hasBaseAsset(item: MockupSolicitudRow): boolean {
  return Boolean(resolveMockupStorageRef(item, 'base'));
}

function baseDownloadFilename(item: MockupSolicitudRow): string {
  const slug = (item.nombre_slug || item.nombre_muestra || `muestra-${item.id.slice(0, 8)}`)
    .trim()
    .replace(/[^\w.-]+/g, '_');
  const ext = item.archivo_base_path?.split('.').pop()?.toLowerCase() || 'png';
  return `${slug}_original.${ext}`;
}

async function downloadOptimizedMockupFile(item: MockupSolicitudRow): Promise<void> {
  await downloadMockupAsset(item, 'optimized', optimizedDownloadFilename(item));
}

async function downloadBaseMockupFile(item: MockupSolicitudRow): Promise<void> {
  await downloadMockupAsset(item, 'base', baseDownloadFilename(item));
}

function HistoryItemCell({ item }: { item: MockupSolicitudRow }) {
  const { toast } = useToast();
  const thumb = thumbKind(item);
  const canDownloadOptimized = hasOptimizedAsset(item);
  const canDownloadBase = hasBaseAsset(item);
  const name = item.nombre_muestra || item.nombre_slug || 'Sin nombre';
  const phone = item.whatsapp?.trim() || null;
  const dateStr = new Date(item.created_at).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleDownloadOptimized = async () => {
    if (!canDownloadOptimized) {
      toast({
        title: 'Sin archivo optimizado',
        description: 'Esta muestra no tiene imagen optimizada guardada.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await downloadOptimizedMockupFile(item);
      toast({
        title: 'Descarga iniciada',
        description: 'Se está descargando el archivo optimizado.',
      });
    } catch (error) {
      toast({
        title: 'Error al descargar',
        description: error instanceof Error ? error.message : 'No se pudo descargar el archivo optimizado',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadBase = async () => {
    if (!canDownloadBase) {
      toast({
        title: 'Sin archivo base',
        description: 'Esta muestra no tiene logo original guardado.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await downloadBaseMockupFile(item);
      toast({
        title: 'Descarga iniciada',
        description: 'Se está descargando el archivo base.',
      });
    } catch (error) {
      toast({
        title: 'Error al descargar',
        description: error instanceof Error ? error.message : 'No se pudo descargar el archivo base',
        variant: 'destructive',
      });
    }
  };

  const shell = (
    <div className="relative w-full min-w-0 max-w-full aspect-[4/3] overflow-hidden rounded-3xl bg-muted/25 shadow-[0_14px_44px_-14px_rgba(0,0,0,0.55)]">
      {thumb ? (
        <MockupStorageImage
          row={item}
          kind={thumb}
          alt=""
          className="relative z-0 block h-full w-full object-contain object-center transition-transform duration-300 ease-out group-hover:[transform:scale(1,1.03)]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted/45 text-[10px] text-muted-foreground">
          Sin vista previa
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/88 via-black/48 to-transparent px-3 pb-2.5 pt-12">
        <p className="truncate text-[11px] font-semibold leading-tight tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)] sm:text-xs">
          {name}
        </p>
        <p className="truncate text-[10px] text-white/90 drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">{phone ?? 'Sin teléfono'}</p>
        <p className="text-[9px] tabular-nums text-white/78 drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)] sm:text-[10px]">{dateStr}</p>
      </div>
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          title="Clic derecho: descargar archivos"
          className={cn(
            'group block w-full min-w-0 max-w-full rounded-3xl outline-none [-webkit-tap-highlight-color:transparent] ring-offset-0 focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-0',
          )}
        >
          {shell}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="z-[200]">
        <ContextMenuItem
          disabled={!canDownloadBase}
          onSelect={() => void handleDownloadBase()}
        >
          <Download className="mr-2 h-4 w-4" aria-hidden />
          Descargar archivo base
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!canDownloadOptimized}
          onSelect={() => void handleDownloadOptimized()}
        >
          <Download className="mr-2 h-4 w-4" aria-hidden />
          Descargar archivo optimizado
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export default function MockupsPage() {
  const [history, setHistory] = useState<MockupSolicitudRow[]>([]);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [slotCount, setSlotCount] = useState(readInitialSlotCount);

  /** 0 = carril en página de creaciones. 1 = carril en historial (misma transición vertical que entre páginas de muestras). */
  const [tanda, setTanda] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyQuery, setHistoryQuery] = useState('');
  const [slotsPerPage, setSlotsPerPage] = useState(12);
  const [historyGridCols, setHistoryGridCols] = useState(6);
  const [historyGridRows, setHistoryGridRows] = useState(2);
  const [historyPagePx, setHistoryPagePx] = useState(400);

  const slotRefs = useRef<(MockupSlotHandle | null)[]>([null, null, null, null]);
  const historyViewportRef = useRef<HTMLDivElement>(null);
  const wheelCooldownRef = useRef(false);

  const slotRefCallbacks = useMemo(
    () =>
      [0, 1, 2, 3].map(
        (_, i) =>
          (instance: MockupSlotHandle | null) => {
            slotRefs.current[i] = instance;
          },
      ),
    [],
  );

  const refreshHistory = useCallback(async () => {
    const { data, error } = await listMockupSolicitudes(180);
    if (error) {
      console.warn(error);
      return;
    }
    setHistory(data);
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    try {
      localStorage.setItem(MOCKUP_PAGE_SLOT_COUNT_KEY, String(slotCount));
    } catch {
      /* ignore */
    }
  }, [slotCount]);

  const closeCreationSlot = useCallback(
    (index: number) => {
      if (slotCount <= 1) return;
      compactMockupSlotStorageAfterClose(index, slotCount);
      setSlotCount((c) => c - 1);
      setHoveredSlot(null);
    },
    [slotCount],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            if (hoveredSlot === null) return;
            const target = slotRefs.current[hoveredSlot];
            target?.acceptFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [hoveredSlot]);

  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter((item) => {
      const name = (item.nombre_muestra || item.nombre_slug || '').toLowerCase();
      const wa = (item.whatsapp || '').toLowerCase();
      return name.includes(q) || wa.includes(q) || item.id.toLowerCase().includes(q);
    });
  }, [history, historyQuery]);

  const historyChunks = useMemo(() => {
    const n = Math.max(slotsPerPage, 1);
    const out: MockupSolicitudRow[][] = [];
    for (let i = 0; i < filteredHistory.length; i += n) {
      out.push(filteredHistory.slice(i, i + n));
    }
    return out;
  }, [filteredHistory, slotsPerPage]);

  /** Páginas del carril bajo “Creaciones”: vacío sin datos, vacío por búsqueda, o grillas por chunk. */
  const historyStripPages = useMemo(() => {
    if (filteredHistory.length === 0) {
      return [{ kind: 'empty' as const, message: 'No hay solicitudes guardadas todavía.' }];
    }
    if (historyChunks.length === 0) {
      return [{ kind: 'empty' as const, message: 'Nada coincide con la búsqueda.' }];
    }
    return historyChunks.map((chunk) => ({ kind: 'grid' as const, chunk }));
  }, [filteredHistory.length, historyChunks]);

  const totalPages = Math.max(1, historyStripPages.length);

  const stripOffsetIndex = tanda === 0 ? 0 : 1 + historyPage;

  const prevStripOffsetRef = useRef(stripOffsetIndex);
  const sheetAnimClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sheetAnim, setSheetAnim] = useState<{ from: number; to: number } | null>(null);

  useEffect(() => {
    const prev = prevStripOffsetRef.current;
    if (stripOffsetIndex === prev) return;
    if (sheetAnimClearRef.current) {
      clearTimeout(sheetAnimClearRef.current);
      sheetAnimClearRef.current = null;
    }
    setSheetAnim({ from: prev, to: stripOffsetIndex });
    prevStripOffsetRef.current = stripOffsetIndex;
    sheetAnimClearRef.current = setTimeout(() => {
      setSheetAnim(null);
      sheetAnimClearRef.current = null;
    }, MOCKUP_STRIP_SHEET_MS + 90);
  }, [stripOffsetIndex]);

  useEffect(() => {
    return () => {
      if (sheetAnimClearRef.current) {
        clearTimeout(sheetAnimClearRef.current);
        sheetAnimClearRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setHistoryPage((p) => Math.min(p, Math.max(0, totalPages - 1)));
  }, [totalPages]);

  useLayoutEffect(() => {
    const el = historyViewportRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const h = rect.height;
      const w = rect.width;
      if (h < 40 || w < 40) return;
      setHistoryPagePx(Math.max(220, Math.round(h)));

      const gapX = 12;
      const gapY = 16;
      const minColW = 100;
      const maxCols = Math.min(12, Math.max(4, Math.floor((w + gapX) / (minColW + gapX))));

      let bestCols = 6;
      let bestRows = 2;
      let bestWaste = Number.POSITIVE_INFINITY;
      let bestSlots = 12;
      let found = false;

      for (let cols = 4; cols <= maxCols; cols++) {
        const colW = (w - gapX * (cols - 1)) / cols;
        if (colW < minColW - 4) continue;
        found = true;
        const cellH = colW * (3 / 4);
        const rows = Math.max(1, Math.floor((h + gapY) / (cellH + gapY)));
        const usedH = rows * cellH + Math.max(0, rows - 1) * gapY;
        const waste = h - usedH;
        const slots = cols * rows;
        if (waste < bestWaste - 0.5 || (Math.abs(waste - bestWaste) <= 0.5 && slots > bestSlots)) {
          bestWaste = waste;
          bestCols = cols;
          bestRows = rows;
          bestSlots = slots;
        }
      }

      if (!found) {
        const cols = Math.min(6, maxCols);
        const colW = (w - gapX * (cols - 1)) / cols;
        const cellH = Math.max(64, colW * (3 / 4));
        const rows = Math.max(1, Math.floor((h + gapY) / (cellH + gapY)));
        bestCols = cols;
        bestRows = rows;
        bestSlots = cols * rows;
      }

      const slots = Math.min(180, Math.max(6, bestCols * bestRows));
      setHistoryGridCols(bestCols);
      setHistoryGridRows(bestRows);
      setSlotsPerPage(slots);
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    const t = window.setTimeout(measure, 360);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
    };
  }, [filteredHistory.length, tanda]);

  useEffect(() => {
    const bumpCooldown = () => {
      wheelCooldownRef.current = true;
      window.setTimeout(() => {
        wheelCooldownRef.current = false;
      }, WHEEL_COOLDOWN_MS);
    };

    const shouldIgnoreWheelForFocus = () => {
      const ae = document.activeElement;
      if (ae instanceof HTMLTextAreaElement) return true;
      if (ae instanceof HTMLInputElement && ae.closest('[data-mockup-history-search]')) return true;
      return false;
    };

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 5) return;
      if (shouldIgnoreWheelForFocus()) return;

      e.preventDefault();
      if (wheelCooldownRef.current) return;
      bumpCooldown();

      if (e.deltaY > 0) {
        if (tanda === 0) {
          setTanda(1);
          setHistoryPage(0);
        } else {
          setHistoryPage((p) => Math.min(p + 1, totalPages - 1));
        }
      } else {
        if (tanda === 1 && historyPage > 0) {
          setHistoryPage((p) => p - 1);
        } else if (tanda === 1) {
          setTanda(0);
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) {
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        if (wheelCooldownRef.current) return;
        bumpCooldown();
        if (tanda === 0) {
          setTanda(1);
          setHistoryPage(0);
        } else {
          setHistoryPage((p) => Math.min(p + 1, totalPages - 1));
        }
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        if (wheelCooldownRef.current) return;
        bumpCooldown();
        if (tanda === 1 && historyPage > 0) setHistoryPage((p) => p - 1);
        else if (tanda === 1) setTanda(0);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setTanda(0);
        setHistoryPage(0);
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [tanda, historyPage, totalPages]);

  return (
    <AppMain className="flex h-dvh min-h-0 flex-col overflow-hidden bg-transparent p-0">
      <main className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-transparent px-4 py-3 sm:px-6 sm:py-4 max-w-[1920px]">
        <div className="relative z-10 flex min-h-0 flex-1 flex-col bg-transparent">
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 pb-3">
            <div className="min-w-0 space-y-0.5 rounded-lg bg-black/25 px-1 py-0.5 backdrop-blur-md sm:bg-black/20">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Generador de Mockups</h1>
              <p
                className="text-xs text-muted-foreground sm:text-sm max-w-2xl line-clamp-2"
                title={`Rodá hacia abajo (o flechas) para el historial. Medidas: ${LS_ALT_MEDIDAS}.`}
              >
                Rodá hacia abajo o &quot;Historial&quot;: mismo deslizamiento vertical que entre páginas de muestras.
                Medidas: {LS_ALT_MEDIDAS}.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setTanda(1);
                setHistoryPage(0);
              }}
            >
              Historial
            </Button>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              className={cn(
                'flex shrink-0 items-end justify-between gap-2 px-0.5 pb-2 pt-1 transition-opacity duration-300 ease-out',
                tanda === 0 ? 'pointer-events-none opacity-0' : 'opacity-100',
              )}
              aria-hidden={tanda === 0}
            >
              <h2 className="text-sm font-semibold tracking-tight text-foreground/90">Historial</h2>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                Página {historyPage + 1} de {totalPages}
                {filteredHistory.length > 0 ? (
                  <span className="text-muted-foreground/70"> · {filteredHistory.length} muestras</span>
                ) : null}
              </p>
            </div>

            <div ref={historyViewportRef} className="relative min-h-0 flex-1 overflow-hidden px-0.5 pb-28">
              <div
                className={cn('flex flex-col', MOCKUPS_SHEET_TWEEN)}
                style={{
                  transform: `translateY(-${stripOffsetIndex * historyPagePx}px)`,
                }}
              >
                <div
                  className={cn('shrink-0', stripOffsetIndex !== 0 && 'pointer-events-none')}
                  style={{ height: historyPagePx }}
                  aria-hidden={stripOffsetIndex !== 0}
                >
                  <div
                    className="grid h-full min-h-0 w-full min-w-0 content-start justify-items-stretch gap-3 sm:gap-4 [grid-template-columns:repeat(1,minmax(0,1fr))] sm:[grid-template-columns:repeat(2,minmax(0,1fr))] xl:[grid-template-columns:repeat(4,minmax(0,1fr))] xl:auto-rows-[minmax(0,1fr)]"
                    onMouseLeave={() => setHoveredSlot(null)}
                  >
                    {[0, 1, 2, 3].map((i) => {
                      const title = SLOT_TITLES[i];
                      const isCard = i < slotCount;
                      const isAddCell = i === slotCount && slotCount < MAX_MOCKUP_SLOTS;
                      const creationsFade = stripFadeKindForPage(0, sheetAnim);
                      const creationsStagger = i * 22;
                      return (
                        <div
                          key={i}
                          className="group/mockup-slot relative flex min-h-0 min-w-0 w-full max-w-full rounded-2xl xl:h-full"
                          onMouseEnter={() => {
                            if (isCard) setHoveredSlot(i);
                            else setHoveredSlot(null);
                          }}
                        >
                          <StripCardAtmosphere
                            kind={creationsFade}
                            staggerMs={creationsStagger}
                            className="flex h-full min-h-0 w-full min-w-0 max-w-full rounded-2xl"
                          >
                            {isCard ? (
                              <MockupSlotCard
                                key={`mockup-slot-${i}-${slotCount}`}
                                ref={slotRefCallbacks[i]}
                                slotIndex={i}
                                title={title}
                                onHistoryRefresh={refreshHistory}
                                isPasteTarget={hoveredSlot === i}
                              />
                            ) : isAddCell ? (
                              <div className="group relative flex h-full min-h-0 w-full max-w-full items-center justify-center rounded-2xl">
                                <div
                                  className="pointer-events-none absolute inset-0 rounded-2xl bg-white/[0.06] opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100"
                                  aria-hidden
                                />
                                <button
                                  type="button"
                                  className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-white/25 bg-white/15 text-foreground shadow-lg backdrop-blur-md transition-transform hover:scale-105 active:scale-95"
                                  onClick={() => setSlotCount((c) => Math.min(MAX_MOCKUP_SLOTS, c + 1))}
                                  title={`Agregar tarjeta (máx. ${MAX_MOCKUP_SLOTS})`}
                                >
                                  <Plus className="h-6 w-6" aria-hidden />
                                </button>
                              </div>
                            ) : (
                              <div className="hidden h-full min-h-0 w-full max-w-full xl:block" aria-hidden />
                            )}
                          </StripCardAtmosphere>
                          {isCard && slotCount > 1 ? (
                            <button
                              type="button"
                              className={cn(
                                'absolute right-2 top-2 z-[35] flex h-8 w-8 items-center justify-center rounded-full',
                                'border border-border/55 bg-background/92 text-foreground shadow-md backdrop-blur-sm',
                                'pointer-events-none opacity-0 transition-opacity duration-200 ease-out',
                                'hover:bg-muted/95 active:scale-95',
                                'group-hover/mockup-slot:pointer-events-auto group-hover/mockup-slot:opacity-100',
                                'focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                              )}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                closeCreationSlot(i);
                              }}
                              title="Cerrar tarjeta"
                              aria-label={`Cerrar ${title}`}
                            >
                              <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {historyStripPages.map((page, pi) => {
                  const pageIndex = 1 + pi;
                  const active = stripOffsetIndex === pageIndex;
                  const pageFade = stripFadeKindForPage(pageIndex, sheetAnim);
                  const cols = historyGridCols;
                  const rowsThisPage =
                    page.kind === 'grid'
                      ? Math.min(historyGridRows, Math.max(1, Math.ceil(page.chunk.length / cols)))
                      : 1;
                  return (
                    <div
                      key={page.kind === 'grid' ? `g-${pi}` : `e-${page.message}`}
                      className={cn('shrink-0 px-0.5', !active && 'pointer-events-none')}
                      style={{ height: historyPagePx }}
                      aria-hidden={!active}
                    >
                      {page.kind === 'empty' ? (
                        <StripCardAtmosphere kind={pageFade} className="h-full min-h-0 rounded-lg">
                          <p className="text-sm text-muted-foreground">{page.message}</p>
                        </StripCardAtmosphere>
                      ) : (
                        <div className="h-full min-h-0 w-full overflow-x-hidden overflow-y-auto">
                          <div
                            className="grid w-full min-w-0 content-start justify-items-stretch gap-x-3 gap-y-4 sm:gap-x-3 sm:gap-y-4"
                            style={{
                              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                            }}
                          >
                            {page.chunk.map((item, idx) => {
                              const rowTop = Math.floor(idx / cols);
                              const rowFromBottom = rowsThisPage - 1 - rowTop;
                              return (
                                <StripCardAtmosphere
                                  key={item.id}
                                  variant="history"
                                  kind={pageFade}
                                  rowTop={rowTop}
                                  rowFromBottom={rowFromBottom}
                                  rowsInPage={rowsThisPage}
                                  className="w-full min-w-0 max-w-full rounded-3xl"
                                >
                                  <HistoryItemCell item={item} />
                                </StripCardAtmosphere>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div
          className={cn(
            'pointer-events-none fixed bottom-6 z-40 flex justify-center transition-opacity duration-500 ease-out',
            tanda >= 1 ? 'opacity-100' : 'opacity-0',
          )}
          style={{ left: 'max(1rem, calc(5rem + 1rem))', right: '1rem' }}
        >
          <div
            data-mockup-history-search
            className={cn(
              'flex w-full max-w-lg items-center gap-2 rounded-full border border-border/45 bg-background/48 px-3 py-2 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.45)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/38',
              tanda >= 1 ? 'pointer-events-auto' : 'pointer-events-none',
            )}
          >
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Input
              value={historyQuery}
              onChange={(e) => {
                setHistoryQuery(e.target.value);
                setHistoryPage(0);
              }}
              placeholder="Buscar por nombre, WhatsApp o ID…"
              className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              aria-label="Buscar en historial de mockups"
            />
          </div>
        </div>
      </main>
      <Toaster />
    </AppMain>
  );
}
