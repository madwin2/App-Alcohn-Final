import { Trash2, Plus, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Program } from '@/lib/types/index';

interface ProgramContextMenuProps {
  program: Program;
  onDelete: (programId: string) => void;
  onAddStamps: (programId: string) => void;
  onDownload: (programId: string) => void;
}

// Menú contextual para acciones de programa
export function ProgramContextMenu({ 
  program, 
  onDelete, 
  onAddStamps, 
  onDownload 
}: ProgramContextMenuProps) {
  return (
    <div className="bg-background border border-border rounded-md shadow-lg p-1 w-[160px]">
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 h-8 text-xs"
        onClick={() => onDelete(program.id)}
      >
        <Trash2 className="h-3 w-3" />
        Eliminar programa
      </Button>
      
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 text-primary hover:text-primary hover:bg-primary/10 h-8 text-xs"
        onClick={() => onAddStamps(program.id)}
      >
        <Plus className="h-3 w-3" />
        Agregar sellos
      </Button>
      
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950 h-8 text-xs"
        onClick={() => onDownload(program.id)}
      >
        <Download className="h-3 w-3" />
        Descargar programa
      </Button>
    </div>
  );
}
