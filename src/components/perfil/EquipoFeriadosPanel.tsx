import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { useToast } from '@/components/ui/use-toast';
import { argentinaDateParts } from '@/lib/utils/argentinaDate';
import { Aviso, BotonIcono, CAMPO, Panel, PanelTitle } from '@/components/perfil/perfilUi';
import {
  borrarFeriado,
  crearFeriadoEmpresa,
  getFeriados,
  hayFeriadosNacionales,
  importarFeriadosNacionales,
  type Feriado,
} from '@/lib/supabase/services/equipoCalendario.service';

function dateToKey(d: Date | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface EquipoFeriadosPanelProps {
  /** Se importaron feriados nuevos (cambia el saldo de vacaciones y el aviso de faltantes). */
  onImported?: () => void;
}

export function EquipoFeriadosPanel({ onImported }: EquipoFeriadosPanelProps = {}) {
  const { toast } = useToast();
  const { year } = argentinaDateParts();
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [sugerirActual, setSugerirActual] = useState(false);
  const [sugerirSiguiente, setSugerirSiguiente] = useState(false);
  const [fechaEmpresa, setFechaEmpresa] = useState<Date | undefined>();
  const [nombreEmpresa, setNombreEmpresa] = useState('');
  const [savingEmpresa, setSavingEmpresa] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, hayAct, haySig] = await Promise.all([
        getFeriados({ desde: `${year}-01-01`, hasta: `${year + 1}-12-31` }),
        hayFeriadosNacionales(year),
        hayFeriadosNacionales(year + 1),
      ]);
      setFeriados(f);
      setSugerirActual(!hayAct);
      setSugerirSiguiente(!haySig);
    } catch (err) {
      toast({
        title: 'No se pudieron cargar los feriados',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [year, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleImport = async (anio: number) => {
    setImporting(true);
    try {
      const { agregados, totalApi } = await importarFeriadosNacionales(anio);
      if (totalApi === 0) {
        toast({
          title: `La fuente todavía no publicó feriados de ${anio}`,
        });
        return;
      }
      toast({
        title: `Feriados ${anio}`,
        description:
          agregados === 0
            ? `Ya estaban cargados (${totalApi} en la fuente).`
            : `Se agregaron ${agregados} de ${totalApi}.`,
      });
      await load();
      if (agregados > 0) onImported?.();
    } catch (err) {
      toast({
        title: 'No se pudo importar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  const handleEmpresa = async () => {
    const fecha = dateToKey(fechaEmpresa);
    if (!fecha || !nombreEmpresa.trim()) {
      toast({ title: 'Completá fecha y nombre', variant: 'destructive' });
      return;
    }
    setSavingEmpresa(true);
    try {
      await crearFeriadoEmpresa({ fecha, nombre: nombreEmpresa.trim() });
      toast({ title: 'Día de la empresa agregado' });
      setFechaEmpresa(undefined);
      setNombreEmpresa('');
      await load();
    } catch (err) {
      toast({
        title: 'No se pudo agregar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setSavingEmpresa(false);
    }
  };

  const handleBorrar = async (f: Feriado) => {
    if (!window.confirm(`¿Borrar «${f.nombre}» (${f.fecha})?`)) return;
    try {
      await borrarFeriado(f.id);
      toast({ title: 'Feriado borrado' });
      await load();
    } catch (err) {
      toast({
        title: 'No se pudo borrar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  const empresa = feriados.filter((f) => f.origen === 'empresa');
  const nacionalesCount = feriados.filter((f) => f.origen === 'nacional').length;

  return (
    <Panel className="space-y-5">
      <PanelTitle
        title="Feriados"
        sub="Nacionales importados y días propios de la empresa. No cuentan como días hábiles (vacaciones, metas y Economía)."
        right={
          <div className="flex flex-wrap justify-end gap-1.5">
            {[year, year + 1].map((y) => (
              <Button
                key={y}
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-full bg-white/[0.06] px-3 text-xs hover:bg-white/[0.1]"
                disabled={importing}
                onClick={() => void handleImport(y)}
              >
                {importing && y === year ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Importar {y}
              </Button>
            ))}
          </div>
        }
      />

      {sugerirActual || sugerirSiguiente ? (
        <Aviso>
          Faltan feriados nacionales de{' '}
          {[sugerirActual ? String(year) : null, sugerirSiguiente ? String(year + 1) : null]
            .filter(Boolean)
            .join(' y ')}
          . Importalos con los botones de arriba.
        </Aviso>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[13px] text-muted-foreground">Nacionales</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">{nacionalesCount}</p>
            <p className="text-xs text-muted-foreground">{year}–{year + 1}</p>
          </div>
          <div>
            <p className="text-[13px] text-muted-foreground">De la empresa</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">{empresa.length}</p>
            <p className="text-xs text-muted-foreground">{year}–{year + 1}</p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label>Día de la empresa</Label>
          <div className={CAMPO}>
            <DatePicker
              date={fechaEmpresa}
              onDateChange={setFechaEmpresa}
              placeholder="Fecha"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="feriado-empresa-nombre">Nombre</Label>
          <Input
            id="feriado-empresa-nombre"
            value={nombreEmpresa}
            onChange={(e) => setNombreEmpresa(e.target.value)}
            placeholder="Cierre fin de año"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-10 gap-1 rounded-full bg-white/[0.08] px-4 hover:bg-white/[0.14]"
          disabled={savingEmpresa}
          onClick={() => void handleEmpresa()}
        >
          {savingEmpresa ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Agregar
        </Button>
      </div>

      {empresa.length > 0 ? (
        <ul className="space-y-1.5">
          {empresa.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 rounded-2xl bg-white/[0.03] px-4 py-2 text-sm">
              <span>
                {f.nombre}
                <span className="text-muted-foreground"> · {f.fecha.split('-').reverse().join('/')}</span>
              </span>
              <BotonIcono label="Borrar feriado" peligro onClick={() => void handleBorrar(f)}>
                <Trash2 />
              </BotonIcono>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
