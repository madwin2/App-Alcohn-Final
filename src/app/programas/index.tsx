import { useState } from 'react';
import { AppMain } from '@/components/layout/AppMain';
import { ProgramsHeader } from '@/components/programas/Header/ProgramsHeader';
import { ProgramsGrid } from '@/components/programas/Grid/ProgramsGrid';
import { NewProgramDialog } from '@/components/programas/NewProgram/NewProgramDialog';
import { ProgramsFiltersDialog } from '@/components/programas/Filters/ProgramsFiltersDialog';
import { ProgramsSorterDialog } from '@/components/programas/Sorter/ProgramsSorterDialog';
import { Toaster } from '@/components/ui/toaster';
import { usePrograms } from '@/lib/hooks/usePrograms';
import { useProgramsStore } from '@/lib/state/programs.store';

export default function ProgramasPage() {
  const { programs, loading, error } = usePrograms();
  const [showNewProgram, setShowNewProgram] = useState(false);
  const { showFilters, showSorter, setShowFilters, setShowSorter } = useProgramsStore();

  return (
    <AppMain className="flex flex-col">
        {/* Header */}
        <div className="border-b bg-background p-6">
          <ProgramsHeader
            onNewProgram={() => setShowNewProgram(true)}
            onFilters={() => setShowFilters(true)}
            onSort={() => setShowSorter(true)}
          />
        </div>

        {/* Programs Grid */}
        <div className="flex-1 p-6 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Cargando programas...</p>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-destructive">Error: {error.message}</p>
            </div>
          ) : (
            <ProgramsGrid programs={programs} />
          )}
        </div>

      {/* Dialogs */}
      <NewProgramDialog
        open={showNewProgram}
        onOpenChange={setShowNewProgram}
      />
      <ProgramsFiltersDialog
        open={showFilters}
        onOpenChange={setShowFilters}
      />
      <ProgramsSorterDialog
        open={showSorter}
        onOpenChange={setShowSorter}
      />

      {/* Toast notifications */}
      <Toaster />
    </AppMain>
  );
}
