export const APP_AREAS = ['produccion', 'logistica', 'ventas'] as const;

export type AppArea = (typeof APP_AREAS)[number];

export type NotificacionSeveridad = 'info' | 'warning' | 'urgent';

export type NotificacionTipo =
  | 'p1_sello_modificado'
  | 'p2_rehacer'
  | 'p3_prioridad'
  | 'p4_vencimiento_proximo'
  | 'p4_vencimiento_vencido'
  | 'p6_stock_bajo'
  | 'l1_direccion_post_etiqueta'
  | 'l1_etiqueta_duplicada'
  | 'l2_despacho_proximo'
  | 'l2_despacho_vencido'
  | 'v1_items_pedido_pagado'
  | 'v2_rehacer'
  | 'v3_sellos_hechos'
  | 'v4_deudor'
  | 't1_tarea_asignada';

export type NotificacionTab = 'todas' | AppArea;

export interface NotificacionMetadata {
  clienteNombre?: string;
  diseno?: string;
  ordenId?: string;
  campos?: string[];
  motivo?: string;
  itemNombre?: string;
  [key: string]: unknown;
}

export interface NotificacionItem {
  destinatarioId: string;
  notificacionId: string;
  tipo: NotificacionTipo | string;
  area: AppArea | null;
  autorId: string | null;
  autorNombre: string | null;
  titulo: string;
  cuerpo: string | null;
  entidadTipo: string | null;
  entidadId: string | null;
  linkPath: string | null;
  severidad: NotificacionSeveridad;
  metadata: NotificacionMetadata;
  createdAt: string;
  leidaAt: string | null;
  isNew?: boolean;
}

export const AREA_LABELS: Record<AppArea, string> = {
  produccion: 'Producción',
  logistica: 'Logística',
  ventas: 'Ventas',
};

export const AUTO_TIPOS = new Set<string>([
  'p4_vencimiento_proximo',
  'p4_vencimiento_vencido',
  'p6_stock_bajo',
  'l2_despacho_proximo',
  'l2_despacho_vencido',
  'v4_deudor',
]);
