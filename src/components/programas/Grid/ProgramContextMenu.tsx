import { RefreshCw, Trash2 } from 'lucide-react';
import type { FabricationState } from '@/lib/types/index';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';

const STATUS_OPTIONS: { state: FabricationState; label: string }[] = [
  { state: 'HACIENDO', label: 'Haciendo' },
  { state: 'REHACER', label: 'Rehacer' },
  { state: 'HECHO', label: 'Hecho' },
];

interface ProgramContextMenuProps {
  locked?: boolean;
  busy?: boolean;
  hasStamps?: boolean;
  onDelete?: () => void;
  onSetFabricationState?: (state: FabricationState) => void;
}

/** Contenido del menú contextual (botón secundario) de una tarjeta de programa. */
export function ProgramContextMenu({
  locked = false,
  busy = false,
  hasStamps = true,
  onDelete,
  onSetFabricationState,
}: ProgramContextMenuProps) {
  const cannotDelete = locked || busy || !onDelete;
  const cannotChangeState = busy || !hasStamps || !onSetFabricationState;

  return (
    <ContextMenuContent className="w-48" onClick={(e) => e.stopPropagation()}>
      {onDelete ? (
        <ContextMenuItem
          disabled={cannotDelete}
          className="gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
          onSelect={() => {
            if (cannotDelete) return;
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />
          Eliminar
        </ContextMenuItem>
      ) : null}

      {onDelete && onSetFabricationState ? <ContextMenuSeparator /> : null}

      {onSetFabricationState ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={cannotChangeState} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Cambiar estado
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-40">
            {STATUS_OPTIONS.map(({ state, label }) => (
              <ContextMenuItem
                key={state}
                disabled={cannotChangeState}
                onSelect={() => {
                  if (cannotChangeState) return;
                  onSetFabricationState(state);
                }}
              >
                {label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}
    </ContextMenuContent>
  );
}
