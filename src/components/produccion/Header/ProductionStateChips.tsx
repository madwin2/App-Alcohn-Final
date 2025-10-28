import { Badge } from '@/components/ui/badge';
import { ProductionState } from '@/lib/types/index';
import { mockProductionItems } from '@/lib/mocks/production.mock';
import { cn } from '@/lib/utils/cn';

interface ProductionStateChipsProps {
  onStateClick?: (state: ProductionState) => void;
  activeStates?: ProductionState[];
}

const stateLabels: Record<ProductionState, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROGRESO: 'En Progreso',
  COMPLETADO: 'Completado',
  REVISAR: 'Revisar',
  REHACER: 'Rehacer'
};

// Color de texto para estado inactivo + fondo oscuro con borde sutil.
// Cuando está activo, se sobreescribe por bg correspondiente.
const stateBase = 'px-3 py-1.5 rounded-full text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0';
const stateInactive = 'bg-[hsl(var(--muted))]/40 text-muted-foreground border border-border/40 hover:bg-[hsl(var(--muted))]/60';

const stateActiveBg: Record<ProductionState, string> = {
  PENDIENTE: 'bg-gray-400 text-black',
  EN_PROGRESO: 'bg-blue-500 text-white',
  COMPLETADO: 'bg-green-500 text-black',
  REVISAR: 'bg-orange-500 text-black',
  REHACER: 'bg-red-500 text-white'
};

export function ProductionStateChips({ onStateClick, activeStates = [] }: ProductionStateChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(stateLabels) as ProductionState[]).map((state) => {
        const isActive = activeStates.includes(state);
        
        return (
          <button
            key={state}
            onClick={() => onStateClick?.(state)}
            aria-pressed={isActive}
            className={cn(
              'inline-flex items-center gap-2',
              stateBase,
              !isActive && stateInactive,
              isActive && stateActiveBg[state]
            )}
          >
            <span>{stateLabels[state]}</span>
          </button>
        );
      })}
    </div>
  );
}





