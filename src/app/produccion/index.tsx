import { useState } from 'react';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { ProductionHeader } from '@/components/produccion/Header/ProductionHeader';
import { ProductionTable } from '@/components/produccion/Table/ProductionTable';
import { ProductionFiltersDialog } from '@/components/produccion/Filters/ProductionFiltersDialog';
import { ProductionSorterDialog } from '@/components/produccion/Sorter/ProductionSorterDialog';
import { NewTaskDialog } from '@/components/produccion/NewTask/NewTaskDialog';
import { Toaster } from '@/components/ui/toaster';
import { mockProductionItems } from '@/lib/mocks/production.mock';
import { ProductionState } from '@/lib/types/index';

export default function ProduccionPage() {
  const [showFilters, setShowFilters] = useState(false);
  const [showSorter, setShowSorter] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [activeStates, setActiveStates] = useState<ProductionState[]>([]);

  const handleStateFilter = (state: ProductionState) => {
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
          <ProductionHeader
            onNewTask={() => setShowNewTask(true)}
            onFilters={() => setShowFilters(true)}
            onSort={() => setShowSorter(true)}
            onStateFilter={handleStateFilter}
            activeStates={activeStates}
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
      
      <NewTaskDialog
        open={showNewTask}
        onOpenChange={setShowNewTask}
      />

      {/* Toast notifications */}
      <Toaster />
    </div>
  );
}
