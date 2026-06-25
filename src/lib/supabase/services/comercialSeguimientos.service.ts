import type {
  ClienteSeguimientoData,
  ClienteSeguimientoResumen,
  ClienteSeguimientoRow,
} from '@/lib/comercial/types';
import { supabase } from '../client';

const EMPTY_RESUMEN: ClienteSeguimientoResumen = {
  elegiblesCount: 0,
  enviadosHoy: 0,
  enviadosUltimos7Dias: 0,
  enviadosUltimos30Dias: 0,
  ultimoEnvioAt: null,
};

function unavailable(reason: string): ClienteSeguimientoData {
  return {
    available: false,
    unavailableReason: reason,
    resumen: EMPTY_RESUMEN,
    historial: [],
  };
}

function isMissingRelationError(error: { code?: string; message: string }): boolean {
  const msg = error.message.toLowerCase();
  return error.code === '42P01' || msg.includes('does not exist') || msg.includes('relation');
}

function mapResumen(row: Record<string, unknown> | null | undefined): ClienteSeguimientoResumen {
  if (!row) return EMPTY_RESUMEN;
  return {
    elegiblesCount: Number(row.elegibles_count ?? 0),
    enviadosHoy: Number(row.enviados_hoy ?? 0),
    enviadosUltimos7Dias: Number(row.enviados_ultimos_7_dias ?? 0),
    enviadosUltimos30Dias: Number(row.enviados_ultimos_30_dias ?? 0),
    ultimoEnvioAt: typeof row.ultimo_envio_at === 'string' ? row.ultimo_envio_at : null,
  };
}

function mapHistorial(row: Record<string, unknown>): ClienteSeguimientoRow {
  return {
    id: String(row.id),
    clienteId: String(row.cliente_id),
    ordenId: String(row.orden_id),
    nombre: String(row.nombre || 'Cliente'),
    telefono: String(row.telefono || ''),
    email: typeof row.mail === 'string' ? row.mail : null,
    estado: row.estado === 'error' ? 'error' : 'enviado',
    enviadoAt: String(row.enviado_at),
    enviadoPor: String(row.enviado_por || 'cron'),
    valorTotal: row.valor_total == null ? null : Number(row.valor_total),
    ordenFecha: typeof row.orden_fecha === 'string' ? row.orden_fecha : null,
  };
}

export async function fetchComercialSeguimientosClientes(): Promise<ClienteSeguimientoData> {
  const [resumenRes, historialRes] = await Promise.all([
    supabase.from('v_comercial_cliente_seguimiento_resumen').select('*').maybeSingle(),
    supabase
      .from('v_comercial_cliente_seguimiento_historial')
      .select('*')
      .order('enviado_at', { ascending: false })
      .limit(100),
  ]);

  if (resumenRes.error) {
    if (isMissingRelationError(resumenRes.error)) {
      return unavailable('Ejecutá migration_comercial_seguimientos_clientes.sql para activar esta sección.');
    }
    throw new Error(resumenRes.error.message);
  }

  if (historialRes.error) {
    if (isMissingRelationError(historialRes.error)) {
      return unavailable('Ejecutá migration_comercial_seguimientos_clientes.sql para activar esta sección.');
    }
    throw new Error(historialRes.error.message);
  }

  return {
    available: true,
    resumen: mapResumen(resumenRes.data as Record<string, unknown> | null),
    historial: ((historialRes.data ?? []) as Record<string, unknown>[]).map(mapHistorial),
  };
}

export async function enviarLoteSeguimientosClientes(limite = 10): Promise<number> {
  const { data, error } = await supabase.rpc('procesar_seguimientos_clientes_pendientes', {
    p_limite: limite,
    p_enviado_por: 'manual',
  });

  if (error) throw new Error(error.message);
  const payload = data as { enviados?: number } | null;
  return Number(payload?.enviados ?? 0);
}
