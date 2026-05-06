import { Upload, FileType2, Download } from 'lucide-react';
import { ProductionItem } from '@/lib/types/index';
import { useProductionStore } from '@/lib/state/production.store';
import { downloadFile } from '@/lib/supabase/services/storage.service';
import { useToast } from '@/components/ui/use-toast';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';

interface CellVectorProps {
  item: ProductionItem;
}

export function CellVector({ item }: CellVectorProps) {
  const { showPreviews } = useProductionStore();
  const { toast } = useToast();

  const hasFile = item.files?.vectorUrl;
  const previewUrl = item.files?.vectorPreviewUrl;
  const isEps = Boolean(hasFile?.toLowerCase().includes('.eps'));
  const epsSinPreview = Boolean(isEps && hasFile && !previewUrl);
  const displayUrl = previewUrl || (!isEps ? hasFile : undefined);

  const handleDownloadVector = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = item.files?.vectorUrl;
    if (!url) return;
    try {
      const safeName = (item.designName || 'vector').replace(/[^\w\s-]/g, '_').trim() || 'vector';
      await downloadFile(url, `${safeName}_vector.eps`);
      toast({ title: 'Descarga iniciada', description: 'Se está descargando el archivo vector.' });
    } catch (error) {
      toast({
        title: 'No se pudo descargar',
        description: error instanceof Error ? error.message : 'Error al descargar',
        variant: 'destructive',
      });
    }
  };

  if (!showPreviews) {
    if (epsSinPreview && hasFile) {
      return (
        <div className="flex h-full w-full items-center justify-center">
          <button
            type="button"
            title="EPS — clic para descargar"
            onClick={(e) => void handleDownloadVector(e)}
            className="relative flex size-10 items-center justify-center rounded border border-violet-500/60 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/40"
          >
            <FileType2 className="size-5 text-violet-700 dark:text-violet-300" />
            <Download className="absolute bottom-0.5 right-0.5 size-3 text-violet-600" aria-hidden />
          </button>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="flex h-12 w-full items-center justify-center">
      {!hasFile ? (
        <div className="flex size-10 items-center justify-center rounded border-2 border-dashed border-muted-foreground/25">
          <Upload className="h-4 w-4 text-muted-foreground" />
        </div>
      ) : epsSinPreview ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              type="button"
              title="EPS sin vista previa — clic para descargar"
              onClick={(e) => void handleDownloadVector(e)}
              className="relative flex size-10 items-center justify-center rounded border border-violet-500/60 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/40"
            >
              <FileType2 className="size-5 text-violet-700 dark:text-violet-300" />
              <Download className="absolute bottom-0.5 right-0.5 size-3 text-violet-600" aria-hidden />
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={(e) => void handleDownloadVector(e)}>
              <Download className="mr-2 h-4 w-4" />
              Descargar EPS
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button type="button" className="size-10 overflow-hidden rounded border p-0" title="Vector">
              {displayUrl ? (
                <img
                  src={displayUrl}
                  alt="Vector"
                  className={`h-full w-full ${previewUrl ? 'object-contain' : 'object-cover'}`}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : null}
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={(e) => void handleDownloadVector(e)}>
              <Download className="mr-2 h-4 w-4" />
              Descargar vector
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}
    </div>
  );
}
