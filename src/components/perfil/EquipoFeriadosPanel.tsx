import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { useToast } from '@/components/ui/use-toast';
import { argentinaDateParts } from '@/lib/utils/argentinaDate';
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

export function EquipoFeriadosPanel() {
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
      toast({
        title: `Feriados ${anio}`,
        description:
          agregados === 0
            ? `Ya estaban cargados (${totalApi} en la fuente).`
            : `Se agregaron ${agregados} de ${totalApi}.`,
      });
      await load();
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
    <div className="space-y-4 rounded-xl border border-white/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Feriados</h3>
          <p className="text-xs text-muted-foreground">
            Nacionales importados y días propios de la empresa. No cuentan como días hábiles de
            vacaciones.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={importing}
            onClick={() => void handleImport(year)}
          >
            {importing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Importar feriados {year}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={importing}
            onClick={() => void handleImport(year + 1)}
          >
            Importar {year + 1}
          </Button>
        </div>
      </div>

      {sugerirActual || sugerirSiguiente ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Faltan feriados nacionales de{' '}
          {[sugerirActual ? String(year) : null, sugerirSiguiente ? String(year + 1) : null]
            .filter(Boolean)
            .join(' y ')}
          . Importalos con los botones de arriba.
        </p>
      ) : null}

      {loading ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {nacionalesCount} nacionales · {empresa.length} de la empresa (en {year}–{year + 1})
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label>Día de la empresa</Label>
          <div className="rounded-md border border-input px-3 py-2">
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
          className="gap-1"
          disabled={savingEmpresa}
          onClick={() => void handleEmpresa()}
        >
          {savingEmpresa ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Agregar
        </Button>
      </div>

      {empresa.length > 0 ? (
        <ul className="divide-y divide-white/[0.06] rounded-lg border border-white/10">
          {empresa.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                <span className="text-white">{f.fecha}</span> · {f.nombre}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => void handleBorrar(f)}
                aria-label="Borrar feriado"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
