import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useVectorizacionStore } from '@/lib/state/vectorizacion.store';
import {
  fetchPendientes,
  filterAlreadyVectorizedSelloIds,
} from '@/lib/vectorizacion/vectorizacion.service';
import { sourceFromSello } from '@/lib/vectorizacion/imageSource';
import { buildPrep } from '@/lib/vectorizacion/buildPrep';
import { packPrepared, runVectorizacion } from '@/lib/vectorizacion/runVectorizacion';
import { baseFileUtil } from '@/lib/vectorizacion/baseFile';
import type { PendingSello, ReviewItem } from '@/lib/vectorizacion/types';

export function usePendientesRun() {
  const { toast } = useToast();
  const store = useVectorizacionStore();
  const reviewQueueHydrated = useVectorizacionStore((s) => s.reviewQueueHydrated);
  const [sellos, setSellos] = useState<PendingSello[]>([]);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState<Record<string, boolean>>({});
  const lastClick = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSellos(await fetchPendientes(store.includeRehacerPrioridad));
    } catch (error) {
      toast({
        title: 'No se pudieron cargar los pendientes',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [store.includeRehacerPrioridad, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const ensurePrepared = useCallback(
    async (sello: PendingSello) => {
      let skip = false;
      setPreparing((prev) => {
        if (prev[sello.id] || useVectorizacionStore.getState().prepared[sello.id]) {
          skip = true;
          return prev;
        }
        return { ...prev, [sello.id]: true };
      });
      if (skip) return;
      try {
        const current = useVectorizacionStore.getState();
        let source = current.sources[sello.id];
        if (!source) {
          source = await sourceFromSello({
            selloId: sello.id,
            orderId: sello.orderId,
            name: sello.designName,
            archivoBase: baseFileUtil(sello),
            mockupSolicitudId: sello.mockupSolicitudId,
          });
          current.putSource(source);
        }
        current.putPrepared(
          buildPrep(source, {
            cropPaddingPct: current.cropPaddingPct,
            cleanLevels: current.cleanLevels,
            crop: current.crops[sello.id],
          }),
        );
      } catch (error) {
        toast({
          title: `No se pudo preparar ${sello.designName}`,
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        });
      } finally {
        setPreparing((prev) => ({ ...prev, [sello.id]: false }));
      }
    },
    [toast],
  );

  const visibles = sellos.filter(
    (sello) => !store.reviewQueue.some((item) => item.selloId === sello.id),
  );

  const selectedSellos = visibles.filter((sello) => store.selectedIds.includes(sello.id));
  const selectedPrepared = selectedSellos
    .map((sello) => store.prepared[sello.id])
    .filter((img): img is NonNullable<typeof img> => Boolean(img));
  const sheets = packPrepared(selectedPrepared, store.sheetScales);

  const toggle = (id: string, shift: boolean) => {
    if (shift && lastClick.current) {
      const ids = visibles.map((sello) => sello.id);
      const a = ids.indexOf(lastClick.current);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a];
        store.toggleSelected(id, ids.slice(from, to + 1));
        ids.slice(from, to + 1).forEach((sid) => {
          const sello = visibles.find((item) => item.id === sid);
          if (sello) void ensurePrepared(sello);
        });
        lastClick.current = id;
        return;
      }
    }
    lastClick.current = id;
    const wasSelected = store.selectedIds.includes(id);
    store.toggleSelected(id);
    const sello = visibles.find((item) => item.id === id);
    if (sello && !wasSelected) void ensurePrepared(sello);
  };

  const run = async () => {
    const state = useVectorizacionStore.getState();
    if (state.running) return;
    if (!state.reviewQueueHydrated) {
      toast({
        title: 'Esperá un segundo',
        description: 'Todavía se está cargando la cola de Revisión.',
      });
      return;
    }
    const inReview = new Set(state.reviewQueue.map((item) => item.selloId));
    let candidatos = selectedSellos.filter((sello) => !inReview.has(sello.id));
    try {
      const yaVectorizados = await filterAlreadyVectorizedSelloIds(candidatos.map((s) => s.id));
      candidatos = candidatos.filter((s) => !yaVectorizados.has(s.id));
    } catch (error) {
      console.warn('[vectorizacion] No se pudo verificar estado antes de vectorizar:', error);
    }
    const omitidos = selectedSellos.length - candidatos.length;
    if (omitidos > 0) {
      toast({
        title: `${omitidos} sello(s) omitidos`,
        description: 'Ya estaban en Revisión o ya vectorizados.',
      });
    }
    const images = candidatos
      .map((sello) => state.prepared[sello.id])
      .filter((img): img is NonNullable<typeof img> => Boolean(img));
    if (!images.length) {
      store.setSelectedIds([]);
      return;
    }
    store.setRunning(true);
    store.clearRun();
    try {
      const outcome = await runVectorizacion({
        images,
        mode: store.mode,
        upscale: store.maximizeResolution,
        scales: state.sheetScales,
        onProgress: store.setProgress,
      });
      store.setResults(outcome.results.filter((r) => r.error || r.empty));

      const reviews: ReviewItem[] = [];
      for (const result of outcome.results) {
        if (!result.svg || !result.selloId) continue;
        const sello = candidatos.find((item) => item.id === result.selloId);
        const prepared = store.prepared[result.id];
        if (!sello || !prepared) continue;
        reviews.push({
          id: result.selloId,
          selloId: result.selloId,
          orderId: sello.orderId,
          designName: sello.designName,
          clienteNombre: sello.clienteNombre,
          svg: result.svg,
          beforeDataUrl: prepared.previewDataUrl,
          requestedWidthMm: sello.requestedWidthMm,
          requestedHeightMm: sello.requestedHeightMm,
          mode: store.mode,
        });
      }
      if (reviews.length) {
        store.pushReviews(reviews);
        store.setTab('revision');
        toast({
          title: `${reviews.length} vectores esperando revisión`,
          description: 'Quedan guardados en este navegador hasta que los confirmes o rechaces.',
        });
      }
      store.setSelectedIds([]);
      await load();
    } finally {
      store.setRunning(false);
    }
  };

  return {
    loading: loading || !reviewQueueHydrated,
    reviewQueueHydrated,
    preparing,
    visibles,
    selectedSellos,
    selectedPrepared,
    sheets,
    ensurePrepared,
    toggle,
    run,
    load,
    setSellos,
  };
}
