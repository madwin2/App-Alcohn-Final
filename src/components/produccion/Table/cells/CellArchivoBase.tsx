import { Upload, FileType2 } from 'lucide-react';
import {
  isNonThumbnailStorageKind,
  storageFileKindFromUrl,
  storageFileKindLabel,
} from '@/lib/utils/storageFileKind';
import { ProductionItem } from '@/lib/types/index';
import { useProductionStore } from '@/lib/state/production.store';
import { ImagePreviewLightbox } from '@/components/shared/ImagePreviewLightbox';
import { StorageUrlImage } from '@/components/shared/StorageUrlImage';
import { useImagePreviewLightbox } from '@/hooks/useImagePreviewLightbox';
import { resolveStorageDisplayUrl } from '@/lib/utils/storageUrlUtils';
import { downloadBaseFile, sanitizeDownloadFilename } from '@/lib/supabase/services/storage.service';
import { useToast } from '@/components/ui/use-toast';

interface CellArchivoBaseProps {
  item: ProductionItem;
}

export function CellArchivoBase({ item }: CellArchivoBaseProps) {
  const { showPreviews } = useProductionStore();
  const { toast } = useToast();
  const { preview, openPreview, closePreview } = useImagePreviewLightbox();
  
  const hasFile = item.files?.baseUrl;
  const baseFileKind =
    hasFile && typeof hasFile === 'string' ? storageFileKindFromUrl(hasFile) : null;
  const showFileIcon =
    baseFileKind !== null && isNonThumbnailStorageKind(baseFileKind);

  const openBasePreview = async () => {
    if (!hasFile || typeof hasFile !== 'string') return;
    try {
      const src = await resolveStorageDisplayUrl(hasFile, item.mockupSolicitudId);
      openPreview(src, 'Archivo base');
    } catch {
      openPreview(hasFile, 'Archivo base');
    }
  };

  const downloadBase = async () => {
    if (!hasFile || typeof hasFile !== 'string') return;
    try {
      const filename = `${sanitizeDownloadFilename(item.designName)}_archivo_base.jpg`;
      await downloadBaseFile(hasFile, filename, item.mockupSolicitudId);
      toast({ title: 'Descarga iniciada', description: 'Archivo base descargándose...' });
    } catch (error) {
      toast({
        title: 'Error al descargar',
        description: error instanceof Error ? error.message : 'No se pudo descargar el archivo base',
        variant: 'destructive',
      });
    }
  };

  if (!showPreviews) {
    return null; // No mostrar nada cuando las previsualizaciones están deshabilitadas
  }

  return (
    <>
      <div className="w-full h-12 flex items-center justify-center">
        {!hasFile ? (
          <div className="flex items-center justify-center w-10 h-10 border-2 border-dashed border-muted-foreground/25 rounded">
            <Upload className="h-4 w-4 text-muted-foreground" />
          </div>
        ) : showFileIcon ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (baseFileKind === 'pdf') {
                void openBasePreview();
                return;
              }
              void downloadBase();
            }}
            className="flex h-10 w-10 flex-col items-center justify-center rounded border border-blue-500/50 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/60"
            title={
              baseFileKind
                ? `${storageFileKindLabel(baseFileKind)} cargado — clic para ${baseFileKind === 'pdf' ? 'ver' : 'descargar'}`
                : 'Archivo cargado'
            }
          >
            <FileType2 className="h-6 w-6" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void openBasePreview();
            }}
            className="w-10 h-10 rounded border overflow-hidden bg-white relative cursor-pointer hover:opacity-80 transition-opacity"
          >
            <StorageUrlImage
              url={hasFile}
              alt="Base"
              mockupSolicitudId={item.mockupSolicitudId}
              className="h-full w-full object-cover"
              imgClassName="h-full w-full object-cover"
              fallbackClassName="absolute inset-0 flex items-center justify-center bg-muted"
            />
          </button>
        )}
      </div>
      <ImagePreviewLightbox
        src={preview?.src ?? null}
        alt={preview?.alt}
        onClose={closePreview}
      />
    </>
  );
}
