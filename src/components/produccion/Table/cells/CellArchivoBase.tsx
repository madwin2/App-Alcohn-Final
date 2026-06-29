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

interface CellArchivoBaseProps {
  item: ProductionItem;
}

export function CellArchivoBase({ item }: CellArchivoBaseProps) {
  const { showPreviews } = useProductionStore();
  const { preview, openPreview, closePreview } = useImagePreviewLightbox();
  
  const hasFile = item.files?.baseUrl;
  const baseFileKind =
    hasFile && typeof hasFile === 'string' ? storageFileKindFromUrl(hasFile) : null;
  const showFileIcon =
    baseFileKind !== null && isNonThumbnailStorageKind(baseFileKind);

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
          <div
            className="flex h-10 w-10 flex-col items-center justify-center rounded border border-blue-500/50 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
            title={
              baseFileKind
                ? `${storageFileKindLabel(baseFileKind)} cargado`
                : 'Archivo cargado'
            }
          >
            <FileType2 className="h-6 w-6" aria-hidden />
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void (async () => {
                try {
                  const src = await resolveStorageDisplayUrl(hasFile);
                  openPreview(src, 'Archivo base');
                } catch {
                  openPreview(hasFile, 'Archivo base');
                }
              })();
            }}
            className="w-10 h-10 rounded border overflow-hidden bg-white relative cursor-pointer hover:opacity-80 transition-opacity"
          >
            <StorageUrlImage
              url={hasFile}
              alt="Base"
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
