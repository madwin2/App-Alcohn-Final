import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, HeartHandshake, ListTodo, Loader2, Pencil, Plus, Repeat, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { COLORES_EQUIPO, colorYaUsado } from '@/lib/equipo/colores';
import { formatearCumpleaniosSinAnio } from '@/lib/equipo/cumpleanios';
import { saldoVacaciones } from '@/lib/equipo/vacaciones';
import { describirFrecuencia } from '@/lib/equipo/tareasRecurrentes';
import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate';
import { parseOrderDateLocal } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import {
  desactivarPerfil,
  getMiembrosEquipo,
  getUsuariosSinPerfil,
  upsertPerfil,
  type AreaPrincipalEquipo,
  type PerfilEquipo,
  type UsuarioSinPerfil,
} from '@/lib/supabase/services/equipo.service';
import {
  crearCambioDia,
  crearVacaciones,
  getAusencias,
  getFeriados,
  type AusenciaEquipo,
} from '@/lib/supabase/services/equipoCalendario.service';
import type { TareaRecurrente } from '@/lib/supabase/services/equipoTareas.service';
import { invalidateEquipoRolCache } from '@/lib/hooks/useEquipoRol';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  notifyTareaRecurrenteAsignada,
  notifyVacacionesCargadas,
} from '@/lib/notificaciones/events';
import { EquipoFeriadosPanel } from '@/components/perfil/EquipoFeriadosPanel';
import { CargarVacacionesDialog } from '@/components/perfil/CargarVacacionesDialog';
import { CambioDiaDialog } from '@/components/perfil/CambioDiaDialog';
import { TareasTab } from '@/components/perfil/TareasTab';
import { EquipoNecesidadesBandeja } from '@/components/perfil/EquipoNecesidadesBandeja';
import { EquipoFeedbackDialog } from '@/components/perfil/EquipoFeedbackDialog';

const AREA_OPTIONS: { value: AreaPrincipalEquipo; label: string }[] = [
  { value: 'ventas', label: 'Ventas' },
  { value: 'logistica', label: 'Logística' },
  { value: 'produccion', label: 'Producción' },
  { value: 'administracion', label: 'Administración' },
];

const AREA_LABEL: Record<string, string> = Object.fromEntries(
  AREA_OPTIONS.map((o) => [o.value, o.label]),
);

type FormState = {
  userId: string;
  puesto: string;
  areaPrincipal: AreaPrincipalEquipo | '';
  fechaIngreso: Date | undefined;
  fechaNacimiento: Date | undefined;
  color: string;
  diasVacacionesAnuales: number;
  vacacionesSaldoBase: number;
  vacacionesSinLimite: boolean;
  esAdmin: boolean;
  /** Si el admin tocó el saldo base en esta edición. */
  saldoBaseEditado: boolean;
};

const emptyForm = (): FormState => ({
  userId: '',
  puesto: '',
  areaPrincipal: '',
  fechaIngreso: undefined,
  fechaNacimiento: undefined,
  color: COLORES_EQUIPO[0],
  diasVacacionesAnuales: 10,
  vacacionesSaldoBase: 0,
  vacacionesSinLimite: false,
  esAdmin: false,
  saldoBaseEditado: false,
});

function dateToKey(d: Date | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface EquipoTabProps {
  onChanged?: () => void;
}

export function EquipoTab({ onChanged }: EquipoTabProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [miembros, setMiembros] = useState<PerfilEquipo[]>([]);
  const [sinPerfil, setSinPerfil] = useState<UsuarioSinPerfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [colorAviso, setColorAviso] = useState<string | null>(null);
  const [ausencias, setAusencias] = useState<AusenciaEquipo[]>([]);
  const [feriadosKeys, setFeriadosKeys] = useState<string[]>([]);
  const [targetPerfil, setTargetPerfil] = useState<PerfilEquipo | null>(null);
  const [vacOpen, setVacOpen] = useState(false);
  const [cambioOpen, setCambioOpen] = useState(false);
  const [tareasOpen, setTareasOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [savingAusencia, setSavingAusencia] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hoy = todayArgentinaDateKey();
      const anio = Number(hoy.slice(0, 4));
      const [m, s, a, f] = await Promise.all([
        getMiembrosEquipo({ incluirInactivos: true }),
        getUsuariosSinPerfil(),
        getAusencias({ desde: `${anio - 1}-01-01`, hasta: `${anio + 1}-12-31` }),
        getFeriados({ desde: `${anio - 1}-01-01`, hasta: `${anio + 1}-12-31` }),
      ]);
      setMiembros(m);
      setSinPerfil(s);
      setAusencias(a);
      setFeriadosKeys(f.map((x) => x.fecha));
    } catch (err) {
      toast({
        title: 'No se pudo cargar el equipo',
        description: err instanceof Error ? err.message : 'Error al cargar',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const saldosPorUser = useMemo(() => {
    const hoy = todayArgentinaDateKey();
    const map = new Map<string, { disponiblesHoy: number; planificados: number }>();
    for (const m of miembros) {
      if (m.vacacionesSinLimite) continue;
      const s = saldoVacaciones({
        saldoBase: m.vacacionesSaldoBase,
        saldoBaseFecha: m.vacacionesSaldoBaseFecha,
        diasAnuales: m.diasVacacionesAnuales,
        ausencias: ausencias
          .filter((a) => a.userId === m.userId)
          .map((a) => ({
            tipo: a.tipo,
            fechaDesde: a.fechaDesde,
            fechaHasta: a.fechaHasta,
            fechaRecupero: a.fechaRecupero,
          })),
        feriados: feriadosKeys,
        hoy,
      });
      map.set(m.userId, {
        disponiblesHoy: s.disponiblesHoy,
        planificados: s.planificados,
      });
    }
    return map;
  }, [miembros, ausencias, feriadosKeys]);

  const coloresUsadosPorOtros = useMemo(() => {
    return miembros
      .filter((m) => m.activo && m.userId !== form.userId)
      .map((m) => m.color);
  }, [miembros, form.userId]);

  const openVacacionesPara = (p: PerfilEquipo) => {
    setTargetPerfil(p);
    setCambioOpen(false);
    setTareasOpen(false);
    setFeedbackOpen(false);
    setVacOpen(true);
  };
  const openCambioPara = (p: PerfilEquipo) => {
    setTargetPerfil(p);
    setVacOpen(false);
    setTareasOpen(false);
    setFeedbackOpen(false);
    setCambioOpen(true);
  };
  const openTareasPara = (p: PerfilEquipo) => {
    setTargetPerfil(p);
    setVacOpen(false);
    setCambioOpen(false);
    setFeedbackOpen(false);
    setTareasOpen(true);
  };
  const openFeedbackPara = (p: PerfilEquipo) => {
    setTargetPerfil(p);
    setVacOpen(false);
    setCambioOpen(false);
    setTareasOpen(false);
    setFeedbackOpen(true);
  };

  const nombresPorUserId = useMemo(() => {
    const map: Record<string, string> = {};
    miembros.forEach((m) => {
      map[m.userId] = m.nombre;
    });
    return map;
  }, [miembros]);

  const handleTareaAsignada = (tarea: TareaRecurrente) => {
    if (!targetPerfil || !user?.id) return;
    if (tarea.userId === user.id) return;
    const autor = miembros.find((m) => m.userId === user.id);
    const autorNombre = (autor?.nombre || 'Julián').split(/\s+/)[0] || 'Julián';
    notifyTareaRecurrenteAsignada({
      autorNombre,
      titulo: tarea.titulo,
      frecuenciaTexto: describirFrecuencia({
        frecuencia: tarea.frecuencia,
        diasSemana: tarea.diasSemana as (1 | 2 | 3 | 4 | 5)[] | null,
        diaMes: tarea.diaMes,
        semanaInicio: tarea.semanaInicio,
      }),
      destinatarioUserId: tarea.userId,
      tareaId: tarea.id,
    });
  };

  const handleVacacionesAdmin = async (input: {
    fechaDesde: string;
    fechaHasta: string;
    nota: string | null;
  }) => {
    if (!targetPerfil) return;
    setSavingAusencia(true);
    try {
      const creada = await crearVacaciones({
        userId: targetPerfil.userId,
        fechaDesde: input.fechaDesde,
        fechaHasta: input.fechaHasta,
        nota: input.nota,
      });
      const destinatarios = miembros
        .filter((m) => m.userId !== targetPerfil.userId && m.activo)
        .map((m) => m.userId);
      notifyVacacionesCargadas({
        nombre: targetPerfil.nombre.split(' ')[0] || targetPerfil.nombre,
        fechaDesde: input.fechaDesde,
        fechaHasta: input.fechaHasta,
        destinatarioUserIds: destinatarios,
        ausenciaId: creada.id,
      });
      toast({ title: `Vacaciones de ${targetPerfil.nombre} cargadas` });
      setVacOpen(false);
      setTargetPerfil(null);
      await load();
      onChanged?.();
    } catch (err) {
      toast({
        title: 'No se pudo cargar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setSavingAusencia(false);
    }
  };

  const handleCambioAdmin = async (input: {
    fecha: string;
    fechaRecupero: string | null;
    nota: string | null;
  }) => {
    if (!targetPerfil) return;
    setSavingAusencia(true);
    try {
      await crearCambioDia({
        userId: targetPerfil.userId,
        fecha: input.fecha,
        fechaRecupero: input.fechaRecupero,
        nota: input.nota,
      });
      toast({ title: `Cambio de día de ${targetPerfil.nombre} cargado` });
      setCambioOpen(false);
      setTargetPerfil(null);
      await load();
      onChanged?.();
    } catch (err) {
      toast({
        title: 'No se pudo cargar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setSavingAusencia(false);
    }
  };

  const openCreate = () => {
    const usados = miembros.filter((m) => m.activo).map((m) => m.color);
    const primerLibre = COLORES_EQUIPO.find((c) => !colorYaUsado(c, usados));
    setMode('create');
    setForm({
      ...emptyForm(),
      color: primerLibre ?? COLORES_EQUIPO[0],
    });
    setColorAviso(null);
    setDialogOpen(true);
  };

  const openEdit = (p: PerfilEquipo) => {
    setMode('edit');
    setForm({
      userId: p.userId,
      puesto: p.puesto ?? '',
      areaPrincipal: p.areaPrincipal ?? '',
      fechaIngreso: p.fechaIngreso ? parseOrderDateLocal(p.fechaIngreso) : undefined,
      fechaNacimiento: p.fechaNacimiento
        ? parseOrderDateLocal(p.fechaNacimiento)
        : undefined,
      color: p.color,
      diasVacacionesAnuales: p.diasVacacionesAnuales,
      vacacionesSaldoBase: p.vacacionesSaldoBase,
      vacacionesSinLimite: p.vacacionesSinLimite,
      esAdmin: p.esAdmin,
      saldoBaseEditado: false,
    });
    setColorAviso(null);
    setDialogOpen(true);
  };

  const pickColor = (color: string) => {
    setForm((f) => ({ ...f, color }));
    if (colorYaUsado(color, coloresUsadosPorOtros)) {
      setColorAviso('Otro integrante activo ya usa este color.');
    } else {
      setColorAviso(null);
    }
  };

  const handleSave = async () => {
    if (!form.userId) {
      toast({ title: 'Elegí un usuario', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const hoy = todayArgentinaDateKey();
      const saldoFecha =
        mode === 'create' || form.saldoBaseEditado
          ? hoy
          : undefined;

      await upsertPerfil({
        userId: form.userId,
        puesto: form.puesto.trim() || null,
        areaPrincipal: form.areaPrincipal || null,
        fechaIngreso: dateToKey(form.fechaIngreso),
        fechaNacimiento: dateToKey(form.fechaNacimiento),
        color: form.color,
        diasVacacionesAnuales: form.diasVacacionesAnuales,
        vacacionesSaldoBase: form.vacacionesSaldoBase,
        ...(saldoFecha ? { vacacionesSaldoBaseFecha: saldoFecha } : {}),
        vacacionesSinLimite: form.vacacionesSinLimite,
        esAdmin: form.esAdmin,
        activo: true,
      });
      invalidateEquipoRolCache(form.userId);
      toast({
        title: mode === 'create' ? 'Integrante agregado' : 'Perfil actualizado',
      });
      setDialogOpen(false);
      await load();
      onChanged?.();
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description: err instanceof Error ? err.message : 'Error al guardar',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDesactivar = async (p: PerfilEquipo) => {
    if (!window.confirm(`¿Desactivar a ${p.nombre}? Seguirá en la base como inactivo.`)) {
      return;
    }
    try {
      await desactivarPerfil(p.userId);
      invalidateEquipoRolCache(p.userId);
      toast({ title: 'Integrante desactivado' });
      await load();
      onChanged?.();
    } catch (err) {
      toast({
        title: 'No se pudo desactivar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  const handleReactivar = async (p: PerfilEquipo) => {
    try {
      await upsertPerfil({ userId: p.userId, activo: true });
      invalidateEquipoRolCache(p.userId);
      toast({ title: 'Integrante reactivado' });
      await load();
      onChanged?.();
    } catch (err) {
      toast({
        title: 'No se pudo reactivar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando equipo…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Equipo</h2>
          <p className="text-xs text-muted-foreground">
            Perfiles laborales. Al crear a Fede / Cachi / Juli B usá los saldos iniciales del 2026-10-02
            (Fede 10, Cachi 0, Juli B 3).
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={openCreate}
          disabled={sinPerfil.length === 0}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Agregar al equipo
        </Button>
      </div>

      <EquipoNecesidadesBandeja nombresPorUserId={nombresPorUserId} />

      {miembros.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted-foreground">
          Todavía no hay perfiles. Agregá al primer integrante.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[1020px] text-left text-xs">
            <thead className="border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Puesto</th>
                <th className="px-3 py-2 font-medium">Área</th>
                <th className="px-3 py-2 font-medium">Ingreso</th>
                <th className="px-3 py-2 font-medium">Cumpleaños</th>
                <th className="px-3 py-2 font-medium">Color</th>
                <th className="px-3 py-2 font-medium">Días/año</th>
                <th className="px-3 py-2 font-medium">Saldo base</th>
                <th className="px-3 py-2 font-medium">Vac. disponibles</th>
                <th className="px-3 py-2 font-medium">Activo</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {miembros.map((m) => (
                <tr key={m.userId} className="border-b border-white/[0.06] last:border-0">
                  <td className="px-3 py-2.5 font-medium text-white">
                    {m.nombre}
                    {m.esAdmin ? (
                      <span className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        admin
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{m.puesto || '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {m.areaPrincipal ? AREA_LABEL[m.areaPrincipal] : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{m.fechaIngreso || '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {m.fechaNacimiento
                      ? formatearCumpleaniosSinAnio(m.fechaNacimiento)
                      : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="inline-block h-4 w-4 rounded-full border border-white/20"
                      style={{ backgroundColor: m.color }}
                      title={m.color}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {m.vacacionesSinLimite ? 'Sin límite' : m.diasVacacionesAnuales}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {m.vacacionesSinLimite
                      ? '—'
                      : `${m.vacacionesSaldoBase} (al ${m.vacacionesSaldoBaseFecha})`}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {m.vacacionesSinLimite
                      ? 'Sin límite'
                      : (() => {
                          const s = saldosPorUser.get(m.userId);
                          if (!s) return '—';
                          return s.planificados > 0
                            ? `${s.disponiblesHoy} (${s.planificados} planif.)`
                            : String(s.disponiblesHoy);
                        })()}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {m.activo ? 'Sí' : 'No'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      {m.activo ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Cargar vacaciones"
                            onClick={() => openVacacionesPara(m)}
                            aria-label={`Vacaciones de ${m.nombre}`}
                          >
                            <CalendarDays className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Cambiar un día"
                            onClick={() => openCambioPara(m)}
                            aria-label={`Cambio de día de ${m.nombre}`}
                          >
                            <Repeat className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={`Tareas de ${m.nombre}`}
                            onClick={() => openTareasPara(m)}
                            aria-label={`Tareas de ${m.nombre}`}
                          >
                            <ListTodo className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={`Dejar feedback a ${m.nombre}`}
                            onClick={() => openFeedbackPara(m)}
                            aria-label={`Feedback a ${m.nombre}`}
                          >
                            <HeartHandshake className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(m)}
                        aria-label={`Editar ${m.nombre}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {m.activo ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => void handleDesactivar(m)}
                          aria-label={`Desactivar ${m.nombre}`}
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => void handleReactivar(m)}
                        >
                          Reactivar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EquipoFeriadosPanel />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {mode === 'create' ? 'Agregar al equipo' : 'Editar perfil'}
            </DialogTitle>
            <DialogDescription>
              {mode === 'create'
                ? 'Elegí un usuario aprobado y completá sus datos laborales.'
                : 'Si corregís el saldo de vacaciones, la fecha base pasa a ser hoy.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {mode === 'create' ? (
              <div className="space-y-1.5">
                <Label>Usuario</Label>
                <Select
                  value={form.userId || undefined}
                  onValueChange={(v) => setForm((f) => ({ ...f, userId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Elegir…" />
                  </SelectTrigger>
                  <SelectContent>
                    {sinPerfil.map((u) => (
                      <SelectItem key={u.userId} value={u.userId}>
                        {u.nombre}
                        {u.email ? ` (${u.email})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {miembros.find((m) => m.userId === form.userId)?.nombre}
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="puesto">Puesto</Label>
              <Input
                id="puesto"
                value={form.puesto}
                onChange={(e) => setForm((f) => ({ ...f, puesto: e.target.value }))}
                placeholder="Ventas y logística"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Área principal</Label>
              <Select
                value={form.areaPrincipal || undefined}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, areaPrincipal: v as AreaPrincipalEquipo }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegir…" />
                </SelectTrigger>
                <SelectContent>
                  {AREA_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha de ingreso</Label>
                <div className="rounded-md border border-input px-3 py-2">
                  <DatePicker
                    date={form.fechaIngreso}
                    onDateChange={(d) => setForm((f) => ({ ...f, fechaIngreso: d }))}
                    placeholder="Elegir fecha"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Cumpleaños</Label>
                <div className="rounded-md border border-input px-3 py-2">
                  <DatePicker
                    date={form.fechaNacimiento}
                    onDateChange={(d) => setForm((f) => ({ ...f, fechaNacimiento: d }))}
                    placeholder="Día y mes"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {COLORES_EQUIPO.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onClick={() => pickColor(c)}
                    className={cn(
                      'h-7 w-7 rounded-full border-2 transition-transform hover:scale-110',
                      form.color.toLowerCase() === c.toLowerCase()
                        ? 'border-white scale-110'
                        : 'border-transparent',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              {colorAviso ? (
                <p className="text-[11px] text-amber-400">{colorAviso}</p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="sin-limite"
                checked={form.vacacionesSinLimite}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, vacacionesSinLimite: v === true }))
                }
              />
              <Label htmlFor="sin-limite" className="font-normal">
                Sin límite de vacaciones
              </Label>
            </div>

            {!form.vacacionesSinLimite ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="dias-anuales">Días anuales</Label>
                  <Input
                    id="dias-anuales"
                    type="number"
                    min={0}
                    max={60}
                    value={form.diasVacacionesAnuales}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        diasVacacionesAnuales: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="saldo-base">Saldo base (días)</Label>
                  <Input
                    id="saldo-base"
                    type="number"
                    step="0.5"
                    value={form.vacacionesSaldoBase}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        vacacionesSaldoBase: Number(e.target.value) || 0,
                        saldoBaseEditado: true,
                      }))
                    }
                  />
                  {mode === 'edit' && form.saldoBaseEditado ? (
                    <p className="text-[11px] text-muted-foreground">
                      Le quedan {form.vacacionesSaldoBase} días al día de hoy.
                    </p>
                  ) : mode === 'create' ? (
                    <p className="text-[11px] text-muted-foreground">
                      Fecha base: hoy ({todayArgentinaDateKey()}).
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Checkbox
                id="es-admin"
                checked={form.esAdmin}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, esAdmin: v === true }))
                }
              />
              <Label htmlFor="es-admin" className="font-normal">
                Administrador del equipo
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                'Guardar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {targetPerfil ? (
        <>
          <CargarVacacionesDialog
            open={vacOpen}
            onOpenChange={(v) => {
              setVacOpen(v);
              if (!v) setTargetPerfil(null);
            }}
            perfil={targetPerfil}
            miembros={miembros.filter((m) => m.activo)}
            ausencias={ausencias}
            feriadosKeys={feriadosKeys}
            saving={savingAusencia}
            onConfirm={handleVacacionesAdmin}
          />
          <CambioDiaDialog
            open={cambioOpen}
            onOpenChange={(v) => {
              setCambioOpen(v);
              if (!v) setTargetPerfil(null);
            }}
            perfil={targetPerfil}
            feriadosKeys={feriadosKeys}
            saving={savingAusencia}
            onConfirm={handleCambioAdmin}
          />
          <Dialog
            open={tareasOpen}
            onOpenChange={(v) => {
              setTareasOpen(v);
              if (!v) setTargetPerfil(null);
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Tareas de {targetPerfil.nombre}</DialogTitle>
                <DialogDescription>
                  Ves su lista y podés sumarle tareas. A la persona le llega un aviso.
                </DialogDescription>
              </DialogHeader>
              {user?.id ? (
                <TareasTab
                  userId={targetPerfil.userId}
                  personaNombre={targetPerfil.nombre}
                  viewerUserId={user.id}
                  esAdmin
                  nombresPorUserId={nombresPorUserId}
                  modoAdmin
                  onTareaAsignada={handleTareaAsignada}
                />
              ) : null}
            </DialogContent>
          </Dialog>
          <EquipoFeedbackDialog
            open={feedbackOpen}
            onOpenChange={(v) => {
              setFeedbackOpen(v);
              if (!v) setTargetPerfil(null);
            }}
            perfil={targetPerfil}
            autorNombre={
              (user?.id && nombresPorUserId[user.id]) || 'Julián'
            }
          />
        </>
      ) : null}
    </div>
  );
}
