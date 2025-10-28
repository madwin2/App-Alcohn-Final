import { useState } from 'react';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { ProductionHeader } from '@/components/produccion/Header/ProductionHeader';
import { ProductionTable } from '@/components/produccion/Table/ProductionTable';
import { ProductionFiltersDialog } from '@/components/produccion/Filters/ProductionFiltersDialog';
import { ProductionSorterDialog } from '@/components/produccion/Sorter/ProductionSorterDialog';
import { Toaster } from '@/components/ui/toaster';
import { mockProductionItems } from '@/lib/mocks/production.mock';

export default function ProduccionPage() {
  const [showFilters, setShowFilters] = useState(false);
  const [showSorter, setShowSorter] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content - Siempre con margen fijo para que la tabla no cambie de tamaño */}
      <div className="flex-1 flex flex-col ml-20">
        {/* Header */}
        <div className="border-b bg-background p-6">
          <ProductionHeader
            onFilters={() => setShowFilters(true)}
            onSort={() => setShowSorter(true)}
          />
        </div>

        {/* Table */}
        <div className="flex-1 p-6 overflow-hidden">
          <ProductionTable items={mockProductionItems} />
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
