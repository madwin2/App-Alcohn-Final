import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { 
  getAvailableStampsForPhoto, 
  assignPhotoToStamp,
  savePendingPhoto,
  getPendingPhotos,
  assignPendingPhotoToStamp,
  deletePendingPhoto,
  PendingPhoto
} from '@/lib/supabase/services/orders.service';

interface UploadedPhoto {
  id: string;
  file?: File;
  preview: string;
  uploadedUrl?: string;
  selectedStampId?: string;
  isUploading?: boolean;
  isAssigning?: boolean;
  isPending?: boolean; // Si es una foto pendiente cargada de la BD
  pendingId?: string; // ID de la foto pendiente en la BD
}

interface AvailableStamp {
  id: string;
  designName: string;
  orderId: string;
  orderDate: string;
  customerName: string;
}

interface UploadPhotosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function UploadPhotosDialog({ open, onOpenChange, onSuccess }: UploadPhotosDialogProps) {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [availableStamps, setAvailableStamps] = useState<AvailableStamp[]>([]);
  const [loadingStamps, setLoadingStamps] = useState(false);
  const [savingPending, setSavingPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Cargar sellos disponibles y fotos pendientes cuando se abre el modal
  useEffect(() => {
    if (open) {
      loadAvailableStamps();
      loadPendingPhotos();
    } else {
      // Guardar fotos no asignadas antes de cerrar
      saveUnassignedPhotos();
      // Limpiar cuando se cierra
      setPhotos([]);
      setAvailableStamps([]);
    }
  }, [open]);

  const loadAvailableStamps = async () => {
    setLoadingStamps(true);
    try {
      const stamps = await getAvailableStampsForPhoto();
      setAvailableStamps(stamps);
    } catch (error) {
      console.error('Error loading available stamps:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los sellos disponibles",
        variant: "destructive",
      });
    } finally {
      setLoadingStamps(false);
    }
  };

  const loadPendingPhotos = async () => {
    try {
      const pendingPhotos = await getPendingPhotos();
      
      // Convertir fotos pendientes a UploadedPhoto
      const pendingUploadedPhotos: UploadedPhoto[] = pendingPhotos.map(pending => ({
        id: pending.id,
        preview: pending.url,
        uploadedUrl: pending.url,
        selectedStampId: pending.selloId,
        isPending: true,
        pendingId: pending.id,
      }));

      setPhotos(prev => [...pendingUploadedPhotos, ...prev]);
    } catch (error) {
      console.error('Error loading pending photos:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las fotos pendientes",
        variant: "destructive",
      });
    }
  };

  const saveUnassignedPhotos = async () => {
    const unassignedPhotos = photos.filter(p => !p.isPending && !p.selectedStampId && !p.isUploading);
    
    if (unassignedPhotos.length === 0) return;

    setSavingPending(true);
    try {
      for (const photo of unassignedPhotos) {
        if (photo.file) {
          await savePendingPhoto(photo.file);
        }
      }
    } catch (error) {
      console.error('Error saving pending photos:', error);
      toast({
        title: "Atención",
        description: "Algunas fotos no se pudieron guardar como pendientes",
        variant: "destructive",
      });
    } finally {
      setSavingPending(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    const newPhotos: UploadedPhoto[] = files.map(file => {
      const id = `${Date.now()}-${Math.random()}`;
      const preview = URL.createObjectURL(file);
      
      return {
        id,
        file,
        preview,
      };
    });

    setPhotos(prev => [...prev, ...newPhotos]);
    
    // Limpiar el input para permitir seleccionar el mismo archivo de nuevo
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removePhoto = async (photoId: string) => {
    const photo = photos.find(p => p.id === photoId);
    
    // Si es una foto pendiente, eliminarla de la BD
    if (photo?.isPending && photo.pendingId) {
      try {
        await deletePendingPhoto(photo.pendingId);
        toast({
          title: "Foto eliminada",
          description: "La foto pendiente ha sido eliminada",
        });
      } catch (error) {
        console.error('Error deleting pending photo:', error);
        toast({
          title: "Error",
          description: "No se pudo eliminar la foto",
          variant: "destructive",
        });
        return;
      }
    } else if (photo?.file) {
      // Si es una foto nueva, solo revocar la URL del preview
      URL.revokeObjectURL(photo.preview);
    }
    
    setPhotos(prev => prev.filter(p => p.id !== photoId));
  };

  const handleStampSelect = (photoId: string, stampId: string) => {
    setPhotos(prev => prev.map(photo => 
      photo.id === photoId 
        ? { ...photo, selectedStampId: stampId }
        : photo
    ));
  };

  const handleAssignPhoto = async (photo: UploadedPhoto) => {
    if (!photo.selectedStampId) {
      toast({
        title: "Error",
        description: "Debe seleccionar un sello para asignar la foto",
        variant: "destructive",
      });
      return;
    }

    setPhotos(prev => prev.map(p => 
      p.id === photo.id 
        ? { ...p, isUploading: true, isAssigning: true }
        : p
    ));

    try {
      if (photo.isPending && photo.pendingId) {
        // Si es una foto pendiente, usar la función específica
        await assignPendingPhotoToStamp(photo.pendingId, photo.selectedStampId!);
      } else if (photo.file) {
        // Si es una foto nueva, subirla y asignarla
        await assignPhotoToStamp(photo.selectedStampId!, photo.file);
      } else {
        throw new Error('No se puede asignar la foto: falta información');
      }
      
      toast({
        title: "¡Foto asignada!",
        description: "La foto se ha asignado correctamente al sello",
      });

      // Remover la foto de la lista
      removePhoto(photo.id);
      
      // Recargar sellos disponibles (porque este ya no estará disponible)
      await loadAvailableStamps();
      
      // Notificar éxito
      onSuccess?.();
    } catch (error) {
      console.error('Error assigning photo:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo asignar la foto",
        variant: "destructive",
      });
    } finally {
      setPhotos(prev => prev.map(p => 
        p.id === photo.id 
          ? { ...p, isUploading: false, isAssigning: false }
          : p
      ));
    }
  };

  const handleAssignAll = async () => {
    const photosToAssign = photos.filter(p => p.selectedStampId && !p.isUploading);
    
    if (photosToAssign.length === 0) {
      toast({
        title: "Atención",
        description: "No hay fotos con sello seleccionado para asignar",
        variant: "destructive",
      });
      return;
    }

    // Asignar todas las fotos
    for (const photo of photosToAssign) {
      await handleAssignPhoto(photo);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto border border-white/20 shadow-[0_0_80px_rgba(255,255,255,0.075),0_0_150px_rgba(255,255,255,0.05),0_0_220px_rgba(255,255,255,0.025)]">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="text-xl font-semibold">Subir Fotos</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Sube fotos y asígnalas a sellos disponibles. Las fotos no asignadas se guardarán automáticamente.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Botón para seleccionar archivos */}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id="photo-upload"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Seleccionar Fotos
            </Button>
            
            {photos.length > 0 && (
              <Button
                type="button"
                onClick={handleAssignAll}
                className="gap-2"
                disabled={photos.some(p => p.isUploading)}
              >
                Asignar Todas
              </Button>
            )}
          </div>

          {/* Lista de fotos */}
          {photos.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {photos.map(photo => (
                <div
                  key={photo.id}
                  className="border rounded-lg p-4 space-y-3"
                >
                  {/* Badge si es foto pendiente */}
                  {photo.isPending && (
                    <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                      Foto pendiente
                    </div>
                  )}

                  {/* Preview de la imagen */}
                  <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                    <img
                      src={photo.preview}
                      alt="Preview"
                      className="w-full h-full object-contain"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 bg-background/80 hover:bg-background"
                      onClick={() => removePhoto(photo.id)}
                      disabled={photo.isUploading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Selector de sello */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Asignar a sello:</label>
                    <Select
                      value={photo.selectedStampId || ''}
                      onValueChange={(value) => handleStampSelect(photo.id, value)}
                      disabled={photo.isUploading || loadingStamps}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar sello..." />
                      </SelectTrigger>
                      <SelectContent>
                        {loadingStamps ? (
                          <SelectItem value="loading" disabled>
                            Cargando...
                          </SelectItem>
                        ) : availableStamps.length === 0 ? (
                          <SelectItem value="none" disabled>
                            No hay sellos disponibles
                          </SelectItem>
                        ) : (
                          availableStamps.map(stamp => (
                            <SelectItem key={stamp.id} value={stamp.id}>
                              {stamp.designName} - {stamp.customerName} ({new Date(stamp.orderDate).toLocaleDateString()})
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Botón para asignar esta foto */}
                  {photo.selectedStampId && (
                    <Button
                      type="button"
                      onClick={() => handleAssignPhoto(photo)}
                      disabled={photo.isUploading}
                      className="w-full"
                      size="sm"
                    >
                      {photo.isUploading ? 'Asignando...' : 'Asignar Foto'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Mensaje cuando no hay fotos */}
          {photos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
              <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">No hay fotos seleccionadas</p>
              <p className="text-sm text-muted-foreground">
                Haz clic en "Seleccionar Fotos" para comenzar
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
