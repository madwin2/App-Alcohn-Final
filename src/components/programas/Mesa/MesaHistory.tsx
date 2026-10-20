import { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronRight, Loader2, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { PreparationMachine } from '@/lib/programas/preparation';
import { getFinishedProgramsPage } from '@/lib/supabase/services/programs.service';
import type { Program } from '@/lib/types/index';
import { cn } from '@/lib/utils/cn';
import { FOCUS, PILL_SOFT, Segmented } from './mesaUi';

const PAGE = 30;
const MACHINE_LABEL: Record<string, string> = { C: 'Chica', G: 'Grande', XL: 'XL', ABC: 'ABC' };
type MachineFilter = 'todas' | PreparationMachine;

const fmt = (iso: string | null | undefined, pattern: string) => iso ? format(parseISO(iso), pattern, { locale: es }) : null;
const count = (p: Program, state: 'RETOCAR' | 'REHACER') => p.stamps.filter((s) => s.fabricationState === state).length;

/**
 * Historial de programas terminados. La mesa solo muestra lo que está en
 * curso y lo terminado en los últimos días; todo lo demás se busca acá, de a
 * páginas, agrupado por mes. Nada se borra: queda para saber en qué corrida
 * se hizo cada sello.
 */
export function MesaHistory({ open, onOpenChange, machine, onOpenProgram }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Máquina que se estaba mirando en la mesa (filtro inicial). */
  machine: PreparationMachine;
  /** Abre el programa en la mesa, en solo lectura. */
  onOpenProgram: (p: Program) => void;
}) {
  const [filter, setFilter] = useState<MachineFilter>(machine);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Program[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  useEffect(() => { if (open) setFilter(machine); }, [open, machine]);

  const load = async (offset: number) => {
    const id = ++request.current;
    setLoading(true); setError(null);
    try {
      const page = await getFinishedProgramsPage({ machine: filter === 'todas' ? null : filter, search, offset, limit: PAGE });
      if (id !== request.current) return;
      setItems((prev) => offset ? [...prev, ...page.programs] : page.programs);
      setTotal(page.total);
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : 'No se pudo cargar el historial');
    } finally {
      if (id === request.current) setLoading(false);
    }
  };

  // Al abrir, al cambiar de máquina o al escribir (con una pausa corta).
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void load(0), search ? 300 : 0);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filter, search]);

  const months = useMemo(() => {
    const out: { key: string; label: string; programs: Program[] }[] = [];
    for (const p of items) {
      const key = p.productionDate.slice(0, 7);
      const last = out[out.length - 1];
      if (last?.key === key) last.programs.push(p);
      else out.push({ key, label: format(parseISO(`${key}-01`), 'MMMM yyyy', { locale: es }), programs: [p] });
    }
    return out;
  }, [items]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Programas terminados</DialogTitle>
          <DialogDescription>Todos los programas fabricados, del más nuevo al más viejo. Abrí uno para ver cómo quedó armado.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="sm" value={filter} onChange={setFilter}
            options={[{ id: 'todas', label: 'Todas' }, { id: 'C', label: 'Chica' }, { id: 'G', label: 'Grande' }, { id: 'XL', label: 'XL' }]} />
          <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1.5 text-[13px]">
            <Search className="size-3.5 text-zinc-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre (p. ej. 15 OCT)"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-500" aria-label="Buscar programa" />
          </label>
        </div>

        <div className="-mx-2 min-h-[12rem] flex-1 overflow-y-auto px-2" aria-busy={loading}>
          {error ? <p className="py-8 text-center text-[13px] text-red-300">{error}</p>
            : !items.length && loading ? <p className="flex items-center justify-center gap-2 py-8 text-[13px] text-zinc-400"><Loader2 className="size-4 animate-spin" />Cargando…</p>
              : !items.length ? <p className="py-8 text-center text-[13px] text-zinc-400">{search ? 'Ningún programa terminado con ese nombre.' : 'Todavía no hay programas terminados.'}</p>
                : months.map((m) => (
                  <section key={m.key} className="mb-4">
                    <h3 className="sticky top-0 z-10 bg-background/95 py-1.5 text-[12px] font-medium uppercase tracking-wide text-zinc-400 backdrop-blur">
                      {m.label} <span className="font-normal normal-case tracking-normal">· {m.programs.length}{m.key === months[months.length - 1]?.key && items.length < total ? '+' : ''}</span>
                    </h3>
                    <ul className="space-y-0.5">
                      {m.programs.map((p) => {
                        const retocar = count(p, 'RETOCAR'), rehacer = count(p, 'REHACER');
                        return (
                          <li key={p.id}>
                            <button type="button" onClick={() => onOpenProgram(p)}
                              className={cn(FOCUS, 'group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] hover:bg-white/[0.05]')}>
                              <span className="w-[7.5rem] shrink-0 font-medium">{p.name}</span>
                              <span className="w-14 shrink-0 text-zinc-400">{MACHINE_LABEL[p.machine] ?? p.machine}</span>
                              <span className="w-16 shrink-0 tabular-nums text-zinc-400">{p.stamps.length} {p.stamps.length === 1 ? 'sello' : 'sellos'}</span>
                              <span className="min-w-0 flex-1 truncate text-zinc-400">
                                {fmt(p.finishedAt, "'Terminado el' d MMM") ?? 'Terminado'}
                                {retocar || rehacer ? <span className="text-amber-200/90"> · {[retocar && `${retocar} retocar`, rehacer && `${rehacer} rehacer`].filter(Boolean).join(' · ')}</span> : null}
                              </span>
                              <ChevronRight className="size-4 shrink-0 text-zinc-500 group-hover:text-foreground" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
        </div>

        <footer className="flex items-center justify-between text-[12px] text-zinc-400">
          <span>{items.length ? `${items.length} de ${total}` : null}</span>
          {items.length < total ? (
            <button type="button" className={PILL_SOFT} disabled={loading} onClick={() => void load(items.length)}>
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}Cargar más
            </button>
          ) : null}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
