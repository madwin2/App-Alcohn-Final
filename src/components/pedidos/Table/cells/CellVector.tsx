import { Upload, Loader2, Download, Trash2, FileType2 } from 'lucide-react';
import { Order } from '@/lib/types/index';
import { useOrdersStore } from '@/lib/state/orders.store';
import { useState, useRef } from 'react';
import {
  uploadFile,
  generateFilePath,
  uploadVectorFileWithPreview,
  deleteFile,
  downloadFile,
  getFilePathFromUrl,
} from '@/lib/supabase/services/storage.service';
import { useToast } from '@/components/ui/use-toast';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu';

interface CellVectorProps {
  order: Order;
  onUpdate?: (orderId: string, updates: Partial<Order>) => Promise<Order>;
  editingRowId?: string | null;
}

export function CellVector({ order, onUpdate, editingRowId }: CellVectorProps) {
  const { showPreviews } = useOrdersStore();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const item = order.items[0];
  
  if (!item) return null;

  const hasFile = item.files?.vectorUrl;
  const previewUrl = item.files?.vectorPreviewUrl;
  const isEps = Boolean(hasFile && hasFile.toLowerCase().includes('.eps'));
  const isPdf = Boolean(hasFile && hasFile.toLowerCase().includes('.pdf'));
  const epsSinPreview = isEps && hasFile && !previewUrl;
  const archivoVectorSinMiniatura =
    epsSinPreview || Boolean(isPdf && hasFile);
  const displayUrl = archivoVectorSinMiniatura
    ? undefined
    : isEps && previewUrl
      ? previewUrl
      : !isPdf
        ? hasFile
        : undefined;
  
  // Si es un archivo resumido (para pedidos con múltiples items)
  if (hasFile === 'summary') {
    const totalItems = order.items.length;
    const itemsWithFiles = order.items.filter(item => item.files?.vectorUrl).length;
    
    return (
      <div className="flex items-center justify-center w-10 h-10 border-2 border-solid border-purple-500 rounded bg-purple-50 dark:bg-purple-900/20">
        <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
          {itemsWithFiles}/{totalItems}
        </span>
      </div>
    );
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdate) return;

    // Validar tipo de archivo: svg, eps, pdf, ai
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
      // Subir archivo a Storage
      const filePath = generateFilePath(order.id, 'vector', file.name, item.id);
      const isEpsFile = fileExtension === '.eps';
      
      let result: { originalUrl: string; previewUrl?: string };
      if (isEpsFile) {
        toast({
          title: 'Subiendo EPS...',
          description: 'Intentando generar vista previa (si la API alcanza el límite, igual queda guardado para descargar).',
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
        // Para otros formatos, subir normalmente
        const fileUrl = await uploadFile('vector', file, filePath);
        result = { originalUrl: fileUrl };
      }

      // Actualizar la orden con la nueva URL y preview si existe
      const updatedItems = order.items.map(i => 
        i.id === item.id 
          ? { 
              ...i, 
              files: { 
                ...i.files, 
                vectorUrl: result.originalUrl,
                vectorPreviewUrl: result.previewUrl 
              } 
            }
          : i
      );

      await onUpdate(order.id, { items: updatedItems });
      
      toast({
        title: 'Archivo subido',
        description:
          isEpsFile && result.previewUrl
            ? 'El vector y la vista previa se subieron correctamente.'
            : isEpsFile
              ? 'El EPS quedó guardado; si no ves miniatura, descargalo con el ícono.'
              : 'El archivo vector se subió correctamente',
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: 'Error al subir archivo',
        description: error instanceof Error ? error.message : 'No se pudo subir el archivo',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClick = () => {
    if (!uploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasFile || !onUpdate) return;

    try {
      // Obtener el path del archivo desde la URL
      const filePath = getFilePathFromUrl(hasFile, 'vector');
      if (!filePath) {
        console.error('No se pudo extraer el path de la URL:', hasFile);
        throw new Error('No se pudo obtener la ruta del archivo');
      }

      // Eliminar archivo original de Storage
      try {
        await deleteFile('vector', filePath);
        console.log('Archivo vector eliminado del bucket:', filePath);
      } catch (storageError) {
        console.error('Error eliminando archivo vector del bucket:', storageError);
        // Continuar aunque falle la eliminación del bucket
      }

      // Si hay preview, también eliminarlo
      if (previewUrl) {
        const previewPath = getFilePathFromUrl(previewUrl, 'vector');
        if (previewPath) {
          try {
            await deleteFile('vector', previewPath);
            console.log('Preview eliminado del bucket:', previewPath);
          } catch (previewError) {
            console.error('Error eliminando preview del bucket:', previewError);
            // Continuar aunque falle la eliminación del preview
          }
        }
      }

      // Actualizar la orden eliminando las URLs de los archivos
      const updatedItems = order.items.map(i => 
        i.id === item.id 
          ? { ...i, files: { ...i.files, vectorUrl: undefined, vectorPreviewUrl: undefined } }
          : i
      );

      await onUpdate(order.id, { items: updatedItems });
      
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

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // Descargar el archivo original (EPS), no el preview
    const fileToDownload = hasFile || previewUrl || displayUrl;
    if (!fileToDownload) return;

    try {
      // Extraer el nombre del archivo de la URL
      const urlParts = fileToDownload.split('/');
      const filename = decodeURIComponent(urlParts[urlParts.length - 1] || '') || 'archivo-vector.eps';
      
      await downloadFile(fileToDownload, filename);
      
      toast({
        title: 'Descarga iniciada',
        description: 'El archivo se está descargando',
      });
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: 'Error al descargar archivo',
        description: error instanceof Error ? error.message : 'No se pudo descargar el archivo',
        variant: 'destructive',
      });
    }
  };

  if (!showPreviews) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".svg,.eps,.pdf,.ai,image/svg+xml,application/pdf,application/postscript,application/illustrator"
          onChange={handleFileSelect}
          className="hidden"
        />
        {archivoVectorSinMiniatura ? (
          <button
            type="button"
            title={
              isPdf ? 'PDF — clic para descargar' : 'EPS sin vista previa — clic para descargar'
            }
            onClick={(e) => {
              e.stopPropagation();
              void handleDownload(e);
            }}
            className="relative flex size-10 items-center justify-center rounded border border-violet-500/60 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/40"
          >
            <FileType2 className="size-5 text-violet-700 dark:text-violet-300" />
            <Download className="absolute bottom-0.5 right-0.5 size-3 text-violet-600" aria-hidden />
          </button>
        ) : (
          <div
            onClick={handleClick}
            className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 transition-colors ${uploading ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        )}
      </>
    );
  }

  if (!displayUrl && !archivoVectorSinMiniatura) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".svg,.eps,.pdf,.ai,image/svg+xml,application/pdf,application/postscript,application/illustrator"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div
          onClick={handleClick}
          className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 transition-colors ${uploading ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".svg,.eps,.pdf,.ai,image/svg+xml,application/pdf,application/postscript,application/illustrator"
        onChange={handleFileSelect}
        className="hidden"
      />
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {archivoVectorSinMiniatura ? (
            <button
              type="button"
              title={
                isPdf
                  ? 'PDF — clic para otro archivo; derecho para descargar'
                  : 'EPS — clic para otro archivo; derecho para descargar'
              }
              onClick={handleClick}
              onContextMenu={(e) => e.stopPropagation()}
              className={`relative flex size-10 items-center justify-center rounded border border-violet-500/60 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/40 ${uploading ? 'opacity-50' : ''}`}
            >
              {uploading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-background/80">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              )}
              <FileType2 className="size-5 text-violet-700 dark:text-violet-300" />
              <Download className="absolute bottom-0.5 right-0.5 size-3 text-violet-600" aria-hidden />
            </button>
          ) : (
            <div
              onClick={handleClick}
              onContextMenu={(e) => e.stopPropagation()}
              className={`relative h-10 w-10 cursor-pointer overflow-hidden rounded border transition-opacity hover:opacity-80 ${uploading ? 'opacity-50' : ''}`}
            >
              {uploading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}
              <div className={`h-full w-full ${isEps && previewUrl ? 'bg-white' : ''}`}>
                {displayUrl ? (
                  <>
                    <img
                      src={displayUrl}
                      alt={isEps ? 'Vector EPS Preview' : 'Vector'}
                      className={`h-full w-full ${isEps && previewUrl ? 'object-contain' : 'object-cover'}`}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const fb = e.currentTarget.nextElementSibling as HTMLElement | null;
                        if (fb) {
                          fb.classList.remove('hidden');
                          fb.classList.add('flex');
                        }
                      }}
                    />
                    <div className="hidden h-full w-full items-center justify-center bg-muted">
                      <FileType2 className="h-5 w-5 text-muted-foreground" aria-hidden />
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent onClick={(e) => e.stopPropagation()}>
          <ContextMenuItem onClick={(e) => void handleDownload(e)}>
            <Download className="mr-2 h-4 w-4" />
            Descargar archivo
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleDelete} className="text-red-500 focus:text-red-500">
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar archivo
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </>
  );
}
