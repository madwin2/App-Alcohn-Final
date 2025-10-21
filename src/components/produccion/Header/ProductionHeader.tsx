import { Search, Filter, ArrowUpDown, Plus, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProductionStateChips } from './ProductionStateChips';
import { useProductionStore } from '@/lib/state/production.store';
import { ProductionState } from '@/lib/types/index';

interface ProductionHeaderProps {
  onNewTask: () => void;
  onFilters: () => void;
  onSort: () => void;
  onStateFilter: (state: ProductionState) => void;
  activeStates: ProductionState[];
}

export function ProductionHeader({ 
  onNewTask, 
  onFilters, 
  onSort, 
  onStateFilter,
  activeStates 
}: ProductionHeaderProps) {
  const { searchQuery, setSearchQuery, showPreviews, setShowPreviews, sellos } = useProductionStore();
  
  const activeItemsCount = sellos.length;
  const pendingCount = sellos.filter(item => item.estado_fabricacion === 'Sin Hacer').length;
  const completedCount = sellos.filter(item => item.estado_fabricacion === 'Hecho').length;

  return (
    <div className="space-y-4">
      {/* Título y búsqueda */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">
            Producción
          </h1>
          <p className="text-xs text-gray-400">
            Total: {activeItemsCount} • Pendientes: {pendingCount} • Completados: {completedCount}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Buscador */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar producción..."
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

          {/* Toggle Previsualizaciones */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreviews(!showPreviews)}
            className="gap-2"
          >
            {showPreviews ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showPreviews ? 'Ocultar' : 'Mostrar'}
          </Button>

          {/* Nueva Tarea */}
          <Button
            onClick={onNewTask}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Nueva Tarea
          </Button>
        </div>
      </div>

      {/* Chips de estado */}
      <ProductionStateChips 
        onStateClick={onStateFilter}
        activeStates={activeStates}
      />
    </div>
  );
}
