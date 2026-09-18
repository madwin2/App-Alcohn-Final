import { useMemo, useState } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { StockAlDiaCard, StockReplenishSection } from '@/components/home/StockReplenishSection';
import type { DashboardTask } from '@/lib/supabase/services/dashboard-tasks.service';
import type { StockReplenishPayload } from '@/lib/supabase/services/stock.service';

/**
 * Sandbox para iterar la tarjeta de Stock pendiente, aislada del inicio.
 * Abrí /stock-pendiente — datos mock, no escribe en el depósito.
 */
export default function StockPendienteSandboxPage() {
  const [showEmpty, setShowEmpty] = useState(false);
  const entries = useMemo(() => MOCK_ENTRIES, []);

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Sandbox · /stock-pendiente</p>
          <h1 className="text-2xl font-semibold tracking-tight">Stock pendiente</h1>
          <p className="max-w-xl text-sm text-zinc-400">
            Versión compacta por defecto: clickeá la tarjeta o los círculos para expandir. El check no
            guarda nada. Ancho como la columna del dashboard (~1/3).
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <ToggleChip active={!showEmpty} onClick={() => setShowEmpty(false)}>
              Con tareas
            </ToggleChip>
            <ToggleChip active={showEmpty} onClick={() => setShowEmpty(true)}>
              Al día
            </ToggleChip>
          </div>
        </header>

        <div className="w-full max-w-[420px] overflow-visible">
          {showEmpty ? (
            <StockAlDiaCard />
          ) : (
            <StockReplenishSection
              preview
              entries={entries}
              lastSyncedAt={MOCK_SYNCED_AT}
              onCompleted={() => undefined}
            />
          )}
        </div>
      </div>
      <Toaster />
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-black'
          : 'rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm font-medium text-zinc-300 hover:bg-white/10'
      }
    >
      {children}
    </button>
  );
}

function mockTask(id: string): DashboardTask {
  return {
    id,
    asignadoAUserId: 'sandbox',
    creadoPorUserId: 'sandbox',
    texto: '',
    createdAt: new Date().toISOString(),
  };
}

const MOCK_SYNCED_AT = new Date();

const MOCK_ENTRIES: { task: DashboardTask; payload: StockReplenishPayload }[] = [
  {
    task: mockTask('sandbox-caja'),
    payload: {
      itemKey: 'CAJA_ABECEDARIO',
      itemName: 'Caja de Abecedario',
      needed: 12,
      stockAlMomento: 4,
      shortage: 8,
      orderId: 'pedido-demo',
      pedidoEtiqueta: 'AL-1042',
    },
  },
  {
    task: mockTask('sandbox-mango'),
    payload: {
      itemKey: 'MANGO_GOLPE',
      itemName: 'Mango de Golpe',
      needed: 6,
      stockAlMomento: 1,
      shortage: 5,
    },
  },
  {
    task: mockTask('sandbox-soldador'),
    payload: {
      itemKey: 'SOLDADOR_100W',
      itemName: 'Soldador 100W',
      needed: 3,
      stockAlMomento: 0,
      shortage: 3,
    },
  },
  {
    task: mockTask('sandbox-tubo'),
    payload: {
      itemKey: 'TUBO_80MM',
      itemName: 'Tubo 80 mm',
      needed: 20,
      stockAlMomento: 14,
      shortage: 6,
    },
  },
];
