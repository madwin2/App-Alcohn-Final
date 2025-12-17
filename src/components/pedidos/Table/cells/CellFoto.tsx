import { Upload, Loader2, Download, Trash2 } from 'lucide-react';
import { Order } from '@/lib/types/index';
import { useOrdersStore } from '@/lib/state/orders.store';
import { useState, useRef } from 'react';
import { uploadFile, generateFilePath, deleteFile, downloadFile, getFilePathFromUrl } from '@/lib/supabase/services/storage.service';
import { useToast } from '@/components/ui/use-toast';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu';

interface CellFotoProps {
  order: Order;
  onUpdate?: (orderId: string, updates: Partial<Order>) => Promise<Order>;
  editingRowId?: string | null;
}

export function CellFoto({ order, onUpdate, editingRowId }: CellFotoProps) {
  const { showPreviews } = useOrdersStore();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const item = order.items[0];
  
  if (!item) return null;

  const hasFile = item.files?.photoUrl;
  
  // Si es un archivo resumido (para pedidos con múltiples items)
  if (hasFile === 'summary') {
    const totalItems = order.items.length;
    const itemsWithFiles = order.items.filter(item => item.files?.photoUrl).length;
    
    return (
      <div className="flex items-center justify-center w-10 h-10 border-2 border-solid border-green-500 rounded bg-green-50 dark:bg-green-900/20">
        <span className="text-xs font-medium text-green-600 dark:text-green-400">
          {itemsWithFiles}/{totalItems}
        </span>
      </div>
    );
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdate) return;

    // Validar tipo de archivo: jpg, jpeg, png
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      toast({
        title: 'Tipo de archivo no válido',
        description: 'Solo se permiten archivos JPG, JPEG o PNG',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      // Subir archivo a Storage
      const filePath = generateFilePath(order.id, 'foto', file.name, item.id);
      const fileUrl = await uploadFile('foto', file, filePath);

      // Actualizar la orden con la nueva URL
      const updatedItems = order.items.map(i => 
        i.id === item.id 
          ? { ...i, files: { ...i.files, photoUrl: fileUrl } }
          : i
      );

      await onUpdate(order.id, { items: updatedItems });
      
      toast({
        title: 'Archivo subido',
        description: 'La foto del sello se subió correctamente',
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
      const filePath = getFilePathFromUrl(hasFile, 'foto');
      if (!filePath) {
        console.error('No se pudo extraer el path de la URL:', hasFile);
        throw new Error('No se pudo obtener la ruta del archivo');
      }

      // Eliminar archivo de Storage primero
      try {
        await deleteFile('foto', filePath);
        console.log('Archivo eliminado del bucket:', filePath);
      } catch (storageError) {
        console.error('Error eliminando archivo del bucket:', storageError);
        // Continuar con la actualización de la BD aunque falle la eliminación del bucket
        // para evitar que quede inconsistente
      }

      // Actualizar la orden eliminando la URL del archivo
      const updatedItems = order.items.map(i => 
        i.id === item.id 
          ? { ...i, files: { ...i.files, photoUrl: undefined } }
          : i
      );

      await onUpdate(order.id, { items: updatedItems });
      
      toast({
        title: 'Archivo eliminado',
        description: 'La foto del sello se eliminó correctamente',
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
    if (!hasFile) return;

    try {
      // Extraer el nombre del archivo de la URL
      const urlParts = hasFile.split('/');
      const filename = urlParts[urlParts.length - 1] || 'foto-sello.jpg';
      
      await downloadFile(hasFile, filename);
      
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

  if (!showPreviews || !hasFile) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
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
        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
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
            <img
              src={hasFile}
              alt="Foto sello"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
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
