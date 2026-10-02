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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { parseOrderDateLocal } from '@/lib/utils/format';
import { contarDiasHabiles } from '@/lib/equipo/diasHabiles';
import { previewCargaVacaciones } from '@/lib/equipo/vacaciones';
import { solapamientosVacaciones } from '@/lib/equipo/calendarioEquipo';
import type { AusenciaEquipo } from '@/lib/supabase/services/equipoCalendario.service';
import type { PerfilEquipo } from '@/lib/supabase/services/equipo.service';
import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate';

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

interface CargarVacacionesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  perfil: PerfilEquipo;
  miembros: PerfilEquipo[];
  ausencias: AusenciaEquipo[];
  feriadosKeys: string[];
  hoy?: string;
  saving?: boolean;
  /** Si viene, es edición (excluye esta ausencia del preview). */
  initial?: {
    id: string;
    fechaDesde: string;
    fechaHasta: string;
    nota: string | null;
  } | null;
  onConfirm: (input: {
    fechaDesde: string;
    fechaHasta: string;
    nota: string | null;
  }) => Promise<void>;
}

export function CargarVacacionesDialog({
  open,
  onOpenChange,
  perfil,
  miembros,
  ausencias,
  feriadosKeys,
  hoy = todayArgentinaDateKey(),
  saving,
  initial = null,
  onConfirm,
}: CargarVacacionesDialogProps) {
  const [desde, setDesde] = useState<Date | undefined>();
  const [hasta, setHasta] = useState<Date | undefined>();
  const [nota, setNota] = useState('');

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDesde(keyToDate(initial.fechaDesde));
      setHasta(keyToDate(initial.fechaHasta));
      setNota(initial.nota ?? '');
    } else {
      setDesde(undefined);
      setHasta(undefined);
      setNota('');
    }
  }, [open, initial]);

  const desdeKey = dateToKey(desde);
  const hastaKey = dateToKey(hasta);

  const ausenciasParaPreview = useMemo(
    () =>
      ausencias.filter(
        (a) => a.userId === perfil.userId && (!initial || a.id !== initial.id),
      ),
    [ausencias, perfil.userId, initial],
  );

  const preview = useMemo(() => {
    if (!desdeKey || !hastaKey || hastaKey < desdeKey) return null;
    if (perfil.vacacionesSinLimite) {
      return {
        diasHabiles: contarDiasHabiles(desdeKey, hastaKey, feriadosKeys),
        teQuedarian: null as number | null,
      };
    }
    const p = previewCargaVacaciones(
      {
        saldoBase: perfil.vacacionesSaldoBase,
        saldoBaseFecha: perfil.vacacionesSaldoBaseFecha,
        diasAnuales: perfil.diasVacacionesAnuales,
        ausencias: ausenciasParaPreview.map((a) => ({
          tipo: a.tipo,
          fechaDesde: a.fechaDesde,
          fechaHasta: a.fechaHasta,
          fechaRecupero: a.fechaRecupero,
        })),
        feriados: feriadosKeys,
        hoy,
      },
      desdeKey,
      hastaKey,
    );
    return { diasHabiles: p.diasHabiles, teQuedarian: p.teQuedarian };
  }, [desdeKey, hastaKey, perfil, ausenciasParaPreview, feriadosKeys, hoy]);

  const solapes = useMemo(() => {
    if (!desdeKey || !hastaKey || hastaKey < desdeKey) return [];
    return solapamientosVacaciones({
      fechaDesde: desdeKey,
      fechaHasta: hastaKey,
      excluirUserId: perfil.userId,
      personas: miembros.map((m) => ({
        userId: m.userId,
        nombre: m.nombre,
        color: m.color,
        fechaNacimiento: m.fechaNacimiento,
      })),
      ausencias: ausencias
        .filter((a) => !initial || a.id !== initial.id)
        .map((a) => ({
          id: a.id,
          userId: a.userId,
          tipo: a.tipo,
          fechaDesde: a.fechaDesde,
          fechaHasta: a.fechaHasta,
          fechaRecupero: a.fechaRecupero,
        })),
    });
  }, [desdeKey, hastaKey, perfil.userId, miembros, ausencias, initial]);

  const handleOpen = (v: boolean) => {
    onOpenChange(v);
  };

  const handleSave = async () => {
    if (!desdeKey || !hastaKey || hastaKey < desdeKey) return;
    await onConfirm({
      fechaDesde: desdeKey,
      fechaHasta: hastaKey,
      nota: nota.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar vacaciones' : 'Cargar vacaciones'}</DialogTitle>
          <DialogDescription>
            {perfil.nombre}: elegí el rango. Se cargan directo, sin aprobación.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Desde</Label>
              <div className="rounded-md border border-input px-3 py-2">
                <DatePicker date={desde} onDateChange={setDesde} placeholder="Desde" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Hasta</Label>
              <div className="rounded-md border border-input px-3 py-2">
                <DatePicker date={hasta} onDateChange={setHasta} placeholder="Hasta" />
              </div>
            </div>
          </div>

          {preview ? (
            <p className="text-xs text-muted-foreground">
              Son {preview.diasHabiles} día{preview.diasHabiles === 1 ? '' : 's'} hábil
              {preview.diasHabiles === 1 ? '' : 'es'}
              {preview.teQuedarian != null ? (
                <>
                  {' '}
                  · Te quedarían{' '}
                  <span
                    className={
                      preview.teQuedarian < 0 ? 'font-medium text-amber-400' : 'text-white'
                    }
                  >
                    {preview.teQuedarian}
                  </span>
                </>
              ) : null}
            </p>
          ) : null}

          {preview && preview.teQuedarian != null && preview.teQuedarian < 0 ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Te quedarían {preview.teQuedarian} días. Podés cargarlo igual.
            </p>
          ) : null}

          {solapes.length > 0 ? (
            <p className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">
              {solapes
                .map((s) => {
                  const d0 = `${s.fechaDesde.slice(8, 10)}/${s.fechaDesde.slice(5, 7)}`;
                  const d1 = `${s.fechaHasta.slice(8, 10)}/${s.fechaHasta.slice(5, 7)}`;
                  return `${s.nombre} también está de vacaciones del ${d0} al ${d1}`;
                })
                .join('. ')}
              .
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="vac-nota">Nota (opcional)</Label>
            <Input
              id="vac-nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Sin motivo obligatorio"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => handleOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !desdeKey || !hastaKey || hastaKey < (desdeKey ?? '')}
          >
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
