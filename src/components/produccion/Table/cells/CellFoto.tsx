import { ProductionItem } from '@/lib/types/index';

interface CellFotoProps {
  item: ProductionItem;
}

export function CellFoto({ item }: CellFotoProps) {
  const hasFile = item.files?.photoUrl;
  
  return (
    <div className="flex justify-center">
      {hasFile ? (
        <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
          <div className="w-2 h-2 bg-green-600 rounded-full"></div>
        </div>
      ) : (
        <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center">
          <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
        </div>
      )}
    </div>
  );
}








