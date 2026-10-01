import type { ReactNode } from 'react';
import { FileImage, FileText, FileType2, ImageIcon, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { ErroresMetricas } from '@/lib/supabase/services/errores.service';
import { monthKeyLabel } from '@/lib/utils/argentinaDate';

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(n >= 0.1 ? 0 : 1)}%`;
}

const panelClass =
  'rounded-2xl border border-white/10 bg-card/50 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]';

export function ErroresMetricCards({
  metricas,
  loading,
  onFilterMotivo,
  onFilterSinDescripcion,
  activeMotivo,
  sinDescripcionActivo,
}: {
  metricas: ErroresMetricas | null;
  loading?: boolean;
  onFilterMotivo?: (motivo: string | null) => void;
  onFilterSinDescripcion?: () => void;
  activeMotivo?: string | null;
  sinDescripcionActivo?: boolean;
}) {
  if (loading && !metricas) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[88px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
        ))}
      </div>
    );
  }

  if (!metricas) return null;

  if (metricas.totalEnPeriodo === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-zinc-950/40 px-4 py-10 text-center text-sm text-muted-foreground">
        No hay rehaceres en este período. Cuando marques uno, aparece acá con motivo y archivos.
      </div>
    );
  }

  const topMotivo = metricas.porMotivo[0];
  const maxMes = Math.max(...metricas.porMes.map((m) => m.count), 1);
  const maxUser = Math.max(...metricas.porUsuario.map((u) => u.count), 1);
  const origenTotal = metricas.internos + metricas.externos + metricas.otros;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Rehaceres"
          value={String(metricas.totalEnPeriodo)}
          hint={
            metricas.tasaVsItems != null
              ? `${pct(metricas.tasaVsItems)} de ${metricas.itemsSelloEnPeriodo} sellos`
              : undefined
          }
        />
        <MetricCard
          label="Sin descripción"
          value={String(metricas.sinDescripcion)}
          hint={
            metricas.sinDescripcion > 0
              ? `${pct(metricas.sinDescripcion / metricas.totalEnPeriodo)} — filtrar`
              : 'Completas'
          }
          tone={metricas.sinDescripcion > 0 ? 'warn' : 'ok'}
          onClick={
            metricas.sinDescripcion > 0 && onFilterSinDescripcion
              ? onFilterSinDescripcion
              : undefined
          }
          active={sinDescripcionActivo}
          icon={<FileText className="h-3.5 w-3.5" />}
        />
        <MetricCard
          label="Motivo top"
          value={topMotivo ? topMotivo.label : '—'}
          hint={topMotivo ? `${topMotivo.count} · ${pct(topMotivo.pct)}` : undefined}
          onClick={
            topMotivo && onFilterMotivo ? () => onFilterMotivo(topMotivo.motivo) : undefined
          }
          active={Boolean(topMotivo && activeMotivo === topMotivo.motivo)}
        />
        <MetricCard
          label="Origen"
          value={`${metricas.internos} / ${metricas.externos}`}
          hint="Taller · Cliente/envío"
          extra={
            origenTotal > 0 ? (
              <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-white/10">
                {metricas.internos > 0 ? (
                  <div
                    className="h-full bg-zinc-200"
                    style={{ width: `${(metricas.internos / origenTotal) * 100}%` }}
                    title={`Taller: ${metricas.internos}`}
                  />
                ) : null}
                {metricas.externos > 0 ? (
                  <div
                    className="h-full bg-sky-400/70"
                    style={{ width: `${(metricas.externos / origenTotal) * 100}%` }}
                    title={`Cliente/envío: ${metricas.externos}`}
                  />
                ) : null}
                {metricas.otros > 0 ? (
                  <div
                    className="h-full bg-white/25"
                    style={{ width: `${(metricas.otros / origenTotal) * 100}%` }}
                    title={`Otro: ${metricas.otros}`}
                  />
                ) : null}
              </div>
            ) : null
          }
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {metricas.porMotivo.length > 0 ? (
          <div className={panelClass}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                Por motivo
              </p>
              {activeMotivo && onFilterMotivo ? (
                <button
                  type="button"
                  className="text-[11px] text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
                  onClick={() => onFilterMotivo(null)}
                >
                  Limpiar
                </button>
              ) : null}
            </div>
            <div className="space-y-2.5">
              {metricas.porMotivo.map((m) => (
                <button
                  key={m.motivo}
                  type="button"
                  className={cn(
                    'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-xl px-2 py-1.5 text-left transition-colors',
                    'hover:bg-white/[0.04]',
                    activeMotivo === m.motivo && 'bg-white/[0.06] ring-1 ring-white/15',
                  )}
                  onClick={() => onFilterMotivo?.(m.motivo)}
                  title={`Filtrar por ${m.label}`}
                >
                  <span className="truncate text-[13px] text-zinc-100">{m.label}</span>
                  <span className="shrink-0 text-[12px] tabular-nums text-zinc-500">
                    {m.count}
                    <span className="ml-1.5 text-zinc-600">{pct(m.pct)}</span>
                  </span>
                  <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-zinc-300/80"
                      style={{ width: `${Math.max(m.pct * 100, 3)}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {metricas.porMes.length > 0 ? (
            <div className={panelClass}>
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                Por mes
              </p>
              <div className="flex h-[108px] items-end gap-2">
                {metricas.porMes.map((m) => {
                  const h = Math.max((m.count / maxMes) * 100, 10);
                  return (
                    <div
                      key={m.monthKey}
                      className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
                      title={`${monthKeyLabel(m.monthKey)}: ${m.count}`}
                    >
                      <span className="text-[11px] font-medium tabular-nums text-zinc-300">
                        {m.count}
                      </span>
                      <div className="relative flex h-16 w-full max-w-[40px] items-end">
                        <div className="absolute inset-0 rounded-md bg-white/[0.04]" />
                        <div
                          className="relative w-full rounded-md bg-zinc-200/85"
                          style={{ height: `${h}%` }}
                        />
                      </div>
                      <span className="truncate text-[10px] text-zinc-500">
                        {monthKeyLabel(m.monthKey)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {metricas.porUsuario.length > 0 ? (
            <div className={panelClass}>
              <p className="mb-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                <UserRound className="h-3.5 w-3.5" />
                Quién marcó
              </p>
              <ul className="space-y-2.5">
                {metricas.porUsuario.map((u) => (
                  <li key={u.userId} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="truncate text-zinc-200">{u.nombre}</span>
                      <span className="tabular-nums text-zinc-500">{u.count}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-white/45"
                        style={{ width: `${Math.max((u.count / maxUser) * 100, 6)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5 text-[11px] text-zinc-500">
        <span>
          Cobro al cliente: <span className="text-zinc-400">{metricas.conCobro}</span>
        </span>
        <span className="text-zinc-700">·</span>
        <span>
          Evidencia: {metricas.conSnapshotBase} base · {metricas.conSnapshotVector} vector
          {metricas.totalEnPeriodo > metricas.conSnapshotVector
            ? ` (${metricas.totalEnPeriodo - metricas.conSnapshotVector} sin snapshot)`
            : ''}
        </span>
        <span className="text-zinc-700">·</span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-200" /> Taller
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400/70" /> Cliente/envío
          </span>
        </span>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  onClick,
  active,
  tone,
  extra,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  tone?: 'warn' | 'ok';
  extra?: ReactNode;
}) {
  const className = cn(
    panelClass,
    'text-left transition-colors',
    onClick && 'cursor-pointer hover:border-white/20 hover:bg-white/[0.03]',
    active && 'border-amber-500/35 bg-amber-500/[0.06]',
    tone === 'warn' && !active && 'border-amber-500/25',
  );

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</p>
        {icon ? <span className="text-zinc-500">{icon}</span> : null}
      </div>
      <p
        className={cn(
          'mt-1.5 text-[22px] font-semibold leading-none tracking-tight text-zinc-50',
          value.length > 22 && 'text-base leading-snug',
          tone === 'warn' && Number(value) > 0 && 'text-amber-300',
          tone === 'ok' && value === '0' && 'text-emerald-300/90',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">{hint}</p> : null}
      {extra}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}

export function SnapshotFlags({
  hasBase,
  hasVector,
  hasFoto,
}: {
  hasBase: boolean;
  hasVector: boolean;
  hasFoto: boolean;
}) {
  const Item = ({
    on,
    title,
    children,
  }: {
    on: boolean;
    title: string;
    children: ReactNode;
  }) => (
    <span
      title={title}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-md border',
        on
          ? 'border-white/15 bg-white/[0.06] text-zinc-200'
          : 'border-transparent text-zinc-700',
      )}
    >
      {children}
    </span>
  );

  return (
    <div className="flex items-center gap-1">
      <Item on={hasBase} title={hasBase ? 'Base congelada' : 'Sin base'}>
        <FileImage className="h-3.5 w-3.5" />
      </Item>
      <Item on={hasVector} title={hasVector ? 'Vector congelado' : 'Sin vector'}>
        <FileType2 className="h-3.5 w-3.5" />
      </Item>
      <Item on={hasFoto} title={hasFoto ? 'Foto previa' : 'Sin foto'}>
        <ImageIcon className="h-3.5 w-3.5" />
      </Item>
    </div>
  );
}
