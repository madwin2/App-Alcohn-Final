// Configuración de Supabase
export const supabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
};

// Validar que las variables de entorno estén configuradas
if (!supabaseConfig.url || !supabaseConfig.anonKey) {
  throw new Error(
    'Faltan las variables de entorno de Supabase. Por favor configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu archivo .env'
  );
}
