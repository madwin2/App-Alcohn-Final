import { ProgramCard } from './ProgramCard';
import { Program } from '@/lib/types/index';
import { useProgramsStore } from '@/lib/state/programs.store';
import { RemoveStampChoice } from '../RemoveStamp/RemoveStampDialog';

interface ProgramsGridProps {
  programs: Program[];
  onRefresh: () => Promise<void> | void;
  onAddStamps: (programId: string, stampIds: string[]) => Promise<void>;
  onRemoveStamp: (
    programId: string,
    stampId: string,
    choice: RemoveStampChoice,
  ) => Promise<void>;
  onDelete: (programId: string, choice: RemoveStampChoice) => Promise<void>;
  onLock: (programId: string) => Promise<void>;
  onUnlock: (programId: string) => Promise<void>;
  onDownload: (programId: string) => Promise<void>;
  onToggleVerified: (programId: string, verified: boolean) => Promise<void>;
}

export function ProgramsGrid({
  programs,
  onRefresh,
  onAddStamps,
  onRemoveStamp,
  onDelete,
  onLock,
  onUnlock,
  onDownload,
  onToggleVerified,
}: ProgramsGridProps) {
  const { getFilteredPrograms, viewMode } = useProgramsStore();
  const filteredPrograms = getFilteredPrograms(programs);

  const cardProps = {
    onRefresh,
    onAddStamps,
    onRemoveStamp,
    onDelete,
    onLock,
    onUnlock,
    onDownload,
    onToggleVerified,
  };

  if (filteredPrograms.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <p className="text-muted-foreground text-sm">No hay programas para mostrar.</p>
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div className="space-y-4">
        {filteredPrograms.map((program) => (
          <div key={program.id} className="w-full">
            <ProgramCard program={program} {...cardProps} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {filteredPrograms.map((program) => (
        <div key={program.id} className="w-full">
          <ProgramCard program={program} {...cardProps} />
        </div>
      ))}
    </div>
  );
}
