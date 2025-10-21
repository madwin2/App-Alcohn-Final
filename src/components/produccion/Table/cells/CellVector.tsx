import { Upload } from 'lucide-react';
import { ProductionItem } from '@/lib/types/index';
import { useProductionStore } from '@/lib/state/production.store';

interface CellVectorProps {
  item: ProductionItem;
}

export function CellVector({ item }: CellVectorProps) {
  const { showPreviews } = useProductionStore();
  
  const hasFile = item.files?.vectorUrl;

  if (!showPreviews) {
    return null; // No mostrar nada cuando las previsualizaciones están deshabilitadas
  }

  if (!hasFile) {
    return (
      <div className="flex items-center justify-center w-10 h-10 border-2 border-dashed border-muted-foreground/25 rounded">
        <Upload className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-10 h-10 rounded border overflow-hidden">
      <img
        src={hasFile}
        alt="Vector"
        className="w-full h-full object-cover"
        onError={(e) => {
          // Si falla la imagen, mostrar el ícono de subir
          e.currentTarget.style.display = 'none';
          e.currentTarget.nextElementSibling?.classList.remove('hidden');
        }}
      />
      <div className="hidden w-full h-full flex items-center justify-center bg-muted">
        <Upload className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}
