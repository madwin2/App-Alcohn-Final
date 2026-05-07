import { Upload, FileType2 } from 'lucide-react';
import { ProductionItem } from '@/lib/types/index';
import { useProductionStore } from '@/lib/state/production.store';

interface CellArchivoBaseProps {
  item: ProductionItem;
}

export function CellArchivoBase({ item }: CellArchivoBaseProps) {
  const { showPreviews } = useProductionStore();
  
  const hasFile = item.files?.baseUrl;
  const isPdfUrl = Boolean(hasFile && hasFile.toLowerCase().includes('.pdf'));

  if (!showPreviews) {
    return null; // No mostrar nada cuando las previsualizaciones están deshabilitadas
  }

  return (
    <div className="w-full h-12 flex items-center justify-center">
      {!hasFile ? (
        <div className="flex items-center justify-center w-10 h-10 border-2 border-dashed border-muted-foreground/25 rounded">
          <Upload className="h-4 w-4 text-muted-foreground" />
        </div>
      ) : isPdfUrl ? (
        <div
          className="flex h-10 w-10 flex-col items-center justify-center rounded border border-blue-500/50 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
          title="PDF cargado"
        >
          <FileType2 className="h-6 w-6" aria-hidden />
        </div>
      ) : (
        <div className="w-10 h-10 rounded border overflow-hidden bg-white relative">
          <img
            src={hasFile}
            alt="Base"
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fb = e.currentTarget.nextElementSibling as HTMLElement | null;
              if (fb) {
                fb.classList.remove('hidden');
              }
            }}
          />
          <div className="hidden absolute inset-0 flex items-center justify-center bg-muted">
            <FileType2 className="h-6 w-6 text-muted-foreground" aria-hidden />
          </div>
        </div>
      )}
    </div>
  );
}
