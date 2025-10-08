import { useState } from 'react';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { OrdersHeader } from '@/components/pedidos/Header/OrdersHeader';
import { OrdersTable } from '@/components/pedidos/Table/OrdersTable';
import { FiltersDialog } from '@/components/pedidos/Filters/FiltersDialog';
import { SorterDialog } from '@/components/pedidos/Sorter/SorterDialog';
import { NewOrderDialog } from '@/components/pedidos/NewOrder/NewOrderDialog';
import { Toaster } from '@/components/ui/toaster';
import { mockOrders } from '@/lib/mocks/orders.mock';
import { FabricationState } from '@/lib/types/index';
import { useOrdersStore } from '@/lib/state/orders.store';

export default function PedidosPage() {
  const { sidebarExpanded } = useOrdersStore();
  const [showFilters, setShowFilters] = useState(false);
  const [showSorter, setShowSorter] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [activeStates, setActiveStates] = useState<FabricationState[]>([]);

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
      
      {/* Main Content */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${
        sidebarExpanded ? 'ml-0' : 'ml-20'
      }`}>
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
          <OrdersTable orders={mockOrders} />
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
