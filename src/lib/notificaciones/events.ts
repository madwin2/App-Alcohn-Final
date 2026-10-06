import {
  clearNotificacionDedup,
  emitNotificacionSafe,
} from '@/lib/supabase/services/notificaciones.service';
import { fraseTipoFeedbackNotificacion } from '@/lib/equipo/feedback';
import { fraseEstadoIdeaNotificacion } from '@/lib/equipo/corcho';
import { clienteNombreFromParts, formatMoneyArs, joinCampos, shortPedidoId } from './format';

export function notifySelloModificado(params: {
  ordenId: string;
  clienteNombre: string;
  items: Array<{
    selloId: string;
    diseno: string;
    campos: string[];
    estadoFabricacion: string;
  }>;
}): void {
  const { ordenId, clienteNombre, items } = params;
  if (!items.length) return;
  const pedido = shortPedidoId(ordenId);
  const cliente = clienteNombre || 'Cliente';

  if (items.length === 1) {
    const item = items[0];
    const campos = joinCampos(item.campos);
    emitNotificacionSafe({
      tipo: 'p1_sello_modificado',
      area: 'produccion',
      titulo: `Se modificó ${campos} del sello de ${cliente} — pedido #${pedido} (estaba en ${item.estadoFabricacion})`,
      cuerpo: item.diseno,
      entidadTipo: 'sello',
      entidadId: item.selloId,
      linkPath: '/produccion',
      metadata: {
        clienteNombre: cliente,
        diseno: item.diseno,
        ordenId,
        campos: item.campos,
      },
    });
    return;
  }

  const todosCampos = [...new Set(items.flatMap((i) => i.campos))];
  emitNotificacionSafe({
    tipo: 'p1_sello_modificado',
    area: 'produccion',
    titulo: `Se modificó ${joinCampos(todosCampos)} de ${items.length} sellos de ${cliente} — pedido #${pedido}`,
    entidadTipo: 'orden',
    entidadId: ordenId,
    linkPath: '/produccion',
    metadata: { clienteNombre: cliente, ordenId, campos: todosCampos },
  });
}

export function notifyPrioridad(params: {
  ordenId: string;
  clienteNombre: string;
  diseno: string;
  selloId: string;
}): void {
  const cliente = params.clienteNombre || 'Cliente';
  emitNotificacionSafe({
    tipo: 'p3_prioridad',
    area: 'produccion',
    titulo: `${cliente} — ${params.diseno} pasó a prioritario`,
    entidadTipo: 'sello',
    entidadId: params.selloId,
    linkPath: '/produccion',
    metadata: { clienteNombre: cliente, diseno: params.diseno, ordenId: params.ordenId },
  });
}

export function notifyRehacer(params: {
  selloIds: string[];
  ordenId: string;
  clienteNombre: string;
  disenos: string[];
  motivo: string;
  descripcion: string;
  cobroMonto?: number | null;
  cobroConcepto?: string | null;
}): void {
  const cliente = params.clienteNombre || 'Cliente';
  const motivo = params.motivo;
  const diseno =
    params.disenos.length === 1
      ? params.disenos[0]
      : `${params.disenos.length} sellos`;
  const cuerpoParts = [params.descripcion?.trim()].filter(Boolean);
  if (params.cobroMonto != null && params.cobroMonto > 0) {
    const cobro = `${formatMoneyArs(params.cobroMonto)}${
      params.cobroConcepto ? ` (${params.cobroConcepto})` : ''
    }`;
    cuerpoParts.push(`Cobro adicional: ${cobro}`);
  }
  const cuerpo = cuerpoParts.join(' · ') || null;

  emitNotificacionSafe({
    tipo: 'p2_rehacer',
    area: 'produccion',
    titulo: `${cliente} — ${diseno}: Rehacer por ${motivo}`,
    cuerpo: params.descripcion?.trim() || null,
    entidadTipo: params.selloIds.length === 1 ? 'sello' : 'orden',
    entidadId: params.selloIds.length === 1 ? params.selloIds[0] : params.ordenId,
    linkPath: '/produccion',
    severidad: 'warning',
    metadata: {
      clienteNombre: cliente,
      diseno,
      ordenId: params.ordenId,
      motivo: params.motivo,
    },
  });

  emitNotificacionSafe({
    tipo: 'v2_rehacer',
    area: 'ventas',
    titulo: `${cliente} — ${diseno}: Rehacer por ${motivo}`,
    cuerpo,
    entidadTipo: params.selloIds.length === 1 ? 'sello' : 'orden',
    entidadId: params.selloIds.length === 1 ? params.selloIds[0] : params.ordenId,
    linkPath: '/pedidos',
    severidad: 'warning',
    metadata: {
      clienteNombre: cliente,
      diseno,
      ordenId: params.ordenId,
      motivo: params.motivo,
    },
  });
}

export function notifyStockBajo(params: { itemKey: string; itemName: string; shortage: number }): void {
  emitNotificacionSafe({
    tipo: 'p6_stock_bajo',
    area: 'produccion',
    titulo: `Falta stock de ${params.itemName} para cubrir pedidos pendientes`,
    cuerpo: `Faltan ${params.shortage} unidades`,
    entidadTipo: 'insumo',
    entidadId: params.itemKey,
    linkPath: '/stock',
    severidad: 'warning',
    includeAutor: false,
    dedupKey: `p6:${params.itemKey}`,
    metadata: { itemNombre: params.itemName },
  });
}

export function notifyStockBajoResuelto(itemKey: string): void {
  void clearNotificacionDedup(`p6:${itemKey}`);
}

export function notifyDireccionPostEtiqueta(params: {
  ordenId: string;
  clienteNombre: string;
  variant: 'address' | 'duplicate';
}): void {
  const cliente = params.clienteNombre || 'Cliente';
  const pedido = shortPedidoId(params.ordenId);
  const isAddress = params.variant === 'address';
  emitNotificacionSafe({
    tipo: isAddress ? 'l1_direccion_post_etiqueta' : 'l1_etiqueta_duplicada',
    area: 'logistica',
    titulo: isAddress
      ? `${cliente} — pedido #${pedido}: la dirección cambió después de generar la etiqueta`
      : `${cliente} — pedido #${pedido}: se generó la etiqueta de Correo Argentino dos veces`,
    entidadTipo: 'orden',
    entidadId: params.ordenId,
    linkPath: '/envios/correo',
    severidad: 'warning',
    metadata: { clienteNombre: cliente, ordenId: params.ordenId },
  });
}

export function notifyItemAgregadoPedidoPagado(params: {
  ordenId: string;
  clienteNombre: string;
  itemNombre: string;
  estado: 'pagado' | 'con foto enviada';
}): void {
  const cliente = params.clienteNombre || 'Cliente';
  const pedido = shortPedidoId(params.ordenId);
  emitNotificacionSafe({
    tipo: 'v1_items_pedido_pagado',
    area: 'ventas',
    titulo: `${cliente} — pedido #${pedido} ya estaba ${params.estado} y se le agregó ${params.itemNombre}`,
    entidadTipo: 'orden',
    entidadId: params.ordenId,
    linkPath: '/pedidos',
    severidad: 'warning',
    metadata: {
      clienteNombre: cliente,
      ordenId: params.ordenId,
      itemNombre: params.itemNombre,
    },
  });
}

type SellosHechosPending = {
  count: number;
  ordenId?: string;
  selloId?: string;
  clienteNombre?: string;
  diseno?: string;
};

/** Tras el último “Hecho”: espera quietud antes de emitir. */
const SELLOS_HECHOS_QUIET_MS = 2 * 60 * 1000;
/** Tope desde el primero del lote, aunque sigan marcando. */
const SELLOS_HECHOS_MAX_MS = 5 * 60 * 1000;

let sellosHechosQueue: SellosHechosPending[] = [];
let sellosHechosQuietTimer: ReturnType<typeof setTimeout> | null = null;
let sellosHechosMaxTimer: ReturnType<typeof setTimeout> | null = null;
let sellosHechosUnloadBound = false;

function clearSellosHechosTimers(): void {
  if (sellosHechosQuietTimer) {
    clearTimeout(sellosHechosQuietTimer);
    sellosHechosQuietTimer = null;
  }
  if (sellosHechosMaxTimer) {
    clearTimeout(sellosHechosMaxTimer);
    sellosHechosMaxTimer = null;
  }
}

function emitSellosHechosBatch(items: SellosHechosPending[]): void {
  if (!items.length) return;

  const selloIds = new Set<string>();
  let anonymousCount = 0;
  let single: SellosHechosPending | null = null;

  for (const item of items) {
    if (item.selloId) {
      if (!selloIds.has(item.selloId)) {
        selloIds.add(item.selloId);
        if (!single) single = item;
      }
    } else {
      anonymousCount += Math.max(1, item.count);
    }
  }

  const total = selloIds.size + anonymousCount;
  if (total <= 0) return;

  if (total === 1 && single) {
    const cliente = single.clienteNombre || 'Cliente';
    emitNotificacionSafe({
      tipo: 'v3_sellos_hechos',
      area: 'ventas',
      titulo: `${cliente} — ${single.diseno || 'Sello'} fue terminado`,
      entidadTipo: single.selloId ? 'sello' : 'orden',
      entidadId: single.selloId ?? single.ordenId ?? null,
      linkPath: '/pedidos',
      metadata: {
        clienteNombre: cliente,
        diseno: single.diseno,
        ordenId: single.ordenId,
      },
    });
    return;
  }

  emitNotificacionSafe({
    tipo: 'v3_sellos_hechos',
    area: 'ventas',
    titulo: `${total} sellos fueron terminados`,
    entidadTipo: 'orden',
    entidadId: null,
    linkPath: '/pedidos',
    metadata: {
      count: total,
      selloIds: selloIds.size ? [...selloIds] : undefined,
    },
  });
}

function flushSellosHechos(): void {
  clearSellosHechosTimers();
  const items = sellosHechosQueue;
  sellosHechosQueue = [];
  emitSellosHechosBatch(items);
}

function ensureSellosHechosUnloadFlush(): void {
  if (sellosHechosUnloadBound || typeof window === 'undefined') return;
  sellosHechosUnloadBound = true;
  window.addEventListener('pagehide', () => {
    if (sellosHechosQueue.length) flushSellosHechos();
  });
}

function scheduleSellosHechosFlush(): void {
  ensureSellosHechosUnloadFlush();

  if (sellosHechosQuietTimer) clearTimeout(sellosHechosQuietTimer);
  sellosHechosQuietTimer = setTimeout(flushSellosHechos, SELLOS_HECHOS_QUIET_MS);

  if (!sellosHechosMaxTimer) {
    sellosHechosMaxTimer = setTimeout(flushSellosHechos, SELLOS_HECHOS_MAX_MS);
  }
}

/**
 * Agrupa los “sello terminado” de la sesión: en producción suelen marcar de a
 * uno y no queremos 17 avisos. Espera 2 min de silencio (máx. 5 min desde el
 * primero) y manda una sola notificación.
 */
export function notifySellosHechos(params: {
  count: number;
  ordenId?: string;
  selloId?: string;
  clienteNombre?: string;
  diseno?: string;
}): void {
  const count = Math.max(1, params.count || 1);
  sellosHechosQueue.push({
    count,
    ordenId: params.ordenId,
    selloId: params.selloId,
    clienteNombre: params.clienteNombre,
    diseno: params.diseno,
  });
  scheduleSellosHechosFlush();
}

export function notifyTareaAsignada(params: {
  asignadoAUserId: string;
  texto: string;
}): void {
  emitNotificacionSafe({
    tipo: 't1_tarea_asignada',
    area: null,
    titulo: `Te asignó: ${params.texto}`,
    entidadTipo: 'tarea',
    entidadId: params.asignadoAUserId,
    linkPath: '/',
    userIds: [params.asignadoAUserId],
    metadata: { itemNombre: params.texto },
  });
}

/** Vacaciones cargadas: avisa a todo el equipo menos el autor (S6). */
export function notifyVacacionesCargadas(params: {
  nombre: string;
  fechaDesde: string;
  fechaHasta: string;
  destinatarioUserIds: string[];
  ausenciaId: string;
}): void {
  if (!params.destinatarioUserIds.length) return;
  const fmt = (iso: string) => {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
  };
  const rango =
    params.fechaDesde === params.fechaHasta
      ? fmt(params.fechaDesde)
      : `${fmt(params.fechaDesde)} al ${fmt(params.fechaHasta)}`;
  emitNotificacionSafe({
    tipo: 'e1_vacaciones_cargadas',
    area: null,
    titulo: `${params.nombre} se toma vacaciones del ${rango}`,
    entidadTipo: 'ausencia',
    entidadId: params.ausenciaId,
    linkPath: '/perfil?tab=calendario',
    userIds: params.destinatarioUserIds,
    metadata: {
      itemNombre: params.nombre,
      fechaDesde: params.fechaDesde,
      fechaHasta: params.fechaHasta,
    },
  });
}

/** Nueva necesidad: avisa al admin (S8). */
export function notifyNecesidadNueva(params: {
  nombre: string;
  texto: string;
  adminUserIds: string[];
  necesidadId: string;
}): void {
  if (!params.adminUserIds.length) return;
  const preview =
    params.texto.length > 80 ? `${params.texto.slice(0, 77).trim()}…` : params.texto;
  emitNotificacionSafe({
    tipo: 'e3_necesidad_nueva',
    area: null,
    titulo: `${params.nombre} necesita: ${preview}`,
    entidadTipo: 'necesidad_equipo',
    entidadId: params.necesidadId,
    linkPath: '/perfil?tab=equipo',
    userIds: params.adminUserIds,
    metadata: { itemNombre: params.nombre, texto: params.texto },
  });
}

/** Admin marcó resuelta una necesidad (S8). */
export function notifyNecesidadResuelta(params: {
  adminNombre: string;
  destinatarioUserId: string;
  necesidadId: string;
}): void {
  emitNotificacionSafe({
    tipo: 'e3_necesidad_resuelta',
    area: null,
    titulo: `${params.adminNombre} resolvió tu pedido`,
    entidadTipo: 'necesidad_equipo',
    entidadId: params.necesidadId,
    linkPath: '/perfil?tab=necesidades',
    userIds: [params.destinatarioUserId],
    metadata: { itemNombre: params.adminNombre },
  });
}

/** Admin dejó feedback a alguien (S10). El título dice el tipo, no el contenido. */
export function notifyFeedbackNuevo(params: {
  autorNombre: string;
  tipo: 'felicitacion' | 'mejora' | 'correccion';
  destinatarioUserId: string;
  feedbackId: string;
}): void {
  emitNotificacionSafe({
    tipo: 'e4_feedback_nuevo',
    area: null,
    titulo: `${params.autorNombre} te dejó ${fraseTipoFeedbackNotificacion(params.tipo)}`,
    entidadTipo: 'feedback_equipo',
    entidadId: params.feedbackId,
    linkPath: '/perfil?tab=feedback',
    userIds: [params.destinatarioUserId],
    metadata: { itemNombre: params.autorNombre, tipoFeedback: params.tipo },
  });
}

/** Alguien pinchó una idea en el corcho: avisa al resto del equipo. */
export function notifyIdeaNueva(params: {
  autorNombre: string;
  ideaId: string;
  destinatarioUserIds: string[];
}): void {
  if (!params.destinatarioUserIds.length) return;
  emitNotificacionSafe({
    tipo: 'e5_idea_nueva',
    area: null,
    titulo: `${params.autorNombre} pinchó una idea en el corcho`,
    entidadTipo: 'idea_corcho',
    entidadId: params.ideaId,
    linkPath: '/corcho',
    userIds: params.destinatarioUserIds,
    metadata: { itemNombre: params.autorNombre },
  });
}

/** Admin aprobó o descartó una idea: avisa al autor. */
export function notifyIdeaEstado(params: {
  estado: 'aprobada' | 'descartada';
  ideaId: string;
  autorUserId: string;
}): void {
  emitNotificacionSafe({
    tipo: 'e5_idea_estado',
    area: null,
    titulo: `Tu idea fue ${fraseEstadoIdeaNotificacion(params.estado)}`,
    entidadTipo: 'idea_corcho',
    entidadId: params.ideaId,
    linkPath: '/corcho',
    userIds: [params.autorUserId],
    metadata: { estadoIdea: params.estado },
  });
}

/** Admin sumó una tarea recurrente a alguien (S7). */
export function notifyTareaRecurrenteAsignada(params: {
  autorNombre: string;
  titulo: string;
  frecuenciaTexto: string;
  destinatarioUserId: string;
  tareaId: string;
}): void {
  emitNotificacionSafe({
    tipo: 'e2_tarea_recurrente_asignada',
    area: null,
    titulo: `${params.autorNombre} te sumó una tarea semanal: ${params.titulo} (${params.frecuenciaTexto})`,
    entidadTipo: 'tarea_recurrente',
    entidadId: params.tareaId,
    linkPath: '/perfil?tab=tareas',
    userIds: [params.destinatarioUserId],
    metadata: {
      itemNombre: params.titulo,
      frecuencia: params.frecuenciaTexto,
    },
  });
}

/** Sellos que el gadget no pudo importar (típicamente .eps). */
export function notifySellosNoImportados(params: {
  programId: string;
  programName: string;
  items: Array<{ selloId: string; diseno: string; motivo: string }>;
}): void {
  const { programId, programName, items } = params;
  if (!items.length) return;

  if (items.length === 1) {
    const item = items[0];
    emitNotificacionSafe({
      tipo: 'p7_sello_no_importado',
      area: 'produccion',
      titulo: `No entró al Aspire: ${item.diseno} — ${programName}`,
      cuerpo: item.motivo,
      entidadTipo: 'programa',
      entidadId: programId,
      linkPath: '/programas',
      severidad: 'warning',
      dedupKey: `sello_no_importado:${programId}:${item.selloId}`,
      metadata: {
        diseno: item.diseno,
        motivo: item.motivo,
        selloId: item.selloId,
        programName,
      },
    });
    return;
  }

  emitNotificacionSafe({
    tipo: 'p7_sello_no_importado',
    area: 'produccion',
    titulo: `${items.length} sellos no entraron al Aspire — ${programName}`,
    cuerpo: items.map((i) => `${i.diseno}: ${i.motivo}`).join(' · '),
    entidadTipo: 'programa',
    entidadId: programId,
    linkPath: '/programas',
    severidad: 'warning',
    dedupKey: `sello_no_importado:${programId}:${items.map((i) => i.selloId).sort().join(',')}`,
    metadata: { programName, count: items.length },
  });
}

export { clienteNombreFromParts };
