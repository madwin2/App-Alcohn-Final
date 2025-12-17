import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { ProductionHeader } from '@/components/produccion/Header/ProductionHeader';
import { ProductionTable } from '@/components/produccion/Table/ProductionTable';
import { ProductionFiltersDialog } from '@/components/produccion/Filters/ProductionFiltersDialog';
import { ProductionSorterDialog } from '@/components/produccion/Sorter/ProductionSorterDialog';
import { Toaster } from '@/components/ui/toaster';
import { useProduction } from '@/lib/hooks/useProduction';
import { useProductionStore } from '@/lib/state/production.store';
import { useTableViewPersistence } from '@/lib/hooks/useTableViewPersistence';

export default function ProduccionPage() {
  const { items, loading, error, updateItem, fetchItems } = useProduction();
  const [showFilters, setShowFilters] = useState(false);
  const [showSorter, setShowSorter] = useState(false);
  
  const store = useProductionStore();
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
    'produccion',
    getConfigForSave(),
    loadConfig,
    configLoaded
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content - Siempre con margen fijo para que la tabla no cambie de tamaño */}
      <div className="flex-1 flex flex-col ml-20">
        {/* Header */}
        <div className="border-b bg-background p-6">
          {!loading && !error && (
            <ProductionHeader
              items={items}
              onFilters={() => setShowFilters(true)}
              onSort={() => setShowSorter(true)}
            />
          )}
        </div>

        {/* Table */}
        <div className="flex-1 p-6 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Cargando items de producción...</p>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-destructive">Error: {error.message}</p>
            </div>
          ) : (
            <ProductionTable items={items} onUpdateItem={updateItem} onRefreshItems={fetchItems} />
          )}
        </div>
      </div>

      {/* Dialogs */}
      <ProductionFiltersDialog
        open={showFilters}
        onOpenChange={setShowFilters}
      />
      
      <ProductionSorterDialog
        open={showSorter}
        onOpenChange={setShowSorter}
      />
      

      {/* Toast notifications */}
      <Toaster />
    </div>
  );
}
