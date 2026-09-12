import * as DialogPrimitive from '@radix-ui/react-dialog';
import { format } from 'date-fns';
import { Sparkles } from 'lucide-react';
import { Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils/cn';

interface AppUpdateDialogProps {
  open: boolean;
  /** Fecha ISO del build nuevo. */
  builtAt: string | null;
  /** "Recordar más tarde": también se usa al cerrar con Esc o click afuera. */
  onSnooze: () => void;
  onUpdate: () => void;
}

function formatBuildDate(builtAt: string | null): string | null {
  if (!builtAt) return null;
  const date = new Date(builtAt);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, 'dd/MM/yyyy');
}

/**
 * Aviso de que la pestaña quedó con un build viejo. No tiene X: las únicas dos
 * salidas son los botones del pie, y cerrar equivale a posponer.
 */
export function AppUpdateDialog({ open, builtAt, onSnooze, onUpdate }: AppUpdateDialogProps) {
  const buildDate = formatBuildDate(builtAt);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onSnooze();
      }}
    >
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] duration-200',
            'rounded-[20px] border border-white/10',
            'bg-gradient-to-br from-zinc-900/95 via-black/70 to-black/95',
            'shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'motion-reduce:animate-none motion-reduce:data-[state=closed]:animate-none',
          )}
        >
          <div className="flex flex-col items-center gap-3 px-6 pb-6 pt-7 text-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full border border-blue-500/20 bg-blue-500/10"
              aria-hidden
            >
              <Sparkles className="h-6 w-6 text-blue-400" strokeWidth={1.5} />
            </div>
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              Hay una actualización disponible
            </DialogTitle>
            {buildDate ? (
              <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-muted-foreground">
                Build del {buildDate}
              </span>
            ) : null}
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
              Alcohn AI tiene cambios nuevos listos. Actualizá para usarlos y evitar errores por trabajar con una
              versión vieja. Guardá cualquier cambio en curso antes de actualizar.
            </DialogDescription>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
            <button
              type="button"
              onClick={onSnooze}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >
              Recordar más tarde
            </button>
            <button
              type="button"
              onClick={onUpdate}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              Actualizar ahora
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
