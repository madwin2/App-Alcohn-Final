import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Program, FabricationState } from '@/lib/types/index';

interface ProgramCardProps {
  program: Program;
}

// Función para obtener el color del estado de fabricación
const getFabricationStateColor = (state: FabricationState) => {
  switch (state) {
    case 'SIN_HACER':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    case 'HACIENDO':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'VERIFICAR':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'HECHO':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'REHACER':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'PRIORIDAD':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'RETOCAR':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

// Función para obtener el color del indicador de máquina
const getMachineColor = (machine: string) => {
  switch (machine) {
    case 'C':
      return 'bg-blue-500 text-white';
    case 'G':
      return 'bg-green-500 text-white';
    case 'XL':
      return 'bg-purple-500 text-white';
    case 'ABC':
      return 'bg-orange-500 text-white';
    default:
      return 'bg-gray-500 text-white';
  }
};

// Tarjeta individual para mostrar información de un programa con versión contraída y expandida
export function ProgramCard({ program }: ProgramCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <Card 
      className={`hover:shadow-lg transition-all duration-200 cursor-pointer ${
        isExpanded ? 'shadow-lg' : ''
      }`}
      onClick={toggleExpanded}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          {/* Indicador de máquina */}
          <div className={`w-8 h-8 rounded flex items-center justify-center text-sm font-bold ${getMachineColor(program.machine)}`}>
            {program.machine}
          </div>
          
          {/* Información principal */}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground truncate">
              {program.name}
            </h3>
            
            {/* Fecha y cantidad en la misma línea */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              <span>{program.productionDate}</span>
              <span>{program.stampCount} sellos</span>
            </div>
            
            {/* Nota del programa */}
            {program.notes && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {program.notes}
              </p>
            )}
          </div>
          
          {/* Botón de expandir/contraer */}
          <Button
            variant="ghost"
            size="sm"
            className="p-1 h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded();
            }}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {/* Estado de fabricación y verificación */}
        <div className="flex items-center gap-2 mb-3">
          <Badge 
            className={`text-xs px-2 py-1 ${getFabricationStateColor(program.fabricationState)}`}
          >
            {program.fabricationState}
          </Badge>
          
          <Button
            variant="ghost"
            size="sm"
            className={`p-1 h-6 w-6 ${
              program.isVerified 
                ? 'text-green-600 hover:text-green-700' 
                : 'text-gray-400 hover:text-gray-600'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              // Aquí iría la lógica para cambiar el estado de verificación
            }}
          >
            {program.isVerified ? (
              <Check className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </Button>
        </div>
        
        {/* Versión expandida - Previsualización de sellos */}
        {isExpanded && (
          <div className="space-y-3 pt-3 border-t">
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Sellos asignados:</h4>
              <div className="grid grid-cols-2 gap-2">
                {program.stamps.map((stamp) => (
                  <div key={stamp.id} className="flex items-center gap-2 p-2 bg-muted rounded">
                    <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center text-xs">
                      {stamp.widthMm}x{stamp.heightMm}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{stamp.designName}</p>
                      <p className="text-xs text-muted-foreground">{stamp.stampType}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Largo utilizado */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Largo utilizado:</span>
              <Badge variant="outline" className="text-xs">
                {program.lengthUsed}mm
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
