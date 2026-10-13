import { LayoutDashboard, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * Selector de modo de la Home nueva: Panel (paneles de área) o Escritorio (íconos de apps que
 * abren ventanas). Mismo material que la barra lateral y los botones de notas.
 */

export type ModoHome = 'panel' | 'escritorio'

const MODOS: Array<{ clave: ModoHome; texto: string; icono: typeof Monitor }> =
  [
    { clave: 'panel', texto: 'Modo panel', icono: LayoutDashboard },
    { clave: 'escritorio', texto: 'Modo escritorio', icono: Monitor },
  ]

export function SelectorModo({
  modo,
  onModo,
  className,
}: {
  modo: ModoHome
  onModo: (m: ModoHome) => void
  className?: string
}) {
  const i = MODOS.findIndex(m => m.clave === modo)
  return (
    <TooltipProvider delayDuration={250}>
      <div
        className={cn(
          'relative flex h-[60px] items-center gap-1 rounded-2xl border bg-card/95 px-2 text-white shadow-2xl',
          className
        )}
      >
        {/* Indicador que se desliza bajo el modo activo */}
        <span
          aria-hidden
          className="absolute left-2 top-1/2 size-11 -translate-y-1/2 rounded-xl bg-white/[0.09] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: `translate(${i * 48}px, -50%)` }}
        />
        {MODOS.map(m => {
          const Icono = m.icono
          return (
            <Tooltip key={m.clave}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onModo(m.clave)}
                  aria-label={m.texto}
                  aria-pressed={modo === m.clave}
                  className={cn(
                    'relative z-10 flex size-11 items-center justify-center rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#e06b17]/60',
                    modo === m.clave
                      ? 'text-white'
                      : 'text-white/50 hover:text-white'
                  )}
                >
                  <Icono className="size-[18px]" strokeWidth={1.75} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{m.texto}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
