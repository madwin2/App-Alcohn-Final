import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useVectorizacionStore } from '@/lib/state/vectorizacion.store';
import { usePendientesRun } from '@/lib/vectorizacion/usePendientesRun';
import { PendienteThumb } from './PendienteThumb';
import { ThumbsRail } from './ThumbsRail';
import { SheetStage } from './SheetStage';
import { PendientesFooterBar } from './PendientesFooterBar';
import { VectorizarConfirmDialog } from './VectorizarConfirmDialog';
import { SourceCropEditor } from '../shared/SourceCropEditor';
import { SheetPreview } from '../shared/SheetPreview';

export function PendientesTab() {
  const store = useVectorizacionStore();
  const { toast } = useToast();
  const {
    loading,
    preparing,
    visibles,
    selectedSellos,
    selectedPrepared,
    sheets,
    toggle,
    run,
    load,
  } = usePendientesRun();
  const [confirm, setConfirm] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [cropId, setCropId] = useState<string | null>(null);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (store.reviewQueue.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [store.reviewQueue.length]);

  const byId = new Map(selectedPrepared.map((img) => [img.id, img]));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pb-20">
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(260px,42%)_minmax(0,1fr)] gap-6 lg:grid-rows-none lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)] lg:gap-8">
        <SheetStage selectedCount={selectedSellos.length} hojasCount={sheets.length} className="min-h-0">
          <SheetPreview sheets={sheets} images={byId} className="h-full" />
        </SheetStage>

        <ThumbsRail className="min-h-0">
          {loading ? (
            <p className="col-span-full px-2 text-xs text-muted-foreground">Cargando…</p>
          ) : null}
          {!loading && visibles.length === 0 ? (
            <p className="col-span-full px-2 text-xs text-muted-foreground">No hay pendientes.</p>
          ) : null}
          {visibles.map((sello) => (
            <PendienteThumb
              key={sello.id}
              sello={sello}
              selected={store.selectedIds.includes(sello.id)}
              prepared={store.prepared[sello.id]}
              preparing={Boolean(preparing[sello.id])}
              onToggle={(shift) => toggle(sello.id, shift)}
              onCrop={() => setCropId(sello.id)}
              onReplaced={async () => {
                store.removeLocal(sello.id);
                await load();
              }}
              onRestored={() => {
                store.removeLocal(sello.id);
                void load();
                toast({ title: 'Volvió a la imagen original' });
              }}
            />
          ))}
        </ThumbsRail>
      </div>

      <PendientesFooterBar
        sellosCount={selectedSellos.length}
        hojasCount={sheets.length}
        canRun={selectedPrepared.length > 0}
        onOpenConfirm={(nextCredits) => {
          setCredits(nextCredits);
          setConfirm(true);
        }}
      />
      <VectorizarConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        sellos={selectedSellos.length}
        hojas={sheets.length}
        credits={credits}
        mode={store.mode}
        onConfirm={() => {
          setConfirm(false);
          void run();
        }}
      />
      <SourceCropEditor sourceId={cropId} onClose={() => setCropId(null)} />
    </div>
  );
}
