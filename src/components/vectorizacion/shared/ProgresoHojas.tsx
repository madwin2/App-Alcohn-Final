import { cn } from '@/lib/utils/cn';
import type { SheetProgress } from '@/lib/vectorizacion/types';

export function ProgresoHojas({ sheets }: { sheets: SheetProgress[] }) {
  if (!sheets.length) return null;
  return (
    <div className="space-y-2">
      {sheets.map((sheet) => (
        <div key={sheet.index} className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{sheet.label}</span>
            <span>
              {sheet.status === 'running'
                ? 'Vectorizando…'
                : sheet.status === 'ok'
                  ? 'Listo'
                  : sheet.status === 'error'
                    ? 'Error'
                    : 'En cola'}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded bg-muted">
            <div
              className={cn(
                'h-full transition-all',
                sheet.status === 'ok' && 'w-full bg-emerald-500',
                sheet.status === 'running' && 'w-2/3 animate-pulse bg-primary',
                sheet.status === 'error' && 'w-full bg-destructive',
                sheet.status === 'pending' && 'w-0 bg-primary',
              )}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
