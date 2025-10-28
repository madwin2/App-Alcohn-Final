import { ProgramCard } from './ProgramCard';
import { Program } from '@/lib/types/index';
import { useProgramsStore } from '@/lib/state/programs.store';

interface ProgramsGridProps {
  programs: Program[];
}

// Grid de tarjetas para mostrar los programas disponibles
export function ProgramsGrid({ programs }: ProgramsGridProps) {
  const { getFilteredPrograms, viewMode } = useProgramsStore();
  
  // Aplicar filtros y orden
  const filteredPrograms = getFilteredPrograms(programs);
  
  // Renderizar según el modo de vista
  if (viewMode === 'list') {
    return (
      <div className="space-y-4">
        {filteredPrograms.map((program, index) => (
          <div key={`program-${program.id}-${index}`} className="w-full">
            <ProgramCard program={program} />
          </div>
        ))}
      </div>
    );
  }
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {filteredPrograms.map((program, index) => (
        <div key={`program-${program.id}-${index}`} className="w-full">
          <ProgramCard program={program} />
        </div>
      ))}
    </div>
  );
}
