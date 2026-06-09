import type { ReactNode } from 'react';
import { ExternalLink, MessageCircle, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type {
  AnalyticsSummary,
  ClienteWebRow,
  ContactoSinMuestraRow,
  MockupSinCompraRow,
  OrdenSeguimientoRow,
} from '@/lib/comercial/types';
import {
  ETAPA_LABELS,
  MATERIAL_LABELS,
  PAGO_ESTADO_LABELS,
  PRIORIDAD_LABELS,
  formatArs,
  formatShortDate,
  whatsAppUrl,
} from '@/lib/comercial/utils';
import { ExcludeButton } from '@/components/comercial/ComercialExcludeDialog';
import { useMemo, useState } from 'react';

function PrioridadBadge({ prioridad }: { prioridad: 'caliente' | 'tibio' | 'frio' }) {
  const variant =
    prioridad === 'caliente' ? 'destructive' : prioridad === 'tibio' ? 'default' : 'secondary';
  return <Badge variant={variant}>{PRIORIDAD_LABELS[prioridad]}</Badge>;
}

function EtapaBadge({ etapa }: { etapa: ClienteWebRow['etapa'] }) {
  return <Badge variant="outline">{ETAPA_LABELS[etapa]}</Badge>;
}

function ActionButtons({
  telefono,
  url,
  onExclude,
}: {
  telefono: string | null | undefined;
  url?: string | null;
  onExclude?: () => void;
}) {
  const wa = whatsAppUrl(telefono);
  return (
    <div className="flex items-center justify-end gap-1">
      {onExclude ? <ExcludeButton onClick={onExclude} /> : null}
      {wa ? (
        <Button variant="ghost" size="icon" className="size-8" asChild>
          <a href={wa} target="_blank" rel="noopener noreferrer" title="WhatsApp">
            <MessageCircle className="size-4 text-green-600" />
          </a>
        </Button>
      ) : null}
      {url ? (
        <Button variant="ghost" size="icon" className="size-8" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer" title="Ver archivo">
            <ExternalLink className="size-4" />
          </a>
        </Button>
      ) : null}
    </div>
  );
}

function SectionTable({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description?: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          <Badge variant="secondary">{count}</Badge>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">{children}</CardContent>
    </Card>
  );
}

export function MockupsSinCompraTable({
  rows,
  onOpenCliente,
  onExclude,
}: {
  rows: MockupSinCompraRow[];
  onOpenCliente?: (clienteId: string, meta?: { nombre?: string; telefono?: string | null }) => void;
  onExclude?: (mockupId: string, label: string) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.nombre.toLowerCase().includes(q) ||
        (r.telefono ?? '').includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        r.material.includes(q),
    );
  }, [rows, query]);

  return (
    <SectionTable
      title="Muestras sin compra"
      description="Mockups listos o en revisión sin orden vinculada — candidatos a remarketing."
      count={filtered.length}
    >
      <div className="border-b px-4 py-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, teléfono..."
            className="pl-9"
          />
        </div>
      </div>
      <table className="w-full min-w-[880px] text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3">Fecha</th>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Material</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3">Cotización</th>
            <th className="px-4 py-3">Días</th>
            <th className="px-4 py-3">Prioridad</th>
            <th className="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                No hay mockups sin compra en este filtro.
              </td>
            </tr>
          ) : (
            filtered.map((row) => (
              <tr key={row.mockupId} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3 whitespace-nowrap">{formatShortDate(row.createdAt)}</td>
                <td className="px-4 py-3">
                  {row.clienteId && onOpenCliente ? (
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() =>
                        onOpenCliente?.(row.clienteId!, {
                          nombre: row.nombre,
                          telefono: row.telefono ?? row.whatsapp,
                        })
                      }
                    >
                      {row.nombre}
                    </button>
                  ) : (
                    <span className="font-medium">{row.nombre}</span>
                  )}
                  <p className="text-xs text-muted-foreground">{row.telefono ?? row.whatsapp ?? '—'}</p>
                </td>
                <td className="px-4 py-3">{MATERIAL_LABELS[row.material] ?? row.material}</td>
                <td className="px-4 py-3 capitalize">{row.estado.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3">{formatArs(row.cotizacionEstimada)}</td>
                <td className="px-4 py-3">
                  <span className={row.diasSinCompra >= 7 ? 'font-semibold text-destructive' : ''}>
                    {row.diasSinCompra}d
                  </span>
                </td>
                <td className="px-4 py-3">
                  <PrioridadBadge prioridad={row.prioridad} />
                </td>
                <td className="px-4 py-3">
                  <ActionButtons
                    telefono={row.telefono ?? row.whatsapp}
                    url={row.mockupCueroUrl || row.mockupMaderaUrl}
                    onExclude={onExclude ? () => onExclude(row.mockupId, row.nombre) : undefined}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </SectionTable>
  );
}

export function OrdenesSeguimientoTable({
  rows,
  onOpenCliente,
  onExclude,
}: {
  rows: OrdenSeguimientoRow[];
  onOpenCliente?: (clienteId: string, meta?: { nombre?: string; telefono?: string | null }) => void;
  onExclude?: (ordenId: string, label: string) => void;
}) {
  return (
    <SectionTable
      title="Pagos pendientes"
      description="Checkouts confirmados sin pago cerrado — reintentar tarjeta o pedir comprobante."
      count={rows.length}
    >
      <table className="w-full min-w-[920px] text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3">Fecha</th>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Estado pago</th>
            <th className="px-4 py-3">Método</th>
            <th className="px-4 py-3">Total</th>
            <th className="px-4 py-3">Comprobante</th>
            <th className="px-4 py-3">Días</th>
            <th className="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                No hay pedidos con pago pendiente.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.ordenId} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3 whitespace-nowrap">{formatShortDate(row.createdAt)}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() =>
                      onOpenCliente?.(row.clienteId, {
                        nombre: row.nombre,
                        telefono: row.telefono,
                      })
                    }
                  >
                    {row.nombre}
                  </button>
                  <p className="text-xs text-muted-foreground">{row.telefono ?? '—'}</p>
                  {row.pagoErrorMensaje ? (
                    <p className="text-xs text-destructive">{row.pagoErrorMensaje}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={row.estadoPagoWeb === 'pago_fallido' ? 'destructive' : 'secondary'}>
                    {PAGO_ESTADO_LABELS[row.estadoPagoWeb] ?? row.estadoPagoWeb}
                  </Badge>
                </td>
                <td className="px-4 py-3">{row.metodoPago ?? '—'}</td>
                <td className="px-4 py-3">{formatArs(row.valorTotal)}</td>
                <td className="px-4 py-3">{row.comprobanteSubido ? 'Sí' : 'No'}</td>
                <td className="px-4 py-3">{row.diasPendiente}d</td>
                <td className="px-4 py-3">
                  <ActionButtons
                    telefono={row.telefono}
                    url={row.comprobanteUrl}
                    onExclude={onExclude ? () => onExclude(row.ordenId, row.nombre) : undefined}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </SectionTable>
  );
}

export function ContactosSinMuestraTable({
  rows,
  onOpenCliente,
  onExclude,
}: {
  rows: ContactoSinMuestraRow[];
  onOpenCliente?: (clienteId: string, meta?: { nombre?: string; telefono?: string | null }) => void;
  onExclude?: (clienteId: string, label: string) => void;
}) {
  return (
    <SectionTable
      title="Contacto sin muestra"
      description="Dejaron datos en la web pero aún no pidieron mockup."
      count={rows.length}
    >
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3">Fecha contacto</th>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Días</th>
            <th className="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                No hay contactos sin muestra en el período.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.clienteId} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3">{formatShortDate(row.createdAt)}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() =>
                      onOpenCliente?.(row.clienteId, {
                        nombre: row.nombre,
                        telefono: row.telefono,
                      })
                    }
                  >
                    {row.nombre}
                  </button>
                  <p className="text-xs text-muted-foreground">{row.telefono}</p>
                </td>
                <td className="px-4 py-3">{row.email ?? '—'}</td>
                <td className="px-4 py-3">{row.diasDesdeContacto}d</td>
                <td className="px-4 py-3">
                  <ActionButtons
                    telefono={row.telefono}
                    onExclude={onExclude ? () => onExclude(row.clienteId, row.nombre) : undefined}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </SectionTable>
  );
}

export function ClientesWebTable({
  rows,
  onOpenCliente,
  onExclude,
}: {
  rows: ClienteWebRow[];
  onOpenCliente: (clienteId: string, meta?: { nombre?: string; telefono?: string | null }) => void;
  onExclude?: (clienteId: string, label: string) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.nombre.toLowerCase().includes(q) ||
        r.telefono.includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        ETAPA_LABELS[r.etapa].toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <SectionTable
      title="Directorio de clientes web"
      description="Personas con contacto web y su etapa actual en el embudo."
      count={filtered.length}
    >
      <div className="border-b px-4 py-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente..."
            className="pl-9"
          />
        </div>
      </div>
      <table className="w-full min-w-[880px] text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Etapa</th>
            <th className="px-4 py-3">Mockups</th>
            <th className="px-4 py-3">Compras</th>
            <th className="px-4 py-3">Valor total</th>
            <th className="px-4 py-3">Última actividad</th>
            <th className="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                Sin clientes web para mostrar.
              </td>
            </tr>
          ) : (
            filtered.map((row) => (
              <tr key={row.clienteId} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() =>
                      onOpenCliente(row.clienteId, { nombre: row.nombre, telefono: row.telefono })
                    }
                  >
                    {row.nombre}
                  </button>
                  <p className="text-xs text-muted-foreground">{row.telefono}</p>
                </td>
                <td className="px-4 py-3">
                  <EtapaBadge etapa={row.etapa} />
                </td>
                <td className="px-4 py-3">{row.mockupsCount}</td>
                <td className="px-4 py-3">{row.ordenesPagadasCount}</td>
                <td className="px-4 py-3">{formatArs(row.valorTotalCompras)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {row.ultimaActividad ? formatShortDate(row.ultimaActividad) : '—'}
                </td>
                <td className="px-4 py-3">
                  <ActionButtons
                    telefono={row.telefono}
                    onExclude={onExclude ? () => onExclude(row.clienteId, row.nombre) : undefined}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </SectionTable>
  );
}

export function TrafficPanel({ analytics }: { analytics: AnalyticsSummary }) {
  if (!analytics.available) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tráfico web</CardTitle>
          <CardDescription>
            {analytics.unavailableReason ??
              'Los eventos de analytics no están disponibles todavía.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Cuando la tabla <code className="rounded bg-muted px-1">web_analytics_events</code> esté activa en
            Supabase, acá vas a ver páginas más visitadas, UTMs y conversiones anónimas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Page views</CardDescription>
            <CardTitle className="text-2xl">{analytics.pageViews}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Clicks WhatsApp</CardDescription>
            <CardTitle className="text-2xl">{analytics.whatsappClicks}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Formularios enviados</CardDescription>
            <CardTitle className="text-2xl">{analytics.leadFormSubmits}</CardTitle>
            <CardDescription>
              Inicios: {analytics.leadFormStarts}
              {analytics.leadFormStarts > 0
                ? ` · ${((analytics.leadFormSubmits / analytics.leadFormStarts) * 100).toFixed(0)}% conversión`
                : ''}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Páginas más visitadas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {analytics.topPages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin page views en el período.</p>
            ) : (
              analytics.topPages.map((p) => (
                <div key={p.path} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{p.path}</span>
                  <Badge variant="secondary">{p.count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top campañas (UTM)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {analytics.topUtms.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin UTMs registradas.</p>
            ) : (
              analytics.topUtms.map((u) => (
                <div key={`${u.source}-${u.campaign}`} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0 truncate">
                    <span className="font-medium">{u.source}</span>
                    <span className="text-muted-foreground"> · {u.campaign}</span>
                  </div>
                  <Badge variant="secondary">{u.count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eventos recientes</CardTitle>
          <CardDescription>Últimos eventos anónimos registrados.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Evento</th>
                <th className="px-4 py-3">Página</th>
                <th className="px-4 py-3">UTM</th>
              </tr>
            </thead>
            <tbody>
              {analytics.recentEvents.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    Sin eventos recientes.
                  </td>
                </tr>
              ) : (
                analytics.recentEvents.map((ev) => (
                  <tr key={ev.id} className="border-b last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap">{formatShortDate(ev.createdAt)}</td>
                    <td className="px-4 py-3">{ev.eventType}</td>
                    <td className="px-4 py-3">{ev.pagePath ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {[ev.utmSource, ev.utmCampaign].filter(Boolean).join(' / ') || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
