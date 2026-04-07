import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { OrdersHeader } from '@/components/pedidos/Header/OrdersHeader';
import { OrdersTable } from '@/components/pedidos/Table/OrdersTable';
import { FiltersDialog } from '@/components/pedidos/Filters/FiltersDialog';
import { SorterDialog } from '@/components/pedidos/Sorter/SorterDialog';
import { NewOrderDialog } from '@/components/pedidos/NewOrder/NewOrderDialog';
import { UploadPhotosDialog } from '@/components/pedidos/UploadPhotos/UploadPhotosDialog';
import { UploadTrackingDialog } from '@/components/pedidos/UploadTracking/UploadTrackingDialog';
import { Toaster } from '@/components/ui/toaster';
import { useOrders } from '@/lib/hooks/useOrders';
import { useOrdersStore } from '@/lib/state/orders.store';
import { useTableViewPersistence } from '@/lib/hooks/useTableViewPersistence';
import { FabricationState } from '@/lib/types/index';
import { exportVentasToCsv } from '@/lib/utils/exportVentas';

export default function PedidosPage() {
  const { orders, loading, error, createOrder, updateOrder, deleteOrder, addStampToOrder, deleteStamp, fetchOrders } = useOrders();
  const [showFilters, setShowFilters] = useState(false);
  const [showSorter, setShowSorter] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showUploadPhotos, setShowUploadPhotos] = useState(false);
  const [showUploadTracking, setShowUploadTracking] = useState(false);
  const [activeStates, setActiveStates] = useState<FabricationState[]>([]);
  
  const store = useOrdersStore();
  const {
    configLoaded,
    loadConfig,
    getConfigForSave,
  } = store;

  // Marcar como cargado si no hay usuario (para evitar esperar)
  useEffect(() => {
    if (!configLoaded) {
      store.setConfigLoaded(true);
    }
  }, [configLoaded, store]);

  // Persistir configuración de la tabla
  useTableViewPersistence(
    'pedidos',
    getConfigForSave(),
    loadConfig,
    configLoaded
  );

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
          {!loading && !error && (
            <OrdersHeader
              orders={orders}
              onNewOrder={() => setShowNewOrder(true)}
              onFilters={() => setShowFilters(true)}
              onSort={() => setShowSorter(true)}
              onUploadPhotos={() => setShowUploadPhotos(true)}
              onUploadTracking={() => setShowUploadTracking(true)}
              onExportVentas={() => exportVentasToCsv(orders)}
              onStateFilter={handleStateFilter}
              activeStates={activeStates}
            />
          )}
        </div>

        {/* Table */}
        <div className="flex-1 p-6 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Cargando órdenes...</p>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-destructive">Error: {error.message}</p>
            </div>
          ) : (
            <OrdersTable 
              orders={orders} 
              onUpdate={updateOrder}
              onDelete={deleteOrder}
              onAddStamp={async (orderId, item, files) => {
                await addStampToOrder(orderId, item, files);
              }}
              onDeleteStamp={async (stampId) => {
                await deleteStamp(stampId);
              }}
            />
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
        createOrder={createOrder}
        addStampToOrder={async (orderId, item, files) => {
          await addStampToOrder(orderId, item, files);
        }}
        fetchOrders={fetchOrders}
      />

      <UploadPhotosDialog
        open={showUploadPhotos}
        onOpenChange={setShowUploadPhotos}
        onSuccess={() => {
          // Refrescar las órdenes cuando se asigne una foto exitosamente
          fetchOrders();
        }}
      />

      <UploadTrackingDialog
        open={showUploadTracking}
        onOpenChange={setShowUploadTracking}
        orders={orders}
        onApply={async (matches) => {
          for (const match of matches) {
            await updateOrder(match.order.id, {
              shipping: {
                ...match.order.shipping,
                trackingNumber: match.trackingNumber,
              },
              items: match.order.items.map((item) => ({
                id: item.id,
                shippingState: 'DESPACHADO',
              })) as any,
            });
          }
          await fetchOrders();
        }}
      />

      {/* Toast notifications */}
      <Toaster />
    </div>
  );
}
