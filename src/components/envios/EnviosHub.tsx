import { useNavigate } from 'react-router-dom';
import { History, LayoutGrid, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { SvgIcon } from '@/components/ui/SvgIcon';
import { ENVIOS_CARRIER_PATH } from '@/components/envios/enviosRoutes';

type CarrierCount = {
  correo: number;
  andreani: number;
  viaCargo: number;
  all: number;
};

type HubCard = {
  id: string;
  title: string;
  description: string;
  path: string;
  count?: number;
  logo?: string;
  icon?: LucideIcon;
  /** Color de marca, solo raya + logo. Las cards quedan oscuras como el resto de la app. */
  accent?: string;
};

interface EnviosHubProps {
  counts: CarrierCount;
  loading?: boolean;
}

export function EnviosHub({ counts, loading = false }: EnviosHubProps) {
  const navigate = useNavigate();

  const cards: HubCard[] = [
    {
      id: 'correo',
      title: 'Correo Argentino',
      description: 'Datos de envío, MiCorreo y CSV de respaldo.',
      path: ENVIOS_CARRIER_PATH.CORREO_ARGENTINO,
      count: counts.correo,
      logo: 'CORREO ARGENTINO DOMICILIO',
      accent: '#C7B830',
    },
    {
      id: 'andreani',
      title: 'Andreani',
      description: 'Pool de links, etiquetas y PDF de despacho.',
      path: ENVIOS_CARRIER_PATH.ANDREANI,
      count: counts.andreani,
      logo: 'ANDREANI DOMICILIO',
      accent: '#C4454A',
    },
    {
      id: 'via-cargo',
      title: 'Via Cargo',
      description: 'Pedidos listos para despachar por Via Cargo.',
      path: ENVIOS_CARRIER_PATH.VIA_CARGO,
      count: counts.viaCargo,
      logo: 'VIA CARGO DOMICILIO',
      accent: '#5B843B',
    },
    {
      id: 'todos',
      title: 'Todos',
      description: 'Las tres colas juntas. Útil para un pantallazo.',
      path: ENVIOS_CARRIER_PATH.ALL,
      count: counts.all,
      icon: LayoutGrid,
    },
    {
      id: 'historial',
      title: 'Historial',
      description: 'Pedidos ya despachados, con seguimiento enviado.',
      path: '/envios/historial',
      icon: History,
    },
  ];

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Envíos</h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Elegí un flujo. Así no se abre todo junto ni se llenan tablas vacías.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((card) => {
            const Icon = card.icon;
            const hasCount = typeof card.count === 'number';
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => navigate(card.path)}
                className={cn(
                  'group relative flex items-start gap-3.5 overflow-hidden rounded-2xl border border-white/10 bg-card/50 p-4 text-left',
                  'transition hover:border-white/20 hover:bg-white/[0.03]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  card.id === 'historial' ? 'sm:col-span-2' : '',
                )}
              >
                {card.accent ? (
                  <span
                    aria-hidden
                    className="absolute inset-y-3 left-0 w-0.5 rounded-full"
                    style={{ backgroundColor: card.accent }}
                  />
                ) : null}
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                  {card.logo ? (
                    <SvgIcon name={card.logo} size={28} className="h-7 w-7 object-contain" />
                  ) : Icon ? (
                    <Icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                  ) : null}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-sm font-semibold">{card.title}</h2>
                    {hasCount ? (
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {loading ? '—' : card.count}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{card.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
