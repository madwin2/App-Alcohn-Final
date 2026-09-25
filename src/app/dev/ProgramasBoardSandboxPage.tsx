import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { AppMain } from '@/components/layout/AppMain';
import { ProgramsGrid } from '@/components/programas/Grid/ProgramsGrid';
import { Toaster } from '@/components/ui/toaster';
import { toast } from '@/components/ui/use-toast';
import type { Program, ProgramStamp, FabricationState } from '@/lib/types/index';
import type { RemoveStampChoice } from '@/components/programas/RemoveStamp/RemoveStampDialog';
import { generateProgramName } from '@/lib/programas/programName';
import type { EligibleEntry } from '@/components/programas/Grid/ProgramsSidePanel';
import {
  MOCK_ELIGIBLE_POOL,
  createMockBoardPrograms,
  createMockEligibleLoader,
  fetchRealEligiblePool,
  mockNewId,
} from './programas-card/mockBoard';

/**
 * Sandbox completo del board de Programas.
 * Programas en memoria; vectores con preview real desde Supabase si hay sesión.
 * Abrí /dev/programas
 */
export default function ProgramasBoardSandboxPage() {
  const [programs, setPrograms] = useState<Program[]>(() => createMockBoardPrograms());
  const [pool, setPool] = useState<EligibleEntry[]>(() =>
    MOCK_ELIGIBLE_POOL.map((e) => ({
      stamp: { ...e.stamp },
      machines: [...e.machines],
    })),
  );
  const [poolSource, setPoolSource] = useState<'mock' | 'supabase'>('mock');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const real = await fetchRealEligiblePool();
        if (cancelled || real.length === 0) return;
        setPool(real);
        setPoolSource('supabase');
      } catch {
        /* sin sesión / offline: se queda el pool mock sin imágenes inventadas */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadEligibleEntries = useMemo(
    () => createMockEligibleLoader(() => pool),
    [pool],
  );

  const reset = () => {
    setPrograms(createMockBoardPrograms());
    setPoolSource('mock');
    setPool(
      MOCK_ELIGIBLE_POOL.map((e) => ({
        stamp: { ...e.stamp },
        machines: [...e.machines],
      })),
    );
    void (async () => {
      try {
        const real = await fetchRealEligiblePool();
        if (real.length === 0) return;
        setPool(real);
        setPoolSource('supabase');
      } catch {
        /* keep mock */
      }
    })();
    toast({ title: 'Sandbox reiniciado' });
  };

  const takeFromPool = useCallback((stampIds: string[]): ProgramStamp[] => {
    const idSet = new Set(stampIds);
    const taken = pool.filter((e) => idSet.has(e.stamp.id)).map((e) => ({ ...e.stamp }));
    if (taken.length) {
      setPool((prev) => prev.filter((e) => !idSet.has(e.stamp.id)));
    }
    return taken;
  }, [pool]);

  const returnToPool = useCallback((stamps: ProgramStamp[], machinesHint?: Program['machine']) => {
    setPool((prev) => {
      const existing = new Set(prev.map((e) => e.stamp.id));
      const next = [...prev];
      for (const s of stamps) {
        if (existing.has(s.id)) continue;
        const machines = machinesHint
          ? ([machinesHint] as EligibleEntry['machines'])
          : (['C', 'G', 'XL'] as EligibleEntry['machines']);
        next.push({
          stamp: {
            ...s,
            fabricationState: 'SIN_HACER' as FabricationState,
          },
          machines,
        });
      }
      return next;
    });
  }, []);

  return (
    <AppMain className="flex flex-col">
      <div className="sticky top-0 z-30 space-y-3 border-b bg-background/95 p-6 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Sandbox · /dev/programas
            </p>
            <h1 className="text-xl font-semibold tracking-tight">Programas (mock)</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Misma UI que producción, datos en memoria. Podés crear, arrastrar vectores,
              abrir hojas y tirar a la papelera sin tocar la base.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
            <Link
              to="/programas"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Programas real
            </Link>
          </div>
        </div>
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-950 dark:text-amber-100">
          Mock local · {programs.length} programas · {pool.length} vectores
          {poolSource === 'supabase' ? ' (previews reales de Supabase)' : ' (sin previews hardcodeados)'}
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <ProgramsGrid
          programs={programs}
          loadEligibleEntries={loadEligibleEntries}
          onRefresh={() => undefined}
          onCreateProgram={async (partial) => {
            const stamps = partial.stamps ?? [];
            if (stamps.length) {
              takeFromPool(stamps.map((s) => s.id));
            }
            const date = partial.productionDate || format(new Date(), 'yyyy-MM-dd');
            const machine = partial.machine || 'C';
            const created: Program = {
              id: mockNewId('p'),
              name:
                partial.name ||
                generateProgramName({
                  date,
                  machine,
                  stampCount: stamps.length,
                }),
              description: partial.description || '',
              version: '1.0',
              status: 'active',
              category: 'PRODUCTION',
              machine,
              productionDate: date,
              stampCount: stamps.length,
              stamps: stamps.map((s) => ({ ...s })),
              lengthUsed: 25,
              lengthByPlanchuela: {},
              fabricationState: 'SIN_HACER',
              estadoPrograma: 'BORRADOR',
              isVerified: false,
              bloqueado: false,
              dirty: true,
              createdAt: new Date().toISOString(),
              lastUpdated: new Date().toISOString(),
              createdBy: 'dev@mock',
              previewUrl: stamps[0]?.previewUrl,
            };
            // recalc lengths roughly
            const lengths: Record<number, number> = {};
            for (const s of created.stamps) {
              const t = s.tipoPlanchuela ?? 25;
              lengths[t] = (lengths[t] || 0) + (s.lengthAlongMm ?? 40);
            }
            created.lengthByPlanchuela = lengths;
            setPrograms((prev) => [created, ...prev]);
            return created;
          }}
          onAddStamps={async (programId, stampIds) => {
            const taken = takeFromPool(stampIds);
            if (!taken.length) {
              // maybe already attached — look in pool miss
              throw new Error('Esos vectores ya no están en el pool mock');
            }
            setPrograms((prev) =>
              prev.map((p) => {
                if (p.id !== programId) return p;
                const stamps = [...p.stamps, ...taken];
                const lengths: Record<number, number> = {};
                for (const s of stamps) {
                  const t = s.tipoPlanchuela ?? 25;
                  lengths[t] = (lengths[t] || 0) + (s.lengthAlongMm ?? 40);
                }
                return {
                  ...p,
                  stamps,
                  stampCount: stamps.length,
                  lengthByPlanchuela: lengths,
                  dirty: true,
                  lastUpdated: new Date().toISOString(),
                  name:
                    generateProgramName({
                      date: p.productionDate,
                      machine: p.machine,
                      stampCount: stamps.length,
                    }) || p.name,
                };
              }),
            );
          }}
          onRemoveStamp={async (programId, stampId, _choice: RemoveStampChoice) => {
            let removed: ProgramStamp | null = null;
            let machine: Program['machine'] = 'C';
            setPrograms((prev) =>
              prev.map((p) => {
                if (p.id !== programId) return p;
                const stamp = p.stamps.find((s) => s.id === stampId) ?? null;
                removed = stamp;
                machine = p.machine;
                const stamps = p.stamps.filter((s) => s.id !== stampId);
                const lengths: Record<number, number> = {};
                for (const s of stamps) {
                  const t = s.tipoPlanchuela ?? 25;
                  lengths[t] = (lengths[t] || 0) + (s.lengthAlongMm ?? 40);
                }
                return {
                  ...p,
                  stamps,
                  stampCount: stamps.length,
                  lengthByPlanchuela: lengths,
                  dirty: true,
                  lastUpdated: new Date().toISOString(),
                };
              }),
            );
            if (removed) returnToPool([removed], machine);
          }}
          onDelete={async (programId, _choice) => {
            let freed: ProgramStamp[] = [];
            let machine: Program['machine'] = 'C';
            setPrograms((prev) => {
              const target = prev.find((p) => p.id === programId);
              if (target) {
                freed = target.stamps;
                machine = target.machine;
              }
              return prev.filter((p) => p.id !== programId);
            });
            if (freed.length) returnToPool(freed, machine);
          }}
          onLock={async (programId) => {
            setPrograms((prev) =>
              prev.map((p) =>
                p.id === programId
                  ? { ...p, bloqueado: true, estadoPrograma: 'BLOQUEADO' }
                  : p,
              ),
            );
          }}
          onUnlock={async (programId) => {
            setPrograms((prev) =>
              prev.map((p) =>
                p.id === programId
                  ? {
                      ...p,
                      bloqueado: false,
                      estadoPrograma:
                        p.estadoPrograma === 'BLOQUEADO' ? 'LISTO' : p.estadoPrograma,
                    }
                  : p,
              ),
            );
          }}
          onDownload={async () => {
            toast({ title: '[Mock] Descarga simulada' });
          }}
          onUpdateProgram={async (programId, updates) => {
            setPrograms((prev) =>
              prev.map((p) => (p.id === programId ? { ...p, ...updates } : p)),
            );
          }}
          onSyncAspireFile={async (programId) => {
            toast({ title: '[Mock] Sync Aspire omitido' });
            const program =
              programs.find((p) => p.id === programId) ?? programs[0] ?? createMockBoardPrograms()[0];
            return {
              program,
              reconciliation: {
                enAmbos: [],
                soloEnApp: [],
                soloEnArchivo: [],
                noIdentificados: 0,
                avisos: [],
              },
              stampLabels: {},
              parseError: null,
              needsAttention: false,
            };
          }}
          onApplyReconciliation={async () => {
            toast({ title: '[Mock] Reconciliación omitida' });
          }}
          onSetFabricationState={async (programId, state) => {
            setPrograms((prev) =>
              prev.map((p) => {
                if (p.id !== programId) return p;
                const stamps = p.stamps.map((s) => ({ ...s, fabricationState: state }));
                const allDone = stamps.every(
                  (s) => s.fabricationState === 'HECHO' || s.fabricationState === 'VERIFICAR',
                );
                return {
                  ...p,
                  stamps,
                  fabricationState: state,
                  estadoPrograma: allDone ? 'FINALIZADO' : 'EN_FABRICACION',
                };
              }),
            );
          }}
          onSetStampFabricationStates={async (programId, assignments) => {
            const map = new Map(assignments.map((a) => [a.stampId, a.state]));
            setPrograms((prev) =>
              prev.map((p) => {
                if (p.id !== programId) return p;
                const stamps = p.stamps.map((s) => ({
                  ...s,
                  fabricationState: map.get(s.id) ?? s.fabricationState,
                }));
                const allDone = stamps.every(
                  (s) => s.fabricationState === 'HECHO' || s.fabricationState === 'VERIFICAR',
                );
                return {
                  ...p,
                  stamps,
                  estadoPrograma: allDone ? 'FINALIZADO' : p.estadoPrograma,
                };
              }),
            );
          }}
        />
      </div>

      <Toaster />
    </AppMain>
  );
}
