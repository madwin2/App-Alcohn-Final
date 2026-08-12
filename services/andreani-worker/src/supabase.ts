import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadConfig } from './config.js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const config = loadConfig();
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configurados');
  }
  client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export async function insertDisponibleLinks(urls: string[]): Promise<string[]> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  if (!unique.length) return [];

  const supabase = getSupabase();
  const rows = unique.map((url) => ({ url, estado: 'disponible' as const }));
  const { data, error } = await supabase
    .from('envios_andreani_links')
    .insert(rows)
    .select('url');

  if (error) throw error;
  return (data ?? []).map((r) => r.url as string);
}

export async function countDisponibles(): Promise<number> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from('envios_andreani_links')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'disponible');
  if (error) throw error;
  return count ?? 0;
}
