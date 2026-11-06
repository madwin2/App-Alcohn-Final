import { useRef, useState } from 'react';
import { Download, FileType2, Loader2, Trash2, Upload } from 'lucide-react';
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  BASE_FILE_ACCEPT,
  baseFileRejection,
  deleteDisplayedProductionBase,
  uploadProductionBase,
} from '../baseFileActions';

interface CellArchivoBaseProps {
  item: ProductionItem;
  onUpdateItem?: (itemId: string, updates: Partial<ProductionItem>) => Promise<ProductionItem>;
}

export function CellArchivoBase({ item, onUpdateItem }: CellArchivoBaseProps) {
  const { showPreviews } = useProductionStore();
  const { toast } = useToast();
  const { preview, openPreview, closePreview } = useImagePreviewLightbox();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasFile = item.files?.baseUrl;
  const baseFileKind =
    hasFile && typeof hasFile === 'string' ? storageFileKindFromUrl(hasFile) : null;
  const showFileIcon =
    baseFileKind !== null && isNonThumbnailStorageKind(baseFileKind);
  const canUpload = Boolean(onUpdateItem);

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

  const openPicker = () => {
    if (!canUpload || uploading) return;
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUpdateItem) return;

    const rejection = baseFileRejection(file);
    if (rejection) {
      toast({
        title: 'Tipo de archivo no válido',
        description: rejection,
        variant: 'destructive',
      });
      return;
    }

    const hadVector = Boolean(item.files?.vectorUrl);
    setUploading(true);
    try {
      const fileUrl = await uploadProductionBase(item, file);
      await onUpdateItem(item.id, { files: { baseUrl: fileUrl } });
      toast({
        title: hadVector ? 'Archivo base actualizado' : 'Archivo subido',
        description: hadVector
          ? 'Se guardó el archivo nuevo y se borró el vector anterior. Hay que vectorizar de nuevo.'
          : 'El archivo base se subió correctamente',
      });
    } catch (error) {
      console.error('Error uploading base file:', error);
      toast({
        title: 'Error al subir archivo',
        description: error instanceof Error ? error.message : 'No se pudo subir el archivo base',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasFile || !onUpdateItem) return;
    try {
      await deleteDisplayedProductionBase(item);
      await onUpdateItem(item.id, { files: { baseUrl: undefined } });
      toast({
        title: 'Archivo eliminado',
        description: 'El archivo base se eliminó correctamente',
      });
    } catch (error) {
      console.error('Error deleting base file:', error);
      toast({
        title: 'Error al eliminar archivo',
        description: error instanceof Error ? error.message : 'No se pudo eliminar el archivo base',
        variant: 'destructive',
      });
    }
  };

  if (!showPreviews) {
    return null;
  }

  const fileInput = canUpload ? (
    <input
      ref={fileInputRef}
      type="file"
      accept={BASE_FILE_ACCEPT}
      onChange={(e) => void handleFileSelect(e)}
      className="hidden"
    />
  ) : null;

  const menu = (
    <ContextMenuContent onClick={(e) => e.stopPropagation()}>
      {canUpload ? (
        <ContextMenuItem onClick={openPicker}>
          <Upload className="mr-2 h-4 w-4" />
          {hasFile ? 'Reemplazar archivo' : 'Subir archivo'}
        </ContextMenuItem>
      ) : null}
      {hasFile ? (
        <ContextMenuItem onClick={() => void downloadBase()}>
          <Download className="mr-2 h-4 w-4" />
          Descargar archivo
        </ContextMenuItem>
      ) : null}
      {canUpload && hasFile ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleDelete} className="text-red-500 focus:text-red-500">
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar archivo
          </ContextMenuItem>
        </>
      ) : null}
    </ContextMenuContent>
  );

  return (
    <>
      {fileInput}
      <div className="flex h-12 w-full items-center justify-center">
        {!hasFile ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openPicker();
            }}
            disabled={!canUpload || uploading}
            title="Subir archivo base"
            className={`flex size-10 items-center justify-center rounded border-2 border-dashed border-muted-foreground/25 ${
              canUpload ? 'cursor-pointer hover:border-primary/50 transition-colors' : ''
            } ${uploading ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        ) : (
          <ContextMenu>
            <ContextMenuTrigger asChild>
              {showFileIcon ? (
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
                  onContextMenu={(e) => e.stopPropagation()}
                  className={`flex h-10 w-10 flex-col items-center justify-center rounded border border-blue-500/50 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/60 ${
                    uploading ? 'opacity-50' : ''
                  }`}
                  title={
                    baseFileKind
                      ? `${storageFileKindLabel(baseFileKind)} cargado — clic para ${baseFileKind === 'pdf' ? 'ver' : 'descargar'}; derecho para reemplazar`
                      : 'Archivo cargado'
                  }
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileType2 className="h-6 w-6" aria-hidden />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void openBasePreview();
                  }}
                  onContextMenu={(e) => e.stopPropagation()}
                  className={`relative h-10 w-10 cursor-pointer overflow-hidden rounded border bg-white hover:opacity-80 transition-opacity ${
                    uploading ? 'opacity-50' : ''
                  }`}
                  title="Clic para ver; clic derecho para reemplazar o descargar"
                >
                  {uploading ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : null}
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
            </ContextMenuTrigger>
            {menu}
          </ContextMenu>
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
