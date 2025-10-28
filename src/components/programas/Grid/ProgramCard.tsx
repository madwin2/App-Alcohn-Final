import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, X, ChevronDown, ChevronUp, Lock, Unlock, Trash2, Plus, Download } from 'lucide-react';
import { Program, FabricationState, ProgramStamp } from '@/lib/types/index';
import { getFabricationChipVisual, getFabricationLabel } from '@/lib/utils/format';
import { StampsSelectionDialog } from '../StampsSelection/StampsSelectionDialog';

interface ProgramCardProps {
  program: Program;
}

// Función para obtener el color del estado de fabricación
const fabricationLabels: Record<FabricationState, string> = {
  'SIN_HACER': 'Sin Hacer',
  'HACIENDO': 'Haciendo',
  'VERIFICAR': 'Verificar',
  'HECHO': 'Hecho',
  'REHACER': 'Rehacer',
  'RETOCAR': 'Retocar'
};

// Función para obtener el texto y color del indicador de máquina
const getMachineInfo = (machine: string) => {
  switch (machine) {
    case 'C':
      return { text: 'Maquina Chica', color: 'bg-purple-600 text-white' };
    case 'G':
      return { text: 'Maquina Grande', color: 'bg-blue-600 text-white' };
    case 'XL':
      return { text: 'Maquina XL', color: 'bg-green-600 text-white' };
    case 'ABC':
      return { text: 'Maquina ABC', color: 'bg-orange-600 text-white' };
    default:
      return { text: 'Maquina', color: 'bg-gray-600 text-white' };
  }
};

// Tarjeta individual para mostrar información de un programa con versión contraída y expandida
export function ProgramCard({ program }: ProgramCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVerified, setIsVerified] = useState(program.isVerified);
  const [fabricationState, setFabricationState] = useState(program.fabricationState);
  const [isLocked, setIsLocked] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showStampsDialog, setShowStampsDialog] = useState(false);
  const [programStamps, setProgramStamps] = useState<ProgramStamp[]>(program.stamps);

  const toggleExpanded = () => {
    console.log(`Toggling card ${program.id}, current state: ${isExpanded}`);
    setIsExpanded(!isExpanded);
  };

  const handleVerificationClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLocked) {
      setIsVerified(!isVerified);
    }
  };

  const handleLockClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLocked(!isLocked);
  };

  const handleStateChange = (value: FabricationState) => {
    if (!isLocked) {
      setFabricationState(value);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLocked) {
      setShowContextMenu(true);
    }
  };

  const handleDelete = () => {
    console.log('Eliminar programa:', program.id);
    setShowContextMenu(false);
  };

  const handleAddStamps = () => {
    console.log('Agregar sellos al programa:', program.id);
    setShowContextMenu(false);
    setShowStampsDialog(true);
  };

  const handleAddStampsToProgram = (selectedStamps: ProgramStamp[]) => {
    console.log('Agregando sellos al programa:', program.id, selectedStamps);
    setProgramStamps(prev => [...prev, ...selectedStamps]);
    setShowStampsDialog(false);
  };

  const handleDownload = () => {
    console.log('Descargar programa:', program.id);
    setShowContextMenu(false);
  };

  // Cerrar menú contextual al hacer click fuera
  useEffect(() => {
    const handleClickOutside = () => {
      if (showContextMenu) {
        setShowContextMenu(false);
      }
    };

    if (showContextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showContextMenu]);

  return (
    <Card 
      id={`program-card-${program.id}`}
      className={`hover:shadow-xl hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 ease-out cursor-pointer relative overflow-hidden ${
        isExpanded ? 'shadow-lg' : 'shadow-md'
      } ${isLocked ? 'opacity-75 bg-muted/20' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!isLocked) {
          toggleExpanded();
        }
      }}
      onContextMenu={handleContextMenu}
    >
      {/* Cuarto de círculo verde en esquina inferior derecha */}
      {isVerified && (
        <div className="absolute -bottom-16 -right-16 w-40 h-40 bg-gradient-to-br from-green-400/20 to-green-600/40 rounded-full blur-2xl"></div>
      )}
      <CardHeader className="pb-3">
        <div className="space-y-3">
          {/* Fila superior: Indicador de máquina y botones */}
          <div className="flex items-center justify-between">
            {/* Indicador de máquina - ARRIBA IZQUIERDA */}
            <div className={`px-3 py-1 rounded text-xs font-medium w-fit ${getMachineInfo(program.machine).color}`}>
              {getMachineInfo(program.machine).text}
            </div>
            
            {/* Botones de la derecha */}
            <div className="flex items-center gap-1">
              {/* Botón de candado */}
              <Button
                variant="ghost"
                size="sm"
                className="p-1 h-6 w-6"
                onClick={handleLockClick}
                title={isLocked ? "Desbloquear programa" : "Bloquear programa"}
              >
                {isLocked ? (
                  <Lock className="h-4 w-4 text-red-500" />
                ) : (
                  <Unlock className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
              
              {/* Botón de expandir/contraer */}
              <Button
                variant="ghost"
                size="sm"
                className="p-1 h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isLocked) {
                    toggleExpanded();
                  }
                }}
                disabled={isLocked}
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        
          {/* Información principal */}
          <div>
            <h3 className="text-xl font-bold text-foreground truncate">
              {program.name}
            </h3>
            
            {/* Fecha y cantidad en la misma línea */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              <span>{program.productionDate}</span>
              <span>{program.stampCount} Sellos</span>
            </div>
            
            {/* Nota del programa */}
            {program.notes && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {program.notes}
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {/* Contenido expandible en el medio */}
        <div className={`overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}>
          <div className="space-y-4 pt-3 border-t border-border/50">
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Sellos:</h4>
              <div className="flex gap-2 flex-wrap">
                {programStamps.map((stamp, index) => (
                  <div 
                    key={stamp.id} 
                    className={`w-8 h-8 bg-white rounded border border-gray-200 flex items-center justify-center text-xs font-medium text-gray-700 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                      isExpanded ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'
                    }`}
                    style={{ 
                      transitionDelay: isExpanded ? `${index * 150}ms` : '0ms'
                    }}
                    title={`${stamp.designName} - ${stamp.stampType}`}
                  >
                    {stamp.widthMm}x{stamp.heightMm}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Largo utilizado */}
            <div className={`space-y-1 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
              isExpanded ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'
            }`}
            style={{ 
              transitionDelay: isExpanded ? `${programStamps.length * 150 + 300}ms` : '0ms'
            }}>
              <span className="text-sm text-muted-foreground">Largo utilizado:</span>
              <div className="text-sm text-foreground">
                <div>38mm: 60mm</div>
                <div>25mm: 120mm</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Estado de fabricación y verificación (siempre al final) */}
        <div className="flex justify-between items-end mt-3">
          <div>
            {/* Select de estado de fabricación - Alineado exactamente con el inicio del nombre */}
            <Select value={fabricationState} onValueChange={handleStateChange} disabled={isLocked}>
              <SelectTrigger 
                className={`w-fit h-8 text-xs [&>svg]:hidden border-none bg-transparent rounded-lg p-2 overflow-visible flex items-center [&:hover]:bg-transparent ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={(e) => e.stopPropagation()}
              >
                     <SelectValue>
                       {(() => {
                         const visual = getFabricationChipVisual(fabricationState);
                         return (
                           <span
                             className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                             style={{ 
                               backgroundImage: visual.backgroundImage, 
                               backgroundColor: visual.backgroundColor, 
                               boxShadow: visual.boxShadow, 
                               borderColor: visual.borderColor, 
                               backdropFilter: 'saturate(140%) blur(3px)', 
                               color: visual.textColor, 
                               width: visual.width 
                             }}
                           >
                             {getFabricationLabel(fabricationState)}
                           </span>
                         );
                       })()}
                     </SelectValue>
                   </SelectTrigger>
                   <SelectContent>
                     {Object.entries(fabricationLabels).map(([value, label]) => (
                       <SelectItem 
                         key={value} 
                         value={value} 
                         className="text-xs"
                       >
                         {(() => {
                           const visual = getFabricationChipVisual(value);
                           return (
                             <span
                               className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                               style={{ 
                                 backgroundImage: visual.backgroundImage, 
                                 backgroundColor: visual.backgroundColor, 
                                 boxShadow: visual.boxShadow, 
                                 borderColor: visual.borderColor, 
                                 backdropFilter: 'saturate(140%) blur(3px)', 
                                 color: visual.textColor, 
                                 width: visual.width 
                               }}
                             >
                               {getFabricationLabel(value)}
                             </span>
                           );
                         })()}
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
          
               {/* Botón de verificación (esquina inferior derecha) */}
               <Button
                 size="sm"
                 className={`h-8 w-8 p-0 rounded-full transition-all duration-200 hover:scale-105 border ${
                   isVerified 
                     ? 'bg-green-500 text-white border-green-500 shadow-lg shadow-green-500/25' 
                     : 'bg-muted/30 text-muted-foreground border-border/40 hover:bg-muted/50'
                 } ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                 onClick={handleVerificationClick}
                 disabled={isLocked}
               >
                 {isVerified ? (
                   <Check className="h-4 w-4" />
                 ) : (
                   <X className="h-4 w-4" />
                 )}
               </Button>
        </div>
      </CardContent>
      
      {/* Menú contextual */}
      {showContextMenu && (
        <div className="absolute top-2 right-2 z-50 bg-background border border-border rounded-md shadow-lg p-1 w-[160px]">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 h-8 text-xs"
            onClick={handleDelete}
          >
            <Trash2 className="h-3 w-3" />
            Eliminar programa
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-primary hover:text-primary hover:bg-primary/10 h-8 text-xs"
            onClick={handleAddStamps}
          >
            <Plus className="h-3 w-3" />
            Agregar sellos
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950 h-8 text-xs"
            onClick={handleDownload}
          >
            <Download className="h-3 w-3" />
            Descargar programa
          </Button>
        </div>
      )}

      {/* Modal de selección de sellos */}
      <StampsSelectionDialog
        isOpen={showStampsDialog}
        onClose={() => setShowStampsDialog(false)}
        onAddStamps={handleAddStampsToProgram}
        programId={program.id}
      />
    </Card>
  );
}
