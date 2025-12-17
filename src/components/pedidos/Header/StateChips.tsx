import { Badge } from '@/components/ui/badge';
import { FabricationState, Order } from '@/lib/types/index';
import { getFabricationCounts } from '@/lib/utils/orders.utils';
import { cn } from '@/lib/utils/cn';

interface StateChipsProps {
  orders: Order[];
  onStateClick?: (state: FabricationState) => void;
  activeStates?: FabricationState[];
}

const stateLabels: Record<FabricationState, string> = {
  SIN_HACER: 'Sin Hacer',
  HACIENDO: 'Haciendo',
  VERIFICAR: 'Verificar',
  HECHO: 'Hecho',
  REHACER: 'Rehacer',
  RETOCAR: 'Retocar',
  PROGRAMADO: 'Programado'
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
  RETOCAR: 'bg-yellow-400 text-black',
  PROGRAMADO: 'bg-purple-500 text-white'
};

export function StateChips({ orders, onStateClick, activeStates = [] }: StateChipsProps) {
  const counts = getFabricationCounts(orders);

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
