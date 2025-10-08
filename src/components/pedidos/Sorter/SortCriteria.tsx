import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
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
    <div className="flex items-center gap-2 p-3 border rounded-lg">
      <div className="flex-1">
        <Select value={criteria.field} onValueChange={handleFieldChange}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fieldOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="w-32">
        <Select value={criteria.dir} onValueChange={handleDirectionChange}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {directionOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <Button
        variant="outline"
        size="icon"
        onClick={() => onRemove(index)}
        className="h-8 w-8"
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}
