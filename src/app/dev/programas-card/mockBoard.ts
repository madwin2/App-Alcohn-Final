import type {
  Program,
  ProgramMachineType,
  ProgramStamp,
} from '@/lib/types/index';
import type { EligibleEntry } from '@/components/programas/Grid/ProgramsSidePanel';
import { PROGRAM_CARD_SCENARIOS } from './mockPrograms';

/**
 * Previews: no hardcodear assets. En sandbox se hidratan desde getEligibleStamps
 * (foto_sello / archivo_vector_preview reales). Acá solo metadata de fallback.
 */
function stamp(
  partial: Partial<ProgramStamp> & Pick<ProgramStamp, 'id' | 'designName'>,
): ProgramStamp {
  return {
    widthMm: 25,
    heightMm: 40,
    stampType: 'CLASICO',
    tipoPlanchuela: 25,
    lengthAlongMm: 42,
    fabricationState: 'SIN_HACER',
    ...partial,
  };
}

function compareEligible(a: EligibleEntry, b: EligibleEntry): number {
  if (Boolean(a.stamp.isPriority) !== Boolean(b.stamp.isPriority)) {
    return a.stamp.isPriority ? -1 : 1;
  }
  const oa = a.stamp.orderDate
    ? new Date(a.stamp.orderDate).getTime()
    : Number.POSITIVE_INFINITY;
  const ob = b.stamp.orderDate
    ? new Date(b.stamp.orderDate).getTime()
    : Number.POSITIVE_INFINITY;
  if (oa !== ob) return oa - ob;
  const ca = a.stamp.createdAt ? new Date(a.stamp.createdAt).getTime() : 0;
  const cb = b.stamp.createdAt ? new Date(b.stamp.createdAt).getTime() : 0;
  return ca - cb;
}

/** Pool de vectores “libres” (no están en ningún programa al inicio). */
export const MOCK_ELIGIBLE_POOL: EligibleEntry[] = [
  {
    stamp: stamp({
      id: 'pool-1',
      designName: 'Estancia Sur',
      tipoPlanchuela: 25,
      isPriority: true,
      orderDate: '2026-09-10',
      notes: 'Cliente pidió cuero más oscuro',
    }),
    machines: ['C', 'G'],
  },
  {
    stamp: stamp({
      id: 'pool-2',
      designName: 'Campo Norte',
      tipoPlanchuela: 38,
      widthMm: 38,
      lengthAlongMm: 52,
      orderDate: '2026-09-18',
    }),
    machines: ['G', 'XL'],
  },
  {
    stamp: stamp({
      id: 'pool-3',
      designName: 'La Pampa',
      tipoPlanchuela: 19,
      widthMm: 19,
      heightMm: 30,
      lengthAlongMm: 34,
      orderDate: '2026-09-05',
      notes: 'Medida y vector confirmadas',
    }),
    machines: ['C'],
  },
  {
    stamp: stamp({
      id: 'pool-4',
      designName: 'Don Julio',
      tipoPlanchuela: 12,
      widthMm: 12,
      heightMm: 22,
      lengthAlongMm: 28,
      orderDate: '2026-09-01',
    }),
    machines: ['C', 'G', 'XL'],
  },
  {
    stamp: stamp({
      id: 'pool-5',
      designName: 'Rodeo XL',
      tipoPlanchuela: 38,
      widthMm: 38,
      lengthAlongMm: 60,
      isPriority: true,
      orderDate: '2026-09-20',
      notes: 'Urgente para el viernes',
    }),
    machines: ['XL'],
  },
  {
    stamp: stamp({
      id: 'pool-6',
      designName: 'Cuero Viejo',
      tipoPlanchuela: 25,
      orderDate: '2026-08-28',
    }),
    machines: ['C', 'G', 'XL'],
  },
].sort(compareEligible);

const INITIAL_IDS = [
  'borrador-con-sellos',
  'en-fabricacion',
  'listo',
  'bloqueado',
  'finalizado',
  'listo-dirty',
] as const;

/** Snapshot inicial del board (deep clone). */
export function createMockBoardPrograms(): Program[] {
  const byId = new Map(PROGRAM_CARD_SCENARIOS.map((s) => [s.id, s.program]));
  return INITIAL_IDS.map((id) => {
    const p = byId.get(id);
    if (!p) throw new Error(`Mock scenario missing: ${id}`);
    return structuredClone(p);
  });
}

export function createMockEligibleLoader(getPool: () => EligibleEntry[]) {
  return async (): Promise<EligibleEntry[]> => {
    await new Promise((r) => setTimeout(r, 80));
    return getPool()
      .map((e) => ({
        stamp: { ...e.stamp },
        machines: [...e.machines] as ProgramMachineType[],
      }))
      .sort(compareEligible);
  };
}

/** Hidrata el pool del sandbox con sellos reales (foto / vector preview de Supabase). */
export async function fetchRealEligiblePool(): Promise<EligibleEntry[]> {
  const { getEligibleStamps } = await import(
    '@/lib/supabase/services/programs.service'
  );
  const machines: ProgramMachineType[] = ['C', 'G', 'XL'];
  const lists = await Promise.all(
    machines.map(async (machine) => ({
      machine,
      stamps: await getEligibleStamps({ machine }),
    })),
  );
  const byId = new Map<string, EligibleEntry>();
  for (const { machine, stamps } of lists) {
    for (const s of stamps) {
      const prev = byId.get(s.id);
      if (prev) {
        if (!prev.machines.includes(machine)) prev.machines.push(machine);
      } else {
        byId.set(s.id, { stamp: { ...s }, machines: [machine] });
      }
    }
  }
  return Array.from(byId.values()).sort(compareEligible);
}

export function mockNewId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
