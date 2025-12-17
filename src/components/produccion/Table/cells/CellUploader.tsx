import { ProductionItem } from '@/lib/types/index';
import { User } from 'lucide-react';

interface CellUploaderProps {
  item: ProductionItem;
}

export function CellUploader({ item }: CellUploaderProps) {
  if (!item.takenBy?.name) return null;

  return (
    <div className="flex items-center justify-center w-full h-12">
      <div 
        className="cursor-help" 
        title={item.takenBy.name}
      >
        <User className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
      </div>
    </div>
  );
}

