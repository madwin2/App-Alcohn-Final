import { supabase } from '../client';

export interface TableViewConfig {
  columns?: Array<{
    id: string;
    size: number;
    order: number;
    hidden?: boolean;
  }>;
  filters?: Record<string, any>;
  sort?: {
    priority?: any[];
    criteria?: Array<{
      field: string;
      dir: 'asc' | 'desc';
    }>;
  };
  hiddenColumns?: string[];
  [key: string]: any; // Para permitir otras configuraciones
}

// Obtener configuración de vista para un usuario y tabla
export const getTableViewConfig = async (
  userId: string,
  tabla: string
): Promise<TableViewConfig | null> => {
  const { data, error } = await supabase
    .from('vistas_tabla')
    .select('configuracion')
    .eq('user_id', userId)
    .eq('tabla', tabla)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No se encontró registro, retornar null
      return null;
    }
    throw error;
  }

  return data?.configuracion || null;
};

// Guardar configuración de vista
export const saveTableViewConfig = async (
  userId: string,
  tabla: string,
  config: TableViewConfig
): Promise<void> => {
  const { error } = await supabase
    .from('vistas_tabla')
    .upsert({
      user_id: userId,
      tabla,
      configuracion: config,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,tabla',
    });

  if (error) throw error;
};

// Actualizar parcialmente la configuración
export const updateTableViewConfig = async (
  userId: string,
  tabla: string,
  partialConfig: Partial<TableViewConfig>
): Promise<void> => {
  // Obtener configuración actual
  const currentConfig = await getTableViewConfig(userId, tabla) || {};

  // Fusionar con la nueva configuración
  const mergedConfig: TableViewConfig = {
    ...currentConfig,
    ...partialConfig,
    // Fusionar arrays/objetos anidados
    columns: partialConfig.columns || currentConfig.columns,
    filters: { ...currentConfig.filters, ...partialConfig.filters },
    sort: { ...currentConfig.sort, ...partialConfig.sort },
  };

  await saveTableViewConfig(userId, tabla, mergedConfig);
};

// Eliminar configuración de vista
export const deleteTableViewConfig = async (
  userId: string,
  tabla: string
): Promise<void> => {
  const { error } = await supabase
    .from('vistas_tabla')
    .delete()
    .eq('user_id', userId)
    .eq('tabla', tabla);

  if (error) throw error;
};









