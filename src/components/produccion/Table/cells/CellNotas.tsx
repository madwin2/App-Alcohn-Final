import { ProductionItem } from '@/lib/types/index';

interface CellNotasProps {
  item: ProductionItem;
}

export function CellNotas({ item }: CellNotasProps) {
  if (!item.notes) {
    return <div className="text-sm text-muted-foreground">-</div>;
  }

  return (
    <div
      className="text-sm text-gray-400 leading-tight line-clamp-3 break-words min-w-0"
      title={item.notes}
    >
      {item.notes}
    </div>
  );
}
