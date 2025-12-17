import { supabase } from './client';

let migrationChecked = false;
let migrationInProgress = false;

/**
 * Ejecuta migraciones necesarias para el sistema
 * Esta función intenta:
 * - crear la columna es_prioritario si no existe
 * - asegurar el cálculo de restante incluyendo costo de envío (si la migración SQL fue instalada)
 */
export const runMigrations = async (): Promise<void> => {
  // Solo ejecutar una vez por sesión
  if (migrationChecked || migrationInProgress) return;
  
  try {
    migrationInProgress = true;

    // Primero, intentar verificar si la columna existe intentando leerla
    const { error: testError } = await supabase
      .from('sellos')
      .select('es_prioritario')
      .limit(1);

    // Si no hay error, la columna existe
    if (!testError) {
      // ok
    } else {
      // Si el error es porque la columna no existe, intentar crearla usando RPC
      if (testError.message?.includes('column "es_prioritario"') || 
          testError.message?.includes('does not exist') ||
          testError.code === '42703') {
        
        // Intentar ejecutar la migración usando una función RPC que debe existir
        // Si no existe, el código manejará el error elegantemente
        let migrationError: any = null;
        try {
          const result = await supabase.rpc('add_es_prioritario_column');
          migrationError = result.error;
          if (migrationError) {
            console.warn('Error ejecutando migración RPC:', migrationError);
          } else {
            // Migración exitosa
            console.log('✅ Migración ejecutada correctamente (es_prioritario)');
          }
        } catch (error) {
          console.warn('Función de migración RPC no existe:', error);
          migrationError = { message: 'Function does not exist' };
        }

        if (migrationError && !migrationError.message?.includes('does not exist')) {
          // Si hay otro error, intentar crear la función primero y luego ejecutarla
          // Esto requiere permisos de administrador, así que solo logueamos
          console.warn('⚠️ No se pudo ejecutar la migración automáticamente (es_prioritario).');
          console.warn('📝 Por favor ejecuta este SQL en Supabase SQL Editor:');
          console.warn(`
-- Crear función para agregar la columna
CREATE OR REPLACE FUNCTION add_es_prioritario_column()
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sellos' AND column_name = 'es_prioritario'
  ) THEN
    ALTER TABLE sellos ADD COLUMN es_prioritario BOOLEAN NOT NULL DEFAULT FALSE;
    COMMENT ON COLUMN sellos.es_prioritario IS 'Indica si el sello es prioritario (independiente del estado de fabricación)';
    CREATE INDEX IF NOT EXISTS idx_sellos_es_prioritario ON sellos(es_prioritario);
    UPDATE sellos SET es_prioritario = TRUE, estado_fabricacion = 'Sin Hacer' WHERE estado_fabricacion = 'Prioridad';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ejecutar la función
SELECT add_es_prioritario_column();
          `);
        }
      }
    }

    // --- Migración: restante incluye costo de envío ---
    // Chequeo liviano: intentar llamar get_shipping_cost (si no existe, avisar cómo instalarlo)
    try {
      const { error: shippingFnErr } = await supabase.rpc('get_shipping_cost', {
        p_empresa_envio: 'Andreani',
        p_tipo_envio: 'Domicilio',
      } as any);

      if (shippingFnErr) {
        // Si existe pero error por firma/permiso, lo dejamos pasar y solo logueamos
        console.debug('Shipping cost RPC returned error (non-fatal):', shippingFnErr);
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.toLowerCase().includes('get_shipping_cost') && msg.toLowerCase().includes('does not exist')) {
        // Intentar aplicar migración si está instalada como SECURITY DEFINER
        try {
          const { error: applyErr } = await supabase.rpc('apply_restante_envio_migration');
          if (applyErr) {
            console.warn('⚠️ No se pudo aplicar migración restante+envío automáticamente:', applyErr);
          } else {
            console.log('✅ Migración aplicada correctamente (restante incluye envío)');
          }
        } catch {
          console.warn('⚠️ Falta instalar migración restante+envío en Supabase (ver setup-migration.sql).');
        }
      }
    }

    migrationChecked = true;
  } catch (error) {
    // Silenciar errores de migración, el código manejará la ausencia de la columna
    console.debug('Migration check:', error);
  } finally {
    migrationInProgress = false;
  }
};

