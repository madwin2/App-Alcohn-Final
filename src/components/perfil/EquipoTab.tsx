import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CalendarRange, HeartHandshake, ListTodo, Loader2, Pencil, Plus, Repeat, UserMinus } from 'lucide-react';
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
import { getUserInitials, getUserProfileImage } from '@/lib/utils/userImages';
import { Aviso, BotonIcono, CAMPO, DIALOGO, Estado, Panel, PanelTitle, Vacio } from '@/components/perfil/perfilUi';
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
  getDatosSaldoVacaciones,
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
import { AusenciasPersonaDialog } from '@/components/perfil/AusenciasPersonaDialog';
import { FALLBACK_NOMBRE_ADMIN, nombreAdminEquipo } from '@/lib/equipo/admin';
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
  /** Fecha a la que corresponde el saldo base (EQ-R20). */
  saldoBaseFecha: Date | undefined;
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
  saldoBaseFecha: undefined,
  vacacionesSinLimite: false,
  esAdmin: false,
  saldoBaseEditado: false,
});

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 2026-03-01 → 1 mar 2026 */
function fmtFechaCorta(key: string): string {
  const [y, m, d] = key.split('-');
  return `${Number(d)} ${MESES_CORTOS[Number(m) - 1] ?? m} ${y}`;
}

function dateToKey(d: Date | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface EquipoTabProps {
  onChanged?: () => void;
  /** Se importaron feriados: el encabezado recalcula saldo y aviso de faltantes. */
  onFeriadosChanged?: () => void;
}

export function EquipoTab({ onChanged, onFeriadosChanged }: EquipoTabProps) {
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
  const [ausenciasOpen, setAusenciasOpen] = useState(false);
  const [savingAusencia, setSavingAusencia] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [m, s] = await Promise.all([
        getMiembrosEquipo({ incluirInactivos: true }),
        getUsuariosSinPerfil(),
      ]);
      setMiembros(m);
      setSinPerfil(s);
      const { ausencias: a, feriados: f } = await getDatosSaldoVacaciones(
        m.map((x) => x.userId),
      );
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

  // Nombre del/los admin(s) para textos ("pedíselo a …"); fallback "el admin" (EQ-R27).
  const adminNombre = useMemo(() => nombreAdminEquipo(miembros), [miembros]);

  const openVacacionesPara = (p: PerfilEquipo) => {
    setTargetPerfil(p);
    setCambioOpen(false);
    setTareasOpen(false);
    setFeedbackOpen(false);
    setAusenciasOpen(false);
    setVacOpen(true);
  };
  const openCambioPara = (p: PerfilEquipo) => {
    setTargetPerfil(p);
    setVacOpen(false);
    setTareasOpen(false);
    setFeedbackOpen(false);
    setAusenciasOpen(false);
    setCambioOpen(true);
  };
  const openTareasPara = (p: PerfilEquipo) => {
    setTargetPerfil(p);
    setVacOpen(false);
    setCambioOpen(false);
    setFeedbackOpen(false);
    setAusenciasOpen(false);
    setTareasOpen(true);
  };
  const openFeedbackPara = (p: PerfilEquipo) => {
    setTargetPerfil(p);
    setVacOpen(false);
    setCambioOpen(false);
    setTareasOpen(false);
    setAusenciasOpen(false);
    setFeedbackOpen(true);
  };
  const openAusenciasPara = (p: PerfilEquipo) => {
    setTargetPerfil(p);
    setVacOpen(false);
    setCambioOpen(false);
    setTareasOpen(false);
    setFeedbackOpen(false);
    setAusenciasOpen(true);
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
    const autorNombre =
      (autor?.nombre || '').split(/\s+/)[0] || adminNombre || FALLBACK_NOMBRE_ADMIN;
    notifyTareaRecurrenteAsignada({
      autorNombre,
      titulo: tarea.titulo,
      frecuenciaTexto: describirFrecuencia({
        frecuencia: tarea.frecuencia,
        diasSemana: tarea.diasSemana as (1 | 2 | 3 | 4 | 5)[] | null,
        diaMes: tarea.diaMes,
        semanaInicio: tarea.semanaInicio,
        fecha: tarea.fecha,
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

  const openCreate = (userId?: string) => {
    const usados = miembros.filter((m) => m.activo).map((m) => m.color);
    const primerLibre = COLORES_EQUIPO.find((c) => !colorYaUsado(c, usados));
    setMode('create');
    setForm({
      ...emptyForm(),
      userId: userId ?? '',
      color: primerLibre ?? COLORES_EQUIPO[0],
      saldoBaseFecha: parseOrderDateLocal(todayArgentinaDateKey()),
      saldoBaseEditado: true,
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
      saldoBaseFecha: p.vacacionesSaldoBaseFecha
        ? parseOrderDateLocal(p.vacacionesSaldoBaseFecha)
        : undefined,
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
    if (mode === 'edit' && form.userId === user?.id && !form.esAdmin) {
      toast({
        title: 'No podés quitarte el rol a vos mismo',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const hoy = todayArgentinaDateKey();
      const saldoFecha =
        mode === 'create' || form.saldoBaseEditado
          ? dateToKey(form.saldoBaseFecha) || hoy
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
        // No mandar `activo` acá: editar no debe reactivar (EQ-R11).
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
    if (p.userId === user?.id) {
      toast({
        title: 'No podés desactivarte a vos mismo',
        variant: 'destructive',
      });
      return;
    }
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

  const activos = miembros.filter((m) => m.activo);
  const inactivos = miembros.filter((m) => !m.activo);

  const tarjeta = (m: PerfilEquipo) => {
    const foto = getUserProfileImage(m.nombre);
    const s = saldosPorUser.get(m.userId);
    const vacaciones = m.vacacionesSinLimite
      ? 'Sin límite'
      : s
        ? `${s.disponiblesHoy} ${s.disponiblesHoy === 1 ? 'día' : 'días'}${s.planificados > 0 ? ` · ${s.planificados} planif.` : ''}`
        : '—';
    return (
      <li key={m.userId} className={cn('flex flex-col rounded-3xl bg-white/[0.035] p-5', !m.activo && 'opacity-60')}>
        <div className="flex items-start gap-3">
          <div className="relative size-12 shrink-0">
            <div className="size-full overflow-hidden rounded-2xl bg-white/[0.05]">
              {foto ? (
                <img src={foto} alt={m.nombre} className="size-full object-cover" draggable={false} />
              ) : (
                <div className="flex size-full items-center justify-center text-sm font-semibold text-foreground/80">
                  {getUserInitials(m.nombre)}
                </div>
              )}
            </div>
            <span
              className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-[3px] ring-[#141416]"
              style={{ backgroundColor: m.color }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium">{m.nombre}</p>
            <p className="truncate text-[13px] text-muted-foreground">
              {[m.puesto, m.areaPrincipal ? AREA_LABEL[m.areaPrincipal] : null].filter(Boolean).join(' · ') ||
                'Sin puesto'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {m.esAdmin ? <span className="text-xs text-muted-foreground">Admin</span> : null}
            {!m.activo ? <Estado tono="neutro" className="text-xs text-muted-foreground">Desactivado</Estado> : null}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Ingreso</dt>
            <dd className="mt-0.5 truncate">{m.fechaIngreso ? fmtFechaCorta(m.fechaIngreso) : '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Cumpleaños</dt>
            <dd className="mt-0.5 truncate">
              {m.fechaNacimiento ? formatearCumpleaniosSinAnio(m.fechaNacimiento) : '—'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Vacaciones</dt>
            <dd className="mt-0.5 truncate" title={m.vacacionesSinLimite ? undefined : `${m.diasVacacionesAnuales} días por año · saldo base ${m.vacacionesSaldoBase} al ${m.vacacionesSaldoBaseFecha}`}>
              {vacaciones}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-0.5 border-t border-white/[0.06] pt-3">
          {m.activo ? (
            <>
              <BotonIcono label="Cargar vacaciones" onClick={() => openVacacionesPara(m)}>
                <CalendarDays />
              </BotonIcono>
              <BotonIcono label="Cambiar un día" onClick={() => openCambioPara(m)}>
                <Repeat />
              </BotonIcono>
              <BotonIcono label={`Tareas de ${m.nombre}`} onClick={() => openTareasPara(m)}>
                <ListTodo />
              </BotonIcono>
              <BotonIcono label={`Feedback y objetivos de ${m.nombre}`} onClick={() => openFeedbackPara(m)}>
                <HeartHandshake />
              </BotonIcono>
            </>
          ) : null}
          <BotonIcono label="Ver ausencias (corregir)" onClick={() => openAusenciasPara(m)}>
            <CalendarRange />
          </BotonIcono>
          <span className="flex-1" />
          <BotonIcono label={`Editar ${m.nombre}`} onClick={() => openEdit(m)}>
            <Pencil />
          </BotonIcono>
          {m.activo ? (
            <BotonIcono
              label={m.userId === user?.id ? 'No podés desactivarte a vos mismo' : `Desactivar ${m.nombre}`}
              peligro
              disabled={m.userId === user?.id}
              onClick={() => void handleDesactivar(m)}
            >
              <UserMinus />
            </BotonIcono>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3 text-xs"
              onClick={() => void handleReactivar(m)}
            >
              Reactivar
            </Button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Perfiles del equipo, feriados y pedidos. Esta pestaña la ven solo los administradores del equipo.
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => openCreate()}
          disabled={sinPerfil.length === 0}
          className="h-9 gap-1.5 rounded-full bg-white/[0.06] px-4 hover:bg-white/[0.1]"
        >
          <Plus className="h-4 w-4" />
          Agregar al equipo
        </Button>
      </div>

      {sinPerfil.length > 0 ? (
        <Panel>
          <PanelTitle
            title="Usuarios de la app sin perfil de equipo"
            sub="Están aprobados para usar la app, pero todavía no tienen perfil laboral. Hasta que lo tengan no ven Mi perfil, el calendario ni el corcho, y no aparecen en el equipo."
          />
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {sinPerfil.map((u) => (
              <li key={u.userId} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{u.nombre}</p>
                  {u.email ? <p className="truncate text-xs text-muted-foreground">{u.email}</p> : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 shrink-0 gap-1 rounded-full bg-white/[0.06] px-3 text-xs hover:bg-white/[0.1]"
                  onClick={() => openCreate(u.userId)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Sumar
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {miembros.length === 0 ? (
        <Vacio>Todavía no hay perfiles. Agregá al primer integrante.</Vacio>
      ) : (
        <div>
          <p className="mb-3 text-[13px] text-muted-foreground">
            Integrantes · {activos.length}
          </p>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {activos.map(tarjeta)}
          </ul>
          {inactivos.length > 0 ? (
            <>
              <p className="mb-3 mt-6 text-[13px] text-muted-foreground">
                Desactivados · {inactivos.length}
              </p>
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {inactivos.map(tarjeta)}
              </ul>
            </>
          ) : null}
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <EquipoNecesidadesBandeja nombresPorUserId={nombresPorUserId} />
        <EquipoFeriadosPanel
          onImported={() => {
            // El saldo cambia al sumar feriados: recalcular sin parpadeo y avisar al encabezado.
            void load({ silent: true });
            onFeriadosChanged?.();
          }}
        />
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={cn(DIALOGO, 'max-h-[90vh] overflow-y-auto sm:max-w-lg')}>
          <DialogHeader>
            <DialogTitle>
              {mode === 'create' ? 'Agregar al equipo' : 'Editar perfil'}
            </DialogTitle>
            <DialogDescription>
              {mode === 'create'
                ? 'Elegí un usuario aprobado y completá sus datos laborales.'
                : 'Podés corregir el saldo y elegir la fecha a la que corresponde.'}
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
              <p className="text-lg font-semibold tracking-tight">
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
                <div className={CAMPO}>
                  <DatePicker
                    date={form.fechaIngreso}
                    onDateChange={(d) => setForm((f) => ({ ...f, fechaIngreso: d }))}
                    placeholder="Elegir fecha"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Cumpleaños</Label>
                <div className={CAMPO}>
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
                      'size-7 rounded-full ring-offset-2 ring-offset-[#111113] transition-transform hover:scale-110',
                      form.color.toLowerCase() === c.toLowerCase()
                        ? 'scale-110 ring-2 ring-white'
                        : '',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              {colorAviso ? (
                <Aviso>{colorAviso}</Aviso>
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
                        saldoBaseFecha:
                          f.saldoBaseFecha ?? parseOrderDateLocal(todayArgentinaDateKey()),
                      }))
                    }
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Fecha del saldo base</Label>
                  <div className={CAMPO}>
                    <DatePicker
                      date={form.saldoBaseFecha}
                      onDateChange={(d) =>
                        setForm((f) => ({
                          ...f,
                          saldoBaseFecha: d,
                          saldoBaseEditado: true,
                        }))
                      }
                      placeholder="Fecha base"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Días disponibles a esa fecha, sin contar las vacaciones futuras ya
                    cargadas (esas se restan solas). Hoy tiene{' '}
                    {saldosPorUser.get(form.userId)?.planificados ?? 0} días planificados.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Checkbox
                id="es-admin"
                checked={form.esAdmin}
                disabled={mode === 'edit' && form.userId === user?.id}
                title={
                  mode === 'edit' && form.userId === user?.id
                    ? 'No podés quitarte el rol a vos mismo'
                    : undefined
                }
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, esAdmin: v === true }))
                }
              />
              <Label htmlFor="es-admin" className="font-normal">
                Administrador del equipo
                {mode === 'edit' && form.userId === user?.id ? (
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    (no podés quitarte el rol a vos mismo)
                  </span>
                ) : null}
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
            saving={savingAusencia}
            esAdmin
            onConfirm={handleVacacionesAdmin}
          />
          <CambioDiaDialog
            open={cambioOpen}
            onOpenChange={(v) => {
              setCambioOpen(v);
              if (!v) setTargetPerfil(null);
            }}
            perfil={targetPerfil}
            saving={savingAusencia}
            esAdmin
            onConfirm={handleCambioAdmin}
          />
          <Dialog
            open={tareasOpen}
            onOpenChange={(v) => {
              setTareasOpen(v);
              if (!v) setTargetPerfil(null);
            }}
          >
            <DialogContent className={cn(DIALOGO, 'max-h-[90vh] overflow-y-auto sm:max-w-2xl')}>
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
              (user?.id && nombresPorUserId[user.id]) || adminNombre
            }
          />
          <AusenciasPersonaDialog
            open={ausenciasOpen}
            onOpenChange={(v) => {
              setAusenciasOpen(v);
              if (!v) setTargetPerfil(null);
            }}
            perfil={targetPerfil}
            miembros={miembros}
            adminNombre={adminNombre}
            onChanged={() => {
              void load({ silent: true });
              onChanged?.();
            }}
          />
        </>
      ) : null}
    </div>
  );
}
