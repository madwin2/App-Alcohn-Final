import { ProductionItem } from '@/lib/types/index';

interface CellNotasProps {
  item: ProductionItem;
}

export function CellNotas({ item }: CellNotasProps) {
  if (!item.notes) {
    return <div className="text-sm text-muted-foreground">-</div>;
  }

  return (
    <div className="text-sm">
      {item.notes}
    </div>
  );
}
