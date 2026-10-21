import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils/cn';
import { fetchEdiciones, fetchRehacerPorVector } from '@/lib/supabase/services/vectorEdiciones.service';
import {
  CASOS_MINIMOS,
  NIVEL_APLICA_SOLA,
  NIVEL_AUTONOMA,
  TIPO_CASO_LABEL,
  calidadPorTipo,
  type CalidadTipo,
  type TipoCaso,
} from '@/lib/vectorizacion/edicionesMetricas';

const PERIODOS = [30, 90, 365] as const;

const NIVEL_LABEL: Record<CalidadTipo['nivel'], string> = {
  1: 'Sugiere',
  3: 'Podría aplicar sola',
  4: 'Podría ser autónoma',
};

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)} %`);

/**
 * Cuánto acierta la corrección automática, por tipo de caso, con lo que se
 * registra al guardar vectores (`vector_ediciones`). Hoy solo informa: el
 * nivel dice a qué podría pasar cada tipo según el plan; no cambia nada solo.
 */
export function CalidadAutomaticoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(90);
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ok'; filas: number; tipos: CalidadTipo[] }
  >({ status: 'loading' });

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setState({ status: 'loading' });
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
    void (async () => {
      const filas = await fetchEdiciones(desde);
      if (!alive) return;
      if (!filas) {
        setState({ status: 'error' });
        return;
      }
      const ids = [...new Set(filas.map((f) => f.sello_id).filter((x): x is string => !!x))];
      const rehechos = await fetchRehacerPorVector(ids);
      if (alive) setState({ status: 'ok', filas: filas.length, tipos: calidadPorTipo(filas, rehechos) });
    })();
    return () => {
      alive = false;
    };
  }, [open, dias]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[860px]">
        <DialogHeader>
          <DialogTitle>Calidad de la corrección automática</DialogTitle>
          <DialogDescription>
            Cada vez que se guarda un vector, la app anota qué propuso la automática y qué quedó. Una propuesta
            cuenta como aceptada si se guardó tal cual; si se volvió al original o se editó a mano, no.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 text-xs" role="group" aria-label="Período">
          <span className="mr-1 text-muted-foreground">Últimos</span>
          {PERIODOS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDias(d)}
              aria-pressed={dias === d}
              className={cn('rounded border px-2 py-1', dias === d ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60')}
            >
              {d} días
            </button>
          ))}
        </div>

        {state.status === 'loading' ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Cargando…
          </p>
        ) : state.status === 'error' ? (
          <p className="py-6 text-sm text-muted-foreground">
            El registro de ediciones todavía no está activo (falta crear la tabla <code>vector_ediciones</code> en la
            base).
          </p>
        ) : !state.filas ? (
          <p className="py-6 text-sm text-muted-foreground">
            Todavía no hay vectores registrados en este período. Se empiezan a anotar solos al confirmar en Revisión,
            al asignar SVG y al guardar un corregido desde el chequeo de fresa.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Tipo de caso</th>
                  <th className="px-2 text-right font-medium" title="Vectores guardados">Guardados</th>
                  <th className="px-2 text-right font-medium" title="Donde la automática tenía que acertar: propuso algo o hubo que editar a mano">A medir</th>
                  <th className="px-2 text-right font-medium">Aceptadas</th>
                  <th className="px-2 text-right font-medium" title="Se volvió al original">Original</th>
                  <th className="px-2 text-right font-medium" title="Se editó a mano">A mano</th>
                  <th className="px-2 text-right font-medium" title="Sellos rehechos por error en el vector después de guardarse">Rehechos</th>
                  <th className="px-2 font-medium">Nivel</th>
                  <th className="pl-2 font-medium">Qué falta</th>
                </tr>
              </thead>
              <tbody>
                {state.tipos.map((t) => (
                  <tr key={t.tipo} className="border-b last:border-0">
                    <td className="py-1.5 pr-2">{TIPO_CASO_LABEL[t.tipo as TipoCaso] ?? t.tipo}</td>
                    <td className="px-2 text-right tabular-nums">{t.total}</td>
                    <td className="px-2 text-right tabular-nums">{t.propuestas}</td>
                    <td
                      className={cn(
                        'px-2 text-right font-medium tabular-nums',
                        t.aceptacion == null
                          ? ''
                          : t.aceptacion >= NIVEL_AUTONOMA
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : t.aceptacion >= NIVEL_APLICA_SOLA
                              ? 'text-sky-600 dark:text-sky-400'
                              : 'text-amber-600 dark:text-amber-400',
                      )}
                    >
                      {pct(t.aceptacion)}
                    </td>
                    <td className="px-2 text-right tabular-nums">{t.rechazadas}</td>
                    <td className="px-2 text-right tabular-nums">{t.editadas}</td>
                    <td className={cn('px-2 text-right tabular-nums', t.rehechos && 'font-medium text-red-600 dark:text-red-400')}>{t.rehechos}</td>
                    <td className="px-2 whitespace-nowrap">{NIVEL_LABEL[t.nivel]}</td>
                    <td className="pl-2 text-muted-foreground">{t.falta ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] leading-snug text-muted-foreground">
          Niveles del plan: con {Math.round(NIVEL_APLICA_SOLA * 100)} % de aceptación y al menos {CASOS_MINIMOS} casos,
          ese tipo podría guardarse solo y quedar marcado para revisar; con {Math.round(NIVEL_AUTONOMA * 100)} %, ser
          autónomo. Por ahora es solo información: la app no cambia de nivel sola. Los sellos de 3 mm nunca se corrigen
          solos.
        </p>
      </DialogContent>
    </Dialog>
  );
}
