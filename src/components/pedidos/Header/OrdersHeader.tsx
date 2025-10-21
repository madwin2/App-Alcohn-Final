import { Search, Filter, ArrowUpDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StateChips } from './StateChips';
import { ViewToggle } from './ViewToggle';
import { useOrdersStore } from '@/lib/state/orders.store';
import { FabricationState } from '@/lib/types/index';

interface OrdersHeaderProps {
  onNewOrder: () => void;
  onFilters: () => void;
  onSort: () => void;
  onStateFilter: (state: FabricationState) => void;
  activeStates: FabricationState[];
}

export function OrdersHeader({ 
  onNewOrder, 
  onFilters, 
  onSort, 
  onStateFilter,
  activeStates 
}: OrdersHeaderProps) {
  const { searchQuery, setSearchQuery, orders } = useOrdersStore();
  
  const activeOrdersCount = orders.length;
  const sinHacerCount = orders.filter(order => order.estado_orden === 'Señado').length;
  const hechoCount = orders.filter(order => order.estado_orden === 'Hecho').length;

  return (
    <div className="space-y-4">
      {/* Título y búsqueda */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">
            Pedidos
          </h1>
          <p className="text-xs text-gray-400">
            Total: {activeOrdersCount} • Sin hacer: {sinHacerCount} • Hecho: {hechoCount}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Toggle de Vista */}
          <ViewToggle />
          
          {/* Buscador */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar pedidos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-64"
            />
          </div>

          {/* Ordenar */}
          <Button
            variant="outline"
            size="sm"
            onClick={onSort}
            className="gap-2"
          >
            <ArrowUpDown className="h-4 w-4" />
            Ordenar
          </Button>

          {/* Filtros */}
          <Button
            variant="outline"
            size="sm"
            onClick={onFilters}
            className="gap-2"
          >
            <Filter className="h-4 w-4" />
            Filtros
          </Button>

          {/* Nuevo Pedido */}
          <Button
            onClick={onNewOrder}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Nuevo
          </Button>
        </div>
      </div>

    </div>
  );
}
