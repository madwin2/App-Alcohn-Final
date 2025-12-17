import { useState, useEffect } from 'react';
import { ProductionItem } from '@/lib/types/index';
import { Input } from '@/components/ui/input';

interface CellProgramaProps {
  item: ProductionItem;
  onProgramaChange?: (itemId: string, newProgram: string) => void;
}

export function CellPrograma({ item, onProgramaChange }: CellProgramaProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(item.program || '');

  // Sincronizar el valor cuando cambia el item
  useEffect(() => {
    if (!isEditing) {
      setValue(item.program || '');
    }
  }, [item.program, isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    if (value !== item.program && onProgramaChange) {
      onProgramaChange(item.id, value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setValue(item.program || '');
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex justify-center">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="h-7 text-xs text-center w-24"
          autoFocus
          placeholder="Programa"
        />
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <div
        onClick={() => setIsEditing(true)}
        className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 cursor-pointer min-w-[60px] justify-center"
        title="Click para editar"
      >
        {item.program || '-'}
      </div>
    </div>
  );
}














