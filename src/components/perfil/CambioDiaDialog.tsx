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
import { esDiaHabilParaCambio } from '@/lib/equipo/calendarioEquipo';
import type { PerfilEquipo } from '@/lib/supabase/services/equipo.service';

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

interface CambioDiaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  perfil: PerfilEquipo;
  feriadosKeys: string[];
  saving?: boolean;
  initial?: {
    id: string;
    fecha: string;
    fechaRecupero: string | null;
    nota: string | null;
  } | null;
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
  feriadosKeys,
  saving,
  initial = null,
  onConfirm,
}: CambioDiaDialogProps) {
  const [fecha, setFecha] = useState<Date | undefined>();
  const [recupero, setRecupero] = useState<Date | undefined>();
  const [nota, setNota] = useState('');

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setFecha(keyToDate(initial.fecha));
      setRecupero(keyToDate(initial.fechaRecupero));
      setNota(initial.nota ?? '');
    } else {
      setFecha(undefined);
      setRecupero(undefined);
      setNota('');
    }
  }, [open, initial]);

  const fechaKey = dateToKey(fecha);
  const recuperoKey = dateToKey(recupero);

  const avisoFecha = useMemo(() => {
    if (!fechaKey) return null;
    if (!esDiaHabilParaCambio(fechaKey, feriadosKeys)) {
      return 'El día que falta tiene que ser lunes a viernes y no feriado.';
    }
    return null;
  }, [fechaKey, feriadosKeys]);

  const handleSave = async () => {
    if (!fechaKey || avisoFecha) return;
    await onConfirm({
      fecha: fechaKey,
      fechaRecupero: recuperoKey,
      nota: nota.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
            <div className="rounded-md border border-input px-3 py-2">
              <DatePicker date={fecha} onDateChange={setFecha} placeholder="Elegir día" />
            </div>
            {avisoFecha ? <p className="text-[11px] text-amber-400">{avisoFecha}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label>Día de recupero (opcional)</Label>
            <div className="rounded-md border border-input px-3 py-2">
              <DatePicker
                date={recupero}
                onDateChange={setRecupero}
                placeholder="Sábado u otro día"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
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
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !fechaKey || !!avisoFecha}
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
