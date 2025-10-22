import { ProgramCard } from './ProgramCard';
import { Program } from '@/lib/types/index';

interface ProgramsGridProps {
  programs: Program[];
}

// Grid de tarjetas para mostrar los programas disponibles
export function ProgramsGrid({ programs }: ProgramsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {programs.map((program) => (
        <ProgramCard key={program.id} program={program} />
      ))}
    </div>
  );
}
