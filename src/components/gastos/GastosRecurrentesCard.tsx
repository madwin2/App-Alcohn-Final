import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Panel, formatArs, formatUsd } from '@/components/economia/controlGastosUi';
import { CATEGORIA_LABEL, GASTO_AUTO_CATEGORIAS, type GastoAutoCategoria, type GastoMoneda } from '@/lib/gastos/gastosAuto';
import { fetchGastosRecurrentes, upsertGastoRecurrente, type GastoRecurrente } from '@/lib/supabase/services/gastosAuto.service';
import { cn } from '@/lib/utils/cn';

type Draft = Omit<GastoRecurrente, 'id' | 'monto'> & { id?: string; monto: string };

const nuevoDraft = (): Draft => ({
  nombre: '',
  categoria: 'automatizaciones',
  moneda: 'USD',
  monto: '',
  ivaAplica: true,
  diaDelMes: 1,
  activo: true,
});

const selectCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm';

const montoTexto = (r: Pick<GastoRecurrente, 'moneda' | 'monto' | 'ivaAplica'>) =>
  `${r.moneda === 'USD' ? formatUsd(r.monto) : formatArs(r.monto)}${r.ivaAplica ? ' + IVA' : ''}`;

/** Suscripciones y servicios que se repiten: se generan solos cada mes en el día indicado. */
export function GastosRecurrentesCard({
  onChanged,
  demo,
}: {
  onChanged: () => Promise<void>;
  /** Solo para la vista previa de desarrollo: muestra estos ítems sin leer la base. */
  demo?: GastoRecurrente[];
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<GastoRecurrente[]>(demo ?? []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (demo) return;
    try {
      setItems(await fetchGastosRecurrentes());
    } catch (e) {
      toast({ title: 'No se pudieron cargar los recurrentes', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  }, [toast, demo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar() {
    if (!draft) return;
    const monto = Number(draft.monto.replace(',', '.'));
    if (!draft.nombre.trim() || draft.monto.trim() === '' || !(monto >= 0)) {
      toast({ title: 'Completá nombre y monto', variant: 'destructive' });
      return;
    }
    setGuardando(true);
    try {
      await upsertGastoRecurrente({ ...draft, monto });
      setDraft(null);
      await cargar();
      await onChanged();
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  }

  const activos = items.filter((r) => r.activo);
  const inactivos = items.filter((r) => !r.activo);

  return (
    <Panel>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-medium">Gastos recurrentes</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Apps, servidor y suscripciones: se cargan solos cada mes.</p>
        </div>
        <Button type="button" variant="secondary" size="sm" className="h-8 gap-1.5 rounded-full px-4 text-xs" onClick={() => setDraft(nuevoDraft())}>
          <Plus className="size-3.5" aria-hidden />
          Agregar
        </Button>
      </div>

      {items.length ? (
        <ul className="mt-5 divide-y divide-white/[0.06]">
          {[...activos, ...inactivos].map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setDraft({ ...r, monto: String(r.monto) })}
                className={cn('flex w-full items-center gap-4 py-3 text-left', !r.activo && 'opacity-45')}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{r.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {CATEGORIA_LABEL[r.categoria]} · día {r.diaDelMes}
                    {r.activo ? '' : ' · pausado'}
                  </p>
                </div>
                <span className="text-sm tabular-nums">{montoTexto(r)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">
          Todavía no hay ninguno. Agregá las apps y servicios que se pagan todos los meses y van a aparecer solos en
          Economía.
        </p>
      )}

      <Dialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Editar gasto recurrente' : 'Nuevo gasto recurrente'}</DialogTitle>
            <DialogDescription>Se suma solo cada mes el día indicado. Cambiar el monto afecta desde el mes en curso.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Nombre</Label>
                <Input autoFocus placeholder="Ej. Hetzner, Canva, ChatGPT" value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} />
              </div>
              <div className="grid grid-cols-[6rem_1fr] gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Moneda</Label>
                  <select
                    className={selectCls}
                    value={draft.moneda}
                    onChange={(e) => {
                      const moneda = e.target.value as GastoMoneda;
                      setDraft({ ...draft, moneda, ivaAplica: moneda === 'USD' });
                    }}
                  >
                    <option value="USD">USD</option>
                    <option value="ARS">ARS</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Monto por mes</Label>
                  <Input inputMode="decimal" value={draft.monto} onChange={(e) => setDraft({ ...draft, monto: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Categoría</Label>
                  <select
                    className={selectCls}
                    value={draft.categoria}
                    onChange={(e) => setDraft({ ...draft, categoria: e.target.value as GastoAutoCategoria })}
                  >
                    {GASTO_AUTO_CATEGORIAS.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORIA_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Día del mes que se cobra</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={draft.diaDelMes}
                    onChange={(e) => setDraft({ ...draft, diaDelMes: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-5 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={draft.ivaAplica} onCheckedChange={(v) => setDraft({ ...draft, ivaAplica: v === true })} />
                  Le suman IVA
                </label>
                {draft.id ? (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={draft.activo} onCheckedChange={(v) => setDraft({ ...draft, activo: v === true })} />
                    Activo
                  </label>
                ) : null}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" className="rounded-full" onClick={() => setDraft(null)}>
                  Cancelar
                </Button>
                <Button type="button" className="rounded-full" onClick={() => void guardar()} disabled={guardando}>
                  {draft.id ? 'Guardar' : 'Agregar'}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
