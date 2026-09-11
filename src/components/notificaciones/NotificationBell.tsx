import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Bell,
  BellOff,
  CheckCheck,
  Clock,
  PackageX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils/cn';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { formatRelativeEs } from '@/lib/notificaciones/format';
import {
  AREA_LABELS,
  AUTO_TIPOS,
  type AppArea,
  type NotificacionItem,
  type NotificacionTab,
} from '@/lib/notificaciones/types';

function systemIconFor(tipo: string): LucideIcon {
  if (tipo.startsWith('p4_') || tipo.startsWith('l2_')) return Clock;
  if (tipo === 'p6_stock_bajo') return PackageX;
  if (tipo === 'v4_deudor') return AlertCircle;
  return Bell;
}

function highlightTitle(item: NotificacionItem): ReactNode {
  const highlights = [
    item.autorNombre,
    item.metadata.clienteNombre,
    item.metadata.diseno,
    item.metadata.itemNombre,
  ].filter((v): v is string => Boolean(v && v.trim()));

  if (item.tipo === 't1_tarea_asignada' && item.autorNombre) {
    return (
      <>
        <span className="font-semibold text-white">{item.autorNombre}</span>
        {' te asignó: '}
        <span className="font-semibold text-white">{item.metadata.itemNombre || item.titulo}</span>
      </>
    );
  }

  if (!highlights.length) {
    return item.titulo;
  }

  const escaped = highlights.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'g');
  const parts = item.titulo.split(re);
  return parts.map((part, i) =>
    highlights.includes(part) ? (
      <span key={`${part}-${i}`} className="font-semibold text-white">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function NotificationRow({
  item,
  onSelect,
}: {
  item: NotificacionItem;
  onSelect: (item: NotificacionItem) => void;
}) {
  const unread = !item.leidaAt;
  const isAuto = !item.autorId || AUTO_TIPOS.has(item.tipo);
  const SystemIcon = systemIconFor(item.tipo);
  const severityBorder =
    item.severidad === 'urgent'
      ? 'border-l-red-500'
      : item.severidad === 'warning'
        ? 'border-l-amber-400'
        : 'border-l-transparent';

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={cn(
        'flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors duration-150',
        'hover:bg-white/[0.04]',
        severityBorder,
        item.isNew && 'animate-in fade-in-0 slide-in-from-top-1 duration-200 bg-white/[0.06]',
      )}
    >
      {isAuto ? (
        <Avatar icon={SystemIcon} />
      ) : (
        <Avatar name={item.autorNombre} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white/90 leading-snug">{highlightTitle(item)}</p>
        {item.cuerpo ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.cuerpo}</p>
        ) : null}
        <p className="mt-1 text-[11px] text-muted-foreground/70">{formatRelativeEs(item.createdAt)}</p>
      </div>
      <span
        className={cn(
          'mt-1 h-2 w-2 shrink-0 rounded-full bg-white transition-opacity duration-200',
          unread ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden
      />
    </button>
  );
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<NotificacionTab>('todas');
  const { items, loading, unreadCount, unreadByArea, badgePulse, markRead, markAllRead } =
    useNotifications();

  const visible = useMemo(() => {
    if (tab === 'todas') return items;
    return items.filter((i) => i.area === tab);
  }, [items, tab]);

  const unreadInTab =
    tab === 'todas' ? unreadCount : unreadByArea[tab];

  const handleSelect = async (item: NotificacionItem) => {
    await markRead(item.destinatarioId);
    setOpen(false);
    if (item.linkPath) navigate(item.linkPath);
  };

  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Notificaciones"
          className={cn(
            'fixed bottom-6 right-6 z-50 flex h-[52px] w-[52px] items-center justify-center md:bottom-8 md:right-8',
            'rounded-full border border-white/10',
            'bg-gradient-to-br from-zinc-900/95 via-black/70 to-black/95',
            'shadow-[0_12px_30px_-8px_rgba(0,0,0,0.85)] backdrop-blur-sm',
            'transition-transform duration-200 hover:scale-105 hover:bg-white/[0.06]',
          )}
        >
          <Bell className="h-5 w-5 text-white" strokeWidth={1.75} />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center">
              {badgePulse ? (
                <span className="absolute inset-0 rounded-full bg-red-500 animate-ping" />
              ) : null}
              <span className="relative flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold tabular-nums text-white">
                {badgeLabel}
              </span>
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={12}
        className={cn(
          'w-[380px] max-h-[70vh] overflow-hidden p-0',
          'rounded-[20px] border border-white/10',
          'bg-gradient-to-br from-zinc-900/95 via-black/70 to-black/95',
          'shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-sm text-white',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2',
          'data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          'data-[state=open]:duration-200 data-[state=closed]:duration-150',
          'ease-[cubic-bezier(0.16,1,0.3,1)]',
        )}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
          <h2 className="text-sm font-semibold tracking-tight text-white">Notificaciones</h2>
          <button
            type="button"
            disabled={unreadInTab <= 0}
            onClick={() => void markAllRead(tab === 'todas' ? null : tab)}
            className={cn(
              'inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors',
              unreadInTab > 0 ? 'hover:text-white' : 'opacity-40 pointer-events-none',
            )}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Marcar todas como leídas
          </button>
        </div>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as NotificacionTab)}
          className="px-3"
        >
          <TabsList className="mb-1 h-auto w-full justify-start gap-1 bg-transparent p-0">
            {(
              [
                ['todas', 'Todas'],
                ['produccion', AREA_LABELS.produccion],
                ['logistica', AREA_LABELS.logistica],
                ['ventas', AREA_LABELS.ventas],
              ] as const
            ).map(([id, label]) => {
              const count = id === 'todas' ? unreadCount : unreadByArea[id as AppArea];
              return (
                <TabsTrigger
                  key={id}
                  value={id}
                  className={cn(
                    'rounded-lg px-2 py-1 text-[11px] uppercase tracking-wide',
                    'text-muted-foreground data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-none',
                  )}
                >
                  {label}
                  {count > 0 ? (
                    <span className="ml-1 tabular-nums text-[10px] text-white/70">{count}</span>
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
        <div className="border-b border-white/[0.06]" />

        <div className="max-h-[min(420px,calc(70vh-110px))] divide-y divide-white/[0.06] overflow-y-auto">
          {loading ? (
            <div className="space-y-0">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3">
                  <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-white/[0.04]" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-3 w-4/5 animate-pulse rounded bg-white/[0.04]" />
                    <div className="h-3 w-2/5 animate-pulse rounded bg-white/[0.04]" />
                  </div>
                </div>
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <BellOff className="h-10 w-10 text-white/20" strokeWidth={1.25} />
              <p className="text-sm text-muted-foreground">
                {tab === 'todas'
                  ? 'Estás al día'
                  : `No hay notificaciones en ${AREA_LABELS[tab]}`}
              </p>
            </div>
          ) : (
            visible.map((item) => (
              <NotificationRow key={item.destinatarioId} item={item} onSelect={handleSelect} />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
