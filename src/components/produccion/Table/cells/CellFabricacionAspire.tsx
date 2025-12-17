import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductionItem, ProductionState, AspireState } from '@/lib/types/index';
import { getFabricationStateColor, getFabricationChipVisual, getFabricationLabel } from '@/lib/utils/format';

interface CellFabricacionAspireProps {
  item: ProductionItem;
  onFabricacionChange?: (itemId: string, newState: ProductionState) => void;
  onAspireChange?: (itemId: string, newState: AspireState | null) => void;
}

// Mapeo de estados de producción a estados de fabricación de pedidos
const productionToFabricationMap: Record<ProductionState, string> = {
  'PENDIENTE': 'SIN_HACER',
  'EN_PROGRESO': 'HACIENDO',
  'COMPLETADO': 'HECHO',
  'REVISAR': 'VERIFICAR',
  'REHACER': 'REHACER'
};

const fabricationToProductionMap: Record<string, ProductionState> = {
  'SIN_HACER': 'PENDIENTE',
  'HACIENDO': 'EN_PROGRESO',
  'HECHO': 'COMPLETADO',
  'VERIFICAR': 'REVISAR',
  'REHACER': 'REHACER',
  'RETOCAR': 'REVISAR', // Mapear a revisar
  'PROGRAMADO': 'PENDIENTE', // Mapear programado a pendiente
};

// Opciones de Aspire
const aspireOptions: { value: AspireState; label: string }[] = [
  { value: 'Aspire G', label: 'Aspire G' },
  { value: 'Aspire G Check', label: 'Aspire G Check' },
  { value: 'Aspire C', label: 'Aspire C' },
  { value: 'Aspire C Check', label: 'Aspire C Check' },
  { value: 'Aspire XL', label: 'Aspire XL' },
];

// Función para obtener el estilo visual del chip Aspire
const getAspireChipVisual = (state: AspireState | null) => {
  if (!state) {
    return {
      backgroundImage: `linear-gradient(60deg, rgba(107,114,128,0.05) 0%, rgba(107,114,128,0) 100%)`,
      backgroundColor: `rgba(107,114,128,0.1)`,
      boxShadow: 'none',
      borderColor: `rgba(107,114,128,0.70)`,
      textClass: '',
      textColor: `rgba(107,114,128,0.82)`,
      width: 'auto'
    };
  }

  switch (state) {
    case 'Aspire G':
      return {
        backgroundImage: `linear-gradient(60deg, rgba(59,130,246,0.05) 0%, rgba(59,130,246,0) 100%)`,
        backgroundColor: `rgba(59,130,246,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(59,130,246,0.70)`,
        textClass: '',
        textColor: `rgba(59,130,246,0.82)`,
        width: 'auto'
      };
    case 'Aspire G Check':
      return {
        backgroundImage: `linear-gradient(60deg, rgba(34,197,94,0.05) 0%, rgba(34,197,94,0) 100%)`,
        backgroundColor: `rgba(34,197,94,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(34,197,94,0.70)`,
        textClass: '',
        textColor: `rgba(34,197,94,0.82)`,
        width: 'auto'
      };
    case 'Aspire C':
      return {
        backgroundImage: `linear-gradient(60deg, rgba(168,85,247,0.05) 0%, rgba(168,85,247,0) 100%)`,
        backgroundColor: `rgba(168,85,247,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(168,85,247,0.70)`,
        textClass: '',
        textColor: `rgba(168,85,247,0.82)`,
        width: 'auto'
      };
    case 'Aspire C Check':
      return {
        backgroundImage: `linear-gradient(60deg, rgba(34,197,94,0.05) 0%, rgba(34,197,94,0) 100%)`,
        backgroundColor: `rgba(34,197,94,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(34,197,94,0.70)`,
        textClass: '',
        textColor: `rgba(34,197,94,0.82)`,
        width: 'auto'
      };
    case 'Aspire XL':
      return {
        backgroundImage: `linear-gradient(60deg, rgba(249,115,22,0.05) 0%, rgba(249,115,22,0) 100%)`,
        backgroundColor: `rgba(249,115,22,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(249,115,22,0.70)`,
        textClass: '',
        textColor: `rgba(249,115,22,0.82)`,
        width: 'auto'
      };
    default:
      return {
        backgroundImage: `linear-gradient(60deg, rgba(107,114,128,0.05) 0%, rgba(107,114,128,0) 100%)`,
        backgroundColor: `rgba(107,114,128,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(107,114,128,0.70)`,
        textClass: '',
        textColor: `rgba(107,114,128,0.82)`,
        width: 'auto'
      };
  }
};

const getAspireLabel = (state: AspireState | null): string => {
  if (!state) return '—';
  return state;
};

export function CellFabricacionAspire({ item, onFabricacionChange, onAspireChange }: CellFabricacionAspireProps) {
  const fabricationState = productionToFabricationMap[item.productionState];
  
  // Determinar qué mostrar: si tiene aspire state, mostrar ese; si no, mostrar fabrication state
  // La prioridad la tiene el estado de aspire sobre programado
  const displayState = item.aspireState ? `ASPIRE_${item.aspireState.replace(/\s+/g, '_')}` : fabricationState;
  const isAspireState = !!item.aspireState;
  
  const handleValueChange = (value: string) => {
    // Si el valor empieza con "ASPIRE_", es un estado de aspire
    if (value.startsWith('ASPIRE_')) {
      const aspireValue = value.replace('ASPIRE_', '').replace(/_/g, ' ') as AspireState;
      onAspireChange?.(item.id, aspireValue);
    } else {
      // Es un estado de fabricación
      const productionState = fabricationToProductionMap[value] || 'PENDIENTE';
      onFabricacionChange?.(item.id, productionState);
      // No limpiar Aspire desde acá: el update de fabricación ya lo limpia en backend
      // para que sea atómico y no pise el estado recién seteado.
    }
  };

  // Opciones del desplegable en el orden especificado:
  // Sin Hacer, Programado, todos los de aspire, Haciendo, Rehacer, Retocar, Verificar, Hecho
  const dropdownOptions = [
    { value: 'SIN_HACER', label: 'Sin Hacer', isAspire: false },
    { value: 'PROGRAMADO', label: 'Programado', isAspire: false },
    ...aspireOptions.map(opt => ({ value: `ASPIRE_${opt.value.replace(/\s+/g, '_')}`, label: opt.label, isAspire: true })),
    { value: 'HACIENDO', label: 'Haciendo', isAspire: false },
    { value: 'REHACER', label: 'Rehacer', isAspire: false },
    { value: 'RETOCAR', label: 'Retocar', isAspire: false },
    { value: 'VERIFICAR', label: 'Verificar', isAspire: false },
    { value: 'HECHO', label: 'Hecho', isAspire: false },
  ];

  return (
    <div className="w-full h-12 flex items-center justify-center">
      <Select value={displayState} onValueChange={handleValueChange}>
        <SelectTrigger className="w-full h-12 text-xs [&>svg]:hidden border-none bg-transparent rounded-lg p-3 overflow-visible flex items-center justify-center [&:hover]:bg-transparent">
          <SelectValue>
            {(() => {
              if (isAspireState && item.aspireState) {
                const visual = getAspireChipVisual(item.aspireState);
                return (
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                    style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}
                  >
                    {getAspireLabel(item.aspireState)}
                  </span>
                );
              } else {
                const visual = getFabricationChipVisual(fabricationState, item.isPriority);
                return (
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                    style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}
                  >
                    {getFabricationLabel(fabricationState, item.isPriority)}
                  </span>
                );
              }
            })()}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {dropdownOptions.map((option) => {
            if (option.isAspire) {
              const aspireValue = option.value.replace('ASPIRE_', '').replace(/_/g, ' ') as AspireState;
              const visual = getAspireChipVisual(aspireValue);
              return (
                <SelectItem 
                  key={option.value} 
                  value={option.value} 
                  className={`text-xs`}
                >
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                    style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}
                  >
                    {option.label}
                  </span>
                </SelectItem>
              );
            } else {
              const visual = getFabricationChipVisual(option.value);
              return (
                <SelectItem 
                  key={option.value} 
                  value={option.value} 
                  className={`text-xs`}
                >
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                    style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}
                  >
                    {getFabricationLabel(option.value, false)}
                  </span>
                </SelectItem>
              );
            }
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

