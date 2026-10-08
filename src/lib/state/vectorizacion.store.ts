import { create } from 'zustand';
import type {
  NormalizedCrop,
  PreparedImage,
  ReviewItem,
  SheetProgress,
  SourceImage,
  VectorResult,
} from '@/lib/vectorizacion/types';
import type { VectorizeMode } from '@/lib/vectorizacion/vectorizerPreset';
import { clampSheetScale } from '@/lib/vectorizacion/sheetPacking';
import { saveReviewQueue } from '@/lib/vectorizacion/reviewQueuePersist';
import { dedupeReviewItems, mergeReviewItems } from '@/lib/vectorizacion/reviewQueueDedupe';

interface VectorizacionStore {
  tab: 'pedidos' | 'lote' | 'asignar' | 'revision';
  includeRehacerPrioridad: boolean;
  cropPaddingPct: number;
  maximizeResolution: boolean;
  cleanLevels: boolean;
  mode: VectorizeMode;
  selectedIds: string[];
  /** Escala en la hoja por imagen (1 = tamaño preparado; solo ≤1). */
  sheetScales: Record<string, number>;
  sources: Record<string, SourceImage>;
  prepared: Record<string, PreparedImage>;
  crops: Record<string, NormalizedCrop>;
  running: boolean;
  progress: SheetProgress[];
  results: VectorResult[];
  reviewQueue: ReviewItem[];
  /** True después de intentar hidratar desde IndexedDB (éxito o vacío). */
  reviewQueueHydrated: boolean;
  fabricationReviews: Array<{
    selloId: string;
    fileName: string;
    previewUrl: string;
    requestedWidthMm: number;
    requestedHeightMm: number;
    resolution: import('@/lib/programas/fabricationSize').FabricationSizeResolution;
    svgAspectRatio: number | null;
  }>;
  setTab: (tab: VectorizacionStore['tab']) => void;
  setIncludeRehacerPrioridad: (value: boolean) => void;
  setCropPaddingPct: (value: number) => void;
  setMaximizeResolution: (value: boolean) => void;
  setCleanLevels: (value: boolean) => void;
  setMode: (mode: VectorizeMode) => void;
  setSelectedIds: (ids: string[]) => void;
  toggleSelected: (id: string, rangeIds?: string[]) => void;
  setSheetScale: (id: string, scale: number) => void;
  putSource: (source: SourceImage) => void;
  putPrepared: (prepared: PreparedImage) => void;
  setCrop: (id: string, crop: NormalizedCrop) => void;
  removeLocal: (id: string) => void;
  setRunning: (running: boolean) => void;
  setProgress: (progress: SheetProgress[]) => void;
  setResults: (results: VectorResult[]) => void;
  pushReviews: (items: ReviewItem[]) => void;
  updateReviewSvg: (id: string, svg: string) => void;
  removeReview: (id: string) => void;
  /** Carga inicial desde IndexedDB; fusiona con la cola en memoria (la sesión gana en conflictos). */
  hydrateReviewQueue: (items: ReviewItem[]) => void;
  setFabricationReviews: (items: VectorizacionStore['fabricationReviews']) => void;
  clearRun: () => void;
}

function closeBitmap(source?: SourceImage) {
  try {
    source?.bitmap?.close?.();
  } catch {
    // ImageBitmap ya cerrado
  }
}

const REVIEW_CHANNEL = 'alcohn-vectorizacion-review';
const reviewChannel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(REVIEW_CHANNEL) : null;

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersistReviewQueue(getQueue: () => ReviewItem[]) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const queue = getQueue();
    void saveReviewQueue(queue);
    reviewChannel?.postMessage({ type: 'queue', items: queue });
  }, 200);
}

export const useVectorizacionStore = create<VectorizacionStore>((set, get) => ({
  tab: 'pedidos',
  includeRehacerPrioridad: false,
  cropPaddingPct: 0.02,
  maximizeResolution: true,
  cleanLevels: true,
  mode: 'production',
  selectedIds: [],
  sheetScales: {},
  sources: {},
  prepared: {},
  crops: {},
  running: false,
  progress: [],
  results: [],
  reviewQueue: [],
  reviewQueueHydrated: false,
  fabricationReviews: [],
  setTab: (tab) => set({ tab }),
  setIncludeRehacerPrioridad: (includeRehacerPrioridad) => set({ includeRehacerPrioridad }),
  setCropPaddingPct: (cropPaddingPct) => set({ cropPaddingPct }),
  setMaximizeResolution: (maximizeResolution) => set({ maximizeResolution }),
  setCleanLevels: (cleanLevels) => set({ cleanLevels }),
  setMode: (mode) => set({ mode }),
  setSelectedIds: (selectedIds) => {
    const { sheetScales } = get();
    const keep = new Set(selectedIds);
    const nextScales = { ...sheetScales };
    for (const key of Object.keys(nextScales)) {
      if (!keep.has(key)) delete nextScales[key];
    }
    set({ selectedIds, sheetScales: nextScales });
  },
  toggleSelected: (id, rangeIds) => {
    const { selectedIds, sheetScales } = get();
    if (rangeIds?.length) {
      set({ selectedIds: [...new Set([...selectedIds, ...rangeIds])] });
      return;
    }
    if (selectedIds.includes(id)) {
      const nextScales = { ...sheetScales };
      delete nextScales[id];
      set({
        selectedIds: selectedIds.filter((item) => item !== id),
        sheetScales: nextScales,
      });
      return;
    }
    set({ selectedIds: [...selectedIds, id] });
  },
  setSheetScale: (id, scale) => {
    const next = clampSheetScale(scale);
    const { sheetScales } = get();
    if (next >= 1) {
      if (!(id in sheetScales)) return;
      const copy = { ...sheetScales };
      delete copy[id];
      set({ sheetScales: copy });
      return;
    }
    set({ sheetScales: { ...sheetScales, [id]: next } });
  },
  putSource: (source) => {
    const prev = get().sources[source.id];
    if (prev && prev.bitmap !== source.bitmap) closeBitmap(prev);
    set({ sources: { ...get().sources, [source.id]: source } });
  },
  putPrepared: (prepared) => set({ prepared: { ...get().prepared, [prepared.id]: prepared } }),
  setCrop: (id, crop) => set({ crops: { ...get().crops, [id]: crop } }),
  removeLocal: (id) => {
    const { sources, prepared, crops, sheetScales, selectedIds, results } = get();
    closeBitmap(sources[id]);
    const nextSources = { ...sources };
    const nextPrepared = { ...prepared };
    const nextCrops = { ...crops };
    const nextScales = { ...sheetScales };
    delete nextSources[id];
    delete nextPrepared[id];
    delete nextCrops[id];
    delete nextScales[id];
    set({
      sources: nextSources,
      prepared: nextPrepared,
      crops: nextCrops,
      sheetScales: nextScales,
      selectedIds: selectedIds.filter((item) => item !== id),
      results: results.filter((item) => item.id !== id),
    });
  },
  setRunning: (running) => set({ running }),
  setProgress: (progress) => set({ progress }),
  setResults: (results) => set({ results }),
  pushReviews: (items) => {
    const { queue, replaced } = mergeReviewItems(get().reviewQueue, items);
    if (replaced.length > 0) {
      console.warn('[vectorizacion] Sello ya estaba en Revisión, se reemplazó:', replaced);
    }
    set({ reviewQueue: queue });
    schedulePersistReviewQueue(() => get().reviewQueue);
  },
  updateReviewSvg: (id, svg) => {
    set({
      reviewQueue: get().reviewQueue.map((item) => (item.id === id ? { ...item, svg } : item)),
    });
    schedulePersistReviewQueue(() => get().reviewQueue);
  },
  removeReview: (id) => {
    set({ reviewQueue: get().reviewQueue.filter((item) => item.id !== id) });
    schedulePersistReviewQueue(() => get().reviewQueue);
  },
  hydrateReviewQueue: (items) => {
    const current = get().reviewQueue;
    if (!current.length) {
      const deduped = dedupeReviewItems(items);
      set({ reviewQueue: deduped, reviewQueueHydrated: true });
      if (deduped.length !== items.length) {
        schedulePersistReviewQueue(() => get().reviewQueue);
      }
      return;
    }
    // Sesión en curso gana sobre IndexedDB.
    const { queue } = mergeReviewItems(items, current);
    set({ reviewQueue: queue, reviewQueueHydrated: true });
    if (queue.length !== current.length) {
      schedulePersistReviewQueue(() => get().reviewQueue);
    }
  },
  setFabricationReviews: (fabricationReviews) => set({ fabricationReviews }),
  clearRun: () => set({ progress: [], results: [] }),
}));

reviewChannel?.addEventListener('message', (event: MessageEvent) => {
  if (event.data?.type !== 'queue' || !Array.isArray(event.data.items)) return;
  useVectorizacionStore.setState({
    reviewQueue: dedupeReviewItems(event.data.items as ReviewItem[]),
    reviewQueueHydrated: true,
  });
});
