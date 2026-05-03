import { ProductionItem } from '@/lib/types/index';

interface CellDisenioProps {
  item: ProductionItem;
}

export function CellDisenio({ item }: CellDisenioProps) {
  const fallbackByType: Record<string, string> = {
    SELLO: 'Sello',
    ABECEDARIO: 'ABC',
    SOLDADOR: 'Soldador',
    MANGO_GOLPE: 'Mango de golpe',
    BASE_REMACHADORA: 'Base de remachadora',
  };

  if (item.itemType === 'SOLDADOR') {
    const label = `Soldador ${item.itemConfig?.soldadorPower || ''}`.trim();
    return (
      <div className="text-sm font-medium">
        {label}
      </div>
    );
  }

  const displayName = item.designName?.trim() && item.designName.toLowerCase() !== 'sin diseño'
    ? item.designName
    : (item.itemType ? fallbackByType[item.itemType] || 'Sello' : 'Sello');

  return (
    <div className="text-sm font-medium">
      {displayName}
    </div>
  );
}
