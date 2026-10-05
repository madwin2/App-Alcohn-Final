import { useCallback, useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
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

const selectCls = 'h-8 w-full rounded-md border bg-background px-2 text-xs';

/** Suscripciones y servicios que se repiten: se generan solos cada mes en el día indicado. */
export function GastosRecurrentesCard({ onChanged }: { onChanged: () => Promise<void> }) {
  const { toast } = useToast();
  const [items, setItems] = useState<GastoRecurrente[]>([]);
  const [draft, setDraft] = useState<Draft>(nuevoDraft);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setItems(await fetchGastosRecurrentes());
    } catch (e) {
      toast({ title: 'No se pudieron cargar los recurrentes', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  }, [toast]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar() {
    const monto = Number(draft.monto.replace(',', '.'));
    if (!draft.nombre.trim() || !(monto >= 0) || draft.monto.trim() === '') {
      toast({ title: 'Completá nombre y monto', variant: 'destructive' });
      return;
    }
    setGuardando(true);
    try {
      await upsertGastoRecurrente({ ...draft, monto });
      setDraft(nuevoDraft());
      await cargar();
      await onChanged();
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card className="w-full border-border/70 shadow-sm">
      <CardHeader className="border-b border-border/50 bg-muted/15 px-4 py-3">
        <CardTitle className="text-lg">Gastos recurrentes</CardTitle>
        <CardDescription className="text-xs leading-snug">
          Apps, servidor y suscripciones que se pagan todos los meses. Se suman solos el día indicado (se ven después de
          «Actualizar ahora» o del sync de las 7:00). Editar un monto cambia el mes en curso, no los anteriores.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-4 py-4 text-sm">
        {items.length ? (
          <ul className="divide-y divide-border/50 rounded-lg border border-border/50">
            {items.map((r) => (
              <li key={r.id} className={cn('flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs', !r.activo && 'opacity-50')}>
                <span className="min-w-0 flex-1 truncate font-medium">{r.nombre}</span>
                <span className="text-muted-foreground">{CATEGORIA_LABEL[r.categoria]}</span>
                <span className="tabular-nums">
                  {r.moneda} {r.monto.toLocaleString('es-AR')}
                  {r.ivaAplica ? ' + IVA' : ''}
                </span>
                <span className="text-muted-foreground">día {r.diaDelMes}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5"
                  aria-label={`Editar ${r.nombre}`}
                  onClick={() => setDraft({ ...r, monto: String(r.monto) })}
                >
                  <Pencil className="size-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Todavía no hay recurrentes cargados.</p>
        )}

        <div className="grid gap-2 rounded-lg border border-dashed border-border/70 p-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <div className="space-y-1 lg:col-span-2">
            <Label className="text-[11px] text-muted-foreground">{draft.id ? 'Editando' : 'Nuevo'} · Nombre</Label>
            <Input value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Categoría</Label>
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
          <div className="grid grid-cols-[5rem_1fr] gap-1">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Moneda</Label>
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
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Monto</Label>
              <Input inputMode="decimal" value={draft.monto} onChange={(e) => setDraft({ ...draft, monto: e.target.value })} className="h-8 text-xs" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Día del mes</Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={draft.diaDelMes}
              onChange={(e) => setDraft({ ...draft, diaDelMes: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:col-span-6">
            <label className="flex items-center gap-1.5 text-xs">
              <Checkbox checked={draft.ivaAplica} onCheckedChange={(v) => setDraft({ ...draft, ivaAplica: v === true })} />
              Suma IVA
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <Checkbox checked={draft.activo} onCheckedChange={(v) => setDraft({ ...draft, activo: v === true })} />
              Activo
            </label>
            <div className="ml-auto flex gap-2">
              {draft.id ? (
                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setDraft(nuevoDraft())}>
                  Cancelar
                </Button>
              ) : null}
              <Button type="button" size="sm" className="h-8 text-xs" onClick={() => void guardar()} disabled={guardando}>
                {draft.id ? 'Guardar cambios' : 'Agregar'}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
