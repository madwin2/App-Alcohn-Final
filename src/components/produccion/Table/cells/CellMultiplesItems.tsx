interface CellMultiplesItemsProps {
  orderItemCount: number;
}

export function CellMultiplesItems({ orderItemCount }: CellMultiplesItemsProps) {
  if (orderItemCount <= 1) {
    return <span className="sr-only">Pedido de un ítem</span>;
  }

  return (
    <span
      title={`Pedido con ${orderItemCount} ítems`}
      className="inline-flex items-center justify-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400"
    >
      Multi
    </span>
  );
}
