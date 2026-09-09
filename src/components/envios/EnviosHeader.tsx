import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { History, Loader2, Search } from 'lucide-react';

export type EnviosCarrierFilter = 'ALL' | 'CORREO_ARGENTINO' | 'ANDREANI' | 'VIA_CARGO';

type CarrierCount = {
  correo: number;
  andreani: number;
  viaCargo: number;
  all: number;
};

interface EnviosHeaderProps {
  carrierFilter: EnviosCarrierFilter;
  onCarrierFilterChange: (value: EnviosCarrierFilter) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  counts: CarrierCount;
  onOpenHistorial: () => void;
  showCsvButton?: boolean;
  csvCount?: number;
  isGeneratingCsv?: boolean;
  onGenerateCsv?: () => void;
  micorreoBusy?: boolean;
  micorreoQueueSize?: number;
}

const FILTERS: { id: EnviosCarrierFilter; label: string; countKey: keyof CarrierCount }[] = [
  { id: 'ALL', label: 'Todos', countKey: 'all' },
  { id: 'CORREO_ARGENTINO', label: 'Correo Argentino', countKey: 'correo' },
  { id: 'ANDREANI', label: 'Andreani', countKey: 'andreani' },
  { id: 'VIA_CARGO', label: 'Via Cargo', countKey: 'viaCargo' },
];

export function EnviosHeader({
  carrierFilter,
  onCarrierFilterChange,
  searchQuery,
  onSearchQueryChange,
  counts,
  onOpenHistorial,
  showCsvButton = false,
  csvCount = 0,
  isGeneratingCsv = false,
  onGenerateCsv,
  micorreoBusy = false,
  micorreoQueueSize = 0,
}: EnviosHeaderProps) {
  return (
    <div className="border-b bg-background p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Envíos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Al confirmar datos se sube a MiCorreo automáticamente. El CSV manual incluye solo pedidos en
            Hacer Etiqueta.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={onOpenHistorial}>
            <History className="mr-1.5 h-4 w-4" />
            Historial
          </Button>
          {showCsvButton ? (
            <Button
              onClick={onGenerateCsv}
              disabled={!csvCount || isGeneratingCsv}
              title={
                csvCount
                  ? 'Descarga CSV para carga manual en MiCorreo (solo Hacer Etiqueta)'
                  : 'No hay pedidos en Hacer Etiqueta para exportar'
              }
            >
              {isGeneratingCsv ? 'Generando CSV...' : `Generar CSV (${csvCount})`}
            </Button>
          ) : null}
          {micorreoBusy ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {micorreoQueueSize > 1
                ? `MiCorreo: cola (${micorreoQueueSize} pendientes)…`
                : 'Subiendo a MiCorreo…'}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const active = carrierFilter === filter.id;
            const count = counts[filter.countKey];
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => onCarrierFilterChange(filter.id)}
                className={`min-w-[7.5rem] rounded-lg border px-3 py-2 text-left transition-colors ${
                  active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-card hover:bg-muted/50'
                }`}
              >
                <span className="block text-sm font-medium">{filter.label}</span>
                <span className={`text-xs tabular-nums ${active ? 'opacity-80' : 'text-muted-foreground'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Buscar por cliente o diseño..."
            className="pl-8"
          />
        </div>
      </div>
    </div>
  );
}
