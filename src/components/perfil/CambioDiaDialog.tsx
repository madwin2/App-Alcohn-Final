import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Aviso, CAMPO, DIALOGO } from '@/components/perfil/perfilUi';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { parseOrderDateLocal } from '@/lib/utils/format';
import { esDiaHabilParaCambio } from '@/lib/equipo/calendarioEquipo';
import { avisosRecupero } from '@/lib/equipo/ausencias';
import {
  ausenciasPropiasSuperpuestas,
  fechaNoPermitidaParaNoAdmin,
} from '@/lib/equipo/ausenciasValidacion';
import {
  getAusencias,
  getFeriados,
  hayFeriadosNacionales,
  type AusenciaEquipo,
} from '@/lib/supabase/services/equipoCalendario.service';
import type { PerfilEquipo } from '@/lib/supabase/services/equipo.service';
import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate';

const DEBOUNCE_MS = 250;

function dateToKey(d: Date | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function keyToDate(key: string | null | undefined): Date | undefined {
  if (!key) return undefined;
  const d = parseOrderDateLocal(key);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Datos del día elegido (se buscan al elegirlo, no dependen del calendario en pantalla). */
type DatosDia = {
  fecha: string;
  esFeriado: boolean;
  propias: AusenciaEquipo[];
  anioSinFeriados: boolean;
};

interface CambioDiaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  perfil: PerfilEquipo;
  hoy?: string;
  saving?: boolean;
  /** Admin puede cargar/editar cualquier fecha; el resto solo a futuro (EQ-R05). */
  esAdmin?: boolean;
  /** Nombre a quien pedirle fechas de hoy o pasadas. */
  adminNombre?: string;
  initial?: {
    id: string;
    fecha: string;
    fechaRecupero: string | null;
    nota: string | null;
  } | null;
  /** Al crear: día de falta preseleccionado. */
  fechaInicial?: string;
  onConfirm: (input: {
    fecha: string;
    fechaRecupero: string | null;
    nota: string | null;
  }) => Promise<void>;
}

export function CambioDiaDialog({
  open,
  onOpenChange,
  perfil,
  hoy = todayArgentinaDateKey(),
  saving,
  esAdmin = false,
  adminNombre,
  initial = null,
  fechaInicial,
  onConfirm,
}: CambioDiaDialogProps) {
  const [fecha, setFecha] = useState<Date | undefined>();
  const [recupero, setRecupero] = useState<Date | undefined>();
  const [nota, setNota] = useState('');
  const [datos, setDatos] = useState<DatosDia | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [errorCarga, setErrorCarga] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setFecha(keyToDate(initial.fecha));
      setRecupero(keyToDate(initial.fechaRecupero));
      setNota(initial.nota ?? '');
    } else if (fechaInicial) {
      setFecha(keyToDate(fechaInicial));
      setRecupero(undefined);
      setNota('');
    } else {
      setFecha(undefined);
      setRecupero(undefined);
      setNota('');
    }
    setDatos(null);
    setErrorCarga(false);
  }, [open, initial, fechaInicial]);

  const fechaKey = dateToKey(fecha);
  const recuperoKey = dateToKey(recupero);
  const userId = perfil.userId;

  // Feriados y ausencias propias del día elegido (EQ-R08/R09/R10).
  useEffect(() => {
    if (!open || !fechaKey) {
      setDatos(null);
      setCalculando(false);
      setErrorCarga(false);
      return;
    }
    let cancelado = false;
    setCalculando(true);
    setErrorCarga(false);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const [feriados, propias, hayAnio] = await Promise.all([
            getFeriados({ desde: fechaKey, hasta: fechaKey }),
            getAusencias({ userId, desde: fechaKey, hasta: fechaKey }),
            hayFeriadosNacionales(Number(fechaKey.slice(0, 4))),
          ]);
          if (cancelado) return;
          setDatos({
            fecha: fechaKey,
            esFeriado: feriados.length > 0,
            propias,
            anioSinFeriados: !hayAnio,
          });
        } catch {
          if (cancelado) return;
          setDatos(null);
          setErrorCarga(true);
        } finally {
          if (!cancelado) setCalculando(false);
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [open, fechaKey, userId]);

  const datosVigentes = datos && datos.fecha === fechaKey && !calculando ? datos : null;

  // EQ-R19: avisos (sin bloquear) sobre el día de recupero.
  const [recuperoInfo, setRecuperoInfo] = useState<{
    fecha: string;
    esFeriado: boolean;
    enVacaciones: boolean;
  } | null>(null);

  useEffect(() => {
    if (!open || !recuperoKey) {
      setRecuperoInfo(null);
      return;
    }
    let cancelado = false;
    const timer = setTimeout(() => {
      void Promise.all([
        getFeriados({ desde: recuperoKey, hasta: recuperoKey }),
        getAusencias({ userId, desde: recuperoKey, hasta: recuperoKey }),
      ])
        .then(([feriados, propias]) => {
          if (cancelado) return;
          setRecuperoInfo({
            fecha: recuperoKey,
            esFeriado: feriados.length > 0,
            enVacaciones: propias.some(
              (a) =>
                a.tipo === 'vacaciones' &&
                a.fechaDesde <= recuperoKey &&
                recuperoKey <= a.fechaHasta,
            ),
          });
        })
        .catch(() => {
          if (!cancelado) setRecuperoInfo(null);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [open, recuperoKey, userId]);

  const avisosDelRecupero = useMemo(
    () =>
      avisosRecupero({
        fecha: fechaKey,
        recupero: recuperoKey,
        recuperoEsFeriado: recuperoInfo?.fecha === recuperoKey && recuperoInfo.esFeriado,
        recuperoEnVacaciones: recuperoInfo?.fecha === recuperoKey && recuperoInfo.enVacaciones,
      }),
    [fechaKey, recuperoKey, recuperoInfo],
  );

  const avisoFecha = useMemo(() => {
    if (!fechaKey) return null;
    const feriados = datosVigentes?.esFeriado ? [fechaKey] : [];
    if (!esDiaHabilParaCambio(fechaKey, feriados)) {
      return 'El día que falta tiene que ser lunes a viernes y no feriado.';
    }
    return null;
  }, [fechaKey, datosVigentes]);

  // EQ-R10: el día que se falta no puede caer en vacaciones propias.
  const enVacaciones = useMemo(() => {
    if (!datosVigentes || !fechaKey) return false;
    return (
      ausenciasPropiasSuperpuestas(
        fechaKey,
        fechaKey,
        datosVigentes.propias
          .filter((a) => a.tipo === 'vacaciones')
          .map((a) => ({
            id: a.id,
            tipo: a.tipo,
            fechaDesde: a.fechaDesde,
            fechaHasta: a.fechaHasta,
          })),
        initial?.id,
      ).length > 0
    );
  }, [datosVigentes, fechaKey, initial]);

  const pasadoNoPermitido =
    !esAdmin && !!fechaKey && fechaNoPermitidaParaNoAdmin(fechaKey, hoy);

  const errorBloqueante: string | null = pasadoNoPermitido
    ? `Para hoy o días que ya pasaron, pedíselo a ${adminNombre || 'el admin'}.`
    : enVacaciones
      ? 'Ese día ya hay vacaciones cargadas.'
      : errorCarga
        ? 'No se pudo verificar el día. Probá elegirlo de nuevo.'
        : null;

  // Solo el día que se falta tiene la regla de «a futuro»; el recupero puede ser cualquier fecha.
  const bloquearFechaPasada = (d: Date) => {
    if (esAdmin) return false;
    const k = dateToKey(d);
    return !!k && fechaNoPermitidaParaNoAdmin(k, hoy);
  };

  const puedeGuardar =
    !!fechaKey && !!datosVigentes && !calculando && !avisoFecha && !errorBloqueante && !saving;

  const handleSave = async () => {
    if (!fechaKey || !puedeGuardar) return;
    await onConfirm({
      fecha: fechaKey,
      fechaRecupero: recuperoKey,
      nota: nota.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(DIALOGO, 'sm:max-w-md')}>
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar cambio de día' : 'Cambiar un día'}</DialogTitle>
          <DialogDescription>
            {perfil.nombre}: el día que falta (lun–vie) y, si querés, cuándo lo recuperás. Sin
            motivo obligatorio.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Día que falta</Label>
            <div className={CAMPO}>
              <DatePicker
                date={fecha}
                onDateChange={setFecha}
                placeholder="Elegir día"
                isDateDisabled={bloquearFechaPasada}
              />
            </div>
            {calculando ? (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Revisando el día…
              </p>
            ) : null}
            {avisoFecha ? <Aviso>{avisoFecha}</Aviso> : null}
            {errorBloqueante ? (
              <Aviso tono="mal">{errorBloqueante}</Aviso>
            ) : null}
            {datosVigentes?.anioSinFeriados ? (
              <Aviso>
                Todavía no están cargados los feriados de {fechaKey?.slice(0, 4)}; el número puede
                cambiar.
              </Aviso>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Día de recupero (opcional)</Label>
            <div className={CAMPO}>
              <DatePicker
                date={recupero}
                onDateChange={setRecupero}
                placeholder="Sábado u otro día"
              />
            </div>
            {avisosDelRecupero.map((aviso) => (
              <Aviso key={aviso}>{aviso} Podés cargarlo igual.</Aviso>
            ))}
            <p className="text-xs text-muted-foreground">
              Si no lo recuperás, queda registrado y no descuenta vacaciones.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cambio-nota">Nota (opcional)</Label>
            <Input
              id="cambio-nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={!puedeGuardar}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : initial ? (
              'Guardar'
            ) : (
              'Cargar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
