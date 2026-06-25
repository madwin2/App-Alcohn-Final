import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, MessageCircle, Search, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type {
  AnalyticsSummary,
  ClienteWebRow,
  ClienteSeguimientoData,
  ContactoSinMuestraRow,
  MockupSinCompraRow,
  OrdenSeguimientoRow,
} from '@/lib/comercial/types';
import { contactoComercialEstadoLabel } from '@/lib/comercial/contacto';
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
import { ConfirmPagoButton } from '@/components/comercial/ComercialConfirmPagoDialog';
import { useEffect, useMemo, useState } from 'react';

const POTENCIALES_PAGE_SIZE = 10;

function PrioridadBadge({ prioridad }: { prioridad: 'caliente' | 'tibio' | 'frio' }) {
  const variant =
    prioridad === 'caliente' ? 'destructive' : prioridad === 'tibio' ? 'default' : 'secondary';
  return <Badge variant={variant}>{PRIORIDAD_LABELS[prioridad]}</Badge>;
}

function EtapaBadge({ etapa }: { etapa: ClienteWebRow['etapa'] }) {
  return <Badge variant="outline">{ETAPA_LABELS[etapa]}</Badge>;
}

function ContactoComercialBadge({ estado }: { estado: MockupSinCompraRow['contactoComercialEstado'] }) {
  const variant =
    estado === 'enviado' ? 'default' : estado === 'programado' ? 'secondary' : 'outline';
  return (
    <Badge variant={variant} className="whitespace-nowrap font-normal">
      {contactoComercialEstadoLabel(estado)}
    </Badge>
  );
}

function ActionButtons({
  telefono,
  url,
  onExclude,
  onSendContacto,
  sendingContacto,
  canSendContacto,
  onConfirmPago,
  confirmingPago,
}: {
  telefono: string | null | undefined;
  url?: string | null;
  onExclude?: () => void;
  onSendContacto?: () => void;
  sendingContacto?: boolean;
  canSendContacto?: boolean;
  onConfirmPago?: () => void;
  confirmingPago?: boolean;
}) {
  const wa = whatsAppUrl(telefono);
  return (
    <div className="flex items-center justify-end gap-1">
      {onConfirmPago ? (
        <ConfirmPagoButton onClick={onConfirmPago} loading={confirmingPago} />
      ) : null}
      {onExclude ? <ExcludeButton onClick={onExclude} /> : null}
      {canSendContacto && onSendContacto ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          title="Enviar mensaje comercial por WhatsApp"
          disabled={sendingContacto}
          onClick={onSendContacto}
        >
          {sendingContacto ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4 text-primary" />
          )}
        </Button>
      ) : null}
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

function PaginationFooter({
  page,
  totalPages,
  totalItems,
  firstVisible,
  lastVisible,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  firstVisible: number;
  lastVisible: number;
  onPageChange: (page: number) => void;
}) {
  if (totalItems <= POTENCIALES_PAGE_SIZE) return null;

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>
        Mostrando {firstVisible}-{lastVisible} de {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          <ChevronLeft className="mr-1 size-4" />
          Anterior
        </Button>
        <span className="min-w-20 text-center text-xs">
          Página {page} de {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
        >
          Siguiente
          <ChevronRight className="ml-1 size-4" />
        </Button>
      </div>
    </div>
  );
}

export function MockupsSinCompraTable({
  rows,
  onOpenCliente,
  onExclude,
  onSendContacto,
  sendingContactoId,
}: {
  rows: MockupSinCompraRow[];
  onOpenCliente?: (clienteId: string, meta?: { nombre?: string; telefono?: string | null }) => void;
  onExclude?: (mockupId: string, label: string) => void;
  onSendContacto?: (row: MockupSinCompraRow) => void;
  sendingContactoId?: string | null;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
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
  const totalPages = Math.max(1, Math.ceil(filtered.length / POTENCIALES_PAGE_SIZE));
  const visibleRows = useMemo(() => {
    const start = (page - 1) * POTENCIALES_PAGE_SIZE;
    return filtered.slice(start, start + POTENCIALES_PAGE_SIZE);
  }, [filtered, page]);
  const firstVisible = filtered.length === 0 ? 0 : (page - 1) * POTENCIALES_PAGE_SIZE + 1;
  const lastVisible = Math.min(page * POTENCIALES_PAGE_SIZE, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [query, rows]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <SectionTable
      title="Muestras sin compra"
      description="Mockups listos sin compra. El bot envía el saludo comercial ~10 min después de generar la muestra (si no compró). Podés forzar el envío con el ícono de avión."
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
            <th className="px-4 py-3">Contacto</th>
            <th className="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                No hay mockups sin compra en este filtro.
              </td>
            </tr>
          ) : (
            visibleRows.map((row) => (
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
                  <div className="flex flex-col gap-1">
                    <ContactoComercialBadge estado={row.contactoComercialEstado} />
                    {row.contactoComercialEstado === 'programado' && row.contactoComercialEligibleAt ? (
                      <span className="text-xs text-muted-foreground">
                        ~{formatShortDate(row.contactoComercialEligibleAt)}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <ActionButtons
                    telefono={row.telefono ?? row.whatsapp}
                    url={row.mockupCueroUrl || row.mockupMaderaUrl}
                    onExclude={onExclude ? () => onExclude(row.mockupId, row.nombre) : undefined}
                    onSendContacto={
                      onSendContacto && row.contactoComercialEstado !== 'enviado'
                        ? () => onSendContacto(row)
                        : undefined
                    }
                    sendingContacto={sendingContactoId === row.mockupId}
                    canSendContacto={
                      row.contactoComercialEstado !== 'enviado' &&
                      Boolean((row.telefono ?? row.whatsapp)?.trim())
                    }
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <PaginationFooter
        page={page}
        totalPages={totalPages}
        totalItems={filtered.length}
        firstVisible={firstVisible}
        lastVisible={lastVisible}
        onPageChange={setPage}
      />
    </SectionTable>
  );
}

export function OrdenesSeguimientoTable({
  rows,
  onOpenCliente,
  onExclude,
  onConfirmPago,
  confirmingOrdenId,
}: {
  rows: OrdenSeguimientoRow[];
  onOpenCliente?: (clienteId: string, meta?: { nombre?: string; telefono?: string | null }) => void;
  onExclude?: (ordenId: string, label: string) => void;
  onConfirmPago?: (row: OrdenSeguimientoRow) => void;
  confirmingOrdenId?: string | null;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / POTENCIALES_PAGE_SIZE));
  const visibleRows = useMemo(() => {
    const start = (page - 1) * POTENCIALES_PAGE_SIZE;
    return rows.slice(start, start + POTENCIALES_PAGE_SIZE);
  }, [rows, page]);
  const firstVisible = rows.length === 0 ? 0 : (page - 1) * POTENCIALES_PAGE_SIZE + 1;
  const lastVisible = Math.min(page * POTENCIALES_PAGE_SIZE, rows.length);

  useEffect(() => {
    setPage(1);
  }, [rows]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <SectionTable
      title="Pagos pendientes"
      description="Checkouts confirmados sin pago cerrado — validá el comprobante y confirmá para crear el pedido."
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
            visibleRows.map((row) => (
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
                    onConfirmPago={onConfirmPago ? () => onConfirmPago(row) : undefined}
                    confirmingPago={confirmingOrdenId === row.ordenId}
                    onExclude={onExclude ? () => onExclude(row.ordenId, row.nombre) : undefined}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <PaginationFooter
        page={page}
        totalPages={totalPages}
        totalItems={rows.length}
        firstVisible={firstVisible}
        lastVisible={lastVisible}
        onPageChange={setPage}
      />
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
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / POTENCIALES_PAGE_SIZE));
  const visibleRows = useMemo(() => {
    const start = (page - 1) * POTENCIALES_PAGE_SIZE;
    return rows.slice(start, start + POTENCIALES_PAGE_SIZE);
  }, [rows, page]);
  const firstVisible = rows.length === 0 ? 0 : (page - 1) * POTENCIALES_PAGE_SIZE + 1;
  const lastVisible = Math.min(page * POTENCIALES_PAGE_SIZE, rows.length);

  useEffect(() => {
    setPage(1);
  }, [rows]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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
            visibleRows.map((row) => (
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
      <PaginationFooter
        page={page}
        totalPages={totalPages}
        totalItems={rows.length}
        firstVisible={firstVisible}
        lastVisible={lastVisible}
        onPageChange={setPage}
      />
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

export function SeguimientosClientesPanel({
  data,
  onRunBatch,
  runningBatch,
}: {
  data: ClienteSeguimientoData;
  onRunBatch?: () => void;
  runningBatch?: boolean;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(data.historial.length / POTENCIALES_PAGE_SIZE));
  const visibleRows = useMemo(() => {
    const start = (page - 1) * POTENCIALES_PAGE_SIZE;
    return data.historial.slice(start, start + POTENCIALES_PAGE_SIZE);
  }, [data.historial, page]);
  const firstVisible = data.historial.length === 0 ? 0 : (page - 1) * POTENCIALES_PAGE_SIZE + 1;
  const lastVisible = Math.min(page * POTENCIALES_PAGE_SIZE, data.historial.length);

  useEffect(() => {
    setPage(1);
  }, [data.historial]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (!data.available) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seguimientos de Clientes</CardTitle>
          <CardDescription>
            {data.unavailableReason ?? 'La sección todavía no está activa en Supabase.'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Elegibles restantes</CardDescription>
            <CardTitle className="text-2xl">{data.resumen.elegiblesCount.toLocaleString('es-AR')}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Enviados hoy</CardDescription>
            <CardTitle className="text-2xl">{data.resumen.enviadosHoy.toLocaleString('es-AR')}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Últimos 7 días</CardDescription>
            <CardTitle className="text-2xl">
              {data.resumen.enviadosUltimos7Dias.toLocaleString('es-AR')}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Últimos 30 días</CardDescription>
            <CardTitle className="text-2xl">
              {data.resumen.enviadosUltimos30Dias.toLocaleString('es-AR')}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Próximo automático</CardDescription>
            <CardTitle className="text-base">Lun-vie 12:26</CardTitle>
            <CardDescription>Hora Argentina</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <SectionTable
        title="Historial de seguimientos"
        description="Se envían 10 clientes aleatorios por día hábil. El criterio vive en Supabase; acá solo vemos el historial reciente."
        count={data.historial.length}
      >
        <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Último envío:{' '}
            {data.resumen.ultimoEnvioAt ? formatShortDate(data.resumen.ultimoEnvioAt) : 'sin envíos todavía'}
          </p>
          {onRunBatch ? (
            <Button type="button" variant="outline" size="sm" onClick={onRunBatch} disabled={runningBatch}>
              {runningBatch ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
              Enviar lote ahora
            </Button>
          ) : null}
        </div>
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Fecha envío</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Pedido</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Origen</th>
            </tr>
          </thead>
          <tbody>
            {data.historial.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Todavía no hay seguimientos enviados.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 whitespace-nowrap">{formatShortDate(row.enviadoAt)}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{row.nombre}</span>
                    <p className="text-xs text-muted-foreground">{row.telefono}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs">{row.ordenId.slice(0, 8)}</span>
                    <p className="text-xs text-muted-foreground">
                      {row.ordenFecha ? formatShortDate(row.ordenFecha) : '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3">{formatArs(row.valorTotal)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={row.estado === 'error' ? 'destructive' : 'default'}>
                      {row.estado === 'error' ? 'Error' : 'Enviado'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 capitalize">{row.enviadoPor}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <PaginationFooter
          page={page}
          totalPages={totalPages}
          totalItems={data.historial.length}
          firstVisible={firstVisible}
          lastVisible={lastVisible}
          onPageChange={setPage}
        />
      </SectionTable>
    </div>
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
