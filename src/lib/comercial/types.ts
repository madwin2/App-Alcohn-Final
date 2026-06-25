export type ComercialOrigenFilter = 'all' | 'web' | 'app';

export type ComercialDateRange = {
  from: Date;
  to: Date;
};

export type ComercialKpiKey =
  | 'visitantes'
  | 'sesiones'
  | 'contactos'
  | 'muestras'
  | 'checkouts'
  | 'ventas';

export type ComercialKpi = {
  key: ComercialKpiKey;
  label: string;
  value: number;
  previousValue: number;
  funnelPreviousValue?: number;
  stepLabel?: string;
};

export type FunnelStep = {
  key: string;
  label: string;
  value: number;
  color: string;
};

export type DailyTrendPoint = {
  date: string;
  visitantes: number;
  contactos: number;
  muestras: number;
  checkouts: number;
  ventas: number;
};

export type MaterialBreakdown = {
  material: string;
  count: number;
  ventas: number;
};

export type PaymentStatusBreakdown = {
  estado: string;
  label: string;
  count: number;
  color: string;
};

import type { ContactoComercialEstado } from '@/lib/comercial/contacto';

export type { ContactoComercialEstado };

export type MockupSinCompraRow = {
  mockupId: string;
  createdAt: string;
  estado: string;
  material: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  whatsapp: string | null;
  mockupCueroUrl: string | null;
  mockupMaderaUrl: string | null;
  cotizacionEstimada: number | null;
  diasSinCompra: number;
  checkoutIniciado: boolean;
  clienteId: string | null;
  prioridad: PotencialPrioridad;
  contactoComercialEstado: ContactoComercialEstado;
  contactoComercialEligibleAt: string | null;
  contactoComercialEnviadoAt: string | null;
};

export type OrdenSeguimientoRow = {
  ordenId: string;
  createdAt: string;
  estadoPagoWeb: string;
  metodoPago: string | null;
  valorTotal: number | null;
  /** Seña sugerida según checkout web (p. ej. $20.000). */
  seniaEsperada: number;
  seniaTotal: number | null;
  pagoErrorMensaje: string | null;
  comprobanteSubido: boolean;
  comprobanteUrl: string | null;
  webCheckoutRef: string | null;
  nombre: string;
  telefono: string | null;
  email: string | null;
  clienteId: string;
  diasPendiente: number;
  prioridad: PotencialPrioridad;
};

export type ContactoSinMuestraRow = {
  clienteId: string;
  createdAt: string;
  nombre: string;
  telefono: string;
  email: string | null;
  diasDesdeContacto: number;
  prioridad: PotencialPrioridad;
};

export type ClienteEtapa =
  | 'solo_contacto'
  | 'con_muestra'
  | 'checkout'
  | 'comprador'
  | 'recurrente';

export type PotencialPrioridad = 'caliente' | 'tibio' | 'frio';

export type ClienteWebRow = {
  clienteId: string;
  nombre: string;
  telefono: string;
  email: string | null;
  etapa: ClienteEtapa;
  mockupsCount: number;
  ordenesPagadasCount: number;
  ultimaActividad: string;
  valorTotalCompras: number;
};

export type ClienteSeguimientoResumen = {
  elegiblesCount: number;
  enviadosHoy: number;
  enviadosUltimos7Dias: number;
  enviadosUltimos30Dias: number;
  ultimoEnvioAt: string | null;
};

export type ClienteSeguimientoRow = {
  id: string;
  clienteId: string;
  ordenId: string;
  nombre: string;
  telefono: string;
  email: string | null;
  estado: 'enviado' | 'error';
  enviadoAt: string;
  enviadoPor: string;
  valorTotal: number | null;
  ordenFecha: string | null;
};

export type ClienteSeguimientoData = {
  available: boolean;
  unavailableReason?: string;
  resumen: ClienteSeguimientoResumen;
  historial: ClienteSeguimientoRow[];
};

export type TimelineEventKind =
  | 'contacto'
  | 'mockup'
  | 'checkout_inicio'
  | 'checkout_completo'
  | 'orden'
  | 'pago_ok'
  | 'pago_fallido';

export type ClienteTimelineEvent = {
  id: string;
  kind: TimelineEventKind;
  label: string;
  detail?: string;
  at: string;
  url?: string | null;
};

export type AnalyticsEventRow = {
  id: string;
  eventType: string;
  pagePath: string | null;
  createdAt: string;
  utmSource: string | null;
  utmCampaign: string | null;
  visitorId: string | null;
  sessionId: string | null;
};

export type AnalyticsSummary = {
  available: boolean;
  unavailableReason?: string;
  pageViews: number;
  uniqueVisitors: number;
  sessions: number;
  whatsappClicks: number;
  leadFormStarts: number;
  leadFormSubmits: number;
  topPages: Array<{ path: string; count: number }>;
  topUtms: Array<{ source: string; campaign: string; count: number }>;
  recentEvents: AnalyticsEventRow[];
};

export type ComercialDashboardData = {
  kpis: ComercialKpi[];
  funnel: FunnelStep[];
  dailyTrend: DailyTrendPoint[];
  materialBreakdown: MaterialBreakdown[];
  paymentBreakdown: PaymentStatusBreakdown[];
  mockupsSinCompra: MockupSinCompraRow[];
  ordenesSeguimiento: OrdenSeguimientoRow[];
  contactosSinMuestra: ContactoSinMuestraRow[];
  clientesWeb: ClienteWebRow[];
  seguimientosClientes: ClienteSeguimientoData;
  analytics: AnalyticsSummary;
  fetchedAt: string;
};
