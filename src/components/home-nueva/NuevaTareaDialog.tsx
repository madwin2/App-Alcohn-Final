import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Loader2, Minus, Plus, X } from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils/cn'
import { DatePicker } from '@/components/ui/date-picker'
import type { TareaRecurrenteFormValue } from '@/components/perfil/TareaRecurrenteDialog'
import { addDaysToKey } from '@/lib/equipo/fechas'
import {
  describirFrecuencia,
  lunesDeSemana,
  type FrecuenciaTarea,
} from '@/lib/equipo/tareasRecurrentes'
import { parseOrderDateLocal } from '@/lib/utils/format'

/**
 * "Nueva tarea" con la estética de la Home nueva: vidrio oscuro, título grande sin caja,
 * frecuencia en píldoras, días como círculos y atajos de fecha. Misma lógica y mismo valor de
 * salida que `TareaRecurrenteDialog` (Mi perfil), que no se toca.
 */

const FRECUENCIAS: Array<{ value: FrecuenciaTarea; label: string }> = [
  { value: 'unica', label: 'Un día' },
  { value: 'diaria', label: 'Diaria' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' },
]

const DIAS = [
  { value: 1, label: 'L' },
  { value: 2, label: 'M' },
  { value: 3, label: 'X' },
  { value: 4, label: 'J' },
  { value: 5, label: 'V' },
]

const ACTIVO =
  'bg-gradient-to-br from-[#f6a33d] via-[#e06b17] to-[#b5440f] text-black font-semibold'

function dateToKey(d: Date | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Próximo lunes estrictamente después de `hoy`. */
function proximoLunes(hoy: string): string {
  const l = lunesDeSemana(hoy)
  return addDaysToKey(l, 7)
}

export function NuevaTareaDialog({
  open,
  onOpenChange,
  hoy,
  saving,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  hoy: string
  saving?: boolean
  onSave: (value: TareaRecurrenteFormValue) => void | Promise<void>
}) {
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [verDetalle, setVerDetalle] = useState(false)
  const [frecuencia, setFrecuencia] = useState<FrecuenciaTarea>('unica')
  const [diasSemana, setDiasSemana] = useState<number[]>([1])
  const [diaMes, setDiaMes] = useState(1)
  const [semanaInicio, setSemanaInicio] = useState<Date | undefined>()
  const [fecha, setFecha] = useState<Date | undefined>()

  useEffect(() => {
    if (!open) return
    setTitulo('')
    setDescripcion('')
    setVerDetalle(false)
    setFrecuencia('unica')
    setDiasSemana([
      Math.min(5, Math.max(1, new Date(`${hoy}T12:00:00`).getDay() || 1)),
    ])
    setDiaMes(Number(hoy.slice(8)))
    setSemanaInicio(parseOrderDateLocal(lunesDeSemana(hoy)))
    setFecha(parseOrderDateLocal(hoy))
  }, [open, hoy])

  const toggleDia = (d: number) =>
    setDiasSemana(prev =>
      prev.includes(d)
        ? prev.length > 1
          ? prev.filter(x => x !== d)
          : prev
        : [...prev, d].sort((a, b) => a - b)
    )

  const valor = useMemo<TareaRecurrenteFormValue>(() => {
    const semanaKey = dateToKey(semanaInicio)
    return {
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      frecuencia,
      diasSemana:
        frecuencia === 'semanal' || frecuencia === 'quincenal'
          ? diasSemana
          : null,
      diaMes: frecuencia === 'mensual' ? diaMes : null,
      semanaInicio:
        frecuencia === 'quincenal' && semanaKey
          ? lunesDeSemana(semanaKey)
          : null,
      fecha: frecuencia === 'unica' ? dateToKey(fecha) : null,
    }
  }, [titulo, descripcion, frecuencia, diasSemana, diaMes, semanaInicio, fecha])

  const error = !valor.titulo
    ? 'Escribí qué hay que hacer'
    : frecuencia === 'unica' && !valor.fecha
      ? 'Elegí el día'
      : frecuencia === 'quincenal' && !valor.semanaInicio
        ? 'Elegí la semana de inicio'
        : null

  const resumen = describirFrecuencia({
    frecuencia,
    diasSemana: valor.diasSemana as (1 | 2 | 3 | 4 | 5)[] | null,
    diaMes: valor.diaMes,
    semanaInicio: valor.semanaInicio,
    fecha: valor.fecha,
  })

  const guardar = () => {
    if (error || saving) return
    void onSave(valor)
  }

  const fechaKey = dateToKey(fecha)
  const atajos = [
    { label: 'Hoy', key: hoy },
    { label: 'Mañana', key: addDaysToKey(hoy, 1) },
    { label: 'Próximo lunes', key: proximoLunes(hoy) },
  ]

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[6px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) guardar()
          }}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[28px] bg-[#100d0b]/95 text-white shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.06] backdrop-blur-2xl duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {/* Brillo cálido arriba, como la luz detrás del personaje */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(224,107,23,0.22),transparent)]"
          />

          <div className="relative px-7 pb-6 pt-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogPrimitive.Title className="text-[13px] text-white/50">
                  Nueva tarea
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  Una tarea para tu día: puntual o con frecuencia.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="-mr-2 -mt-1 rounded-full p-1.5 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white">
                <X className="size-4" />
                <span className="sr-only">Cerrar</span>
              </DialogPrimitive.Close>
            </div>

            {/* Título grande, sin caja */}
            <input
              autoFocus
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) guardar()
              }}
              maxLength={120}
              placeholder="¿Qué hay que hacer?"
              className="mt-2 w-full bg-transparent text-[26px] font-semibold leading-tight tracking-tight placeholder:text-white/25 focus:outline-none"
            />

            {verDetalle ? (
              <textarea
                autoFocus
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                rows={2}
                placeholder="Detalle (opcional)"
                className="mt-2 w-full resize-none bg-transparent text-[14px] leading-relaxed text-white/80 placeholder:text-white/25 focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setVerDetalle(true)}
                className="mt-2 text-[13px] text-white/40 transition-colors hover:text-white/75"
              >
                + Agregar detalle
              </button>
            )}

            {/* Cuándo */}
            <div className="mt-6 border-t border-white/[0.06] pt-5">
              <p className="mb-3 text-[13px] text-white/50">Cuándo</p>
              <div className="flex flex-wrap gap-1.5">
                {FRECUENCIAS.map(f => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFrecuencia(f.value)}
                    className={cn(
                      'h-8 rounded-full px-3.5 text-[13px] transition-colors',
                      frecuencia === f.value
                        ? 'bg-white text-black'
                        : 'bg-white/[0.06] text-white/65 hover:bg-white/[0.1] hover:text-white'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 min-h-[44px]">
                {frecuencia === 'unica' ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {atajos.map(a => (
                      <button
                        key={a.key}
                        type="button"
                        onClick={() => setFecha(parseOrderDateLocal(a.key))}
                        className={cn(
                          'h-9 rounded-full px-3.5 text-[13px] transition-colors',
                          fechaKey === a.key
                            ? ACTIVO
                            : 'bg-white/[0.04] text-white/70 hover:bg-white/[0.08]'
                        )}
                      >
                        {a.label}
                      </button>
                    ))}
                    <div
                      className={cn(
                        'flex h-9 items-center gap-1.5 rounded-full pl-3 pr-1 text-[13px] transition-colors',
                        fechaKey && !atajos.some(a => a.key === fechaKey)
                          ? ACTIVO
                          : 'bg-white/[0.04] text-white/70'
                      )}
                    >
                      <CalendarDays className="size-3.5 opacity-70" />
                      <DatePicker
                        date={
                          fechaKey && !atajos.some(a => a.key === fechaKey)
                            ? fecha
                            : undefined
                        }
                        onDateChange={setFecha}
                        placeholder="Otro día"
                        className="h-8 border-0 bg-transparent px-1 text-[13px] text-inherit shadow-none hover:bg-transparent"
                      />
                    </div>
                  </div>
                ) : null}

                {frecuencia === 'semanal' || frecuencia === 'quincenal' ? (
                  <div className="flex gap-2">
                    {DIAS.map(d => {
                      const on = diasSemana.includes(d.value)
                      return (
                        <button
                          key={d.value}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleDia(d.value)}
                          className={cn(
                            'size-10 rounded-full text-[13px] transition-colors',
                            on
                              ? ACTIVO
                              : 'bg-white/[0.05] text-white/55 hover:bg-white/[0.1] hover:text-white'
                          )}
                        >
                          {d.label}
                        </button>
                      )
                    })}
                  </div>
                ) : null}

                {frecuencia === 'quincenal' ? (
                  <div className="mt-3 flex items-center gap-2 text-[13px] text-white/50">
                    Empieza la semana del
                    <div className="rounded-full bg-white/[0.05] px-1">
                      <DatePicker
                        date={semanaInicio}
                        onDateChange={setSemanaInicio}
                        placeholder="Elegir lunes"
                        className="h-8 border-0 bg-transparent text-[13px] text-white shadow-none hover:bg-transparent"
                      />
                    </div>
                  </div>
                ) : null}

                {frecuencia === 'mensual' ? (
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] text-white/50">El día</span>
                    <div className="flex items-center rounded-full bg-white/[0.05] p-1">
                      <button
                        type="button"
                        onClick={() => setDiaMes(d => Math.max(1, d - 1))}
                        className="flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.08] hover:text-white"
                        aria-label="Un día menos"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-9 text-center text-[16px] font-semibold tabular-nums">
                        {diaMes}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDiaMes(d => Math.min(31, d + 1))}
                        className="flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.08] hover:text-white"
                        aria-label="Un día más"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <span className="text-[13px] text-white/50">
                      de cada mes
                    </span>
                  </div>
                ) : null}

                {frecuencia === 'diaria' ? (
                  <p className="text-[13px] text-white/50">
                    De lunes a viernes, salvo feriados y tus días libres.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {/* Pie: resumen de cómo queda + acciones */}
          <div className="relative flex items-center justify-between gap-4 border-t border-white/[0.06] bg-white/[0.02] px-7 py-4">
            <p
              className={cn(
                'min-w-0 truncate text-[13px]',
                error && titulo ? 'text-[#f6a33d]' : 'text-white/50'
              )}
            >
              {error && titulo ? error : resumen}
              {frecuencia === 'mensual' ? (
                <span className="text-white/30">
                  {' '}
                  · si no es hábil, pasa al siguiente
                </span>
              ) : null}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <DialogPrimitive.Close
                disabled={saving}
                className="h-9 rounded-full px-4 text-[13px] text-white/60 transition-colors hover:text-white"
              >
                Cancelar
              </DialogPrimitive.Close>
              <button
                type="button"
                onClick={guardar}
                disabled={!!error || saving}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-full px-5 text-[13px] transition-[background-color,color,transform,opacity] duration-200 active:scale-[0.97]',
                  error
                    ? 'bg-white/[0.08] text-white/35'
                    : `${ACTIVO} shadow-[0_8px_24px_-8px_rgba(224,107,23,0.9)] hover:brightness-110`
                )}
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Crear
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
