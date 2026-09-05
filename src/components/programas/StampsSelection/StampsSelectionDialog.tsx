import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Plus, Clock, AlertCircle, Calendar, Loader2 } from 'lucide-react';
import { ProgramMachineType, ProgramStamp, StampType } from '@/lib/types/index';
import { StampTypeIcon } from '@/components/ui/StampTypeIcon';
import { getEligibleStamps } from '@/lib/supabase/services/programs.service';

interface StampsSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAddStamps: (selectedStamps: ProgramStamp[]) => void;
  programId: string;
  machine: ProgramMachineType;
  excludeStampIds?: string[];
}

const formatDeadline = (deadlineAt: string): string => {
  const date = new Date(deadlineAt);
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatCreatedAt = (createdAt: string): string => {
  const date = new Date(createdAt);
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

export function StampsSelectionDialog({
  isOpen,
  onClose,
  onAddStamps,
  programId: _programId,
  machine,
  excludeStampIds = [],
}: StampsSelectionDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStamps, setSelectedStamps] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<StampType | 'ALL'>('ALL');
  const [availableStamps, setAvailableStamps] = useState<ProgramStamp[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !machine) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const stamps = await getEligibleStamps({ machine, excludeStampIds });
        if (!cancelled) setAvailableStamps(stamps);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'No se pudieron cargar los sellos');
          setAvailableStamps([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, machine, excludeStampIds.join(',')]);

  const filteredStamps = availableStamps.filter((stamp) => {
    const matchesSearch = stamp.designName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'ALL' || stamp.stampType === filterType;
    return matchesSearch && matchesType;
  });

  const handleStampToggle = (stampId: string) => {
    setSelectedStamps((prev) =>
      prev.includes(stampId) ? prev.filter((id) => id !== stampId) : [...prev, stampId],
    );
  };

  const handleAddSelected = () => {
    const stampsToAdd = availableStamps.filter((stamp) => selectedStamps.includes(stamp.id));
    onAddStamps(stampsToAdd);
    setSelectedStamps([]);
    onClose();
  };

  const handleClose = () => {
    setSelectedStamps([]);
    setSearchQuery('');
    setFilterType('ALL');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Agregar Sellos al Programa (máquina {machine})
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          <div className="flex gap-4 items-center flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar sellos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              {(['ALL', 'CLASICO', '3MM', 'ALIMENTO', 'ABC', 'LACRE'] as const).map((type) => (
                <Button
                  key={type}
                  variant={filterType === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterType(type)}
                  className="text-xs"
                >
                  {type === 'ALL' ? 'Todos' : type}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-[200px]">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando sellos elegibles...
              </div>
            ) : loadError ? (
              <div className="flex items-center justify-center h-40 text-destructive text-sm px-4 text-center">
                {loadError}
              </div>
            ) : filteredStamps.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm px-4 text-center">
                No hay sellos elegibles (vectorizados, sin programa, Sin Hacer/Rehacer, máquina{' '}
                {machine} o sin asignar).
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredStamps.map((stamp) => (
                  <div
                    key={stamp.id}
                    className={`border rounded-lg p-3 cursor-pointer transition-all hover:shadow-md ${
                      selectedStamps.includes(stamp.id)
                        ? 'border-primary bg-primary/5 shadow-md'
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => handleStampToggle(stamp.id)}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedStamps.includes(stamp.id)}
                        onCheckedChange={() => handleStampToggle(stamp.id)}
                        className="mt-1"
                        onClick={(e) => e.stopPropagation()}
                      />

                      <div className="w-16 h-16 border border-border rounded bg-muted/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {stamp.previewUrl ? (
                          <img
                            src={stamp.previewUrl}
                            alt={`Diseño de ${stamp.designName}`}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="text-xs text-muted-foreground text-center">
                            {Math.round(stamp.widthMm)}×{Math.round(stamp.heightMm)}mm
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          {stamp.isPriority && (
                            <AlertCircle className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
                          )}
                          <h4 className="font-medium text-sm truncate">{stamp.designName}</h4>
                          <StampTypeIcon
                            stampType={stamp.stampType}
                            className="w-4 h-4 flex-shrink-0 opacity-80"
                          />
                        </div>

                        <div className="text-xs text-muted-foreground mb-1">
                          {Math.round(stamp.widthMm)}mm × {Math.round(stamp.heightMm)}mm
                          {stamp.tipoPlanchuela ? ` · P${stamp.tipoPlanchuela}` : ''}
                        </div>

                        {stamp.createdAt && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                            <Calendar className="w-3 h-3" />
                            <span>{formatCreatedAt(stamp.createdAt)}</span>
                          </div>
                        )}

                        {stamp.deadlineAt && (
                          <div className="flex items-center gap-1 text-xs text-red-600">
                            <Clock className="w-3 h-3" />
                            <span>{formatDeadline(stamp.deadlineAt)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {selectedStamps.length} sello{selectedStamps.length !== 1 ? 's' : ''} seleccionado
              {selectedStamps.length !== 1 ? 's' : ''}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                onClick={handleAddSelected}
                disabled={selectedStamps.length === 0}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Agregar {selectedStamps.length > 0 && `(${selectedStamps.length})`}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
