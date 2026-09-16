import { useNavigate } from 'react-router-dom';
import { ArrowLeft, History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { SvgIcon } from '@/components/ui/SvgIcon';
import {
  ENVIOS_CARRIER_PATH,
  type EnviosCarrierFilter,
} from '@/components/envios/enviosRoutes';

export type { EnviosCarrierFilter };

type CarrierCount = {
  correo: number;
  andreani: number;
  viaCargo: number;
  all: number;
};

interface EnviosHeaderProps {
  carrierFilter: EnviosCarrierFilter;
  counts: CarrierCount;
  showCsvButton?: boolean;
  csvCount?: number;
  isGeneratingCsv?: boolean;
  onGenerateCsv?: () => void;
  micorreoBusy?: boolean;
  micorreoQueueSize?: number;
}

const FILTERS: {
  id: EnviosCarrierFilter;
  label: string;
  countKey: keyof CarrierCount;
  logo?: string;
}[] = [
  { id: 'CORREO_ARGENTINO', label: 'Correo', countKey: 'correo', logo: 'CORREO ARGENTINO DOMICILIO' },
  { id: 'ANDREANI', label: 'Andreani', countKey: 'andreani', logo: 'ANDREANI DOMICILIO' },
  { id: 'VIA_CARGO', label: 'Via Cargo', countKey: 'viaCargo', logo: 'VIA CARGO DOMICILIO' },
  { id: 'ALL', label: 'Todos', countKey: 'all' },
];

const TITLE: Record<EnviosCarrierFilter, string> = {
  ALL: 'Todos',
  CORREO_ARGENTINO: 'Correo Argentino',
  ANDREANI: 'Andreani',
  VIA_CARGO: 'Via Cargo',
};

const TITLE_LOGO: Partial<Record<EnviosCarrierFilter, string>> = {
  CORREO_ARGENTINO: 'CORREO ARGENTINO DOMICILIO',
  ANDREANI: 'ANDREANI DOMICILIO',
  VIA_CARGO: 'VIA CARGO DOMICILIO',
};

const SUBTITLE: Record<EnviosCarrierFilter, string> = {
  ALL: 'Las tres colas en una vista. Las secciones vacías quedan plegadas.',
  CORREO_ARGENTINO: 'Al confirmar datos se sube a MiCorreo. El CSV es solo para Hacer Etiqueta.',
  ANDREANI: 'Pool, etiquetas del portal y PDF de despacho.',
  VIA_CARGO: 'Pedidos Via Cargo listos para despachar.',
};

export function EnviosHeader({
  carrierFilter,
  counts,
  showCsvButton = false,
  csvCount = 0,
  isGeneratingCsv = false,
  onGenerateCsv,
  micorreoBusy = false,
  micorreoQueueSize = 0,
}: EnviosHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="sticky top-0 z-20 border-b bg-background/90 px-5 py-3 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-0.5 h-8 w-8 shrink-0"
            onClick={() => navigate('/envios')}
            title="Volver a elegir flujo"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Envíos</p>
            <h1 className="flex items-center gap-2 text-xl font-semibold leading-tight">
              {TITLE_LOGO[carrierFilter] ? (
                <SvgIcon name={TITLE_LOGO[carrierFilter]!} size={22} className="h-6 w-6 object-contain" />
              ) : null}
              {TITLE[carrierFilter]}
            </h1>
            <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">{SUBTITLE[carrierFilter]}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showCsvButton ? (
            <Button
              onClick={onGenerateCsv}
              disabled={!csvCount || isGeneratingCsv}
              size="sm"
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap gap-1 rounded-full border border-border bg-card p-1">
          {FILTERS.map((filter) => {
            const active = carrierFilter === filter.id;
            const count = counts[filter.countKey];
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => navigate(ENVIOS_CARRIER_PATH[filter.id])}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                )}
              >
                {filter.logo ? (
                  <SvgIcon name={filter.logo} size={16} className="h-4 w-4 object-contain" />
                ) : null}
                {filter.label}
                <span className={cn('tabular-nums', active ? 'opacity-80' : 'opacity-70')}>{count}</span>
              </button>
            );
          })}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => navigate('/envios/historial')}
        >
          <History className="mr-1.5 h-3.5 w-3.5" />
          Historial
        </Button>
      </div>
    </div>
  );
}
