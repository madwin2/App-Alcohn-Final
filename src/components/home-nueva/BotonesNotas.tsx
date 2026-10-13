import { StickyNote, UserPlus, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * Botones de notas de la Home nueva, con el material de la barra lateral (bg-card, borde fino,
 * radio 2xl). Al pasar el mouse, el ícono hace un gesto: la nota se despega, el compañero salta.
 */
export function BotonesNotas({
  onNota,
  onNotaCompanero,
  className,
}: {
  onNota: () => void
  onNotaCompanero: () => void
  className?: string
}) {
  return (
    <TooltipProvider delayDuration={250}>
      <div
        className={cn(
          'flex h-[60px] items-center gap-1 rounded-2xl border bg-card/95 px-2 text-white shadow-2xl',
          className
        )}
      >
        <Boton
          icono={StickyNote}
          etiqueta="Nueva nota"
          gesto="group-hover:-rotate-12 group-hover:-translate-y-0.5"
          onClick={onNota}
        />
        <Boton
          icono={UserPlus}
          etiqueta="Nota a un compañero"
          gesto="group-hover:-translate-y-1"
          onClick={onNotaCompanero}
        />
      </div>
    </TooltipProvider>
  )
}

function Boton({
  icono: Icono,
  etiqueta,
  gesto,
  onClick,
}: {
  icono: LucideIcon
  etiqueta: string
  gesto: string
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={etiqueta}
          className="group flex size-11 items-center justify-center rounded-xl text-white/70 outline-none transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-[#e06b17]/60 active:scale-95"
        >
          <Icono
            className={cn(
              'size-[18px] transition-transform duration-300 ease-[cubic-bezier(0.34,1.3,0.64,1)]',
              gesto
            )}
            strokeWidth={1.75}
            aria-hidden
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{etiqueta}</TooltipContent>
    </Tooltip>
  )
}
