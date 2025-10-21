import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { OrdersHeader } from '@/components/pedidos/Header/OrdersHeader';
import { OrdersTable } from '@/components/pedidos/Table/OrdersTable';
import { FiltersDialog } from '@/components/pedidos/Filters/FiltersDialog';
import { SorterDialog } from '@/components/pedidos/Sorter/SorterDialog';
import { NewOrderDialog } from '@/components/pedidos/NewOrder/NewOrderDialog';
import { Toaster } from '@/components/ui/toaster';
import { useOrdersStore } from '@/lib/state/orders.store';
import { FabricationState } from '@/lib/types/index';

export default function PedidosPage() {
  const [showFilters, setShowFilters] = useState(false);
  const [showSorter, setShowSorter] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [activeStates, setActiveStates] = useState<FabricationState[]>([]);

  // Usar el store de Supabase
  const { orders, loading, error, fetchOrders } = useOrdersStore();

  // Cargar datos al montar el componente
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleStateFilter = (state: FabricationState) => {
    setActiveStates(prev => 
      prev.includes(state) 
        ? prev.filter(s => s !== state)
        : [...prev, state]
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content - Siempre con margen fijo para que la tabla no cambie de tamaño */}
      <div className="flex-1 flex flex-col ml-20">
        {/* Header */}
        <div className="border-b bg-background p-6">
          <OrdersHeader
            onNewOrder={() => setShowNewOrder(true)}
            onFilters={() => setShowFilters(true)}
            onSort={() => setShowSorter(true)}
            onStateFilter={handleStateFilter}
            activeStates={activeStates}
          />
        </div>

        {/* Table */}
        <div className="flex-1 p-6 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-lg">Cargando órdenes...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-red-500">Error: {error}</div>
            </div>
          ) : (
            <OrdersTable orders={orders} />
          )}
        </div>
      </div>

      {/* Dialogs */}
      <FiltersDialog
        open={showFilters}
        onOpenChange={setShowFilters}
      />
      
      <SorterDialog
        open={showSorter}
        onOpenChange={setShowSorter}
      />
      
      <NewOrderDialog
        open={showNewOrder}
        onOpenChange={setShowNewOrder}
      />

      {/* Toast notifications */}
      <Toaster />
    </div>
  );
}
