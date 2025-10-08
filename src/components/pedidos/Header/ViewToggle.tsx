import { Button } from '@/components/ui/button';
import { useOrdersStore } from '@/lib/state/orders.store';

export function ViewToggle() {
  const { viewMode, setViewMode } = useOrdersStore();

  return (
    <div className="flex items-center bg-muted rounded-lg p-1">
      <Button
        variant={viewMode === 'items' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setViewMode('items')}
        className="h-8 px-3 text-xs"
      >
        Por Item
      </Button>
      <Button
        variant={viewMode === 'orders' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setViewMode('orders')}
        className="h-8 px-3 text-xs"
      >
        Por Orden
      </Button>
    </div>
  );
}
