import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductionItem, VectorizationState } from '@/lib/types/index';

interface CellVectorizadoProps {
  item: ProductionItem;
  onVectorizadoChange?: (itemId: string, newState: VectorizationState) => void;
}

// Mapeo de estados de vectorización a estados de fabricación para usar los mismos estilos
const vectorizationToFabricationMap: Record<VectorizationState, string> = {
  'PENDIENTE': 'HACIENDO', // AB en naranja (como Haciendo)
  'COMPLETADO': 'HECHO',   // V en verde (como Hecho)
  'NO_REQUERIDO': 'HACIENDO' // AB en naranja (como Haciendo)
};

const fabricationToVectorizationMap: Record<string, VectorizationState> = {
  'HACIENDO': 'PENDIENTE',
  'HECHO': 'COMPLETADO',
  'SIN_HACER': 'PENDIENTE',
  'VERIFICAR': 'PENDIENTE',
  'REHACER': 'PENDIENTE',
  'PRIORIDAD': 'PENDIENTE',
  'RETOCAR': 'PENDIENTE'
};

// Función para obtener el estilo visual de vectorización
const getVectorizationChipVisual = (state: VectorizationState) => {
  const fabricationState = vectorizationToFabricationMap[state];
  
  // Usar los mismos estilos que fabricación pero con labels personalizados
  switch (fabricationState) {
    case 'HECHO':
      return {
        backgroundImage: `linear-gradient(60deg, rgba(34,197,94,0.05) 0%, rgba(34,197,94,0) 100%)`,
        backgroundColor: `rgba(34,197,94,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(34,197,94,0.70)`,
        textClass: '',
        textColor: `rgba(34,197,94,0.82)`,
        width: '80px'
      };
    case 'HACIENDO':
      return {
        backgroundImage: `linear-gradient(60deg, rgba(249,115,22,0.05) 0%, rgba(249,115,22,0) 100%)`,
        backgroundColor: `rgba(249,115,22,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(249,115,22,0.70)`,
        textClass: '',
        textColor: `rgba(249,115,22,0.82)`,
        width: '80px'
      };
    default:
      return {
        backgroundImage: `linear-gradient(60deg, rgba(249,115,22,0.05) 0%, rgba(249,115,22,0) 100%)`,
        backgroundColor: `rgba(249,115,22,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(249,115,22,0.70)`,
        textClass: '',
        textColor: `rgba(249,115,22,0.82)`,
        width: '80px'
      };
  }
};

const getVectorizationLabel = (state: VectorizationState): string => {
  switch (state) {
    case 'COMPLETADO':
      return 'V';
    case 'PENDIENTE':
    case 'NO_REQUERIDO':
      return 'AB';
    default:
      return 'AB';
  }
};

export function CellVectorizado({ item, onVectorizadoChange }: CellVectorizadoProps) {
  const fabricationState = vectorizationToFabricationMap[item.vectorizationState];
  
  const handleValueChange = (value: string) => {
    const vectorizationState = fabricationToVectorizationMap[value] || 'PENDIENTE';
    onVectorizadoChange?.(item.id, vectorizationState);
  };

  return (
    <Select value={fabricationState} onValueChange={handleValueChange}>
      <SelectTrigger className="w-full h-12 text-xs [&>svg]:hidden border-none bg-transparent rounded-lg p-3 overflow-visible flex items-center [&:hover]:bg-transparent">
        <SelectValue>
          {(() => {
            const visual = getVectorizationChipVisual(item.vectorizationState);
            return (
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}
              >
                {getVectorizationLabel(item.vectorizationState)}
              </span>
            );
          })()}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(vectorizationToFabricationMap).map(([vectorizationState, fabricationState]) => (
          <SelectItem 
            key={fabricationState} 
            value={fabricationState} 
            className={`text-xs`}
          >
            {(() => {
              const visual = getVectorizationChipVisual(vectorizationState as VectorizationState);
              return (
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                  style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}
                >
                  {getVectorizationLabel(vectorizationState as VectorizationState)}
                </span>
              );
            })()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
