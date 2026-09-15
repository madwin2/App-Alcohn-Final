import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useVectorizacionStore } from '@/lib/state/vectorizacion.store';
import { saveSelloVector } from '@/lib/vectorizacion/saveVector';
import { downloadSvg, downloadBlob, zipDownloadName, zipVectorResults } from '@/lib/vectorizacion/zipResults';
import type { ReviewItem } from '@/lib/vectorizacion/types';
import { Check, Download, Replace, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

function ReviewCard({
  item,
  confirming,
  onConfirm,
  onReject,
  onChangeSvg,
}: {
  item: ReviewItem;
  confirming: boolean;
  onConfirm: () => void;
  onReject: () => void;
  onChangeSvg: (svg: string) => void;
}) {
  const [checker, setChecker] = useState(false);
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
      <div className="grid grid-cols-2 gap-px bg-border">
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
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {item.designName} — {item.clienteNombre}
            </p>
            <p className="text-xs text-muted-foreground">
              {(item.requestedWidthMm / 10).toFixed(1)} × {(item.requestedHeightMm / 10).toFixed(1)} cm
            </p>
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
            onClick={onConfirm}
          >
            <Check className="mr-1 size-3.5" />
            Confirmar
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onReject}>
            <X className="mr-1 size-3.5" />
            Rechazar
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
    </div>
  );
}

export function RevisionTab() {
  const store = useVectorizacionStore();
  const { toast } = useToast();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

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
      });
      store.removeReview(item.id);
      store.removeLocal(item.selloId);
      if (saved.needsReview) {
        store.setFabricationReviews([
          ...store.fabricationReviews,
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

  const confirmAll = async () => {
    for (const item of [...store.reviewQueue]) {
      if (item.mode !== 'production') continue;
      await confirmOne(item);
    }
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
        <p className="text-sm">
          {store.reviewQueue.length} en revisión — confirmá antes de que entren a un programa.
        </p>
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
            onConfirm={() => void confirmOne(item)}
            onReject={() => {
              store.removeReview(item.id);
              store.removeLocal(item.selloId);
            }}
            onChangeSvg={(svg) => store.updateReviewSvg(item.id, svg)}
          />
        ))}
      </div>
    </div>
  );
}
