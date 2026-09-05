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
import { RemoveStampChoice } from '@/components/programas/RemoveStamp/RemoveStampDialog';
import { ProgramBaseFilesUpload } from '@/components/programas/BaseFiles/ProgramBaseFilesUpload';

export default function ProgramasPage() {
  const {
    programs,
    loading,
    error,
    fetchPrograms,
    createProgram,
    updateProgram,
    deleteProgram,
    addStamps,
    removeStamp,
    lockProgram,
    unlockProgram,
    downloadPackage,
  } = usePrograms();
  const [showNewProgram, setShowNewProgram] = useState(false);
  const { showFilters, showSorter, setShowFilters, setShowSorter } = useProgramsStore();

  const mapChoice = (choice: RemoveStampChoice) => ({
    restoreMode: choice.mode,
    newFabricationState: choice.mode === 'NEW' ? choice.state : undefined,
  });

  return (
    <AppMain className="flex flex-col">
      <div className="border-b bg-background p-6 space-y-4">
        <ProgramsHeader
          onNewProgram={() => setShowNewProgram(true)}
          onFilters={() => setShowFilters(true)}
          onSort={() => setShowSorter(true)}
        />
        <ProgramBaseFilesUpload />
      </div>

      <div className="flex-1 p-6 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Cargando programas...</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-destructive">Error: {error.message}</p>
          </div>
        ) : (
          <ProgramsGrid
            programs={programs}
            onRefresh={() => fetchPrograms({ silent: true })}
            onAddStamps={async (programId, stampIds) => {
              await addStamps(programId, stampIds);
            }}
            onRemoveStamp={async (programId, stampId, choice) => {
              await removeStamp(programId, stampId, mapChoice(choice));
            }}
            onDelete={async (programId, choice) => {
              await deleteProgram(programId, mapChoice(choice));
            }}
            onLock={async (programId) => {
              await lockProgram(programId);
            }}
            onUnlock={async (programId) => {
              await unlockProgram(programId);
            }}
            onDownload={async (programId) => {
              await downloadPackage(programId);
            }}
            onToggleVerified={async (programId, verified) => {
              await updateProgram(programId, { isVerified: verified });
            }}
          />
        )}
      </div>

      <NewProgramDialog
        open={showNewProgram}
        onOpenChange={setShowNewProgram}
        onCreated={() => void fetchPrograms({ silent: true })}
        createProgram={createProgram}
      />
      <ProgramsFiltersDialog open={showFilters} onOpenChange={setShowFilters} />
      <ProgramsSorterDialog open={showSorter} onOpenChange={setShowSorter} />

      <Toaster />
    </AppMain>
  );
}
