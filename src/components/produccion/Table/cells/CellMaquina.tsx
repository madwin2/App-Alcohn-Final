import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductionItem, MachineType } from '@/lib/types/index';

interface CellMaquinaProps {
  item: ProductionItem;
  onMaquinaChange?: (itemId: string, newMachine: MachineType | null) => void;
}

const machineOptions: { value: MachineType; label: string }[] = [
  { value: 'C', label: 'C' },
  { value: 'G', label: 'G' },
  { value: 'XL', label: 'XL' },
];

// Función para obtener el estilo visual del chip Máquina
const getMaquinaChipVisual = (machine: MachineType | null | undefined) => {
  if (!machine) {
    return {
      backgroundImage: `linear-gradient(60deg, rgba(107,114,128,0.05) 0%, rgba(107,114,128,0) 100%)`,
      backgroundColor: `rgba(107,114,128,0.1)`,
      boxShadow: 'none',
      borderColor: `rgba(107,114,128,0.70)`,
      textClass: '',
      textColor: `rgba(107,114,128,0.82)`,
      width: '40px'
    };
  }

  switch (machine) {
    case 'C':
      return {
        backgroundImage: `linear-gradient(60deg, rgba(168,85,247,0.05) 0%, rgba(168,85,247,0) 100%)`,
        backgroundColor: `rgba(168,85,247,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(168,85,247,0.70)`,
        textClass: '',
        textColor: `rgba(168,85,247,0.82)`,
        width: '40px'
      };
    case 'G':
      return {
        backgroundImage: `linear-gradient(60deg, rgba(59,130,246,0.05) 0%, rgba(59,130,246,0) 100%)`,
        backgroundColor: `rgba(59,130,246,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(59,130,246,0.70)`,
        textClass: '',
        textColor: `rgba(59,130,246,0.82)`,
        width: '40px'
      };
    case 'XL':
      return {
        backgroundImage: `linear-gradient(60deg, rgba(249,115,22,0.05) 0%, rgba(249,115,22,0) 100%)`,
        backgroundColor: `rgba(249,115,22,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(249,115,22,0.70)`,
        textClass: '',
        textColor: `rgba(249,115,22,0.82)`,
        width: '40px'
      };
    default:
      return {
        backgroundImage: `linear-gradient(60deg, rgba(107,114,128,0.05) 0%, rgba(107,114,128,0) 100%)`,
        backgroundColor: `rgba(107,114,128,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(107,114,128,0.70)`,
        textClass: '',
        textColor: `rgba(107,114,128,0.82)`,
        width: '40px'
      };
  }
};

const getMaquinaLabel = (machine: MachineType | null | undefined): string => {
  if (!machine) return '—';
  return machine;
};

export function CellMaquina({ item, onMaquinaChange }: CellMaquinaProps) {
  const handleValueChange = (value: string) => {
    const newMachine = value === 'none' ? null : (value as MachineType);
    onMaquinaChange?.(item.id, newMachine);
  };

  return (
    <div className="w-full h-12 flex items-center justify-center">
      <Select 
        value={item.machine || 'none'} 
        onValueChange={handleValueChange}
      >
        <SelectTrigger className="w-full h-12 text-xs [&>svg]:hidden border-none bg-transparent rounded-lg p-3 overflow-visible flex items-center justify-center [&:hover]:bg-transparent">
          <SelectValue>
            {(() => {
              const visual = getMaquinaChipVisual(item.machine);
              return (
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                  style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}
                >
                  {getMaquinaLabel(item.machine)}
                </span>
              );
            })()}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" className="text-xs">
            <span className="text-muted-foreground">—</span>
          </SelectItem>
          {machineOptions.map((option) => {
            const visual = getMaquinaChipVisual(option.value);
            return (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                  style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}
                >
                  {option.label}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

