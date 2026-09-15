import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface Props {
  children: ReactNode;
  selectedCount: number;
  hojasCount: number;
  className?: string;
}

/** Escenario abierto de la hoja — sin caja pesada, siempre a escala. */
export function SheetStage({ children, selectedCount, hojasCount, className }: Props) {
  return (
    <section className={cn('relative flex min-h-0 min-w-0 flex-col', className)}>
      <div className="mb-2 flex shrink-0 items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[13px] font-medium tracking-tight text-foreground">Hoja a vectorizar</p>
          <p className="text-[11px] text-muted-foreground">
            {selectedCount === 0
              ? 'Elegí diseños para armarla'
              : `${selectedCount} ${selectedCount === 1 ? 'diseño' : 'diseños'} · ${hojasCount} ${hojasCount === 1 ? 'hoja' : 'hojas'}`}
          </p>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-visible">{children}</div>
    </section>
  );
}
