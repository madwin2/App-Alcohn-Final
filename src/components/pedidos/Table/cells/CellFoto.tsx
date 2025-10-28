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
  
  // Si es un archivo resumido (para pedidos con múltiples items)
  if (hasFile === 'summary') {
    const totalItems = order.items.length;
    const itemsWithFiles = order.items.filter(item => item.files?.photoUrl).length;
    
    return (
      <div className="flex items-center justify-center w-10 h-10 border-2 border-solid border-green-500 rounded bg-green-50 dark:bg-green-900/20">
        <span className="text-xs font-medium text-green-600 dark:text-green-400">
          {itemsWithFiles}/{totalItems}
        </span>
      </div>
    );
  }

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
