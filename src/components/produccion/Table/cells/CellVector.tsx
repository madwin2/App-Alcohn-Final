import { Upload, FileType2, Download, Loader2, Trash2, Ruler } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { storageFileKindFromUrl, storageFileKindLabel } from '@/lib/utils/storageFileKind';
import { ProductionItem } from '@/lib/types/index';
import { useProductionStore } from '@/lib/state/production.store';
import {
  deleteFile,
  downloadFile,
  generateFilePath,
  getFilePathFromUrl,
  uploadFile,
  uploadVectorFileWithPreview,
} from '@/lib/supabase/services/storage.service';
import { useToast } from '@/components/ui/use-toast';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ImagePreviewLightbox } from '@/components/shared/ImagePreviewLightbox';
import { useImagePreviewLightbox } from '@/hooks/useImagePreviewLightbox';
import { measureSvgFile } from '@/lib/utils/svgBoundingBox';
import { suggestFabricationSize, type FabricationSizeSuggestion } from '@/lib/programas/fabricationSize';
import { VectorSizeConfirmDialog } from '@/components/shared/VectorSizeConfirmDialog';

interface CellVectorProps {
  item: ProductionItem;
  onUpdateItem?: (itemId: string, updates: Partial<ProductionItem>) => Promise<ProductionItem>;
}

interface SizeDialogState {
  fileName: string;
  previewUrl?: string;
  suggestion: FabricationSizeSuggestion;
  svgAspectRatio: number | null;
}

export function CellVector({ item, onUpdateItem }: CellVectorProps) {
  const { showPreviews } = useProductionStore();
  const { toast } = useToast();
  const { preview, openPreview, closePreview } = useImagePreviewLightbox();
  const [uploading, setUploading] = useState(false);
  const [sizeDialogState, setSizeDialogState] = useState<SizeDialogState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasFile = item.files?.vectorUrl;
  const previewUrl = item.files?.vectorPreviewUrl;
  const vectorFileKind =
    hasFile && typeof hasFile === 'string' ? storageFileKindFromUrl(hasFile) : null;
  const isEps = vectorFileKind === 'eps';
  const isPdf = vectorFileKind === 'pdf';
  const isAi = vectorFileKind === 'ai';
  const previewKind =
    previewUrl && typeof previewUrl === 'string' ? storageFileKindFromUrl(previewUrl) : null;
  const previewUsableAsImage =
    Boolean(previewUrl) &&
    previewKind !== 'eps' &&
    previewKind !== 'pdf' &&
    previewKind !== 'ai';
  const epsSinPreview = Boolean(isEps && hasFile && !previewUsableAsImage);
  const archivoVectorSinMiniatura = epsSinPreview || isPdf || isAi;
  const displayUrl = archivoVectorSinMiniatura
    ? undefined
    : previewUsableAsImage
      ? previewUrl
      : !isEps && !isPdf && !isAi
        ? hasFile
        : undefined;

  const canUpload = Boolean(onUpdateItem);

  const fabricationConfirmed =
    item.fabricationWidthMm != null && item.fabricationHeightMm != null;
  const fabricationBadge = fabricationConfirmed ? (
    <span
      className="absolute top-0.5 left-0.5 z-10 rounded-full bg-emerald-500 p-0.5 text-white shadow"
      title={`Medida de fabricación confirmada: ${Number(item.fabricationWidthMm).toFixed(1)} × ${Number(item.fabricationHeightMm).toFixed(1)} mm`}
    >
      <Ruler className="size-2.5" aria-hidden />
    </span>
  ) : null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateItem) return;

    const allowedExtensions = ['.svg', '.eps', '.pdf', '.ai'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
      toast({
        title: 'Tipo de archivo no válido',
        description: 'Solo se permiten archivos SVG, EPS, PDF o AI',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const filePath = generateFilePath(item.orderId, 'vector', file.name, item.id);
      const isEpsFile = fileExtension === '.eps';

      let result: { originalUrl: string; previewUrl?: string };
      if (isEpsFile) {
        toast({
          title: 'Subiendo EPS...',
          description:
            'Intentando generar vista previa (si la API alcanza el límite, igual queda guardado para descargar).',
        });
        try {
          result = await uploadVectorFileWithPreview('vector', file, filePath);
        } catch {
          const fileUrl = await uploadFile('vector', file, filePath);
          result = { originalUrl: fileUrl };
          toast({
            title: 'EPS guardado sin preview',
            description: 'No se pudo convertir el EPS; igual podés descargarlo con el ícono o clic derecho.',
            variant: 'destructive',
          });
        }
      } else {
        const fileUrl = await uploadFile('vector', file, filePath);
        result = { originalUrl: fileUrl, previewUrl: fileUrl };
      }

      await onUpdateItem(item.id, {
        files: {
          ...item.files,
          vectorUrl: result.originalUrl,
          vectorPreviewUrl: result.previewUrl ?? result.originalUrl,
        },
        vectorizationState: 'VECTORIZADO',
      });

      toast({
        title: 'Archivo subido',
        description:
          isEpsFile && result.previewUrl
            ? 'El vector y la vista previa se subieron correctamente.'
            : isEpsFile
              ? 'El EPS quedó guardado; si no ves miniatura, descargalo con el ícono.'
              : 'El archivo vector se subió correctamente',
      });

      if (fileExtension === '.svg') {
        const measurement = await measureSvgFile(file);
        const suggestion = suggestFabricationSize(
          item.requestedWidthMm,
          item.requestedHeightMm,
          measurement?.aspectRatio ?? null,
        );
        setSizeDialogState({
          fileName: file.name,
          previewUrl: result.previewUrl ?? result.originalUrl,
          suggestion,
          svgAspectRatio: measurement?.aspectRatio ?? null,
        });
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: 'Error al subir archivo',
        description: error instanceof Error ? error.message : 'No se pudo subir el archivo',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmFabricationSize = async ({
    widthMm,
    heightMm,
  }: {
    widthMm: number;
    heightMm: number;
  }) => {
    if (!onUpdateItem) return;
    await onUpdateItem(item.id, {
      fabricationWidthMm: widthMm,
      fabricationHeightMm: heightMm,
    });
  };

  const handleClick = () => {
    if (!canUpload || uploading) return;
    fileInputRef.current?.click();
  };

  const handleDownloadVector = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = item.files?.vectorUrl;
    if (!url) return;
    try {
      const safeName = (item.designName || 'vector').replace(/[^\w\s-]/g, '_').trim() || 'vector';
      const lower = url.toLowerCase();
      const ext = lower.includes('.pdf')
        ? 'pdf'
        : lower.includes('.svg')
          ? 'svg'
          : lower.includes('.eps')
            ? 'eps'
            : 'vector';
      await downloadFile(url, `${safeName}_vector.${ext}`);
      toast({ title: 'Descarga iniciada', description: 'Se está descargando el archivo vector.' });
    } catch (error) {
      toast({
        title: 'No se pudo descargar',
        description: error instanceof Error ? error.message : 'Error al descargar',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasFile || !onUpdateItem) return;

    try {
      const filePath = getFilePathFromUrl(hasFile, 'vector');
      if (filePath) {
        try {
          await deleteFile('vector', filePath);
        } catch (storageError) {
          console.error('Error eliminando archivo vector del bucket:', storageError);
        }
      }

      if (previewUrl) {
        const previewPath = getFilePathFromUrl(previewUrl, 'vector');
        if (previewPath) {
          try {
            await deleteFile('vector', previewPath);
          } catch (previewError) {
            console.error('Error eliminando preview del bucket:', previewError);
          }
        }
      }

      await onUpdateItem(item.id, {
        files: {
          ...item.files,
          vectorUrl: undefined,
          vectorPreviewUrl: undefined,
        },
        vectorizationState: 'BASE',
      });

      toast({
        title: 'Archivo eliminado',
        description: 'El archivo vector se eliminó correctamente',
      });
    } catch (error) {
      console.error('Error deleting file:', error);
      toast({
        title: 'Error al eliminar archivo',
        description: error instanceof Error ? error.message : 'No se pudo eliminar el archivo',
        variant: 'destructive',
      });
    }
  };

  const uploadInput = canUpload ? (
    <input
      ref={fileInputRef}
      type="file"
      accept=".svg,.eps,.pdf,.ai,image/svg+xml,application/pdf,application/postscript,application/illustrator"
      onChange={handleFileSelect}
      className="hidden"
    />
  ) : null;

  const emptyUploadSlot = (
    <div
      onClick={canUpload ? handleClick : undefined}
      className={`flex size-10 items-center justify-center rounded border-2 border-dashed border-muted-foreground/25 ${
        canUpload
          ? `cursor-pointer hover:border-primary/50 transition-colors ${uploading ? 'cursor-not-allowed opacity-50' : ''}`
          : ''
      }`}
    >
      {uploading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <Upload className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );

  let content: ReactNode;

  if (!showPreviews) {
    if (!hasFile && !canUpload) {
      content = null;
    } else {
      const kindLabel = vectorFileKind ? storageFileKindLabel(vectorFileKind) : 'Archivo';
      content = (
        <>
          {uploadInput}
          <div className="flex h-full w-full items-center justify-center">
            {!hasFile ? (
              emptyUploadSlot
            ) : (
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    title={
                      canUpload
                        ? `${kindLabel} cargado — clic para reemplazar; derecho para más opciones`
                        : `${kindLabel} cargado — clic para descargar`
                    }
                    onClick={canUpload ? handleClick : (e) => void handleDownloadVector(e)}
                    onContextMenu={(e) => e.stopPropagation()}
                    className={`relative flex size-10 items-center justify-center rounded border border-violet-500/60 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/40 ${
                      uploading ? 'opacity-50' : ''
                    }`}
                  >
                    {fabricationBadge}
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin text-violet-700 dark:text-violet-300" />
                    ) : (
                      <FileType2 className="size-5 text-violet-700 dark:text-violet-300" />
                    )}
                    <Download className="absolute bottom-0.5 right-0.5 size-3 text-violet-600" aria-hidden />
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent onClick={(e) => e.stopPropagation()}>
                  {canUpload && (
                    <ContextMenuItem onClick={handleClick}>
                      <Upload className="mr-2 h-4 w-4" />
                      Reemplazar archivo
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem onClick={(e) => void handleDownloadVector(e)}>
                    <Download className="mr-2 h-4 w-4" />
                    Descargar archivo
                  </ContextMenuItem>
                  {canUpload && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={handleDelete} className="text-red-500 focus:text-red-500">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar archivo
                      </ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            )}
          </div>
        </>
      );
    }
  } else {
    content = (
      <>
        {uploadInput}
        <div className="flex h-12 w-full items-center justify-center">
          {!hasFile ? (
            emptyUploadSlot
          ) : archivoVectorSinMiniatura ? (
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  title={
                    isPdf
                      ? 'PDF — clic para otro archivo; derecho para descargar'
                      : isAi
                        ? 'AI — clic para otro archivo; derecho para descargar'
                        : 'EPS — clic para otro archivo; derecho para descargar'
                  }
                  onClick={canUpload ? handleClick : (e) => void handleDownloadVector(e)}
                  onContextMenu={(e) => e.stopPropagation()}
                  className={`relative flex size-10 items-center justify-center rounded border border-violet-500/60 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/40 ${
                    uploading ? 'opacity-50' : ''
                  }`}
                >
                  {fabricationBadge}
                  {uploading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-background/80">
                      <Loader2 className="size-4 animate-spin" />
                    </div>
                  )}
                  <FileType2 className="size-5 text-violet-700 dark:text-violet-300" />
                  <Download className="absolute bottom-0.5 right-0.5 size-3 text-violet-600" aria-hidden />
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent onClick={(e) => e.stopPropagation()}>
                {canUpload && (
                  <ContextMenuItem onClick={handleClick}>
                    <Upload className="mr-2 h-4 w-4" />
                    Reemplazar archivo
                  </ContextMenuItem>
                )}
                <ContextMenuItem onClick={(e) => void handleDownloadVector(e)}>
                  <Download className="mr-2 h-4 w-4" />
                  {isPdf ? 'Descargar PDF' : 'Descargar EPS'}
                </ContextMenuItem>
                {canUpload && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={handleDelete} className="text-red-500 focus:text-red-500">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar archivo
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          ) : (
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  className={`relative size-10 overflow-hidden rounded border p-0 cursor-pointer hover:opacity-80 transition-opacity ${
                    uploading ? 'opacity-50' : ''
                  }`}
                  title="Vector"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (displayUrl) openPreview(displayUrl, 'Vector');
                  }}
                  onContextMenu={(e) => e.stopPropagation()}
                >
                  {fabricationBadge}
                  {uploading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  )}
                  {displayUrl ? (
                    <>
                      <img
                        src={displayUrl}
                        alt="Vector"
                        className={`h-full w-full ${previewUrl ? 'object-contain' : 'object-cover'}`}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fb = e.currentTarget.nextElementSibling as HTMLElement | null;
                          if (fb) {
                            fb.classList.remove('hidden');
                          }
                        }}
                      />
                      <div className="hidden absolute inset-0 flex flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
                        <FileType2 className="size-6" aria-hidden />
                      </div>
                    </>
                  ) : null}
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent onClick={(e) => e.stopPropagation()}>
                {canUpload && (
                  <ContextMenuItem onClick={handleClick}>
                    <Upload className="mr-2 h-4 w-4" />
                    Reemplazar archivo
                  </ContextMenuItem>
                )}
                <ContextMenuItem onClick={(e) => void handleDownloadVector(e)}>
                  <Download className="mr-2 h-4 w-4" />
                  Descargar vector
                </ContextMenuItem>
                {canUpload && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={handleDelete} className="text-red-500 focus:text-red-500">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar archivo
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
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

  return (
    <>
      {content}
      <VectorSizeConfirmDialog
        open={sizeDialogState != null}
        onOpenChange={(next) => {
          if (!next) setSizeDialogState(null);
        }}
        fileName={sizeDialogState?.fileName ?? ''}
        previewUrl={sizeDialogState?.previewUrl}
        requestedWidthMm={item.requestedWidthMm}
        requestedHeightMm={item.requestedHeightMm}
        suggestion={
          sizeDialogState?.suggestion ?? {
            widthMm: 0,
            heightMm: 0,
            tipoPlanchuela: null,
            marginAppliedMm: null,
          }
        }
        svgAspectRatio={sizeDialogState?.svgAspectRatio ?? null}
        onConfirm={handleConfirmFabricationSize}
      />
    </>
  );
}
