import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useVectorizacionStore } from '@/lib/state/vectorizacion.store';
import { isAcceptedImageFile, sourceFromFile } from '@/lib/vectorizacion/imageSource';
import { buildPrep } from '@/lib/vectorizacion/buildPrep';
import { packPrepared, runVectorizacion } from '@/lib/vectorizacion/runVectorizacion';
import { downloadBlob, zipDownloadName, zipVectorResults } from '@/lib/vectorizacion/zipResults';
import { LoteDropzone } from './LoteDropzone';
import { LoteImageCard } from './LoteImageCard';
import { SourceCropEditor } from '../shared/SourceCropEditor';
import { SheetPreview } from '../shared/SheetPreview';
import { ProgresoHojas } from '../shared/ProgresoHojas';
import { VectorResultCard } from '../shared/VectorResultCard';

export function LoteTab() {
  const { toast } = useToast();
  const store = useVectorizacionStore();
  const [cropId, setCropId] = useState<string | null>(null);

  const images = useMemo(
    () => Object.values(store.prepared).filter((img) => !img.selloId),
    [store.prepared],
  );
  const sheets = packPrepared(images);
  const byId = new Map(images.map((img) => [img.id, img]));

  const addFiles = useCallback(
    async (files: File[]) => {
      const rejected = files.filter((file) => !isAcceptedImageFile(file));
      if (rejected.length) {
        toast({
          title: 'Archivos no válidos',
          description: rejected.map((file) => file.name).join(', '),
          variant: 'destructive',
        });
      }
      for (const file of files.filter(isAcceptedImageFile)) {
        const source = await sourceFromFile(file);
        store.putSource(source);
        store.putPrepared(
          buildPrep(source, { cropPaddingPct: store.cropPaddingPct, cleanLevels: store.cleanLevels }),
        );
      }
    },
    [store, toast],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (store.tab !== 'lote') return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length) {
        event.preventDefault();
        void addFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles, store.tab]);

  const run = async () => {
    store.setRunning(true);
    store.clearRun();
    try {
      const outcome = await runVectorizacion({
        images,
        mode: store.mode,
        upscale: store.maximizeResolution,
        onProgress: store.setProgress,
      });
      store.setResults(outcome.results);
      const ok = outcome.results.filter((r) => r.svg);
      if (ok.length) {
        const zip = await zipVectorResults(ok);
        downloadBlob(zip, zipDownloadName());
      }
    } finally {
      store.setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <LoteDropzone
        onFiles={(files) => void addFiles(files)}
        label="Arrastrá, pegá (Ctrl+V) o hacé click"
        hint="PNG, JPG, WEBP, GIF, BMP o TIFF"
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {images.map((image) => (
          <LoteImageCard
            key={image.id}
            image={image}
            onCrop={() => setCropId(image.id)}
            onRemove={() => store.removeLocal(image.id)}
          />
        ))}
      </div>
      {sheets.length ? <SheetPreview sheets={sheets} images={byId} /> : null}
      {store.running ? <ProgresoHojas sheets={store.progress} /> : null}
      <Button type="button" disabled={!images.length || store.running} onClick={() => void run()}>
        {store.mode === 'test' ? 'Probar lote (gratis)' : `Vectorizar lote (${sheets.length} créditos)`}
      </Button>
      {store.results.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {store.results.map((result) => (
            <VectorResultCard
              key={result.id}
              result={result}
              beforeUrl={store.prepared[result.id]?.previewDataUrl}
            />
          ))}
        </div>
      ) : null}
      <SourceCropEditor sourceId={cropId} onClose={() => setCropId(null)} />
    </div>
  );
}
