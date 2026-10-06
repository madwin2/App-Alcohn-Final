import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { toastConDeshacer } from '@/components/ui/toastDeshacer'
import { ConfirmDialog } from '@/components/programas/ConfirmDialog'
import { CargarVacacionesDialog } from '@/components/perfil/CargarVacacionesDialog'
import { CambioDiaDialog } from '@/components/perfil/CambioDiaDialog'
import { ListaAusencias } from '@/components/perfil/ListaAusencias'
import { huboCambioDeFechas } from '@/lib/equipo/ausencias'
import {
  avisarVacacionesCambiadas,
  avisarVacacionesCanceladas,
} from '@/lib/notificaciones/vacacionesEquipo'
import type { PerfilEquipo } from '@/lib/supabase/services/equipo.service'
import {
  actualizarAusencia,
  borrarAusencia,
  crearCambioDia,
  crearVacaciones,
  getAusenciasDeUsuario,
  type AusenciaEquipo,
} from '@/lib/supabase/services/equipoCalendario.service'
import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate'

interface AusenciasPersonaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  perfil: PerfilEquipo
  /** Todo el equipo (activos e inactivos): define a quién se avisa. */
  miembros: PerfilEquipo[]
  adminNombre?: string
  /** Se llama tras editar/borrar para que el padre recargue saldos. */
  onChanged?: () => void
}

/**
 * EQ-R04: el admin ve, edita y borra las ausencias de cualquier persona
 * (incluidas las que ya empezaron, que el propio integrante no puede tocar).
 */
export function AusenciasPersonaDialog({
  open,
  onOpenChange,
  perfil,
  miembros,
  adminNombre,
  onChanged,
}: AusenciasPersonaDialogProps) {
  const { toast } = useToast()
  const hoy = todayArgentinaDateKey()
  const [items, setItems] = useState<AusenciaEquipo[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editVac, setEditVac] = useState<AusenciaEquipo | null>(null)
  const [editCambio, setEditCambio] = useState<AusenciaEquipo | null>(null)
  const [ausenciaABorrar, setAusenciaABorrar] = useState<AusenciaEquipo | null>(
    null
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await getAusenciasDeUsuario(perfil.userId))
    } catch (err) {
      toast({
        title: 'No se pudieron cargar las ausencias',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [perfil.userId, toast])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const afterChange = async () => {
    await load()
    onChanged?.()
  }

  const solicitarBorrarAusencia = (a: AusenciaEquipo) => {
    setAusenciaABorrar(a)
  }

  const confirmarBorrarAusencia = () => {
    const a = ausenciaABorrar
    if (!a) return
    void (async () => {
      const snap = a
      try {
        await borrarAusencia(snap.id)
        if (snap.tipo === 'vacaciones') {
          avisarVacacionesCanceladas({
            persona: perfil,
            miembros,
            ausenciaId: snap.id,
            fechaDesde: snap.fechaDesde,
            fechaHasta: snap.fechaHasta,
          })
        }
        toastConDeshacer('Borrado', async () => {
          try {
            if (snap.tipo === 'vacaciones') {
              await crearVacaciones({
                userId: snap.userId,
                fechaDesde: snap.fechaDesde,
                fechaHasta: snap.fechaHasta,
                nota: snap.nota,
              })
            } else {
              await crearCambioDia({
                userId: snap.userId,
                fecha: snap.fechaDesde,
                fechaRecupero: snap.fechaRecupero,
                nota: snap.nota,
              })
            }
            toast({ title: 'Registro restaurado' })
            await afterChange()
          } catch (err) {
            toast({
              title: 'No se pudo deshacer',
              description: err instanceof Error ? err.message : 'Error',
              variant: 'destructive',
            })
          }
        })
        await afterChange()
      } catch (err) {
        toast({
          title: 'No se pudo borrar',
          description: err instanceof Error ? err.message : 'Error',
          variant: 'destructive',
        })
      }
    })()
  }

  const handleVacaciones = async (input: {
    fechaDesde: string
    fechaHasta: string
    nota: string | null
  }) => {
    if (!editVac) return
    setSaving(true)
    try {
      await actualizarAusencia({
        id: editVac.id,
        fechaDesde: input.fechaDesde,
        fechaHasta: input.fechaHasta,
        nota: input.nota,
      })
      if (huboCambioDeFechas(editVac, input)) {
        avisarVacacionesCambiadas({
          persona: perfil,
          miembros,
          ausenciaId: editVac.id,
          fechaDesde: input.fechaDesde,
          fechaHasta: input.fechaHasta,
        })
      }
      toast({ title: 'Vacaciones actualizadas' })
      setEditVac(null)
      await afterChange()
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleCambio = async (input: {
    fecha: string
    fechaRecupero: string | null
    nota: string | null
  }) => {
    if (!editCambio) return
    setSaving(true)
    try {
      await actualizarAusencia({
        id: editCambio.id,
        fechaDesde: input.fecha,
        fechaHasta: input.fecha,
        fechaRecupero: input.fechaRecupero,
        nota: input.nota,
      })
      toast({ title: 'Cambio de día actualizado' })
      setEditCambio(null)
      await afterChange()
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ausencias de {perfil.nombre}</DialogTitle>
            <DialogDescription>
              Vacaciones y cambios de día. Como admin podés corregir también lo
              que ya empezó.
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : (
            <ListaAusencias
              ausencias={items}
              viewerUserId={perfil.userId}
              esAdmin
              hoy={hoy}
              vacioTexto={`${perfil.nombre.split(' ')[0]} no tiene nada cargado.`}
              onEditar={a =>
                a.tipo === 'vacaciones' ? setEditVac(a) : setEditCambio(a)
              }
              onBorrar={solicitarBorrarAusencia}
            />
          )}
        </DialogContent>
      </Dialog>

      <CargarVacacionesDialog
        open={editVac != null}
        onOpenChange={v => {
          if (!v) setEditVac(null)
        }}
        perfil={perfil}
        miembros={miembros.filter(m => m.activo)}
        hoy={hoy}
        saving={saving}
        esAdmin
        adminNombre={adminNombre}
        initial={
          editVac
            ? {
                id: editVac.id,
                fechaDesde: editVac.fechaDesde,
                fechaHasta: editVac.fechaHasta,
                nota: editVac.nota,
              }
            : null
        }
        onConfirm={handleVacaciones}
      />
      <CambioDiaDialog
        open={editCambio != null}
        onOpenChange={v => {
          if (!v) setEditCambio(null)
        }}
        perfil={perfil}
        hoy={hoy}
        saving={saving}
        esAdmin
        adminNombre={adminNombre}
        initial={
          editCambio
            ? {
                id: editCambio.id,
                fecha: editCambio.fechaDesde,
                fechaRecupero: editCambio.fechaRecupero,
                nota: editCambio.nota,
              }
            : null
        }
        onConfirm={handleCambio}
      />

      <ConfirmDialog
        open={!!ausenciaABorrar}
        onOpenChange={open => {
          if (!open) setAusenciaABorrar(null)
        }}
        title="Borrar registro"
        description="¿Borrar este registro de vacaciones o cambio de día?"
        confirmLabel="Borrar"
        variant="destructive"
        onConfirm={confirmarBorrarAusencia}
      />
    </>
  )
}
