import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { ModoHome } from './SelectorModo'
import type { MaterialTarjeta } from './TarjetaBienvenida'
import {
  APPS_VISTA,
  AREAS,
  CUADRADOS,
  PERSONAS_PRUEBA,
  type useVistaInicio,
} from './vista'

/**
 * Botón "Personalizar" del Inicio (arriba a la izquierda, al lado del selector de modo): abre un
 * panel con interruptores para elegir qué se ve. Cada cambio se aplica en el momento y queda
 * guardado; "Volver a la base" deja lo de su rol. Muestra las apps solo en modo escritorio (es lo
 * único que cambia entre modos). En desarrollo, abajo: ver el Inicio de cada persona.
 */
export function BotonPersonalizar({
  control,
  modo,
  esDueno,
  persona,
  tarjeta,
  onTarjeta,
  className,
}: {
  control: ReturnType<typeof useVistaInicio>
  modo: ModoHome
  esDueno: boolean
  /** Slug de la persona de la vista previa (si se está viendo el Inicio de otro). */
  persona: string | null
  /** Material de la tarjeta de perfil (comparación de versiones). */
  tarjeta: MaterialTarjeta
  onTarjeta: (m: MaterialTarjeta) => void
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const { vista, alternar, setStock, restablecer, cambiada } = control

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <TooltipProvider delayDuration={250}>
        <div
          className={cn(
            'flex h-[60px] items-center rounded-2xl border bg-card/95 px-2 text-white shadow-2xl',
            className
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Personalizar el inicio"
                  className={cn(
                    'relative flex size-11 items-center justify-center rounded-xl outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[#e06b17]/60',
                    abierto
                      ? 'bg-white/[0.09] text-white'
                      : 'text-white/50 hover:bg-white/[0.06] hover:text-white'
                  )}
                >
                  <SlidersHorizontal
                    className={cn(
                      'size-[18px] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                      abierto && 'rotate-90'
                    )}
                    strokeWidth={1.75}
                  />
                  {/* Punto: la vista es distinta de la base */}
                  {cambiada ? (
                    <span className="absolute right-2 top-2 size-1.5 rounded-full bg-[#f6a33d]" />
                  ) : null}
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Personalizar</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      <PopoverContent
        align="start"
        sideOffset={10}
        className="w-[340px] rounded-[22px] border-white/10 bg-[#0b0a09]/[0.97] p-0 text-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.95)] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=open]:slide-in-from-top-2"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div>
            <p className="text-[15px] font-semibold">Tu inicio</p>
            <p className="text-[12px] text-white/45">
              Elegí qué querés ver. Se guarda solo.
            </p>
          </div>
          <button
            type="button"
            onClick={restablecer}
            disabled={!cambiada}
            className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] text-white/60 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <RotateCcw className="size-3.5" />
            Volver a la base
          </button>
        </div>

        <div className="max-h-[min(70vh,560px)] overflow-y-auto px-2 pb-2 [scrollbar-width:thin]">
          <Seccion titulo="Tarjeta de perfil (comparar versiones)">
            <Segmentos
              opciones={[
                { clave: 'actual', texto: 'Actual' },
                { clave: 'negra', texto: 'Negra' },
                { clave: 'vidrio', texto: 'Vidrio' },
              ]}
              valor={tarjeta}
              onCambio={onTarjeta}
            />
          </Seccion>

          <Seccion titulo="Cuadrados de sellos">
            {CUADRADOS.map(c => (
              <Interruptor
                key={c.id}
                texto={c.texto}
                prendido={vista.cuadrados.includes(c.id)}
                onCambio={() => alternar('cuadrados', c.id)}
              />
            ))}
          </Seccion>

          <Seccion
            titulo={modo === 'panel' ? 'Panel de áreas' : 'Columna de áreas'}
          >
            {AREAS.filter(a => !a.soloDueno || esDueno).map(a => (
              <Interruptor
                key={a.id}
                texto={a.texto}
                prendido={vista.areas.includes(a.id)}
                onCambio={() => alternar('areas', a.id)}
              />
            ))}
            <Interruptor
              texto="Stock pendiente"
              prendido={vista.stock}
              onCambio={() => setStock(!vista.stock)}
            />
          </Seccion>

          {modo === 'escritorio' ? (
            <Seccion titulo="Apps del escritorio">
              {APPS_VISTA.filter(a => !a.soloDueno || esDueno).map(a => (
                <Interruptor
                  key={a.id}
                  texto={a.texto}
                  prendido={vista.apps.includes(a.id)}
                  onCambio={() => alternar('apps', a.id)}
                />
              ))}
            </Seccion>
          ) : null}
        </div>

        {/* Solo en desarrollo: ver la vista base de cada persona */}
        {import.meta.env.DEV ? (
          <div className="border-t border-white/[0.06] px-5 py-3.5">
            <p className="mb-2 text-[11.5px] text-white/40">Ver el inicio de</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { slug: null, nombre: 'Yo' },
                ...PERSONAS_PRUEBA.map(p => ({
                  slug: p.slug as string | null,
                  nombre: p.nombre,
                })),
              ].map(p => (
                <Link
                  key={p.nombre}
                  to={p.slug ? `/dev/home/${p.slug}` : '/dev/home'}
                  onClick={() => setAbierto(false)}
                  className={cn(
                    'flex h-7 items-center rounded-full px-3 text-[12px] transition-colors duration-200',
                    persona === p.slug
                      ? 'bg-white text-black'
                      : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white'
                  )}
                >
                  {p.nombre}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function Seccion({
  titulo,
  children,
}: {
  titulo: string
  children: ReactNode
}) {
  return (
    <section className="mt-2">
      <p className="px-3 pb-1 pt-2 text-[11.5px] text-white/40">{titulo}</p>
      <div className="rounded-2xl bg-white/[0.03] p-1">{children}</div>
    </section>
  )
}

/** Control segmentado con indicador que se desliza (como el selector de modo). */
function Segmentos<T extends string>({
  opciones,
  valor,
  onCambio,
}: {
  opciones: Array<{ clave: T; texto: string }>
  valor: T
  onCambio: (v: T) => void
}) {
  const i = Math.max(
    0,
    opciones.findIndex(o => o.clave === valor)
  )
  return (
    <div className="relative flex rounded-xl p-0.5 text-[12.5px]">
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 rounded-[10px] bg-white transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          width: `calc((100% - 4px) / ${opciones.length})`,
          transform: `translateX(${i * 100}%)`,
        }}
      />
      {opciones.map(o => (
        <button
          key={o.clave}
          type="button"
          onClick={() => onCambio(o.clave)}
          aria-pressed={valor === o.clave}
          className={cn(
            'relative z-10 flex-1 rounded-[10px] py-1.5 transition-colors duration-300',
            valor === o.clave ? 'text-black' : 'text-white/60 hover:text-white'
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  )
}

/** Fila con interruptor tipo iOS. */
function Interruptor({
  texto,
  prendido,
  onCambio,
}: {
  texto: string
  prendido: boolean
  onCambio: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={prendido}
      onClick={onCambio}
      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] outline-none transition-colors duration-200 hover:bg-white/[0.04] focus-visible:bg-white/[0.06]"
    >
      <span className={prendido ? 'text-white' : 'text-white/50'}>{texto}</span>
      <span
        className={cn(
          'relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          prendido ? 'bg-[#e06b17]' : 'bg-white/[0.14]'
        )}
      >
        <span
          className={cn(
            'absolute left-[2px] top-[2px] size-[18px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.3,0.64,1)]',
            prendido ? 'translate-x-4' : 'translate-x-0'
          )}
        />
      </span>
    </button>
  )
}
