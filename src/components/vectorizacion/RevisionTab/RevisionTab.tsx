import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useVectorizacionStore } from '@/lib/state/vectorizacion.store';
import { saveSelloVector } from '@/lib/vectorizacion/saveVector';
import { downloadSvg, downloadBlob, zipDownloadName, zipVectorResults } from '@/lib/vectorizacion/zipResults';
import type { ReviewItem } from '@/lib/vectorizacion/types';
import { Check, Download, Replace, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ReviewCompareDialog } from './ReviewCompareDialog';
import { ConfirmDialog } from '@/components/programas/ConfirmDialog';
import { FresaChip } from '@/components/fresa/FresaChip';
import { FresaCheckDialog } from '@/components/fresa/FresaCheckDialog';
import { chequearSvg, fresaCacheKey, type FresaReport, type FresaTarget } from '@/lib/fresa/chequeoFresa';

/** La medida con la que se va a guardar: la misma lógica que "Confirmar". */
function reviewTarget(item: ReviewItem): FresaTarget {
  const o = item.fabricationOverrideMm;
  if (o) {
    return {
      mode: 'fabricacion',
      longSideMm: Math.max(o.widthMm, o.heightMm),
      requestedWidthMm: item.requestedWidthMm,
      requestedHeightMm: item.requestedHeightMm,
      alimento: item.alimento,
    };
  }
  return {
    mode: 'pedido',
    requestedWidthMm: item.requestedWidthMm,
    requestedHeightMm: item.requestedHeightMm,
    alimento: item.alimento,
  };
}

function reviewKey(item: ReviewItem): string {
  return fresaCacheKey(item.svg, reviewTarget(item));
}

const fresaProblemas = (r: FresaReport | null | undefined) => (r ? r.groupCounts.alta + r.groupCounts.media : 0);

function ReviewCard({
  item,
  confirming,
  fresa,
  onConfirm,
  onReject,
  onChangeSvg,
}: {
  item: ReviewItem;
  confirming: boolean;
  /** Chequeo de fresa del SVG actual (null = analizando). */
  fresa: FresaReport | null;
  onConfirm: () => void;
  onReject: () => void;
  onChangeSvg: (svg: string, fabricationOverrideMm?: { widthMm: number; heightMm: number }) => void;
}) {
  const [checker, setChecker] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [fresaOpen, setFresaOpen] = useState(false);
  const [guardOpen, setGuardOpen] = useState(false);
  const problemas = fresaProblemas(fresa);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const svgUrl = `data:image/svg+xml;utf8,${encodeURIComponent(item.svg)}`;

  const pickSvg = async (file: File | undefined) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.svg') && file.type !== 'image/svg+xml') {
      toast({ title: 'Elegí un archivo .svg', variant: 'destructive' });
      return;
    }
    try {
      onChangeSvg(await file.text());
      toast({ title: 'SVG reemplazado' });
    } catch (error) {
      toast({
        title: 'No se pudo leer el SVG',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <button
        type="button"
        className="grid w-full grid-cols-2 gap-px bg-border text-left transition-opacity hover:opacity-95"
        onClick={() => setCompareOpen(true)}
        title="Ampliar para comparar con zoom"
      >
        <div className="flex aspect-square items-center justify-center bg-white p-2">
          <img src={item.beforeDataUrl} alt="" className="max-h-full max-w-full object-contain" />
        </div>
        <div
          className={cn(
            'flex aspect-square items-center justify-center p-2',
            checker
              ? 'bg-[length:16px_16px] bg-[linear-gradient(45deg,#eee_25%,transparent_25%,transparent_75%,#eee_75%),linear-gradient(45deg,#eee_25%,transparent_25%,transparent_75%,#eee_75%)] bg-[position:0_0,8px_8px]'
              : 'bg-white',
          )}
        >
          <img src={svgUrl} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      </button>
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {item.designName} — {item.clienteNombre}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <p className="text-xs text-muted-foreground">
                {(Math.max(item.requestedWidthMm, item.requestedHeightMm) / 10).toFixed(1)} ×{' '}
                {(Math.min(item.requestedWidthMm, item.requestedHeightMm) / 10).toFixed(1)} cm
              </p>
              <FresaChip report={fresa} onClick={() => setFresaOpen(true)} />
            </div>
          </div>
          <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={checker} onChange={(e) => setChecker(e.target.checked)} />
            Damero
          </label>
        </div>
        {item.mode !== 'production' ? (
          <p className="text-xs text-amber-600">Modo prueba: no se puede confirmar en pedidos.</p>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept=".svg,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            void pickSvg(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={confirming || item.mode !== 'production'}
            onClick={() => (problemas > 0 ? setGuardOpen(true) : onConfirm())}
          >
            <Check className="mr-1 size-3.5" />
            Confirmar
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onReject}>
            <X className="mr-1 size-3.5" />
            Rechazar
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setCompareOpen(true)}>
            <Search className="mr-1 size-3.5" />
            Zoom
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Replace className="mr-1 size-3.5" />
            Cambiar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => downloadSvg(item.svg, item.designName)}
          >
            <Download className="mr-1 size-3.5" />
            SVG
          </Button>
        </div>
      </div>
      <ReviewCompareDialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        title={`${item.designName} — ${item.clienteNombre}`}
        beforeUrl={item.beforeDataUrl}
        afterUrl={svgUrl}
        checker={checker}
      />
      <FresaCheckDialog
        open={fresaOpen}
        onOpenChange={setFresaOpen}
        title={`${item.designName} — ${item.clienteNombre}`}
        svgText={item.svg}
        target={reviewTarget(item)}
        downloadName={item.designName}
        onApply={(svg, _fix, opts) => {
          onChangeSvg(svg, opts.scaledUp ? opts.fabricationMm : undefined);
          toast({
            title: opts.scaledUp ? 'Vector corregido y agrandado' : 'Vector corregido',
            description: opts.scaledUp
              ? `Se guarda con ${opts.fabricationMm.widthMm.toFixed(1).replace('.', ',')} × ${opts.fabricationMm.heightMm
                  .toFixed(1)
                  .replace('.', ',')} mm cuando lo confirmás.`
              : 'Se guarda en el pedido cuando lo confirmás.',
          });
        }}
        applyLabel="Usar el corregido"
        applyHint="Reemplaza el vector en revisión. Se guarda en el pedido cuando apretás Confirmar."
      />
      <ConfirmDialog
        open={guardOpen}
        onOpenChange={setGuardOpen}
        title="La fresa no llega en todo el diseño"
        description={`Hay ${problemas} lugar${problemas === 1 ? '' : 'es'} donde la fresa no llega a la profundidad mínima. Podés revisarlo y corregirlo antes, o confirmarlo igual.`}
        cancelLabel="Revisar"
        confirmLabel="Confirmar igual"
        onCancel={() => setFresaOpen(true)}
        onConfirm={onConfirm}
      />
    </div>
  );
}

export function RevisionTab() {
  const store = useVectorizacionStore();
  const { toast } = useToast();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [fresaReports, setFresaReports] = useState<Record<string, FresaReport>>({});
  const [bulkGuard, setBulkGuard] = useState<{ ok: ReviewItem[]; withIssues: ReviewItem[] } | null>(null);

  // Clave por ítem (hash del SVG + medida): se calcula una vez por cambio de la cola.
  const fresaKeys = useMemo(
    () => new Map(store.reviewQueue.map((item) => [item.id, reviewKey(item)])),
    [store.reviewQueue],
  );

  // Chequeo de fresa de toda la cola (en segundo plano, cacheado por contenido).
  useEffect(() => {
    let alive = true;
    for (const item of store.reviewQueue) {
      const key = fresaKeys.get(item.id) ?? reviewKey(item);
      void chequearSvg(item.svg, reviewTarget(item)).then((r) => {
        if (alive) setFresaReports((prev) => (prev[key] === r ? prev : { ...prev, [key]: r }));
      });
    }
    return () => {
      alive = false;
    };
  }, [store.reviewQueue, fresaKeys]);

  const fresaFor = (item: ReviewItem): FresaReport | null => fresaReports[fresaKeys.get(item.id) ?? ''] ?? null;
  const fresaResumen = useMemo(() => {
    let conProblemas = 0;
    let analizados = 0;
    let errores = 0;
    for (const item of store.reviewQueue) {
      const r = fresaReports[fresaKeys.get(item.id) ?? ''];
      if (!r) continue;
      analizados++;
      if (r.status === 'error') errores++;
      else if (fresaProblemas(r) > 0) conProblemas++;
    }
    return { conProblemas, analizados, errores };
  }, [store.reviewQueue, fresaReports, fresaKeys]);

  const confirmOne = async (item: ReviewItem) => {
    setConfirmingId(item.id);
    try {
      const saved = await saveSelloVector({
        selloId: item.selloId,
        orderId: item.orderId,
        designName: item.designName,
        svgText: item.svg,
        requestedWidthMm: item.requestedWidthMm,
        requestedHeightMm: item.requestedHeightMm,
        mode: item.mode,
        fabricationOverrideMm: item.fabricationOverrideMm,
      });
      store.removeReview(item.id);
      store.removeLocal(item.selloId);
      if (saved.needsReview) {
        store.setFabricationReviews([
          ...useVectorizacionStore.getState().fabricationReviews,
          {
            selloId: item.selloId,
            fileName: saved.fileName,
            previewUrl: saved.url,
            requestedWidthMm: item.requestedWidthMm,
            requestedHeightMm: item.requestedHeightMm,
            resolution: saved.resolution,
            svgAspectRatio: saved.svgAspectRatio,
          },
        ]);
      }
    } catch (error) {
      toast({
        title: 'No se pudo confirmar',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setConfirmingId(null);
    }
  };

  const confirmItems = async (items: ReviewItem[]) => {
    for (const item of items) {
      if (item.mode !== 'production') continue;
      if (!useVectorizacionStore.getState().reviewQueue.some((r) => r.id === item.id)) continue;
      await confirmOne(item);
    }
  };

  const confirmAll = async () => {
    const items = store.reviewQueue.filter((i) => i.mode === 'production');
    const reports = await Promise.all(items.map((i) => chequearSvg(i.svg, reviewTarget(i))));
    const withIssues = items.filter((_, k) => fresaProblemas(reports[k]) > 0);
    if (withIssues.length) {
      setBulkGuard({ ok: items.filter((i) => !withIssues.includes(i)), withIssues });
      return;
    }
    await confirmItems(items);
  };

  const downloadAll = async () => {
    const zip = await zipVectorResults(
      store.reviewQueue.map((item) => ({
        id: item.id,
        name: item.designName,
        svg: item.svg,
        selloId: item.selloId,
        orderId: item.orderId,
      })),
    );
    downloadBlob(zip, zipDownloadName());
  };

  if (!store.reviewQueue.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay vectores pendientes de revisión. Cuando vectorices pedidos, aparecen acá para confirmar o rechazar.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-sm">
            {store.reviewQueue.length} en revisión — confirmá antes de que entren a un programa.
          </p>
          {fresaResumen.conProblemas > 0 ? (
            <p className="text-xs text-rose-700 dark:text-rose-300">
              {fresaResumen.conProblemas} con lugares donde la fresa no llega: tocá el chip «Fresa» para ver y
              corregir.
            </p>
          ) : fresaResumen.analizados === store.reviewQueue.length && fresaResumen.errores > 0 ? (
            <p className="text-xs text-muted-foreground">
              {fresaResumen.errores} no se pudieron chequear; en el resto la fresa llega bien.
            </p>
          ) : fresaResumen.analizados === store.reviewQueue.length ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">La fresa llega bien en todos.</p>
          ) : (
            <p className="text-xs text-muted-foreground">Chequeando la fresa…</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void downloadAll()}>
            Descargar todos
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={store.reviewQueue.every((i) => i.mode !== 'production')}
            onClick={() => void confirmAll()}
          >
            Confirmar todos
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {store.reviewQueue.map((item) => (
          <ReviewCard
            key={item.id}
            item={item}
            confirming={confirmingId === item.id}
            fresa={fresaFor(item)}
            onConfirm={() => void confirmOne(item)}
            onReject={() => {
              store.removeReview(item.id);
              store.removeLocal(item.selloId);
            }}
            onChangeSvg={(svg, override) => store.updateReviewSvg(item.id, svg, override)}
          />
        ))}
      </div>
      <Dialog open={Boolean(bulkGuard)} onOpenChange={(o) => !o && setBulkGuard(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Hay vectores donde la fresa no llega</DialogTitle>
            <DialogDescription>
              {bulkGuard?.withIssues.length} de {(bulkGuard?.ok.length ?? 0) + (bulkGuard?.withIssues.length ?? 0)}{' '}
              tienen lugares donde la fresa no llega a la profundidad mínima:{' '}
              {bulkGuard?.withIssues.map((i) => i.designName).join(', ')}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setBulkGuard(null)}>
              Cancelar
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const items = [...(bulkGuard?.ok ?? []), ...(bulkGuard?.withIssues ?? [])];
                setBulkGuard(null);
                void confirmItems(items);
              }}
            >
              Confirmar todos igual
            </Button>
            <Button
              disabled={!bulkGuard?.ok.length}
              onClick={() => {
                const items = bulkGuard?.ok ?? [];
                setBulkGuard(null);
                void confirmItems(items);
              }}
            >
              Confirmar solo los OK ({bulkGuard?.ok.length ?? 0})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
