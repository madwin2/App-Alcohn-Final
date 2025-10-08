import { Upload } from 'lucide-react';
import { Order } from '@/lib/types/index';
import { useOrdersStore } from '@/lib/state/orders.store';

interface CellFotoProps {
  order: Order;
}

export function CellFoto({ order }: CellFotoProps) {
  const { showPreviews } = useOrdersStore();
  const item = order.items[0];
  
  if (!item) return null;

  const hasFile = item.files?.photoUrl;

  if (!showPreviews || !hasFile) {
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
        alt="Foto sello"
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
