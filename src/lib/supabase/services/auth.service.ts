import { supabase } from '../client';
import { Database } from '../types';

type SolicitudRegistroRow = {
  id: string;
  user_id: string;
  email: string;
  nombre: string | null;
  apellido: string | null;
  estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
  solicitado_en: string;
  aprobado_en: string | null;
  aprobado_por: string | null;
  motivo_rechazo: string | null;
  created_at: string;
  updated_at: string;
};

// Crear solicitud de registro
export const createRegistrationRequest = async (
  userId: string,
  email: string,
  metadata?: { nombre?: string; apellido?: string }
): Promise<SolicitudRegistroRow> => {
  const { data, error } = await supabase
    .from('solicitudes_registro')
    .insert({
      user_id: userId,
      email,
      nombre: metadata?.nombre || null,
      apellido: metadata?.apellido || null,
      estado: 'PENDIENTE',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Obtener todas las solicitudes pendientes
export const getPendingRegistrationRequests = async (): Promise<SolicitudRegistroRow[]> => {
  const { data, error } = await supabase
    .from('solicitudes_registro')
    .select('*')
    .eq('estado', 'PENDIENTE')
    .order('solicitado_en', { ascending: false });

  if (error) throw error;
  return data || [];
};

// Obtener todas las solicitudes (para administradores)
export const getAllRegistrationRequests = async (): Promise<SolicitudRegistroRow[]> => {
  const { data, error } = await supabase
    .from('solicitudes_registro')
    .select('*')
    .order('solicitado_en', { ascending: false });

  if (error) throw error;
  return data || [];
};

// Aprobar solicitud de registro
export const approveRegistrationRequest = async (
  requestId: string,
  approvedBy: string
): Promise<void> => {
  const { error } = await supabase
    .from('solicitudes_registro')
    .update({
      estado: 'APROBADO',
      aprobado_en: new Date().toISOString(),
      aprobado_por: approvedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (error) throw error;
};

// Rechazar solicitud de registro
export const rejectRegistrationRequest = async (
  requestId: string,
  approvedBy: string,
  motivoRechazo?: string
): Promise<void> => {
  const { error } = await supabase
    .from('solicitudes_registro')
    .update({
      estado: 'RECHAZADO',
      aprobado_en: new Date().toISOString(),
      aprobado_por: approvedBy,
      motivo_rechazo: motivoRechazo || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (error) throw error;
};

// Verificar si un usuario está autorizado
export const isUserAuthorized = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('solicitudes_registro')
    .select('estado')
    .eq('user_id', userId)
    .single();

  if (error || !data) return false;
  return data.estado === 'APROBADO';
};

// Obtener estado de solicitud de un usuario
export const getUserRegistrationStatus = async (userId: string): Promise<SolicitudRegistroRow | null> => {
  const { data, error } = await supabase
    .from('solicitudes_registro')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) return null;
  return data;
};

// Obtener usuarios únicos aprobados (para filtros)
export const getApprovedUsers = async (): Promise<Array<{ id: string; name: string }>> => {
  try {
    const { data, error } = await supabase
      .from('solicitudes_registro')
      .select('user_id, nombre, apellido, email')
      .eq('estado', 'APROBADO');

    if (error) throw error;
    if (!data) return [];

    // Mapear a formato { id, name }
    return data.map(user => ({
      id: user.user_id,
      name: user.nombre && user.apellido 
        ? `${user.nombre} ${user.apellido}` 
        : user.nombre || user.apellido || user.email || 'Usuario'
    }));
  } catch (error) {
    console.error('Error fetching approved users:', error);
    return [];
  }
};




