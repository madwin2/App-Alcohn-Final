import { ProductionItem } from '@/lib/types/index';

interface CellDisenioProps {
  item: ProductionItem;
  onOpenOrderInfo?: (item: ProductionItem) => void;
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

export function CellDisenio({ item, onOpenOrderInfo }: CellDisenioProps) {
  const displayName = getItemDisplayName(item);
  const secondary = getItemSecondary(item);

  const content = (
    <>
      <p className="text-sm font-medium truncate">{displayName}</p>
      {secondary && (
        <p className="text-xs text-muted-foreground truncate">{secondary}</p>
      )}
    </>
  );

  if (!onOpenOrderInfo || !item.clienteId) {
    return <div className="min-w-0">{content}</div>;
  }

  return (
    <button
      type="button"
      title="Ver info del pedido"
      onClick={(e) => {
        e.stopPropagation();
        onOpenOrderInfo(item);
      }}
      className="min-w-0 w-full rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {content}
    </button>
  );
}
