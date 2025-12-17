import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductionItem, AspireState } from '@/lib/types/index';

interface CellAspireProps {
  item: ProductionItem;
  onAspireChange?: (itemId: string, newState: AspireState | null) => void;
}

const aspireOptions: { value: AspireState; label: string }[] = [
  { value: 'Aspire G', label: 'Aspire G' },
  { value: 'Aspire G Check', label: 'Aspire G Check' },
  { value: 'Aspire C', label: 'Aspire C' },
  { value: 'Aspire C Check', label: 'Aspire C Check' },
  { value: 'Aspire XL', label: 'Aspire XL' },
];

// Función para obtener el estilo visual del chip Aspire
const getAspireChipVisual = (state: AspireState | null | undefined) => {
  if (!state) {
    return {
      backgroundImage: `linear-gradient(60deg, rgba(107,114,128,0.05) 0%, rgba(107,114,128,0) 100%)`,
      backgroundColor: `rgba(107,114,128,0.1)`,
      boxShadow: 'none',
      borderColor: `rgba(107,114,128,0.70)`,
      textClass: '',
      textColor: `rgba(107,114,128,0.82)`,
      width: 'auto'
    };
  }

  switch (state) {
    case 'Aspire G':
      return {
        backgroundImage: `linear-gradient(60deg, rgba(59,130,246,0.05) 0%, rgba(59,130,246,0) 100%)`,
        backgroundColor: `rgba(59,130,246,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(59,130,246,0.70)`,
        textClass: '',
        textColor: `rgba(59,130,246,0.82)`,
        width: 'auto'
      };
    case 'Aspire G Check':
      return {
        backgroundImage: `linear-gradient(60deg, rgba(34,197,94,0.05) 0%, rgba(34,197,94,0) 100%)`,
        backgroundColor: `rgba(34,197,94,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(34,197,94,0.70)`,
        textClass: '',
        textColor: `rgba(34,197,94,0.82)`,
        width: 'auto'
      };
    case 'Aspire C':
      return {
        backgroundImage: `linear-gradient(60deg, rgba(168,85,247,0.05) 0%, rgba(168,85,247,0) 100%)`,
        backgroundColor: `rgba(168,85,247,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(168,85,247,0.70)`,
        textClass: '',
        textColor: `rgba(168,85,247,0.82)`,
        width: 'auto'
      };
    case 'Aspire C Check':
      return {
        backgroundImage: `linear-gradient(60deg, rgba(34,197,94,0.05) 0%, rgba(34,197,94,0) 100%)`,
        backgroundColor: `rgba(34,197,94,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(34,197,94,0.70)`,
        textClass: '',
        textColor: `rgba(34,197,94,0.82)`,
        width: 'auto'
      };
    case 'Aspire XL':
      return {
        backgroundImage: `linear-gradient(60deg, rgba(249,115,22,0.05) 0%, rgba(249,115,22,0) 100%)`,
        backgroundColor: `rgba(249,115,22,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(249,115,22,0.70)`,
        textClass: '',
        textColor: `rgba(249,115,22,0.82)`,
        width: 'auto'
      };
    default:
      return {
        backgroundImage: `linear-gradient(60deg, rgba(107,114,128,0.05) 0%, rgba(107,114,128,0) 100%)`,
        backgroundColor: `rgba(107,114,128,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(107,114,128,0.70)`,
        textClass: '',
        textColor: `rgba(107,114,128,0.82)`,
        width: 'auto'
      };
  }
};

const getAspireLabel = (state: AspireState | null | undefined): string => {
  if (!state) return '—';
  return state;
};

export function CellAspire({ item, onAspireChange }: CellAspireProps) {
  const handleValueChange = (value: string) => {
    const newState = value === 'none' ? null : (value as AspireState);
    onAspireChange?.(item.id, newState);
  };

  return (
    <div className="w-full h-12 flex items-center justify-center">
      <Select 
        value={item.aspireState || 'none'} 
        onValueChange={handleValueChange}
      >
        <SelectTrigger className="w-full h-12 text-xs [&>svg]:hidden border-none bg-transparent rounded-lg p-3 overflow-visible flex items-center justify-center [&:hover]:bg-transparent">
          <SelectValue>
            {(() => {
              const visual = getAspireChipVisual(item.aspireState);
              return (
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                  style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}
                >
                  {getAspireLabel(item.aspireState)}
                </span>
              );
            })()}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" className="text-xs">
            <span className="text-muted-foreground">—</span>
          </SelectItem>
          {aspireOptions.map((option) => {
            const visual = getAspireChipVisual(option.value);
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

