import { ProductionItem } from '@/lib/types/index';
import { formatAbecedarioSummary } from '@/lib/abecedario/abecedarioConfig';

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
    return formatAbecedarioSummary(item.itemConfig);
  }
  return undefined;
}

export function CellDisenio({ item, onOpenOrderInfo }: CellDisenioProps) {
  const displayName = getItemDisplayName(item);
  const secondary = getItemSecondary(item);
  const salioPorMaterial = (item.motivoSalidaPrograma || '').toUpperCase() === 'SIN_MATERIAL';
  const noImportado = Boolean(item.noImportadoMotivo);

  const content = (
    <>
      <p className="text-sm font-medium truncate">{displayName}</p>
      {secondary && (
        <p className="text-xs text-muted-foreground truncate">{secondary}</p>
      )}
      {(salioPorMaterial || noImportado) && (
        <div className="mt-1 flex flex-col gap-0.5">
          {salioPorMaterial && (
            <span
              className="inline-flex w-fit max-w-full items-center rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
              title="Volvió del programa por falta de material; no lo metas en la misma planchuela sin revisar."
            >
              Salió por falta de material
            </span>
          )}
          {noImportado && (
            <span
              className="inline-flex w-fit max-w-full items-center rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
              title={item.noImportadoMotivo || 'No entró al Aspire'}
            >
              No entró al Aspire
              {item.noImportadoMotivo ? `: ${item.noImportadoMotivo}` : ''}
            </span>
          )}
        </div>
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
