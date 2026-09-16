import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X, Image as ImageIcon, Link2, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { formatDate } from '@/lib/utils/format';
import { ENVIOS_CARRIER_PATH } from '@/components/envios/enviosRoutes';
import {
  checkAndreaniLinksForPhotoAssignment,
  type AndreaniPhotoLinkCheck,
} from '@/lib/supabase/services/andreani.service';
import { 
  getAvailableStampsForPhoto, 
  assignPhotoToStamp,
  savePendingPhoto,
  getPendingPhotos,
  assignPendingPhotoToStamp,
  deletePendingPhoto,
  updatePendingPhotoStamp,
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

type ShortageState = {
  check: AndreaniPhotoLinkCheck;
  photos: UploadedPhoto[];
};

function shortageCopy(check: AndreaniPhotoLinkCheck): string {
  if (check.available === 0) {
    return `No hay links de Andreani disponibles. Hacen falta ${check.needed} para ${
      check.needed === 1 ? 'este pedido' : 'estos pedidos'
    }.`;
  }
  return `Hacen falta ${check.needed} link${check.needed === 1 ? '' : 's'} y hay ${check.available} disponible${
    check.available === 1 ? '' : 's'
  }. Faltan ${check.missing}.`;
}

async function persistDraftPhotos(list: UploadedPhoto[]): Promise<UploadedPhoto[]> {
  const next: UploadedPhoto[] = [];
  for (const photo of list) {
    if (photo.isUploading || photo.isAssigning) {
      next.push(photo);
      continue;
    }

    if (photo.isPending && photo.pendingId) {
      try {
        await updatePendingPhotoStamp(photo.pendingId, photo.selectedStampId ?? null);
      } catch (error) {
        console.error('Error updating pending photo stamp:', error);
      }
      next.push(photo);
      continue;
    }

    if (photo.file) {
      try {
        const saved = await savePendingPhoto(photo.file, photo.selectedStampId);
        if (photo.preview.startsWith('blob:')) {
          URL.revokeObjectURL(photo.preview);
        }
        next.push({
          id: saved.id,
          preview: saved.url,
          uploadedUrl: saved.url,
          selectedStampId: saved.selloId ?? photo.selectedStampId,
          isPending: true,
          pendingId: saved.id,
        });
      } catch (error) {
        console.error('Error saving pending photo:', error);
        next.push(photo);
      }
      continue;
    }

    next.push(photo);
  }
  return next;
}

export function UploadPhotosDialog({ open, onOpenChange, onSuccess }: UploadPhotosDialogProps) {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [availableStamps, setAvailableStamps] = useState<AvailableStamp[]>([]);
  const [loadingStamps, setLoadingStamps] = useState(false);
  const [savingPending, setSavingPending] = useState(false);
  const [checkingLinks, setCheckingLinks] = useState(false);
  const [shortage, setShortage] = useState<ShortageState | null>(null);
  const [waitBanner, setWaitBanner] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<UploadedPhoto[]>([]);
  const persistPromiseRef = useRef<Promise<void> | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  photosRef.current = photos;

  // Cargar sellos disponibles y fotos pendientes cuando se abre el modal
  useEffect(() => {
    if (!open) {
      setPhotos([]);
      setAvailableStamps([]);
      setShortage(null);
      setWaitBanner(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      if (persistPromiseRef.current) {
        await persistPromiseRef.current;
      }
      if (cancelled) return;
      await loadAvailableStamps();
      if (cancelled) return;
      await loadPendingPhotos();
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      const snapshot = photosRef.current;
      persistPromiseRef.current = persistDraftPhotos(snapshot)
        .then(() => undefined)
        .catch((error) => {
          console.error('Error saving pending photos:', error);
        });
    }
    onOpenChange(next);
  };

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

      setPhotos((prev) => {
        const localNew = prev.filter((photo) => !photo.isPending);
        return [...pendingUploadedPhotos, ...localNew];
      });
    } catch (error) {
      console.error('Error loading pending photos:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las fotos pendientes",
        variant: "destructive",
      });
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

    const photo = photosRef.current.find((item) => item.id === photoId);
    if (photo?.isPending && photo.pendingId) {
      void updatePendingPhotoStamp(photo.pendingId, stampId).catch((error) => {
        console.error('Error updating pending photo stamp:', error);
      });
    }
  };

  const assignPhotoNow = async (photo: UploadedPhoto) => {
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
        await assignPendingPhotoToStamp(photo.pendingId, photo.selectedStampId);
      } else if (photo.file) {
        // Si es una foto nueva, subirla y asignarla
        await assignPhotoToStamp(photo.selectedStampId, photo.file);
      } else {
        throw new Error('No se puede asignar la foto: falta información');
      }
      
      toast({
        title: "¡Foto asignada!",
        description: "La foto se ha asignado correctamente al sello",
      });

      // Remover la foto de la lista
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
      if (photo.file && photo.preview.startsWith('blob:')) {
        URL.revokeObjectURL(photo.preview);
      }
      
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

  const ensureAndreaniLinksOrPrompt = async (
    photosToAssign: UploadedPhoto[],
  ): Promise<boolean> => {
    const stampIds = photosToAssign
      .map((photo) => photo.selectedStampId)
      .filter((id): id is string => Boolean(id));
    if (!stampIds.length) return true;

    setCheckingLinks(true);
    try {
      const check = await checkAndreaniLinksForPhotoAssignment(stampIds);
      if (check.missing > 0) {
        setShortage({ check, photos: photosToAssign });
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error checking Andreani links:', error);
      toast({
        title: 'No se pudo verificar el pool de Andreani',
        description: 'Probá de nuevo en un momento. Si sigue fallando, cargá el pool y volvé.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setCheckingLinks(false);
    }
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

    const ok = await ensureAndreaniLinksOrPrompt([photo]);
    if (!ok) return;
    await assignPhotoNow(photo);
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

    const ok = await ensureAndreaniLinksOrPrompt(photosToAssign);
    if (!ok) return;

    for (const photo of photosToAssign) {
      await assignPhotoNow(photo);
    }
  };

  const handleWaitForLinks = async () => {
    setSavingPending(true);
    try {
      const saved = await persistDraftPhotos(photosRef.current);
      setPhotos(saved);
      persistPromiseRef.current = Promise.resolve();
      setShortage(null);
      setWaitBanner(true);
      toast({
        title: 'Fotos guardadas',
        description: 'Quedan en este modal. Cargá el pool de Andreani y volvé a asignar.',
      });
    } catch (error) {
      console.error('Error saving pending photos:', error);
      toast({
        title: 'Atención',
        description: 'Algunas fotos no se pudieron guardar como pendientes',
        variant: 'destructive',
      });
    } finally {
      setSavingPending(false);
    }
  };

  const handleGoLoadPool = async () => {
    setSavingPending(true);
    try {
      const snapshot = photosRef.current;
      persistPromiseRef.current = persistDraftPhotos(snapshot).then(() => undefined);
      await persistPromiseRef.current;
      setShortage(null);
      onOpenChange(false);
      navigate(ENVIOS_CARRIER_PATH.ANDREANI);
    } catch (error) {
      console.error('Error saving pending photos:', error);
      toast({
        title: 'Atención',
        description: 'Algunas fotos no se pudieron guardar como pendientes',
        variant: 'destructive',
      });
    } finally {
      setSavingPending(false);
    }
  };

  const handleAssignAnyway = async () => {
    const photosToAssign = shortage?.photos ?? [];
    setShortage(null);
    setWaitBanner(false);
    for (const photo of photosToAssign) {
      await assignPhotoNow(photo);
    }
  };

  const busy = photos.some(p => p.isUploading) || checkingLinks || savingPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="relative flex max-h-[85vh] max-w-4xl flex-col overflow-hidden border border-white/20 shadow-[0_0_80px_rgba(255,255,255,0.075),0_0_150px_rgba(255,255,255,0.05),0_0_220px_rgba(255,255,255,0.025)]">
        <DialogHeader className="pb-4 border-b shrink-0">
          <DialogTitle className="text-xl font-semibold">Subir Fotos</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Sube fotos y asígnalas a sellos disponibles. Las fotos no asignadas se guardarán automáticamente.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {waitBanner && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm space-y-2">
              <p>
                Las fotos quedaron guardadas. Cargá el pool de Andreani y después volvé y apretá Asignar todas.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => void handleGoLoadPool()}>
                Ir a cargar el pool
              </Button>
            </div>
          )}

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
                onClick={() => void handleAssignAll()}
                className="gap-2"
                disabled={busy}
              >
                {checkingLinks ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verificando links…
                  </>
                ) : (
                  'Asignar Todas'
                )}
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
                              {stamp.designName} - {stamp.customerName} ({formatDate(stamp.orderDate)})
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
                      onClick={() => void handleAssignPhoto(photo)}
                      disabled={busy}
                      className="w-full"
                      size="sm"
                    >
                      {photo.isUploading ? 'Asignando...' : checkingLinks ? 'Verificando…' : 'Asignar Foto'}
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

        {shortage && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/90 p-6 backdrop-blur-sm">
            <div className="w-full max-w-md space-y-4 rounded-lg border bg-background p-6 shadow-lg">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md bg-amber-500/15 p-2 text-amber-600">
                  <Link2 className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">Faltan links de Andreani</h3>
                  <p className="text-sm text-muted-foreground">{shortageCopy(shortage.check)}</p>
                  <p className="text-sm text-muted-foreground">
                    Las fotos quedan guardadas acá. Podés ir a cargar el pool y después volver y solo apretar Asignar todas.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void handleAssignAnyway()}
                  disabled={busy}
                >
                  Asignar de todas formas
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleGoLoadPool()}
                  disabled={savingPending}
                >
                  Ir a cargar el pool
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleWaitForLinks()}
                  disabled={savingPending}
                >
                  Esperar a que estén disponibles
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
