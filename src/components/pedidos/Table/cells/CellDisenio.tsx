import { formatDimensions, truncateText } from '@/lib/utils/format';
import type { Orden } from '@/lib/supabase/types';

interface CellDisenioProps {
  order: Orden;
  showNotes?: boolean;
}

export function CellDisenio({ order, showNotes = true }: CellDisenioProps) {
  // Obtener el primer sello de la orden
  const sellos = (order as any).sellos;
  const sello = sellos && sellos.length > 0 ? sellos[0] : null;
  
  if (!sello) {
    return (
      <div className="min-w-0">
        <p className="text-sm font-medium truncate text-gray-400">
          Sin sello
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <p className="text-sm font-medium truncate">
        {sello.diseno || 'Sin diseño'}
      </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{formatDimensions(sello.largo_real, sello.ancho_real)}</span>
        {showNotes && sello.nota && (
          <span className="text-blue-400 truncate" title={sello.nota}>
            • {truncateText(sello.nota, 15)}
          </span>
        )}
      </div>
    </div>
  );
}
