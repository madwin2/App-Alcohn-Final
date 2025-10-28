import { ProductionItem } from '@/lib/types';

interface CellPrioridadProps {
  item: ProductionItem;
}

export function CellPrioridad({ item }: CellPrioridadProps) {
  const isPriority = !!item?.isPriority;
  if (!isPriority) return <span className="text-muted-foreground/60 text-xs">—</span>;

  return (
    <span
      aria-label="Tarea prioritaria"
      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-red-600 text-white border border-red-500"
    >
      PRIO
    </span>
  );
}


