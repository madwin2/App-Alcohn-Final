import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils/cn';
import {
  DEPTH_LIMIT_MM, MecanizadoPersonalizado, MECANIZADO_DEFAULT, parseDepthInput, ROSCA_OPTIONS, Rosca,
} from '@/lib/pedidos/mecanizadoPersonalizado';

interface Props {
  open: boolean;
  /** Valores actuales; sin valores arranca como Clásico. */
  value?: MecanizadoPersonalizado;
  designName?: string;
  onCancel: () => void;
  onSave: (value: MecanizadoPersonalizado) => void | Promise<void>;
}

const toText = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));

export function MecanizadoPersonalizadoDialog({ open, value, designName, onCancel, onSave }: Props) {
  const [rosca, setRosca] = useState<Rosca>(MECANIZADO_DEFAULT.rosca);
  const [exterior, setExterior] = useState('');
  const [grabado, setGrabado] = useState('');
  const [perfilado, setPerfilado] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const v = value ?? MECANIZADO_DEFAULT;
    setRosca(v.rosca);
    setExterior(toText(v.exteriorDepthMm));
    setGrabado(toText(v.grabadoDepthMm));
    setPerfilado(v.perfiladoRecto1mm);
    setSaving(false);
  }, [open, value]);

  const exteriorMm = parseDepthInput(exterior);
  const grabadoMm = parseDepthInput(grabado);
  const exteriorError = exteriorMm === 'invalid';
  const grabadoError = grabadoMm === 'invalid' || grabadoMm === null;
  const canSave = !exteriorError && !grabadoError && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        rosca,
        exteriorDepthMm: exteriorMm as number | null,
        grabadoDepthMm: grabadoMm as number,
        perfiladoRecto1mm: perfilado,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mecanizado personalizado</DialogTitle>
          <DialogDescription>
            {designName ? <>{designName}. </> : null}
            Arranca con los valores de Clásico. Programas usa esta configuración para este sello.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="space-y-2">
            <Label>Rosca</Label>
            <div className="grid grid-cols-4 gap-1 rounded-lg border p-1" role="radiogroup" aria-label="Rosca">
              {ROSCA_OPTIONS.map((o) => (
                <button key={o.value} type="button" role="radio" aria-checked={rosca === o.value}
                  onClick={() => setRosca(o.value)}
                  className={cn('rounded-md py-1.5 text-sm transition-colors',
                    rosca === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mec-exterior">Exterior · fresa de 6</Label>
              <div className="relative">
                <Input id="mec-exterior" inputMode="decimal" placeholder="Como Clásico" value={exterior}
                  onChange={(e) => setExterior(e.target.value)} aria-invalid={exteriorError} className="pr-10" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">mm</span>
              </div>
              <p className={cn('text-[11px]', exteriorError ? 'text-destructive' : 'text-muted-foreground')}>
                {exteriorError ? `Entre 0 y ${DEPTH_LIMIT_MM} mm.` : 'Vacío: igual que Clásico.'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mec-grabado">Grabado · cónicas 1 y 0,6</Label>
              <div className="relative">
                <Input id="mec-grabado" inputMode="decimal" value={grabado}
                  onChange={(e) => setGrabado(e.target.value)} aria-invalid={grabadoError} className="pr-10" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">mm</span>
              </div>
              <p className={cn('text-[11px]', grabadoError ? 'text-destructive' : 'text-muted-foreground')}>
                {grabadoError ? `Obligatorio, entre 0 y ${DEPTH_LIMIT_MM} mm.` : 'Una sola profundidad para las dos fresas.'}
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={perfilado} onCheckedChange={(c) => setPerfilado(c === true)} />
            Perfilado recto con fresa de 1 mm
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
            <Button type="submit" disabled={!canSave}>{saving ? 'Guardando…' : 'Guardar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
