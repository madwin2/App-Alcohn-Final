import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Plus, Clock, AlertCircle, Calendar } from 'lucide-react';
import { ProgramStamp, StampType } from '@/lib/types/index';
import { StampTypeIcon } from '@/components/ui/StampTypeIcon';

interface StampsSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAddStamps: (selectedStamps: ProgramStamp[]) => void;
  programId: string;
}

// Datos mock de sellos disponibles
const availableStamps: ProgramStamp[] = [
  {
    id: 'stamp-1',
    designName: 'Logo Empresa',
    widthMm: 25,
    heightMm: 25,
    stampType: 'CLASICO',
    previewUrl: '/icons/CLASICO.svg',
    isPriority: false,
    createdAt: '2024-01-15T10:30:00Z'
  },
  {
    id: 'stamp-2',
    designName: 'Marca Personal',
    widthMm: 38,
    heightMm: 38,
    stampType: '3MM',
    previewUrl: '/icons/3mm.svg',
    isPriority: true,
    deadlineAt: '2024-02-15T18:00:00Z',
    createdAt: '2024-02-01T14:20:00Z'
  },
  {
    id: 'stamp-3',
    designName: 'Sello Alimentario',
    widthMm: 19,
    heightMm: 19,
    stampType: 'ALIMENTO',
    previewUrl: '/icons/ABC.svg',
    isPriority: false,
    deadlineAt: '2024-02-20T12:00:00Z',
    createdAt: '2024-02-05T09:15:00Z'
  },
  {
    id: 'stamp-4',
    designName: 'Sello ABC',
    widthMm: 12,
    heightMm: 12,
    stampType: 'ABC',
    previewUrl: '/icons/ABC.svg',
    isPriority: true,
    createdAt: '2024-02-08T16:45:00Z'
  },
  {
    id: 'stamp-5',
    designName: 'Sello Lacre',
    widthMm: 25,
    heightMm: 25,
    stampType: 'LACRE',
    previewUrl: '/icons/LACRE.svg',
    isPriority: false,
    createdAt: '2024-01-22T11:00:00Z'
  },
  {
    id: 'stamp-6',
    designName: 'Logo Clásico',
    widthMm: 38,
    heightMm: 25,
    stampType: 'CLASICO',
    previewUrl: '/icons/CLASICO.svg',
    isPriority: false,
    createdAt: '2024-01-18T13:30:00Z'
  },
  {
    id: 'stamp-7',
    designName: 'Marca 3MM',
    widthMm: 25,
    heightMm: 25,
    stampType: '3MM',
    previewUrl: '/icons/3mm.svg',
    isPriority: true,
    deadlineAt: '2024-02-10T16:30:00Z',
    createdAt: '2024-02-03T08:20:00Z'
  },
  {
    id: 'stamp-8',
    designName: 'Sello Alimentario Grande',
    widthMm: 38,
    heightMm: 38,
    stampType: 'ALIMENTO',
    previewUrl: '/icons/ABC.svg',
    isPriority: false,
    createdAt: '2024-02-12T15:10:00Z'
  }
];

// Función para formatear fecha límite
const formatDeadline = (deadlineAt: string): string => {
  const date = new Date(deadlineAt);
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Función para formatear fecha de creación/subida
const formatCreatedAt = (createdAt: string): string => {
  const date = new Date(createdAt);
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};


// Modal para seleccionar sellos disponibles y agregarlos al programa
export function StampsSelectionDialog({ 
  isOpen, 
  onClose, 
  onAddStamps, 
  programId 
}: StampsSelectionDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStamps, setSelectedStamps] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<StampType | 'ALL'>('ALL');

  // Filtrar sellos por búsqueda y tipo
  const filteredStamps = availableStamps.filter(stamp => {
    const matchesSearch = stamp.designName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'ALL' || stamp.stampType === filterType;
    return matchesSearch && matchesType;
  });

  const handleStampToggle = (stampId: string) => {
    setSelectedStamps(prev => 
      prev.includes(stampId) 
        ? prev.filter(id => id !== stampId)
        : [...prev, stampId]
    );
  };

  const handleAddSelected = () => {
    const stampsToAdd = availableStamps.filter(stamp => selectedStamps.includes(stamp.id));
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
            Agregar Sellos al Programa
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Filtros y búsqueda */}
          <div className="flex gap-4 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar sellos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex gap-2">
              {(['ALL', 'CLASICO', '3MM', 'ALIMENTO', 'ABC', 'LACRE'] as const).map(type => (
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

          {/* Lista de sellos */}
          <div className="flex-1 overflow-y-auto">
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
                      onChange={() => handleStampToggle(stamp.id)}
                      className="mt-1"
                      onClick={(e) => e.stopPropagation()}
                    />
                    
                    {/* Preview del diseño del sello - pequeño a la izquierda */}
                    <div className="w-16 h-16 border border-border rounded bg-muted/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {stamp.previewUrl ? (
                        <img 
                          src={stamp.previewUrl} 
                          alt={`Diseño de ${stamp.designName}`}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-xs text-muted-foreground text-center">
                          {stamp.widthMm}×{stamp.heightMm}mm
                        </div>
                      )}
                    </div>
                    
                    {/* Información del sello - a la derecha */}
                    <div className="flex-1 min-w-0">
                      {/* Header con icono de prioridad, nombre e icono del tipo */}
                      <div className="flex items-center gap-1.5 mb-1">
                        {stamp.isPriority && (
                          <AlertCircle className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
                        )}
                        <h4 className="font-medium text-sm truncate">
                          {stamp.designName}
                        </h4>
                        <StampTypeIcon stampType={stamp.stampType} className="w-4 h-4 flex-shrink-0 opacity-80" />
                      </div>
                      
                      {/* Medidas */}
                      <div className="text-xs text-muted-foreground mb-1">
                        {stamp.widthMm}mm × {stamp.heightMm}mm
                      </div>
                      
                      {/* Fecha de creación/subida */}
                      {stamp.createdAt && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                          <Calendar className="w-3 h-3" />
                          <span>{formatCreatedAt(stamp.createdAt)}</span>
                        </div>
                      )}
                      
                      {/* Fecha límite */}
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
          </div>

          {/* Footer con acciones */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {selectedStamps.length} sello{selectedStamps.length !== 1 ? 's' : ''} seleccionado{selectedStamps.length !== 1 ? 's' : ''}
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



