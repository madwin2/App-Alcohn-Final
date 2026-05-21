import { useState, useEffect } from 'react';
import { AppMain } from '@/components/layout/AppMain';
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
  const searchAcrossDatabase = useOrdersStore((s) => s.searchAcrossDatabase);
  const { orders, loading, error, createOrder, updateOrder, deleteOrder, addStampToOrder, deleteStamp, fetchOrders } =
    useOrders({ useFullCatalog: searchAcrossDatabase });
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
    <AppMain>
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
          const appliedMatches: typeof matches = [];
          const failed: Array<{ match: (typeof matches)[number]; reason: string }> = [];

          for (const match of matches) {
            try {
              const hasNonTransferredItems = match.order.items.some((item) => item.saleState !== 'TRANSFERIDO');
              const patch: Partial<import('@/lib/types/index').Order> = {
                shipping: {
                  ...match.order.shipping,
                  trackingNumber: match.trackingNumber,
                },
                items: match.order.items.map((item) => ({
                  id: item.id,
                  shippingState: 'DESPACHADO' as const,
                  ...(hasNonTransferredItems ? { saleState: 'TRANSFERIDO' as const } : {}),
                })) as any,
              };
              await updateOrder(match.order.id, patch);

              appliedMatches.push(match);
            } catch (error) {
              failed.push({
                match,
                reason: error instanceof Error ? error.message : 'Error desconocido al aplicar el seguimiento.',
              });
            }
          }

          if (appliedMatches.length > 0) {
            await fetchOrders({ silent: true });
          }

          if (appliedMatches.length === 0) {
            throw new Error(failed[0]?.reason || 'No se pudo aplicar ningún seguimiento.');
          }

          return { appliedMatches, failed };
        }}
      />

      {/* Toast notifications */}
      <Toaster />
    </AppMain>
  );
}
