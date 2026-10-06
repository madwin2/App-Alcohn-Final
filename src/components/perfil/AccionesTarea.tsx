import { useState } from 'react'
import { Check, ChevronDown, Loader2, SkipForward, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/use-toast'
import {
  fechaPosponer,
  type AusenciaAgenda,
  type OcurrenciaAgenda,
} from '@/lib/equipo/tareasAgenda'
import {
  desmarcarTareaOcurrencia,
  marcarAtrasadasComoNoHechas,
  marcarTareaOcurrencia,
} from '@/lib/supabase/services/equipoTareas.service'

export type AccionesTareaProps = {
  ocurrencia: OcurrenciaAgenda
  feriados: Iterable<string> | Set<string>
  misAusencias: AusenciaAgenda[]
  onChanged: () => void | Promise<void>
  disabled?: boolean
}

export function AccionesTarea({
  ocurrencia,
  feriados,
  misAusencias,
  onChanged,
  disabled,
}: AccionesTareaProps) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [moverAbierto, setMoverAbierto] = useState(false)
  const [fechaMover, setFechaMover] = useState(ocurrencia.fechaVisible)

  const tieneRegistro = Boolean(ocurrencia.registroEstado)
  const esUnica = ocurrencia.frecuencia === 'unica'
  const agrupadas = ocurrencia.fechasAgrupadas
  const puedeAgrupar = Boolean(agrupadas && agrupadas.length > 1)

  const run = async (fn: () => Promise<void>) => {
    if (busy || disabled) return
    setBusy(true)
    try {
      await fn()
      await onChanged()
    } catch (err) {
      toast({
        title: 'No se pudo actualizar',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const handleHecha = () =>
    run(async () => {
      // S14: con varias atrasadas, Hecha cierra la más vieja (fechaProgramada).
      await marcarTareaOcurrencia({
        tareaId: ocurrencia.tareaId,
        fechaProgramada: ocurrencia.fechaProgramada,
        estado: 'hecha',
      })
    })

  const handlePosponer = () =>
    run(async () => {
      const destino = fechaPosponer(
        ocurrencia.fechaVisible,
        feriados,
        misAusencias
      )
      await marcarTareaOcurrencia({
        tareaId: ocurrencia.tareaId,
        fechaProgramada: ocurrencia.fechaProgramada,
        estado: 'movida',
        fechaDestino: destino,
      })
    })

  const handleMover = () =>
    run(async () => {
      if (!fechaMover) return
      await marcarTareaOcurrencia({
        tareaId: ocurrencia.tareaId,
        fechaProgramada: ocurrencia.fechaProgramada,
        estado: 'movida',
        fechaDestino: fechaMover,
      })
      setMoverAbierto(false)
    })

  const handleNoHecha = () =>
    run(async () => {
      await marcarTareaOcurrencia({
        tareaId: ocurrencia.tareaId,
        fechaProgramada: ocurrencia.fechaProgramada,
        estado: 'no_hecha',
      })
    })

  const handleDesmarcar = () =>
    run(async () => {
      await desmarcarTareaOcurrencia(
        ocurrencia.tareaId,
        ocurrencia.fechaProgramada
      )
    })

  const handleNoHechasAnteriores = () =>
    run(async () => {
      if (!agrupadas?.length) return
      await marcarAtrasadasComoNoHechas(ocurrencia.tareaId, agrupadas)
    })

  if (ocurrencia.estado === 'no_aplica') return null

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-7 gap-1 px-2 text-xs"
        disabled={busy || disabled}
        onClick={() => void handleHecha()}
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Check className="h-3 w-3" />
        )}
        Hecha
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-0.5 px-2 text-xs"
            disabled={busy || disabled}
          >
            Más
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            disabled={busy}
            onSelect={() => {
              void handlePosponer()
            }}
          >
            <SkipForward className="mr-2 h-3.5 w-3.5" />
            Posponer
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busy}
            onSelect={e => {
              e.preventDefault()
              setFechaMover(ocurrencia.fechaVisible)
              setMoverAbierto(true)
            }}
          >
            Mover a otro día…
          </DropdownMenuItem>
          {!esUnica ? (
            <DropdownMenuItem
              disabled={busy}
              onSelect={() => {
                void handleNoHecha()
              }}
            >
              No hecha
            </DropdownMenuItem>
          ) : null}
          {puedeAgrupar ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={busy}
                onSelect={() => {
                  void handleNoHechasAnteriores()
                }}
              >
                Dar por no hechas las anteriores
              </DropdownMenuItem>
            </>
          ) : null}
          {tieneRegistro ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={busy}
                onSelect={() => {
                  void handleDesmarcar()
                }}
              >
                <Undo2 className="mr-2 h-3.5 w-3.5" />
                Desmarcar
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {moverAbierto ? (
        <div className="flex w-full items-center gap-1.5 pt-1">
          <input
            type="date"
            value={fechaMover}
            onChange={e => setFechaMover(e.target.value)}
            className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
            disabled={busy || disabled}
          />
          <Button
            type="button"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={busy || disabled || !fechaMover}
            onClick={() => void handleMover()}
          >
            Mover
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={() => setMoverAbierto(false)}
          >
            Cancelar
          </Button>
        </div>
      ) : null}
    </div>
  )
}
