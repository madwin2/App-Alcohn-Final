import { supabase } from '@/lib/supabase/client';
import {
  mergePreciosPayload,
  type PreciosPayload,
} from '@/lib/precios/preciosPayload';

export async function fetchPreciosLista(userId: string): Promise<PreciosPayload | null> {
  const { data, error } = await supabase
    .from('precios_lista')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.data) return null;
  return mergePreciosPayload(data.data);
}

export async function upsertPreciosLista(userId: string, payload: PreciosPayload): Promise<void> {
  const { error } = await supabase.from('precios_lista').upsert(
    {
      user_id: userId,
      data: payload as unknown as Record<string, unknown>,
    },
    { onConflict: 'user_id' },
  );

  if (error) throw error;
}
