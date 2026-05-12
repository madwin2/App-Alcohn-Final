import { useMemo } from 'react';
import { Search, Filter, ArrowUpDown, Plus, Image, Download, FileUp, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StateChips } from './StateChips';
import { useOrdersStore } from '@/lib/state/orders.store';
import { getFabricationCounts, filterOrders, MIN_SEARCH_CHARS_FULL_DATABASE } from '@/lib/utils/orders.utils';
import { FabricationState, Order } from '@/lib/types/index';

interface OrdersHeaderProps {
  orders: Order[];
  onNewOrder: () => void;
  onFilters: () => void;
  onSort: () => void;
  onUploadPhotos?: () => void;
  onUploadTracking?: () => void;
  onExportVentas?: () => void;
  onStateFilter: (state: FabricationState) => void;
  activeStates: FabricationState[];
}

export function OrdersHeader({ 
  orders,
  onNewOrder, 
  onFilters, 
  onSort,
  onUploadPhotos,
  onUploadTracking,
  onExportVentas,
  onStateFilter,
  activeStates 
}: OrdersHeaderProps) {
  const { searchQuery, setSearchQuery, searchAcrossDatabase, setSearchAcrossDatabase, filters, sort } = useOrdersStore();
  
  // Filtrar pedidos según los filtros aplicados
  const filteredOrders = useMemo(() => {
    return filterOrders(orders, searchQuery, filters, sort, searchAcrossDatabase);
  }, [orders, searchQuery, filters, sort, searchAcrossDatabase]);
  
  const activeOrdersCount = filteredOrders.length;
  const counts = getFabricationCounts(filteredOrders);

  return (
    <div className="space-y-4">
      {/* Título y búsqueda */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">
            Pedidos
          </h1>
          <p className="text-xs text-gray-400">
            Total: {activeOrdersCount} • Sin hacer: {counts['SIN_HACER']} • Hecho: {counts['HECHO']}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Buscador */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={
                searchAcrossDatabase
                  ? `Buscar en toda la base (mín. ${MIN_SEARCH_CHARS_FULL_DATABASE} letras)...`
                  : 'Buscar pedidos...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-64"
            />
          </div>

          <Button
            variant={searchAcrossDatabase ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSearchAcrossDatabase(!searchAcrossDatabase)}
            className="gap-2"
            title="Buscar en toda la base ignorando filtros"
          >
            <Database className="h-4 w-4" />
            Toda la base
          </Button>

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

          {/* Subir Fotos */}
          {onUploadPhotos && (
            <Button
              variant="outline"
              size="sm"
              onClick={onUploadPhotos}
              className="gap-2"
            >
              <Image className="h-4 w-4" />
              Subir Fotos
            </Button>
          )}

          {onUploadTracking && (
            <Button
              variant="outline"
              size="sm"
              onClick={onUploadTracking}
              className="gap-2"
            >
              <FileUp className="h-4 w-4" />
              Subir seguimientos
            </Button>
          )}

          {/* Exportar ventas */}
          {onExportVentas && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExportVentas}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Exportar ventas
            </Button>
          )}

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
      {searchAcrossDatabase &&
      searchQuery.toLowerCase().trim().replace(/\s+/g, ' ').length <
        MIN_SEARCH_CHARS_FULL_DATABASE ? (
        <p className="text-xs text-muted-foreground">
          Para buscar en toda la base, ingresá al menos {MIN_SEARCH_CHARS_FULL_DATABASE} caracteres.
        </p>
      ) : null}

    </div>
  );
}
