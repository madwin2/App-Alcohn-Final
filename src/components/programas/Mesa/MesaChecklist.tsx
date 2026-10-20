import { Loader2 } from 'lucide-react';
import type { CheckGroup, MesaProgress, MesaStep } from '@/lib/programas/mesa';
import { cn } from '@/lib/utils/cn';
import { Dot, FOCUS } from './mesaUi';

export type MesaStage = MesaStep | 'fabricando' | 'fabricado';
export const STEP_LABEL: Record<MesaStage, string> = { armado: 'Armado', revisar: 'Revisado', aspire: 'En Aspire', fabricar: 'Para fabricar', fabricando: 'Fabricando', fabricado: 'Fabricado' };
const STEPS: MesaStage[] = ['armado', 'revisar', 'aspire', 'fabricar', 'fabricando', 'fabricado'];

/** Etapas del programa: seis puntos unidos por una línea. */
export function MesaSteps({ progress, fabricating, fabricated }: { progress: MesaProgress; fabricating: boolean; fabricated: boolean }) {
  // En la máquina o terminado: lo anterior ya pasó, aunque el armado se haya tocado después.
  const done = (s: MesaStage) => s === 'fabricado' ? fabricated
    : s === 'fabricando' ? fabricated
      : fabricated || fabricating || progress.done[s];
  const current = fabricated ? null : STEPS.find((s) => !done(s)) ?? null;
  return (
    <ol className="flex items-center" aria-label="Etapas del programa">
      {STEPS.map((s, i) => {
        const isDone = done(s), isCurrent = s === current;
        return (
          <li key={s} className="flex items-center" aria-current={isCurrent ? 'step' : undefined}>
            {i ? <span className={cn('mx-2 h-px w-5 xl:w-7', isDone || isCurrent ? 'bg-white/45' : 'bg-white/10')} aria-hidden /> : null}
            <span className={cn('flex items-center gap-2 whitespace-nowrap text-[13px]', isDone || isCurrent ? 'text-foreground' : 'text-zinc-500')}>
              <span className={cn('size-2 rounded-full', isDone ? 'bg-white' : isCurrent ? 'ring-1 ring-white' : 'bg-white/20')} />
              {STEP_LABEL[s]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Resumen de una línea para la barra de acción. */
export function checkSummary(groups: CheckGroup[], checking: boolean): { tone: 'ok' | 'warning' | 'error' | 'pending'; text: string; count: number } {
  if (checking) return { tone: 'pending', text: 'Chequeando la fresa…', count: 0 };
  const errors = groups.filter((g) => g.state === 'error');
  const warnings = groups.filter((g) => g.state === 'warning');
  const pending = groups.filter((g) => g.state === 'pending');
  const issues = (gs: CheckGroup[]) => gs.reduce((n, g) => n + Math.max(1, groupIssues(g.items).length), 0);
  if (errors.length) return { tone: 'error', text: `${issues(errors)} ${issues(errors) === 1 ? 'error' : 'errores'}`, count: issues(errors) };
  if (warnings.length) return { tone: 'warning', text: `${issues(warnings)} para revisar`, count: issues(warnings) };
  if (pending.length) return { tone: 'pending', text: `${groups.length - pending.length} de ${groups.length} controles ok`, count: 0 };
  return { tone: 'ok', text: 'Todos los controles ok', count: 0 };
}

type Issue = CheckGroup['items'][number];
/**
 * Un mismo problema repetido por sello («X: falta verificar las plantillas de
 * CLASICO.») se muestra una vez con la cantidad de sellos.
 */
function groupIssues(items: Issue[]): { issue: Issue; text: string; count: number }[] {
  const out = new Map<string, { issue: Issue; text: string; count: number }>();
  for (const i of items) {
    const m = i.instanceId ? /^[^:]+:\s*(.+)$/.exec(i.message) : null;
    const key = m ? `${i.code}|${m[1]}` : `${i.code}|${i.message}|${i.instanceId ?? ''}`;
    const hit = out.get(key);
    if (hit) hit.count += 1; else out.set(key, { issue: i, text: m ? m[1] : i.message, count: 1 });
  }
  return [...out.values()].map((g) => g.count > 1 ? g : { ...g, text: g.issue.message });
}

/**
 * Controles antes de Aspire. Lo que está bien queda en una línea gris; lo que
 * falla se abre con cada sello y su acción («Ir al sello»).
 */
export function MesaChecklist({ groups, checking, onPick, onSetup }: { groups: CheckGroup[]; checking: boolean; onPick: (instanceId: string) => void; onSetup?: () => void }) {
  return (
    <ul className="space-y-2" aria-label="Controles antes de Aspire">
      {groups.map((g) => {
        const busy = g.id === 'fresa' && checking;
        return (
          <li key={g.id}>
            <p className="flex items-center gap-2.5 text-[13px]">
              {busy ? <Loader2 className="size-3 animate-spin text-zinc-400" /> : <Dot tone={g.state} />}
              <span className={cn('flex-1', g.state === 'ok' ? 'text-zinc-400' : 'text-foreground')}>{g.label}</span>
              {g.items.length ? <span className="text-[12px] tabular-nums text-zinc-400">{groupIssues(g.items).length}</span> : null}
            </p>
            {g.hint && !busy ? <p className="pl-4 text-[12px] text-zinc-400">{g.hint}</p> : null}
            {g.items.length ? (
              <ul className="mt-1 space-y-0.5 pl-4">
                {groupIssues(g.items).map(({ issue: i, text, count }, k) => (
                  <li key={`${i.code}-${k}`} className="flex items-start gap-2">
                    <span className={cn('flex-1 text-[12px] leading-snug', i.severity === 'error' ? 'text-red-300' : 'text-amber-200/90')}>
                      {text.charAt(0).toUpperCase() + text.slice(1)}{count > 1 ? <span className="text-zinc-400"> · {count} sellos</span> : null}
                    </span>
                    {g.id === 'maquina' && onSetup ? (
                      <button type="button" onClick={onSetup}
                        className={cn(FOCUS, 'shrink-0 rounded-full px-2 text-[12px] text-zinc-300 hover:bg-white/[0.08] hover:text-foreground')}>Configurar</button>
                    ) : i.instanceId && count === 1 ? (
                      <button type="button" onClick={() => onPick(i.instanceId!)}
                        className={cn(FOCUS, 'shrink-0 rounded-full px-2 text-[12px] text-zinc-300 hover:bg-white/[0.08] hover:text-foreground')}>Ir al sello</button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
