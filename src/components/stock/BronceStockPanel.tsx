import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { PLANCHUELA_REF_ORDER, planchuelaRefLabel, type PlanchuelaRef } from '@/lib/bronce/planchuelaRef';
import {
  formatCortes,
  parseCortes,
  PIEZA_MIN_UTIL_MM,
  type CompraSugerida,
  type ResumenAncho,
} from '@/lib/bronce/stock';
import {
  getBronceStock,
  guardarConteoBronce,
  registrarCompraBronce,
  syncBronceCompraAvisos,
  type BronceStock,
} from '@/lib/supabase/services/bronceStock.service';

const MAQUINA_LABEL = { C: 'Chica', G: 'Grande', XL: 'XL' } as const;

const mm = (value: number) => `${Math.round(value).toLocaleString('es-AR')} mm`;

function capacidadTexto(r: ResumenAncho): string[] {
  return r.porMaquina.map((m) => {
    const partes = [
      m.completas ? `${m.completas} ${m.completas === 1 ? 'fila completa' : 'filas completas'}` : '',
      m.parciales.length ? `${m.parciales.length === 1 ? 'parcial' : 'parciales'} ${m.parciales.map((p) => Math.round(p)).join(', ')}` : '',
    ].filter(Boolean);
    return `${MAQUINA_LABEL[m.maquina]}: ${partes.length ? partes.join(' + ') : 'nada'}`;
  });
}

function compraTexto(c: CompraSugerida): string {
  if (c.coberturaDias == null) return 'Sin consumo reciente';
  const dias = Math.floor(c.coberturaDias);
  const cobertura = dias > 90 ? 'más de 3 meses' : `~${dias} ${dias === 1 ? 'día' : 'días'}`;
  return c.metros > 0 ? `${cobertura} · pedir ${c.metros} m → ${formatCortes(c.cortes)}` : cobertura;
}

/** Ingreso de una compra: un renglón de cortes por ancho, en el formato en que se pide. */
function CompraDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [cortes, setCortes] = useState<Record<number, string>>({});
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setCortes({}); setNota(''); }
  }, [open]);

  const parsed = useMemo(() => PLANCHUELA_REF_ORDER.map((ref) => {
    const raw = cortes[ref]?.trim() ?? '';
    if (!raw) return { ref, piezas: [] as number[], error: null as string | null };
    try { return { ref, piezas: parseCortes(raw), error: null }; } catch (e) { return { ref, piezas: [], error: (e as Error).message }; }
  }), [cortes]);

  const total = parsed.reduce((n, p) => n + p.piezas.length, 0);
  const hasError = parsed.some((p) => p.error);

  const save = async () => {
    setSaving(true);
    try {
      await registrarCompraBronce(parsed.flatMap((p) => p.piezas.map((largoMm) => ({ anchoRef: p.ref, largoMm }))), nota);
      toast({ title: 'Compra cargada', description: `${total} ${total === 1 ? 'pieza' : 'piezas'}` });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({ title: 'No se pudo cargar', description: error instanceof Error ? error.message : 'Error desconocido.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Llegó bronce</DialogTitle>
          <DialogDescription>
            Escribí los cortes de cada ancho como los pediste, p. ej. <span className="font-medium text-foreground">2x400 + 200</span>. Dejá vacío lo que no vino.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {parsed.map((p) => (
            <label key={p.ref} className="grid grid-cols-[4.5rem_1fr] items-start gap-3 text-sm">
              <span className="pt-2 font-medium">{planchuelaRefLabel(p.ref)}</span>
              <span className="space-y-1">
                <Input value={cortes[p.ref] ?? ''} placeholder="2x400 + 200" aria-label={`Cortes de ${planchuelaRefLabel(p.ref)}`}
                  onChange={(e) => setCortes((prev) => ({ ...prev, [p.ref]: e.target.value }))} />
                {p.error ? <span className="block text-xs text-red-500">{p.error}</span>
                  : p.piezas.length ? <span className="block text-xs text-muted-foreground">{p.piezas.length} {p.piezas.length === 1 ? 'pieza' : 'piezas'} · {mm(p.piezas.reduce((a, b) => a + b, 0))}</span> : null}
              </span>
            </label>
          ))}
          <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" aria-label="Nota de la compra" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving || hasError || total === 0}>{saving ? 'Guardando…' : total ? `Cargar ${total} ${total === 1 ? 'pieza' : 'piezas'}` : 'Cargar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ConteoRow = { key: string; id?: string; largo: string };

/** Conteo de un ancho: la lista completa de lo que hay. Lo que se quita se da de baja. */
function ConteoDialog({ anchoRef, stock, onClose, onSaved }: { anchoRef: PlanchuelaRef | null; stock: BronceStock | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<ConteoRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (anchoRef == null) return;
    const actuales = (stock?.piezas ?? []).filter((p) => p.anchoRef === anchoRef && p.estado === 'disponible');
    setRows(actuales.map((p) => ({ key: p.id, id: p.id, largo: String(Math.round(p.largoMm)) })));
  }, [anchoRef, stock]);

  const invalid = rows.some((r) => !(Number(r.largo) > 0) || Number(r.largo) > 2000);

  const save = async () => {
    if (anchoRef == null) return;
    setSaving(true);
    try {
      const n = await guardarConteoBronce(anchoRef, rows.map((r) => ({ id: r.id, largoMm: Number(r.largo) })));
      toast({ title: 'Conteo guardado', description: `${planchuelaRefLabel(anchoRef)}: ${n} ${n === 1 ? 'pieza' : 'piezas'}` });
      onClose();
      onSaved();
    } catch (error) {
      toast({ title: 'No se pudo guardar', description: error instanceof Error ? error.message : 'Error desconocido.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={anchoRef != null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Contar {anchoRef != null ? planchuelaRefLabel(anchoRef) : ''}</DialogTitle>
          <DialogDescription>
            Corregí el largo de cada pieza, quitá las que no están y sumá las que falten. Menos de {PIEZA_MIN_UTIL_MM} mm pasa a retazo.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[50vh] space-y-2 overflow-auto">
          {rows.map((r, i) => (
            <li key={r.key} className="flex items-center gap-2">
              <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              <Input type="number" min={1} inputMode="numeric" className="w-32" value={r.largo} aria-label={`Largo de la pieza ${i + 1}`}
                onChange={(e) => setRows((prev) => prev.map((x) => x.key === r.key ? { ...x, largo: e.target.value } : x))} />
              <span className="text-sm text-muted-foreground">mm{r.id ? '' : ' · nueva'}</span>
              <Button type="button" size="icon" variant="ghost" className="ml-auto" aria-label={`Quitar pieza ${i + 1}`}
                onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}>
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
          {!rows.length ? <li className="text-sm text-muted-foreground">No hay piezas. Sumá las que tengas.</li> : null}
        </ul>
        <Button type="button" variant="outline" size="sm" className="w-fit"
          onClick={() => setRows((prev) => [...prev, { key: `nueva-${Date.now()}-${prev.length}`, largo: '' }])}>
          <Plus className="h-4 w-4" />Sumar pieza
        </Button>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving || invalid}>{saving ? 'Guardando…' : 'Guardar conteo'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BronceStockPanel() {
  const { toast } = useToast();
  const [stock, setStock] = useState<BronceStock | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [compraOpen, setCompraOpen] = useState(false);
  const [conteo, setConteo] = useState<PlanchuelaRef | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getBronceStock();
      setStock(next);
      setLoadError(null);
      void syncBronceCompraAvisos(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : (error as { message?: string })?.message ?? 'No se pudo cargar.';
      setLoadError(message);
      toast({ title: 'Error cargando stock de bronce', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const compraPorAncho = new Map(stock?.compras.map((c) => [c.anchoRef, c]) ?? []);
  const pendientes = new Set(stock?.conteoPendiente ?? []);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
        <div>
          <p className="text-sm font-medium">Stock de bronce</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Por pieza. Al terminar un programa se descuenta solo cada fila de la pieza más corta en la que entra. Contá cuando llega una compra o cuando lo pide.
          </p>
        </div>
        <Button type="button" size="sm" disabled={!stock} onClick={() => setCompraOpen(true)}>
          <Plus className="h-4 w-4" />Llegó bronce
        </Button>
      </div>

      {!loading && stock && !stock.iniciado ? (
        <div className="border-b bg-amber-500/10 px-4 py-3 text-sm">
          El stock arranca con un conteo: tocá <span className="font-medium">Contar</span> en cada ancho y cargá las piezas que hay hoy en el taller. Hasta entonces los programas no descuentan.
        </div>
      ) : null}

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30">
            <tr className="text-left">
              <th className="px-4 py-3">Planchuela</th>
              <th className="px-4 py-3">Piezas útiles</th>
              <th className="px-4 py-3">Total útil</th>
              <th className="px-4 py-3">Para mecanizar</th>
              <th className="px-4 py-3">Alcanza / pedir</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && !stock ? (
              <tr><td className="px-4 py-6 text-muted-foreground" colSpan={6}>Cargando stock de bronce...</td></tr>
            ) : !stock ? (
              <tr><td className="px-4 py-6 text-muted-foreground" colSpan={6}>No se pudo leer el stock de bronce{loadError ? `: ${loadError}` : ''}.</td></tr>
            ) : (
              (stock?.resumen ?? []).map((r) => {
                // Antes del conteo inicial no hay stock real: no sugerir compras.
                const compra = stock?.iniciado ? compraPorAncho.get(r.anchoRef) : undefined;
                return (
                  <tr key={r.anchoRef} className="border-b last:border-b-0 align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{planchuelaRefLabel(r.anchoRef)}</span>
                        {pendientes.has(r.anchoRef) ? (
                          <span className="text-xs rounded-full border border-amber-400/50 text-amber-600 dark:text-amber-400 px-2 py-0.5"
                            title="Se terminó una fila para la que no había ninguna pieza cargada que alcanzara. Contá este ancho.">
                            Contar
                          </span>
                        ) : null}
                        {compra?.avisar ? (
                          <span className="text-xs rounded-full border border-red-400/40 text-red-500 px-2 py-0.5">Pedir</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {r.utiles.length ? (
                        <div className="flex flex-wrap gap-1">
                          {r.utiles.map((p) => (
                            <span key={p.id} className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums">{Math.round(p.largoMm)}</span>
                          ))}
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                      {r.retazos ? <p className="mt-1 text-xs text-muted-foreground">{r.retazos} {r.retazos === 1 ? 'retazo' : 'retazos'}</p> : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap">{mm(r.utilMm)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {capacidadTexto(r).map((t) => <p key={t}>{t}</p>)}
                    </td>
                    <td className={`px-4 py-3 text-xs ${compra?.avisar ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                      {compra ? compraTexto(compra) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="outline" onClick={() => setConteo(r.anchoRef)}>Contar</Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <CompraDialog open={compraOpen} onOpenChange={setCompraOpen} onSaved={() => void load()} />
      <ConteoDialog anchoRef={conteo} stock={stock} onClose={() => setConteo(null)} onSaved={() => void load()} />
    </div>
  );
}
