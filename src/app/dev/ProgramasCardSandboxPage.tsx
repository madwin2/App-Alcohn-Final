import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  ProgramCardDesign,
  ProgramSlotEmpty,
} from '@/components/programas/Grid/ProgramCardDesign';
import {
  PROGRAM_CARD_SCENARIOS,
  type ProgramCardScenario,
} from './programas-card/mockPrograms';
import type { ProgramMachineType } from '@/lib/types/index';
import { cn } from '@/lib/utils';

const SLOTS_PER_COLUMN = 4;

const BOARD_SLOT_IDS: Record<ProgramMachineType, (string | null)[]> = {
  C: ['borrador-vacio', 'borrador-con-sellos', 'listo-dirty', 'no-importados'],
  G: ['listo', 'finalizado', 'sin-preview-con-aspire', null],
  XL: ['bloqueado', 'en-fabricacion', 'otra-planchuela', 'alertas-combinadas'],
  ABC: [],
};

const COLUMNS: {
  machine: Exclude<ProgramMachineType, 'ABC'>;
  title: string;
  badge: string;
}[] = [
  { machine: 'C', title: 'Máquina Chica', badge: 'bg-purple-600 text-white' },
  { machine: 'G', title: 'Máquina Grande', badge: 'bg-blue-600 text-white' },
  { machine: 'XL', title: 'Máquina XL', badge: 'bg-green-600 text-white' },
];

function resolveSlots(
  ids: (string | null)[],
  all: ProgramCardScenario[],
): (ProgramCardScenario | null)[] {
  const byId = new Map(all.map((s) => [s.id, s]));
  const slots = ids.map((id) => (id ? byId.get(id) ?? null : null));
  while (slots.length < SLOTS_PER_COLUMN) slots.push(null);
  return slots.slice(0, SLOTS_PER_COLUMN);
}

/**
 * 3 columnas × 4 tarjeteros FIJOS.
 * La hoja sale hacia arriba y puede tapar el de atrás; el labio propio sigue delante.
 */
export default function ProgramasCardSandboxPage() {
  const board = COLUMNS.map((col) => ({
    ...col,
    slots: resolveSlots(BOARD_SLOT_IDS[col.machine], PROGRAM_CARD_SCENARIOS),
  }));

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-4 p-6">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Sandbox · /dev/programas-card
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Tarjeteros de programa
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Contenedores fijos. Hover: la hoja sube. Click: sale y se abre en grande.
            </p>
          </div>
            <Link
              to="/dev/programas"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Board completo →
            </Link>
            <Link
              to="/programas"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Programas
            </Link>
        </div>
      </div>

      <div className="mx-auto max-w-7xl p-6">
        <div className="grid grid-cols-1 gap-8 pt-32 lg:grid-cols-3">
          {board.map((col) => (
            <section key={col.machine} className="min-w-0">
              <div className="mb-4 flex items-center gap-2">
                <div className={cn('rounded px-3 py-1 text-xs font-medium', col.badge)}>
                  {col.title}
                </div>
                <span className="text-xs text-muted-foreground">
                  {col.slots.filter(Boolean).length}/{SLOTS_PER_COLUMN}
                </span>
              </div>

              <div className="relative isolate flex flex-col">
                {col.slots.map((scenario, idx) => (
                  <div
                    key={`${col.machine}-slot-${idx}`}
                    className={cn(
                      'relative w-full overflow-visible',
                      idx === 0 && 'z-[1]',
                      idx === 1 && 'z-[2]',
                      idx === 2 && 'z-[3]',
                      idx === 3 && 'z-[4]',
                      // Un poco menos de solape → se lee mejor la sombra entre ranuras
                      idx > 0 && '-mt-4',
                    )}
                  >
                    {scenario ? (
                      <ProgramCardDesign program={scenario.program} />
                    ) : (
                      <ProgramSlotEmpty />
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
