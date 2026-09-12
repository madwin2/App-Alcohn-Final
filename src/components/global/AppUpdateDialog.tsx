import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils/cn';

const COVER = '/changelog/update/hero.jpg';

interface AppUpdateDialogProps {
  open: boolean;
  /** Versión legible para el chip (ej. "1.1"). */
  version: string | null;
  /** "Recordar más tarde": también se usa al cerrar con Esc o click afuera. */
  onSnooze: () => void;
  onUpdate: () => void;
}

/** Seis círculos en órbita: giran y pulsan de tamaño en cascada. */
function OrbitIcon({ className }: { className?: string }) {
  return (
    <div className={cn('au-orbit relative h-14 w-14', className)} aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <span
          key={i}
          className="au-orbit-dot absolute left-1/2 top-1/2 h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.55)]"
          style={{ ['--i' as string]: i }}
        />
      ))}
    </div>
  );
}

/**
 * Aviso de que la pestaña quedó con un build viejo.
 * Portada ilustrada + ícono animado arriba; cuerpo y acciones sobre fondo blanco.
 */
export function AppUpdateDialog({ open, version, onSnooze, onUpdate }: AppUpdateDialogProps) {
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
            'fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
            'flex w-[min(100vw-1.25rem,34rem)] flex-col overflow-hidden',
            'rounded-[22px] border border-black/5 bg-white',
            'shadow-[0_28px_70px_-16px_rgba(0,0,0,0.55)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'motion-reduce:animate-none motion-reduce:data-[state=closed]:animate-none',
            'focus:outline-none',
          )}
        >
          <div className="relative px-2 pt-2">
            <div
              className="relative aspect-[16/9] overflow-hidden rounded-t-[18px] bg-white"
              style={{
                WebkitMaskImage:
                  'linear-gradient(to bottom, #000 0%, #000 52%, rgba(0,0,0,0.75) 68%, rgba(0,0,0,0.35) 84%, transparent 100%)',
                maskImage:
                  'linear-gradient(to bottom, #000 0%, #000 52%, rgba(0,0,0,0.75) 68%, rgba(0,0,0,0.35) 84%, transparent 100%)',
              }}
            >
              <img src={COVER} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-transparent"
                aria-hidden
              />

              <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-3 px-5 pt-6 text-center sm:pt-7">
                <OrbitIcon />
                <DialogTitle className="max-w-[20rem] text-balance text-[1.85rem] font-semibold leading-[1.12] tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]">
                  Hay una actualización disponible
                </DialogTitle>
                {version ? (
                  <span className="rounded-full bg-zinc-950 px-2.5 py-1 text-[11px] font-medium leading-none text-white">
                    Versión {version}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="relative -mt-2 flex flex-col gap-5 px-6 pb-5 pt-1">
            <DialogDescription className="text-center text-[0.875rem] leading-relaxed text-zinc-500">
              Alcohn AI tiene cambios nuevos listos. Actualizá para usarlos y evitar errores por trabajar con una
              versión vieja. Guardá cualquier cambio en curso antes de actualizar.
            </DialogDescription>

            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={onSnooze}
                className="inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium leading-none text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
              >
                Recordar más tarde
              </button>
              <button
                type="button"
                onClick={onUpdate}
                className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium leading-none text-white transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                Actualizar ahora
              </button>
            </div>
          </div>

          <style>{`
            @keyframes au-spin {
              to { transform: rotate(360deg); }
            }
            @keyframes au-pulse {
              0%, 100% { transform: rotate(calc(var(--i) * 60deg)) translateY(-1.15rem) scale(0.55); opacity: 0.45; }
              50% { transform: rotate(calc(var(--i) * 60deg)) translateY(-1.15rem) scale(1.15); opacity: 1; }
            }
            .au-orbit {
              animation: au-spin 3.2s linear infinite;
            }
            .au-orbit-dot {
              margin-left: -0.3125rem;
              margin-top: -0.3125rem;
              animation: au-pulse 1.35s ease-in-out infinite;
              animation-delay: calc(var(--i) * -0.22s);
            }
            @media (prefers-reduced-motion: reduce) {
              .au-orbit, .au-orbit-dot { animation: none !important; }
              .au-orbit-dot {
                transform: rotate(calc(var(--i) * 60deg)) translateY(-1.15rem) scale(1);
                opacity: 0.9;
              }
            }
          `}</style>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
