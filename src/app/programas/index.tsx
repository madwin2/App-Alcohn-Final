import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
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
import { MesaProgramas } from '@/components/programas/Mesa/MesaProgramas';
import { Button } from '@/components/ui/button';

type Vista = 'mesa' | 'todos';
const VISTA_KEY = 'programas-vista';

/**
 * Programas: la mesa de armado es la vista principal (ADR-027). «Todos los
 * programas» abre el tablero de siempre para ABC, terminados, papelera,
 * bloqueo, historial y sincronizar archivos, hasta que pasen a la mesa.
 */
export default function ProgramasPage() {
  const [vista, setVista] = useState<Vista>(() => {
    try { return window.localStorage.getItem(VISTA_KEY) === 'todos' ? 'todos' : 'mesa'; } catch { return 'mesa'; }
  });
  useEffect(() => { try { window.localStorage.setItem(VISTA_KEY, vista); } catch { /* sin almacenamiento */ } }, [vista]);
  const programsApi = usePrograms();
  const {
    programs,
    loading,
    error,
    fetchPrograms,
    createProgram,
    updateProgram,
    setFabricationStateForProgram,
    setStampFabricationStates,
    deleteProgram,
    addStamps,
    removeStamp,
    lockProgram,
    unlockProgram,
    syncProgramFromAspireFile,
    applyProgramReconciliation,
    downloadPackage,
  } = programsApi;
  const [showNewProgram, setShowNewProgram] = useState(false);
  const { showFilters, showSorter, setShowFilters, setShowSorter } = useProgramsStore();

  const mapChoice = (choice: RemoveStampChoice) => ({
    restoreMode: choice.mode,
    newFabricationState: choice.mode === 'NEW' ? choice.state : undefined,
  });

  if (vista === 'mesa') {
    return (
      <AppMain className="bg-black">
        <div className="flex h-screen min-h-[680px] flex-col p-4">
          <MesaProgramas programs={programsApi} onOpenBoard={() => setVista('todos')} />
        </div>
        <Toaster />
      </AppMain>
    );
  }

  return (
    <AppMain className="flex flex-col">
      <div className="border-b bg-background p-6 space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setVista('mesa')}>
          <ArrowLeft className="mr-1 size-4" />Mesa de armado
        </Button>
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
            onCreateProgram={async (program) => createProgram(program)}
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
            onUpdateProgram={async (programId, updates) => {
              await updateProgram(programId, updates);
            }}
            onSyncAspireFile={async (programId, file) => {
              return syncProgramFromAspireFile(programId, file);
            }}
            onApplyReconciliation={async (programId, decisions) => {
              await applyProgramReconciliation(programId, decisions);
            }}
            onSetFabricationState={async (programId, state) => {
              await setFabricationStateForProgram(programId, state);
            }}
            onSetStampFabricationStates={async (programId, assignments) => {
              await setStampFabricationStates(programId, assignments);
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
