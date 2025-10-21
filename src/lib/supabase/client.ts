import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from './config';

// Crear cliente de Supabase
export const supabase = createClient(
  supabaseConfig.url,
  supabaseConfig.anonKey
);

// Exportar tipos de Supabase
export type { Database } from './types';
