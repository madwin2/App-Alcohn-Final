import { Link } from 'react-router-dom';
import { ProductionItem } from '@/lib/types/index';

interface CellProgramaProps {
  item: ProductionItem;
}

/**
 * Solo lectura. El programa se asigna/quita en la pestaña Programas.
 * - Con programId: chip link a /programas (programa real).
 * - Solo nombre (histórico sin FK): chip apagado.
 */
export function CellPrograma({ item }: CellProgramaProps) {
  const name = (item.program || '').trim();
  if (!name) {
    return (
      <div className="flex justify-center">
        <span className="text-xs text-muted-foreground">—</span>
      </div>
    );
  }

  if (item.programId) {
    return (
      <div className="flex justify-center">
        <Link
          to="/programas"
          title="Ver en Programas"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary hover:bg-primary/15 underline-offset-2 hover:underline min-w-[60px] justify-center"
        >
          {name}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <span
        className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-muted/50 text-muted-foreground/70 min-w-[60px] justify-center cursor-default"
        title="Texto histórico sin programa vinculado"
      >
        {name}
      </span>
    </div>
  );
}
