import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Filter, ArrowUpDown, Search } from 'lucide-react';
import { useProgramsStore } from '@/lib/state/programs.store';

interface ProgramsHeaderProps {
  onNewProgram: () => void;
  onFilters: () => void;
  onSort: () => void;
}

// Header principal de la página de Programas con botones de acción
export function ProgramsHeader({ onNewProgram, onFilters, onSort }: ProgramsHeaderProps) {
  const { searchQuery, setSearchQuery } = useProgramsStore();

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Programas</h1>
        <p className="text-muted-foreground mt-1">
          Gestiona y organiza tus programas de producción
        </p>
      </div>
      
      <div className="flex items-center gap-3">
        {/* Buscador */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Buscar programas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 w-64"
          />
        </div>
        
        <Button variant="outline" onClick={onFilters} className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Filtros
        </Button>
        
        <Button variant="outline" onClick={onSort} className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4" />
          Ordenar
        </Button>
        
        <Button onClick={onNewProgram} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Nuevo Programa
        </Button>
      </div>
    </div>
  );
}
