import { ProductionItem } from '@/lib/types/index';

interface CellNotasProps {
  item: ProductionItem;
}

export function CellNotas({ item }: CellNotasProps) {
  if (!item.notes?.trim()) {
    return <div className="text-sm text-muted-foreground">-</div>;
  }

  return (
    <div className="text-sm text-muted-foreground leading-snug whitespace-pre-wrap break-words min-w-0 py-1">
      {item.notes.trim()}
    </div>
  );
}
