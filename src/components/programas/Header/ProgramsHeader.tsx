import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface ProgramsHeaderProps {
  onNewProgram: () => void;
}

// Header principal de la página de Programas con botón para crear nuevo programa
export function ProgramsHeader({ onNewProgram }: ProgramsHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Programas</h1>
        <p className="text-muted-foreground mt-1">
          Gestiona y organiza tus programas de producción
        </p>
      </div>
      
      <Button onClick={onNewProgram} className="flex items-center gap-2">
        <Plus className="h-4 w-4" />
        Nuevo Programa
      </Button>
    </div>
  );
}
