import { useCallback, useState, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useSalida } from '../movimiento'
import { cn } from '@/lib/utils/cn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/use-toast'
import { useOrdersActions } from '@/lib/hooks/useOrders'
import { useSound } from '@/lib/hooks/useSound'
import { RehacerDialog } from '@/components/shared/RehacerDialog'
import type {
  FabricationState,
  Order,
  SaleState,
  ShippingState,
} from '@/lib/types'

/**
 * Acciones de las ventanas mini del escritorio. Cambian los estados exactamente como la tabla de
 * Pedidos (mismo `updateOrder`, mismo aviso, el sonido de Transferido y el diálogo de Rehacer con
 * su motivo y cargo), así trabajar desde el Inicio da el mismo resultado que hacerlo en Pedidos.
 */

export const FABRICACION: Array<{ clave: FabricationState; texto: string }> = [
  { clave: 'SIN_HACER', texto: 'Sin hacer' },
  { clave: 'PROGRAMADO', texto: 'Programado' },
  { clave: 'HACIENDO', texto: 'Haciendo' },
  { clave: 'VERIFICAR', texto: 'Verificar' },
  { clave: 'RETOCAR', texto: 'Retocar' },
  { clave: 'REHACER', texto: 'Rehacer' },
  { clave: 'HECHO', texto: 'Hecho' },
]

export const VENTA: Array<{ clave: SaleState; texto: string }> = [
  { clave: 'SEÑADO', texto: 'Señado' },
  { clave: 'FOTO_ENVIADA', texto: 'Foto enviada' },
  { clave: 'TRANSFERIDO', texto: 'Transferido' },
  { clave: 'DEUDOR', texto: 'Deudor' },
]

export const ENVIO: Array<{ clave: ShippingState; texto: string }> = [
  { clave: 'SIN_ENVIO', texto: 'Sin envío' },
  { clave: 'HACER_ETIQUETA', texto: 'Hacer etiqueta' },
  { clave: 'ERROR_ETIQUETA', texto: 'Error de etiqueta' },
  { clave: 'ETIQUETA_LISTA', texto: 'Etiqueta lista' },
  { clave: 'DESPACHADO', texto: 'Despachado' },
  { clave: 'SEGUIMIENTO_ENVIADO', texto: 'Seguimiento enviado' },
]

export const textoDe = <T extends string>(
  lista: Array<{ clave: T; texto: string }>,
  clave: T | null | undefined
) => lista.find(e => e.clave === clave)?.texto ?? '—'

type Campo = 'fabricationState' | 'saleState' | 'shippingState'

/**
 * Cambia un estado de uno o varios sellos de un pedido. Rehacer no se cambia directo: abre el
 * diálogo de Rehacer (el mismo de Pedidos). Devuelve también el diálogo para renderizar.
 */
export function useCambiarEstado() {
  const { updateOrder, fetchOrders } = useOrdersActions()
  const { toast } = useToast()
  const { playSound } = useSound()
  const [rehacer, setRehacer] = useState<string[]>([])

  const cambiar = useCallback(
    async (pedido: Order, campo: Campo, valor: string, selloIds?: string[]) => {
      const ids = selloIds ?? pedido.items.map(i => i.id)
      if (campo === 'fabricationState' && valor === 'REHACER') {
        setRehacer(ids)
        return
      }
      if (campo === 'saleState' && valor === 'TRANSFERIDO')
        playSound('transfer')
      try {
        await updateOrder(pedido.id, {
          items: ids.map(id => ({ id, [campo]: valor })),
        } as unknown as Partial<Order>)
        toast({
          title: 'Pedido actualizado',
          description: 'Los cambios se guardaron correctamente',
        })
      } catch (error) {
        toast({
          title: 'Error al actualizar',
          description:
            error instanceof Error
              ? error.message
              : 'No se pudo guardar los cambios',
          variant: 'destructive',
        })
      }
    },
    [updateOrder, toast, playSound]
  )

  const dialogo = (
    <RehacerDialog
      open={rehacer.length > 0}
      selloIds={rehacer}
      onOpenChange={open => {
        if (!open) setRehacer([])
      }}
      onConfirmed={() => {
        void fetchOrders({ silent: true })
      }}
    />
  )

  return { cambiar, dialogo }
}

/** Chip con menú para elegir un estado (oscuro, con el material de la Home). */
export function MenuEstado<T extends string>({
  opciones,
  valor,
  onElegir,
  etiqueta,
  alerta,
  className,
}: {
  opciones: Array<{ clave: T; texto: string }>
  valor: T | null | undefined
  onElegir: (v: T) => void
  /** Lo que dice el chip (por defecto, el texto del estado). */
  etiqueta?: ReactNode
  alerta?: boolean
  className?: string
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={e => e.stopPropagation()}
          onDoubleClick={e => e.stopPropagation()}
          className={cn(
            'flex h-6 shrink-0 items-center gap-1 rounded-full pl-2.5 pr-1.5 text-[11px] outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[#e06b17]/50',
            alerta
              ? 'bg-[#f6a33d]/15 text-[#f6a33d] hover:bg-[#f6a33d]/25'
              : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white',
            className
          )}
        >
          <span className="truncate">
            {etiqueta ?? textoDe(opciones, valor)}
          </span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[170px] rounded-xl border-white/10 bg-[#1a1412]/95 p-1 text-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl"
        onClick={e => e.stopPropagation()}
      >
        {opciones.map(o => (
          <DropdownMenuItem
            key={o.clave}
            onSelect={() => {
              if (o.clave !== valor) onElegir(o.clave)
            }}
            className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-[12.5px] text-white/80 focus:bg-white/[0.08] focus:text-white"
          >
            {o.texto}
            {o.clave === valor ? (
              <Check className="size-3.5 text-[#f6a33d]" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Se pliega/despliega con animación de alto (grid 0fr ↔ 1fr). El contenido se monta al abrir y
 * sigue montado mientras se pliega (así se cierra con lo que tiene adentro).
 */
export function Plegable({
  abierto,
  children,
}: {
  abierto: boolean
  children: ReactNode
}) {
  const [montado] = useSalida(abierto)
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
        abierto ? 'opacity-100' : 'opacity-0 duration-300'
      )}
      style={{ gridTemplateRows: abierto ? '1fr' : '0fr' }}
      aria-hidden={!abierto}
    >
      <div className="min-h-0 overflow-hidden">{montado ? children : null}</div>
    </div>
  )
}

/** Botón principal de una ventana (naranja, como el resto de las acciones de la Home). */
export function BotonAccion({
  children,
  onClick,
  icono,
  disabled,
  tipo = 'primario',
}: {
  children: ReactNode
  onClick: () => void
  icono?: ReactNode
  disabled?: boolean
  tipo?: 'primario' | 'secundario'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] disabled:opacity-40',
        tipo === 'primario'
          ? 'bg-[#e06b17] text-white hover:bg-[#f07a22]'
          : 'bg-white/[0.06] text-white/75 hover:bg-white/[0.12] hover:text-white'
      )}
    >
      {icono}
      {children}
    </button>
  )
}
