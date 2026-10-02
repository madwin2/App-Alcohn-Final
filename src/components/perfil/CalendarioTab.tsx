import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { CalendarioEquipo } from '@/components/perfil/CalendarioEquipo';
import { CargarVacacionesDialog } from '@/components/perfil/CargarVacacionesDialog';
import { CambioDiaDialog } from '@/components/perfil/CambioDiaDialog';
import {
  armarMesCalendario,
  quienesFaltanHoy,
} from '@/lib/equipo/calendarioEquipo';
import { todayArgentinaDateKey, argentinaDateParts } from '@/lib/utils/argentinaDate';
import { cn } from '@/lib/utils/cn';
import { notifyVacacionesCargadas } from '@/lib/notificaciones/events';
import {
  getMiembrosEquipo,
  type PerfilEquipo,
} from '@/lib/supabase/services/equipo.service';
import {
  borrarAusencia,
  crearCambioDia,
  crearVacaciones,
  actualizarAusencia,
  getAusencias,
  getAusenciasDeUsuario,
  getFeriados,
  type AusenciaEquipo,
  type Feriado,
} from '@/lib/supabase/services/equipoCalendario.service';

function fmtCorto(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function puedeEditarAusencia(
  a: AusenciaEquipo,
  userId: string,
  esAdmin: boolean,
  hoy: string,
): boolean {
  if (esAdmin) return true;
  return a.userId === userId && a.fechaDesde > hoy;
}

interface CalendarioTabProps {
  perfil: PerfilEquipo;
  esAdmin: boolean;
  onAusenciasChanged?: () => void;
}

export function CalendarioTab({ perfil, esAdmin, onAusenciasChanged }: CalendarioTabProps) {
  const { toast } = useToast();
  const hoy = todayArgentinaDateKey();
  const parts = argentinaDateParts();
  const [year, setYear] = useState(parts.year);
  const [month, setMonth] = useState(parts.month);
  const [miembros, setMiembros] = useState<PerfilEquipo[]>([]);
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [ausenciasMes, setAusenciasMes] = useState<AusenciaEquipo[]>([]);
  const [ausenciasHoy, setAusenciasHoy] = useState<AusenciaEquipo[]>([]);
  const [misAusencias, setMisAusencias] = useState<AusenciaEquipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroUserIds, setFiltroUserIds] = useState<string[] | null>(null);
  const [vacOpen, setVacOpen] = useState(false);
  const [cambioOpen, setCambioOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editVac, setEditVac] = useState<{
    id: string;
    fechaDesde: string;
    fechaHasta: string;
    nota: string | null;
  } | null>(null);
  const [editCambio, setEditCambio] = useState<{
    id: string;
    fecha: string;
    fechaRecupero: string | null;
    nota: string | null;
  } | null>(null);
  const target = perfil;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const padDesde = `${year}-${String(month).padStart(2, '0')}-01`;
      const padHasta = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const [m, f, aMes, aHoy, aMias] = await Promise.all([
        getMiembrosEquipo(),
        getFeriados({
          desde: `${year - 1}-12-01`,
          hasta: `${year + 1}-01-31`,
        }),
        getAusencias({ desde: padDesde, hasta: padHasta }),
        getAusencias({ desde: hoy, hasta: hoy }),
        getAusenciasDeUsuario(perfil.userId),
      ]);
      setMiembros(m);
      setFeriados(f);
      setAusenciasMes(aMes);
      setAusenciasHoy(aHoy);
      setMisAusencias(aMias);
    } catch (err) {
      toast({
        title: 'No se pudo cargar el calendario',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [year, month, perfil.userId, toast, hoy]);

  useEffect(() => {
    void load();
  }, [load]);

  const feriadosKeys = useMemo(() => feriados.map((f) => f.fecha), [feriados]);

  const mesData = useMemo(
    () =>
      armarMesCalendario({
        year,
        month,
        personas: miembros.map((m) => ({
          userId: m.userId,
          nombre: m.nombre,
          color: m.color,
          fechaNacimiento: m.fechaNacimiento,
        })),
        ausencias: ausenciasMes.map((a) => ({
          id: a.id,
          userId: a.userId,
          tipo: a.tipo,
          fechaDesde: a.fechaDesde,
          fechaHasta: a.fechaHasta,
          fechaRecupero: a.fechaRecupero,
        })),
        feriados: feriados.map((f) => ({
          id: f.id,
          fecha: f.fecha,
          nombre: f.nombre,
          origen: f.origen,
        })),
        filtroUserIds,
      }),
    [year, month, miembros, ausenciasMes, feriados, filtroUserIds],
  );

  const faltanHoy = useMemo(
    () =>
      quienesFaltanHoy({
        hoy,
        personas: miembros.map((m) => ({
          userId: m.userId,
          nombre: m.nombre,
          color: m.color,
          fechaNacimiento: m.fechaNacimiento,
        })),
        ausencias: ausenciasHoy.map((a) => ({
          id: a.id,
          userId: a.userId,
          tipo: a.tipo,
          fechaDesde: a.fechaDesde,
          fechaHasta: a.fechaHasta,
          fechaRecupero: a.fechaRecupero,
        })),
      }),
    [hoy, miembros, ausenciasHoy],
  );

  const goPrev = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  };
  const goNext = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  };
  const goHoy = () => {
    const p = argentinaDateParts();
    setYear(p.year);
    setMonth(p.month);
  };

  const toggleFiltro = (userId: string) => {
    setFiltroUserIds((prev) => {
      if (!prev) return [userId];
      if (prev.includes(userId)) {
        const next = prev.filter((id) => id !== userId);
        return next.length === 0 ? null : next;
      }
      return [...prev, userId];
    });
  };

  const afterChange = async () => {
    await load();
    onAusenciasChanged?.();
  };

  const handleVacaciones = async (input: {
    fechaDesde: string;
    fechaHasta: string;
    nota: string | null;
  }) => {
    setSaving(true);
    try {
      if (editVac) {
        await actualizarAusencia({
          id: editVac.id,
          fechaDesde: input.fechaDesde,
          fechaHasta: input.fechaHasta,
          nota: input.nota,
        });
        toast({ title: 'Vacaciones actualizadas' });
      } else {
        const creada = await crearVacaciones({
          userId: target.userId,
          fechaDesde: input.fechaDesde,
          fechaHasta: input.fechaHasta,
          nota: input.nota,
        });
        const destinatarios = miembros
          .filter((m) => m.userId !== target.userId && m.activo)
          .map((m) => m.userId);
        notifyVacacionesCargadas({
          nombre: target.nombre.split(' ')[0] || target.nombre,
          fechaDesde: input.fechaDesde,
          fechaHasta: input.fechaHasta,
          destinatarioUserIds: destinatarios,
          ausenciaId: creada.id,
        });
        toast({ title: 'Vacaciones cargadas' });
      }
      setVacOpen(false);
      setEditVac(null);
      await afterChange();
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCambio = async (input: {
    fecha: string;
    fechaRecupero: string | null;
    nota: string | null;
  }) => {
    setSaving(true);
    try {
      if (editCambio) {
        await actualizarAusencia({
          id: editCambio.id,
          fechaDesde: input.fecha,
          fechaHasta: input.fecha,
          fechaRecupero: input.fechaRecupero,
          nota: input.nota,
        });
        toast({ title: 'Cambio de día actualizado' });
      } else {
        await crearCambioDia({
          userId: target.userId,
          fecha: input.fecha,
          fechaRecupero: input.fechaRecupero,
          nota: input.nota,
        });
        toast({ title: 'Cambio de día cargado' });
      }
      setCambioOpen(false);
      setEditCambio(null);
      await afterChange();
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (a: AusenciaEquipo) => {
    if (!puedeEditarAusencia(a, perfil.userId, esAdmin, hoy)) return;
    if (a.tipo === 'vacaciones') {
      setEditVac({
        id: a.id,
        fechaDesde: a.fechaDesde,
        fechaHasta: a.fechaHasta,
        nota: a.nota,
      });
      setVacOpen(true);
    } else {
      setEditCambio({
        id: a.id,
        fecha: a.fechaDesde,
        fechaRecupero: a.fechaRecupero,
        nota: a.nota,
      });
      setCambioOpen(true);
    }
  };

  const handleBorrar = async (a: AusenciaEquipo) => {
    if (!puedeEditarAusencia(a, perfil.userId, esAdmin, hoy)) return;
    if (!window.confirm('¿Borrar este registro?')) return;
    try {
      await borrarAusencia(a.id);
      toast({ title: 'Borrado' });
      await afterChange();
    } catch (err) {
      toast({
        title: 'No se pudo borrar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  const proximas = misAusencias.filter((a) => a.fechaHasta >= hoy);
  const pasadas = misAusencias.filter((a) => a.fechaHasta < hoy);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando calendario…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Calendario del equipo</h2>
          <p className="text-xs text-muted-foreground">
            Vacaciones, cambios de día, feriados y cumpleaños de todos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setEditVac(null);
              setVacOpen(true);
            }}
          >
            Cargar vacaciones
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setEditCambio(null);
              setCambioOpen(true);
            }}
          >
            Cambiar un día
          </Button>
        </div>
      </div>

      <p className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground">
        {faltanHoy.length === 0 ? (
          <>Hoy no están: nadie</>
        ) : (
          <>
            Hoy no están:{' '}
            <span className="text-white">
              {faltanHoy.map((f) => f.nombre.split(' ')[0]).join(', ')}
            </span>
          </>
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        {miembros.map((m) => {
          const activo = !filtroUserIds || filtroUserIds.includes(m.userId);
          return (
            <button
              key={m.userId}
              type="button"
              onClick={() => toggleFiltro(m.userId)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-opacity',
                activo ? 'border-white/20 text-white' : 'border-white/10 text-muted-foreground opacity-45',
              )}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: m.color }}
              />
              {m.nombre.split(' ')[0]}
            </button>
          );
        })}
        {filtroUserIds ? (
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline"
            onClick={() => setFiltroUserIds(null)}
          >
            Ver todos
          </button>
        ) : null}
      </div>

      <CalendarioEquipo
        year={year}
        month={month}
        dias={mesData.dias}
        hoy={hoy}
        onPrev={goPrev}
        onNext={goNext}
        onHoy={goHoy}
      />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white">Mis vacaciones y cambios</h3>
        {misAusencias.length === 0 ? (
          <p className="text-xs text-muted-foreground">Todavía no cargaste nada.</p>
        ) : (
          <div className="space-y-4">
            {[
              { title: 'Próximos', items: proximas },
              { title: 'Pasados', items: pasadas },
            ].map((grupo) =>
              grupo.items.length === 0 ? null : (
                <div key={grupo.title}>
                  <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {grupo.title}
                  </p>
                  <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/10">
                    {grupo.items.map((a) => {
                      const editable = puedeEditarAusencia(a, perfil.userId, esAdmin, hoy);
                      return (
                        <li
                          key={a.id}
                          className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs"
                        >
                          <div>
                            <span className="font-medium text-white">
                              {a.tipo === 'vacaciones' ? 'Vacaciones' : 'Cambio de día'}
                            </span>
                            <span className="text-muted-foreground">
                              {' '}
                              ·{' '}
                              {a.tipo === 'vacaciones'
                                ? `${fmtCorto(a.fechaDesde)} – ${fmtCorto(a.fechaHasta)}`
                                : `${fmtCorto(a.fechaDesde)}${
                                    a.fechaRecupero
                                      ? ` (recupera ${fmtCorto(a.fechaRecupero)})`
                                      : ' (sin recupero)'
                                  }`}
                            </span>
                            {a.nota ? (
                              <span className="block text-[11px] text-muted-foreground">
                                {a.nota}
                              </span>
                            ) : null}
                          </div>
                          {editable ? (
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openEdit(a)}
                                aria-label="Editar"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => void handleBorrar(a)}
                                aria-label="Borrar"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ),
            )}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Podés borrar los futuros. Los pasados solo los corrige el admin.
        </p>
      </section>

      <CargarVacacionesDialog
        open={vacOpen}
        onOpenChange={(v) => {
          setVacOpen(v);
          if (!v) setEditVac(null);
        }}
        perfil={target}
        miembros={miembros}
        ausencias={[...ausenciasMes, ...misAusencias].filter(
          (a, i, arr) => arr.findIndex((x) => x.id === a.id) === i,
        )}
        feriadosKeys={feriadosKeys}
        hoy={hoy}
        saving={saving}
        initial={editVac}
        onConfirm={handleVacaciones}
      />
      <CambioDiaDialog
        open={cambioOpen}
        onOpenChange={(v) => {
          setCambioOpen(v);
          if (!v) setEditCambio(null);
        }}
        perfil={target}
        feriadosKeys={feriadosKeys}
        saving={saving}
        initial={editCambio}
        onConfirm={handleCambio}
      />
    </div>
  );
}
