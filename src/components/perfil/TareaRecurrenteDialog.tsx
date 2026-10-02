import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils/cn';
import { parseOrderDateLocal } from '@/lib/utils/format';
import { lunesDeSemana, type FrecuenciaTarea } from '@/lib/equipo/tareasRecurrentes';
import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate';
import type { TareaRecurrente } from '@/lib/supabase/services/equipoTareas.service';

const DIAS: { value: number; label: string }[] = [
  { value: 1, label: 'L' },
  { value: 2, label: 'M' },
  { value: 3, label: 'X' },
  { value: 4, label: 'J' },
  { value: 5, label: 'V' },
];

function dateToKey(d: Date | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type TareaRecurrenteFormValue = {
  titulo: string;
  descripcion: string | null;
  frecuencia: FrecuenciaTarea;
  diasSemana: number[] | null;
  diaMes: number | null;
  semanaInicio: string | null;
};

interface TareaRecurrenteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si edita; null = crear. */
  initial: TareaRecurrente | null;
  /** Nombre de la persona dueña (para el título cuando el admin suma). */
  personaNombre: string;
  saving?: boolean;
  onSave: (value: TareaRecurrenteFormValue) => void | Promise<void>;
}

export function TareaRecurrenteDialog({
  open,
  onOpenChange,
  initial,
  personaNombre,
  saving,
  onSave,
}: TareaRecurrenteDialogProps) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [frecuencia, setFrecuencia] = useState<FrecuenciaTarea>('semanal');
  const [diasSemana, setDiasSemana] = useState<number[]>([1]);
  const [diaMes, setDiaMes] = useState(1);
  const [semanaInicio, setSemanaInicio] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setTitulo(initial.titulo);
      setDescripcion(initial.descripcion ?? '');
      setFrecuencia(initial.frecuencia);
      setDiasSemana(initial.diasSemana?.length ? [...initial.diasSemana] : [1]);
      setDiaMes(initial.diaMes ?? 1);
      setSemanaInicio(
        initial.semanaInicio ? parseOrderDateLocal(initial.semanaInicio) : undefined,
      );
    } else {
      setTitulo('');
      setDescripcion('');
      setFrecuencia('semanal');
      setDiasSemana([1]);
      setDiaMes(1);
      const hoy = todayArgentinaDateKey();
      setSemanaInicio(parseOrderDateLocal(lunesDeSemana(hoy)));
    }
  }, [open, initial]);

  const toggleDia = (d: number) => {
    setDiasSemana((prev) => {
      if (prev.includes(d)) {
        const next = prev.filter((x) => x !== d);
        return next.length ? next : prev; // al menos uno
      }
      return [...prev, d].sort((a, b) => a - b);
    });
  };

  const error = useMemo(() => {
    if (!titulo.trim()) return 'Escribí un título';
    if (
      (frecuencia === 'semanal' || frecuencia === 'quincenal') &&
      diasSemana.length === 0
    ) {
      return 'Elegí al menos un día';
    }
    if (frecuencia === 'mensual' && (diaMes < 1 || diaMes > 31)) {
      return 'Día del mes entre 1 y 31';
    }
    if (frecuencia === 'quincenal' && !dateToKey(semanaInicio)) {
      return 'Elegí la semana de inicio (un lunes)';
    }
    return null;
  }, [titulo, frecuencia, diasSemana, diaMes, semanaInicio]);

  const handleSave = async () => {
    if (error) return;
    let semanaKey = dateToKey(semanaInicio);
    if (frecuencia === 'quincenal' && semanaKey) {
      semanaKey = lunesDeSemana(semanaKey);
    }
    await onSave({
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      frecuencia,
      diasSemana:
        frecuencia === 'semanal' || frecuencia === 'quincenal' ? diasSemana : null,
      diaMes: frecuencia === 'mensual' ? diaMes : null,
      semanaInicio: frecuencia === 'quincenal' ? semanaKey : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar tarea' : 'Nueva tarea'}</DialogTitle>
          <DialogDescription>
            {initial
              ? `Tarea de ${personaNombre}.`
              : `Definí qué tiene que hacer ${personaNombre} y con qué frecuencia.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="tarea-titulo">Título</Label>
            <Input
              id="tarea-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Limpiar CNC"
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tarea-desc">Descripción (opcional)</Label>
            <Textarea
              id="tarea-desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalle si hace falta"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Frecuencia</Label>
            <Select
              value={frecuencia}
              onValueChange={(v) => setFrecuencia(v as FrecuenciaTarea)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="diaria">Diaria (lun–vie)</SelectItem>
                <SelectItem value="semanal">Semanal</SelectItem>
                <SelectItem value="quincenal">Cada 15 días</SelectItem>
                <SelectItem value="mensual">Mensual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {frecuencia === 'semanal' || frecuencia === 'quincenal' ? (
            <div className="space-y-1.5">
              <Label>Días</Label>
              <div className="flex gap-1.5">
                {DIAS.map((d) => {
                  const on = diasSemana.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDia(d.value)}
                      className={cn(
                        'h-9 w-9 rounded-md border text-xs font-medium transition-colors',
                        on
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-white/15 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06]',
                      )}
                      aria-pressed={on}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {frecuencia === 'quincenal' ? (
            <div className="space-y-1.5">
              <Label>Semana de inicio (lunes de referencia)</Label>
              <div className="rounded-md border border-input px-3 py-2">
                <DatePicker
                  date={semanaInicio}
                  onDateChange={setSemanaInicio}
                  placeholder="Elegir lunes"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Si elegís otro día, se usa el lunes de esa semana.
              </p>
            </div>
          ) : null}

          {frecuencia === 'mensual' ? (
            <div className="space-y-1.5">
              <Label htmlFor="tarea-dia-mes">Día del mes</Label>
              <Input
                id="tarea-dia-mes"
                type="number"
                min={1}
                max={31}
                value={diaMes}
                onChange={(e) => setDiaMes(Number(e.target.value) || 1)}
              />
              <p className="text-[11px] text-muted-foreground">
                Si cae en fin de semana o feriado, pasa al día hábil siguiente.
              </p>
            </div>
          ) : null}

          {error ? <p className="text-[11px] text-amber-400">{error}</p> : null}
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
          <Button type="button" onClick={() => void handleSave()} disabled={saving || !!error}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : initial ? (
              'Guardar'
            ) : (
              'Crear'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
