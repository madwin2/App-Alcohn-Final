import { ProductionItem } from '@/lib/types/index';

interface CellDisenioProps {
  item: ProductionItem;
}

function getItemDisplayName(item: ProductionItem): string {
  if (item.itemType === 'ABECEDARIO') return 'Abecedario';
  if (item.itemType === 'SOLDADOR') return `Soldador ${item.itemConfig?.soldadorPower || ''}`.trim();
  if (item.itemType === 'MANGO_GOLPE') return 'Mango de golpe';
  if (item.itemType === 'BASE_REMACHADORA') return 'Base remachadora';

  const fallbackByType: Record<string, string> = {
    SELLO: 'Sello',
  };

  if (item.designName?.trim() && item.designName.toLowerCase() !== 'sin diseño') {
    return item.designName;
  }
  return item.itemType ? fallbackByType[item.itemType] || 'Sello' : 'Sello';
}

function getItemSecondary(item: ProductionItem): string | undefined {
  if (item.itemType === 'ABECEDARIO') {
    const parts = [
      item.itemConfig?.abecedarioTipografia,
      item.itemConfig?.abecedarioAlturaMm ? `${item.itemConfig.abecedarioAlturaMm}mm` : undefined,
      item.itemConfig?.abecedarioCase,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' • ') : undefined;
  }
  return undefined;
}

export function CellDisenio({ item }: CellDisenioProps) {
  const displayName = getItemDisplayName(item);
  const secondary = getItemSecondary(item);

  return (
    <div className="min-w-0">
      <p className="text-sm font-medium truncate">{displayName}</p>
      {secondary && (
        <p className="text-xs text-muted-foreground truncate">{secondary}</p>
      )}
    </div>
  );
}
