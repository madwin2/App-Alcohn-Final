import { Upload, Loader2, Download, Trash2 } from 'lucide-react';
import { Order } from '@/lib/types/index';
import { useOrdersStore } from '@/lib/state/orders.store';
import { useState, useRef } from 'react';
import { uploadFile, generateFilePath, uploadVectorFileWithPreview, deleteFile, downloadFile, getFilePathFromUrl } from '@/lib/supabase/services/storage.service';
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
  const isEps = hasFile?.toLowerCase().includes('.eps');
  const displayUrl = (isEps && previewUrl) ? previewUrl : hasFile;
  
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
        // Si es EPS, usar la función que genera preview
        result = await uploadVectorFileWithPreview('vector', file, filePath);
        toast({
          title: 'Convirtiendo EPS...',
          description: 'Generando preview del archivo',
        });
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
        description: isEpsFile && result.previewUrl 
          ? 'El archivo vector y su preview se subieron correctamente'
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
    const fileToDownload = hasFile || displayUrl;
    if (!fileToDownload) return;

    try {
      // Extraer el nombre del archivo de la URL
      const urlParts = fileToDownload.split('/');
      const filename = urlParts[urlParts.length - 1] || 'archivo-vector.eps';
      
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

  if (!showPreviews || !displayUrl) {
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
          className={`flex items-center justify-center w-10 h-10 border-2 border-dashed border-muted-foreground/25 rounded cursor-pointer hover:border-primary/50 transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
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
          <div 
            onClick={handleClick}
            onContextMenu={(e) => e.stopPropagation()} // Prevenir que se propague al menú del pedido
            className={`w-10 h-10 rounded border overflow-hidden cursor-pointer hover:opacity-80 transition-opacity relative ${uploading ? 'opacity-50' : ''}`}
          >
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
            <div className={`w-full h-full ${isEps && previewUrl ? 'bg-white' : ''}`}>
              <img
                src={displayUrl}
                alt={isEps ? "Vector EPS Preview" : "Vector"}
                className={`w-full h-full ${isEps && previewUrl ? 'object-contain' : 'object-cover'}`}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
            </div>
            <div className="hidden w-full h-full flex items-center justify-center bg-muted">
              <Upload className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent onClick={(e) => e.stopPropagation()}>
          <ContextMenuItem onClick={handleDownload}>
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
