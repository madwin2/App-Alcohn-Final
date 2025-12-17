import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, ArrowUp, ArrowDown } from 'lucide-react';
import { SortCriteria as SortCriteriaType } from '@/lib/types/index';

interface SortCriteriaProps {
  criteria: SortCriteriaType;
  index: number;
  onUpdate: (index: number, criteria: SortCriteriaType) => void;
  onRemove: (index: number) => void;
}

const fieldOptions = [
  { value: 'fecha', label: 'Fecha' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'fabricacion', label: 'Fabricación' },
  { value: 'venta', label: 'Venta' },
  { value: 'envio', label: 'Envío' },
  { value: 'valor', label: 'Valor' },
  { value: 'restante', label: 'Restante' },
];

const directionOptions = [
  { value: 'asc', label: 'Ascendente' },
  { value: 'desc', label: 'Descendente' },
];

export function SortCriteria({ criteria, index, onUpdate, onRemove }: SortCriteriaProps) {
  const handleFieldChange = (field: string) => {
    onUpdate(index, { ...criteria, field: field as any });
  };

  const handleDirectionChange = (dir: string) => {
    onUpdate(index, { ...criteria, dir: dir as 'asc' | 'desc' });
  };

  return (
    <div className="flex items-center gap-3 p-3.5 bg-card rounded-lg border border-border hover:border-primary/30 transition-colors">
      <div className="flex items-center gap-2 flex-1">
        <Select value={criteria.field} onValueChange={handleFieldChange}>
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fieldOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={criteria.dir} onValueChange={handleDirectionChange}>
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">
              <div className="flex items-center gap-2">
                <ArrowUp className="h-3 w-3" />
                Ascendente
              </div>
            </SelectItem>
            <SelectItem value="desc">
              <div className="flex items-center gap-2">
                <ArrowDown className="h-3 w-3" />
                Descendente
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <Button
        variant="outline"
        size="icon"
        onClick={() => onRemove(index)}
        className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
