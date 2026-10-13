import { useEffect, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useToast } from '@/components/ui/use-toast'
import { createDashboardTask } from '@/lib/supabase/services/dashboard-tasks.service'
import { getUserInitials } from '@/lib/utils/userImages'
import type { Persona } from './useNotas'

/**
 * "Nota a un compañero" con la estética clara de la rama local (papel, como el post-it que le
 * va a aparecer). Se elige a la persona por su busto. Guarda igual que la Home actual
 * (`tareas_dashboard`, con aviso al compañero).
 */
export function NotaCompaneroDialog({
  open,
  onOpenChange,
  personas,
  miId,
  onCreada,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  personas: Persona[]
  miId: string
  onCreada: () => void
}) {
  const { toast } = useToast()
  const [para, setPara] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!open) return
    setPara(null)
    setTexto('')
  }, [open])

  const elegido = personas.find(p => p.id === para)
  const puede = Boolean(para && texto.trim() && miId) && !enviando

  const enviar = async () => {
    if (!puede || !para) return
    setEnviando(true)
    try {
      await createDashboardTask(para, miId, texto)
      toast({
        title: 'Nota enviada',
        description: `${elegido?.nombre.split(/\s+/)[0] ?? 'Tu compañero'} la ve en su inicio.`,
      })
      onCreada()
      onOpenChange(false)
    } catch {
      toast({
        title: 'No se pudo enviar',
        description: 'Probá de nuevo.',
        variant: 'destructive',
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[6px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void enviar()
          }}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[28px] bg-[#F5F5F3] text-[#0A0A0A] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="px-7 pb-6 pt-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogPrimitive.Title className="text-[19px] font-semibold tracking-[-0.02em]">
                  Nota a un compañero
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-0.5 text-[13px] text-black/50">
                  Le aparece como post-it en su inicio.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="-mr-2 -mt-1 rounded-full p-1.5 text-black/35 transition-colors hover:bg-black/[0.05] hover:text-black">
                <X className="size-4" />
                <span className="sr-only">Cerrar</span>
              </DialogPrimitive.Close>
            </div>

            {/* Para quién: bustos */}
            <p className="mb-2 mt-6 text-[12px] font-medium text-black/45">
              Para
            </p>
            {personas.length === 0 ? (
              <p className="text-[13px] text-black/45">
                No hay otros compañeros.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {personas.map(p => {
                  const on = p.id === para
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPara(p.id)}
                      aria-pressed={on}
                      className={cn(
                        'group flex w-[76px] flex-col items-center gap-1 rounded-2xl pb-2 pt-1.5 transition-colors',
                        on ? 'bg-black text-white' : 'hover:bg-black/[0.05]'
                      )}
                    >
                      {p.foto ? (
                        <img
                          src={p.foto}
                          alt=""
                          draggable={false}
                          className={cn(
                            'size-14 select-none object-contain transition-transform duration-300',
                            on && 'scale-105'
                          )}
                        />
                      ) : (
                        <span
                          className={cn(
                            'flex size-14 items-center justify-center rounded-full text-[15px] font-semibold',
                            on ? 'bg-white/15' : 'bg-black/[0.07]'
                          )}
                        >
                          {getUserInitials(p.nombre)}
                        </span>
                      )}
                      <span
                        className={cn(
                          'max-w-full truncate px-1 text-[12px]',
                          on ? 'font-semibold' : 'text-black/60'
                        )}
                      >
                        {p.nombre.split(/\s+/)[0]}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* La nota, escrita sobre un post-it */}
            <p className="mb-2 mt-5 text-[12px] font-medium text-black/45">
              Nota
            </p>
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              rows={4}
              placeholder={
                elegido
                  ? `¿Qué le dejás a ${elegido.nombre.split(/\s+/)[0]}?`
                  : 'Escribí la nota…'
              }
              className="w-full resize-none rounded-[14px] border-0 bg-white px-4 py-3 text-[14px] leading-snug shadow-[0_10px_24px_-14px_rgba(0,0,0,0.35)] outline-none placeholder:text-black/30 focus:ring-2 focus:ring-[#e06b17]/50"
            />
          </div>

          <div className="flex items-center justify-end gap-1 border-t border-black/[0.06] px-7 py-4">
            <DialogPrimitive.Close
              disabled={enviando}
              className="h-9 rounded-full px-4 text-[13px] font-medium text-black/50 transition-colors hover:text-black"
            >
              Cancelar
            </DialogPrimitive.Close>
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={!puede}
              className="flex h-9 items-center gap-1.5 rounded-full bg-black px-5 text-[13px] font-semibold text-white transition-transform active:scale-95 disabled:opacity-30"
            >
              {enviando ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Enviar
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
