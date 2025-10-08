import { Badge } from '@/components/ui/badge';
import { FabricationState } from '@/lib/types/index';
import { getFabricationCounts } from '@/lib/mocks/orders.mock';
import { mockOrders } from '@/lib/mocks/orders.mock';
import { cn } from '@/lib/utils/cn';

interface StateChipsProps {
  onStateClick?: (state: FabricationState) => void;
  activeStates?: FabricationState[];
}

const stateLabels: Record<FabricationState, string> = {
  SIN_HACER: 'Sin Hacer',
  HACIENDO: 'Haciendo',
  VERIFICAR: 'Verificar',
  HECHO: 'Hecho',
  REHACER: 'Rehacer',
  PRIORIDAD: 'Prioridad',
  RETOCAR: 'Retocar'
};

// Color de texto para estado inactivo + fondo oscuro con borde sutil.
// Cuando está activo, se sobreescribe por bg correspondiente.
const stateBase = 'px-3 py-1.5 rounded-full text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0';
const stateInactive = 'bg-[hsl(var(--muted))]/40 text-muted-foreground border border-border/40 hover:bg-[hsl(var(--muted))]/60';

const stateActiveBg: Record<FabricationState, string> = {
  SIN_HACER: 'bg-gray-400 text-black',
  HACIENDO: 'bg-blue-500 text-white',
  VERIFICAR: 'bg-orange-500 text-black',
  HECHO: 'bg-green-500 text-black',
  REHACER: 'bg-red-500 text-white',
  PRIORIDAD: 'bg-red-600 text-white',
  RETOCAR: 'bg-yellow-400 text-black'
};

export function StateChips({ onStateClick, activeStates = [] }: StateChipsProps) {
  const counts = getFabricationCounts(mockOrders);

  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(stateLabels) as FabricationState[]).map((state) => {
        const count = counts[state];
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
            <span className="text-xs opacity-70">({count})</span>
          </button>
        );
      })}
    </div>
  );
}
