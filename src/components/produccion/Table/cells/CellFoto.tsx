import { Upload } from 'lucide-react';
import { ProductionItem } from '@/lib/types/index';
import { useProductionStore } from '@/lib/state/production.store';

interface CellFotoProps {
  item: ProductionItem;
}

export function CellFoto({ item }: CellFotoProps) {
  const { showPreviews } = useProductionStore();
  const hasFile = item.files?.photoUrl;
  
  if (!showPreviews) {
    // Cuando las previsualizaciones están deshabilitadas, mostrar solo el indicador
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

  // Cuando las previsualizaciones están habilitadas, mostrar la imagen
  return (
    <div className="w-full h-12 flex items-center justify-center">
      {!hasFile ? (
        <div className="flex items-center justify-center w-10 h-10 border-2 border-dashed border-muted-foreground/25 rounded">
          <Upload className="h-4 w-4 text-muted-foreground" />
        </div>
      ) : (
        <div className="w-10 h-10 rounded border overflow-hidden">
          <img
            src={hasFile}
            alt="Foto"
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
      )}
    </div>
  );
}














