import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import {
  getTableViewConfig,
  saveTableViewConfig,
  TableViewConfig,
} from '../supabase/services/tableViews.service';

export function useTableViewPersistence<T extends TableViewConfig>(
  tabla: string,
  config: T,
  onLoadConfig: (config: Partial<T>) => void,
  configLoaded: boolean = false
) {
  const { user } = useAuth();
  const isInitialLoadRef = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const configRef = useRef<T>(config);
  const hasLoadedRef = useRef(false);
  const lastSavedConfigRef = useRef<string>('');

  // Serializar configuración para comparar cambios
  const configString = JSON.stringify(config);

  // Actualizar ref cuando cambie la config
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Cargar configuración al montar (solo una vez)
  useEffect(() => {
    if (!user || hasLoadedRef.current) return;

    const loadConfig = async () => {
      try {
        const savedConfig = await getTableViewConfig(user.id, tabla);
        if (savedConfig) {
          onLoadConfig(savedConfig as Partial<T>);
          // Guardar la configuración cargada como referencia
          lastSavedConfigRef.current = JSON.stringify(savedConfig);
        } else {
          // Si no hay configuración guardada, usar la actual como referencia
          lastSavedConfigRef.current = JSON.stringify(configRef.current);
        }
        // Marcar como cargado incluso si no hay configuración guardada
        hasLoadedRef.current = true;
        isInitialLoadRef.current = false;
      } catch (error) {
        console.error(`Error loading table view config for ${tabla}:`, error);
        // Marcar como cargado incluso si hay error
        hasLoadedRef.current = true;
        isInitialLoadRef.current = false;
        lastSavedConfigRef.current = JSON.stringify(configRef.current);
      }
    };

    loadConfig();
  }, [user, tabla, onLoadConfig]);

  // Guardar configuración cuando cambie (con debounce)
  useEffect(() => {
    if (!user || isInitialLoadRef.current || !hasLoadedRef.current) return;

    // Comparar con la última configuración guardada
    if (configString === lastSavedConfigRef.current) {
      return; // No hay cambios, no guardar
    }

    // Limpiar timeout anterior
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Guardar después de 1 segundo de inactividad
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveTableViewConfig(user.id, tabla, configRef.current);
        lastSavedConfigRef.current = configString;
        console.log(`Configuración guardada para tabla ${tabla}`);
      } catch (error) {
        console.error(`Error saving table view config for ${tabla}:`, error);
      }
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [user, tabla, configString]);
}
