import { supabase } from '../client';
import type {
  AppArea,
  NotificacionItem,
  NotificacionMetadata,
  NotificacionSeveridad,
  NotificacionTipo,
} from '@/lib/notificaciones/types';

export interface EmitNotificacionInput {
  tipo: NotificacionTipo | string;
  area?: AppArea | null;
  titulo: string;
  cuerpo?: string | null;
  entidadTipo?: string | null;
  entidadId?: string | null;
  linkPath?: string | null;
  severidad?: NotificacionSeveridad;
  dedupKey?: string | null;
  metadata?: NotificacionMetadata;
  /** Destinatarios explícitos (T1). Si se omite, se reparte al área. */
  userIds?: string[] | null;
  /** Si false, no se toma el usuario de la sesión (eventos automáticos). */
  includeAutor?: boolean;
}

export async function getCurrentActor(): Promise<{ id: string; nombre: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const metaNombre = user.user_metadata?.nombre
    ? `${user.user_metadata.nombre} ${user.user_metadata.apellido || ''}`.trim()
    : '';
  if (metaNombre) return { id: user.id, nombre: metaNombre };

  const { data } = await supabase
    .from('solicitudes_registro')
    .select('nombre, apellido, email')
    .eq('user_id', user.id)
    .maybeSingle();

  const nombre =
    data?.nombre && data?.apellido
      ? `${data.nombre} ${data.apellido}`
      : data?.nombre || data?.email || user.email || 'Alguien';
  return { id: user.id, nombre };
}

export async function emitNotificacion(input: EmitNotificacionInput): Promise<string | null> {
  try {
    const includeAutor = input.includeAutor !== false;
    const actor = includeAutor ? await getCurrentActor() : null;

    const { data, error } = await supabase.rpc('emitir_notificacion', {
      p_tipo: input.tipo,
      p_area: input.area ?? null,
      p_autor_id: actor?.id ?? null,
      p_autor_nombre: actor?.nombre ?? null,
      p_titulo: input.titulo,
      p_cuerpo: input.cuerpo ?? null,
      p_entidad_tipo: input.entidadTipo ?? null,
      p_entidad_id: input.entidadId ?? null,
      p_link_path: input.linkPath ?? null,
      p_severidad: input.severidad ?? 'info',
      p_dedup_key: input.dedupKey ?? null,
      p_metadata: input.metadata ?? {},
      p_user_ids: input.userIds ?? null,
    });

    if (error) {
      console.error('Error emitiendo notificación:', error);
      return null;
    }
    return (data as string | null) ?? null;
  } catch (error) {
    console.error('Error emitiendo notificación:', error);
    return null;
  }
}

/** Fire-and-forget: nunca interrumpe el flujo que disparó el evento. */
export function emitNotificacionSafe(input: EmitNotificacionInput): void {
  void emitNotificacion(input);
}

export async function clearNotificacionDedup(key: string): Promise<void> {
  const { error } = await supabase.rpc('clear_notificacion_dedup', { p_key: key });
  if (error) console.error('Error limpiando dedup de notificación:', error);
}

type NotificacionJoin = {
  id: string;
  tipo: string;
  area: AppArea | null;
  autor_id: string | null;
  autor_nombre: string | null;
  titulo: string;
  cuerpo: string | null;
  entidad_tipo: string | null;
  entidad_id: string | null;
  link_path: string | null;
  severidad: NotificacionSeveridad;
  metadata: NotificacionMetadata | null;
  created_at: string;
};

const firstJoin = <T>(value: T | T[] | null | undefined): T | null => {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
};

function mapDestinatarioRow(row: {
  id: string;
  leida_at: string | null;
  notificaciones: NotificacionJoin | NotificacionJoin[] | null;
}): NotificacionItem | null {
  const n = firstJoin(row.notificaciones);
  if (!n) return null;
  return {
    destinatarioId: row.id,
    notificacionId: n.id,
    tipo: n.tipo,
    area: n.area,
    autorId: n.autor_id,
    autorNombre: n.autor_nombre,
    titulo: n.titulo,
    cuerpo: n.cuerpo,
    entidadTipo: n.entidad_tipo,
    entidadId: n.entidad_id,
    linkPath: n.link_path,
    severidad: n.severidad || 'info',
    metadata: n.metadata ?? {},
    createdAt: n.created_at,
    leidaAt: row.leida_at,
  };
}

export async function fetchMyNotifications(limit = 80): Promise<NotificacionItem[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('notificacion_destinatarios')
    .select(
      `
      id, leida_at,
      notificaciones (
        id, tipo, area, autor_id, autor_nombre, titulo, cuerpo,
        entidad_tipo, entidad_id, link_path, severidad, metadata, created_at
      )
    `,
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error cargando notificaciones:', error);
    return [];
  }

  return (data ?? [])
    .map((row) => mapDestinatarioRow(row as Parameters<typeof mapDestinatarioRow>[0]))
    .filter((item): item is NotificacionItem => Boolean(item));
}

export async function fetchNotificationByDestinatarioId(
  destinatarioId: string,
): Promise<NotificacionItem | null> {
  const { data, error } = await supabase
    .from('notificacion_destinatarios')
    .select(
      `
      id, leida_at,
      notificaciones (
        id, tipo, area, autor_id, autor_nombre, titulo, cuerpo,
        entidad_tipo, entidad_id, link_path, severidad, metadata, created_at
      )
    `,
    )
    .eq('id', destinatarioId)
    .maybeSingle();

  if (error || !data) return null;
  return mapDestinatarioRow(data as Parameters<typeof mapDestinatarioRow>[0]);
}

export async function markNotificationRead(destinatarioId: string): Promise<void> {
  const { error } = await supabase
    .from('notificacion_destinatarios')
    .update({ leida_at: new Date().toISOString() })
    .eq('id', destinatarioId)
    .is('leida_at', null);
  if (error) console.error('Error marcando notificación leída:', error);
}

export async function markAllNotificationsRead(area?: AppArea | null): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  if (!area) {
    const { error } = await supabase
      .from('notificacion_destinatarios')
      .update({ leida_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('leida_at', null);
    if (error) console.error('Error marcando notificaciones leídas:', error);
    return;
  }

  const { data, error } = await supabase
    .from('notificacion_destinatarios')
    .select('id, notificaciones!inner(area)')
    .eq('user_id', user.id)
    .is('leida_at', null)
    .eq('notificaciones.area', area);

  if (error) {
    console.error('Error buscando notificaciones del área:', error);
    return;
  }
  const ids = (data ?? []).map((row) => row.id as string);
  if (!ids.length) return;
  const { error: upErr } = await supabase
    .from('notificacion_destinatarios')
    .update({ leida_at: new Date().toISOString() })
    .in('id', ids);
  if (upErr) console.error('Error marcando notificaciones del área:', upErr);
}

export async function getUsuarioAreasMap(): Promise<Map<string, AppArea[]>> {
  const { data, error } = await supabase.from('usuario_area').select('user_id, area');
  if (error) {
    console.error('Error cargando áreas de usuario:', error);
    return new Map();
  }
  const map = new Map<string, AppArea[]>();
  for (const row of data ?? []) {
    const list = map.get(row.user_id as string) ?? [];
    list.push(row.area as AppArea);
    map.set(row.user_id as string, list);
  }
  return map;
}

export async function setUsuarioArea(
  userId: string,
  area: AppArea,
  enabled: boolean,
): Promise<void> {
  if (enabled) {
    const { error } = await supabase.from('usuario_area').upsert(
      { user_id: userId, area },
      { onConflict: 'user_id,area' },
    );
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('usuario_area').delete().eq('user_id', userId).eq('area', area);
  if (error) throw error;
}
