import { supabase } from '../client';
import type { Database } from '../types';

export type MockupSolicitudRow = Database['public']['Tables']['mockup_solicitudes']['Row'];
export type MockupSolicitudInsert = Database['public']['Tables']['mockup_solicitudes']['Insert'];
export type MockupSolicitudUpdate = Database['public']['Tables']['mockup_solicitudes']['Update'];

export async function insertMockupSolicitud(
  row: MockupSolicitudInsert,
): Promise<{ data: MockupSolicitudRow | null; error: Error | null }> {
  const { data, error } = await supabase.from('mockup_solicitudes').insert(row).select().single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as MockupSolicitudRow, error: null };
}

export async function updateMockupSolicitud(
  id: string,
  patch: MockupSolicitudUpdate,
): Promise<{ data: MockupSolicitudRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('mockup_solicitudes')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as MockupSolicitudRow, error: null };
}

export async function listMockupSolicitudes(limit = 60): Promise<{
  data: MockupSolicitudRow[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('mockup_solicitudes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as MockupSolicitudRow[], error: null };
}
