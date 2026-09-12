import { supabase } from '@/lib/supabase/client';

/** Id de la última tanda de novedades que el usuario ya vio (0 si nunca vio ninguna). */
export async function getUltimoVisto(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('changelog_visto')
    .select('ultimo_id_visto')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.ultimo_id_visto ?? 0;
}

/** Marca la tanda `id` como vista. Nunca retrocede el valor guardado. */
export async function marcarVisto(userId: string, id: number): Promise<void> {
  const actual = await getUltimoVisto(userId);
  if (id <= actual) return;

  const { error } = await supabase.from('changelog_visto').upsert(
    {
      user_id: userId,
      ultimo_id_visto: id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) throw new Error(error.message);
}
