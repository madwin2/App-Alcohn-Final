import { supabase } from '../client';
import { ProductionItem, ProductionTask } from '../../types/index';
import { mapSelloToOrderItem, mapClienteToCustomer } from '../mappers';
import { Database } from '../types';

type SelloRow = Database['public']['Tables']['sellos']['Row'];
type ClienteRow = Database['public']['Tables']['clientes']['Row'];
type OrdenRow = Database['public']['Tables']['ordenes']['Row'];

// Mapear estado de fabricación a estado de producción
const mapToProductionState = (estadoFabricacion: string | null): 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADO' | 'REVISAR' | 'REHACER' => {
  const mapping: Record<string, 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADO' | 'REVISAR' | 'REHACER'> = {
    'Sin Hacer': 'PENDIENTE',
    'Haciendo': 'EN_PROGRESO',
    'Hecho': 'COMPLETADO',
    'Verificar': 'REVISAR',
    'Rehacer': 'REHACER',
    'Retocar': 'EN_PROGRESO',
    'Programado': 'PENDIENTE', // Programado se mapea a PENDIENTE
    'Prioridad': 'PENDIENTE',
  };
  return estadoFabricacion ? (mapping[estadoFabricacion] || 'PENDIENTE') : 'PENDIENTE';
};

// Obtener todos los items de producción (sellos con sus órdenes y clientes)
export const getProductionItems = async (): Promise<ProductionItem[]> => {
  try {
    // Obtener todos los sellos con sus órdenes y clientes
    const { data: sellos, error: sellosError } = await supabase
      .from('sellos')
      .select(`
        *,
        ordenes!inner (
          id,
          taken_by,
          clientes (*)
        )
      `)
      .order('created_at', { ascending: false });

    if (sellosError) throw sellosError;
    if (!sellos) return [];

    // Obtener todas las tareas para todas las órdenes (solo tareas de producción)
    const ordenIds = [...new Set(sellos.map(s => s.orden_id))];
    const { data: tareas, error: tareasError } = await supabase
      .from('tareas')
      .select('*')
      .in('orden_id', ordenIds)
      .eq('contexto', 'PRODUCCION');

    if (tareasError) {
      console.warn('Error fetching tasks:', tareasError);
    }

    // Agrupar tareas por orden
    const tareasPorOrden = new Map<string, any[]>();
    tareas?.forEach(tarea => {
      const lista = tareasPorOrden.get(tarea.orden_id) || [];
      lista.push(tarea);
      tareasPorOrden.set(tarea.orden_id, lista);
    });

    // Obtener información de usuarios únicos que han creado pedidos (si existe taken_by)
    const takenByUserIds = [...new Set(sellos.map(s => (s.ordenes as any)?.taken_by).filter(Boolean))];
    const usersMap = new Map<string, { id: string; name: string }>();
    
    if (takenByUserIds.length > 0) {
      try {
        const { data: usuarios, error: usuariosError } = await supabase
          .from('solicitudes_registro')
          .select('user_id, nombre, apellido, email')
          .in('user_id', takenByUserIds)
          .eq('estado', 'APROBADO');

        if (!usuariosError && usuarios) {
          usuarios.forEach(user => {
            const name = user.nombre && user.apellido 
              ? `${user.nombre} ${user.apellido}` 
              : user.nombre || user.apellido || user.email || 'Usuario';
            usersMap.set(user.user_id, { id: user.user_id, name });
          });
        }
      } catch (error) {
        console.warn('Error fetching user information:', error);
      }
    }

    // Mapear tareas a ProductionTask
    // ProductionState es: 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADO' | 'REVISAR' | 'REHACER'
    const mapTareaToProductionTask = (tarea: any): ProductionTask => ({
      id: tarea.id,
      orderId: tarea.orden_id,
      title: tarea.titulo,
      description: tarea.descripcion || undefined,
      status: tarea.estado === 'PENDING' ? 'PENDIENTE' :
              tarea.estado === 'IN_PROGRESS' ? 'EN_PROGRESO' :
              tarea.estado === 'COMPLETED' ? 'COMPLETADO' : 'PENDIENTE',
      createdAt: tarea.created_at,
      completedAt: tarea.completada_at || undefined,
      dueDate: tarea.fecha_limite ? `${tarea.fecha_limite}T00:00:00Z` : undefined,
    });

    // Mapear a ProductionItem
    const items: ProductionItem[] = sellos.map(sello => {
      const orden = sello.ordenes as unknown as OrdenRow & { clientes: ClienteRow; taken_by?: string | null };
      const cliente = orden.clientes;
      const takenByUserId = orden.taken_by;
      const takenBy = takenByUserId && usersMap.has(takenByUserId) 
        ? usersMap.get(takenByUserId)! 
        : null;
      
      // Obtener tareas de esta orden
      const tareasDeOrden = tareasPorOrden.get(sello.orden_id) || [];
      const productionTasks = tareasDeOrden.map(mapTareaToProductionTask);

      // Calcular medidas
      const widthMm = sello.ancho_real ? Number(sello.ancho_real) * 10 : 50;
      const heightMm = sello.largo_real ? Number(sello.largo_real) * 10 : 30;

      // Mapear tipo de sello
      const stampTypeMap: Record<string, 'CLASICO' | '3MM' | 'LACRE' | 'ALIMENTO' | 'ABC'> = {
        'Clasico': 'CLASICO',
        '3mm': '3MM',
        'Lacre': 'LACRE',
        'Alimento': 'ALIMENTO',
        'ABC': 'ABC',
      };
      const stampType = sello.tipo ? (stampTypeMap[sello.tipo] || 'CLASICO') : 'CLASICO';

      // Obtener estado de vectorización desde la BD, o calcularlo desde archivos si no existe
      let vectorizationState: 'BASE' | 'VECTORIZADO' | 'DESCARGADO' | 'EN_PROCESO' = 'BASE';
      
      // Si hay un estado guardado en la BD, usarlo
      if ((sello as any).estado_vectorizacion) {
        vectorizationState = (sello as any).estado_vectorizacion as 'BASE' | 'VECTORIZADO' | 'DESCARGADO' | 'EN_PROCESO';
      } else {
        // Si no hay estado guardado, calcularlo desde archivos (comportamiento legacy)
        if (sello.foto_sello) {
          vectorizationState = 'VECTORIZADO';
        }
        if (sello.archivo_base && sello.foto_sello) {
          vectorizationState = 'DESCARGADO';
        }
      }

      // Obtener programa desde el campo programa_nombre
      // IMPORTANTE: NO inferir el programa desde la máquina - debe estar vacío hasta que se complete manualmente
      let program = (sello as any).programa_nombre || '';

      return {
        id: sello.id,
        orderId: sello.orden_id,
        designName: sello.diseno || 'Sin diseño',
        requestedWidthMm: widthMm,
        requestedHeightMm: heightMm,
        stampType,
        productionState: mapToProductionState(sello.estado_fabricacion),
        isPriority: (sello as any).es_prioritario === true || (sello as any).es_prioritario === 'true',
        vectorizationState,
        program,
        aspireState: (sello as any).estado_aspire || null,
        machine: sello.maquina || null,
        notes: sello.nota || undefined,
        deadline: sello.fecha_limite ? `${sello.fecha_limite}T00:00:00Z` : null,
        takenBy,
        files: {
          baseUrl: sello.archivo_base || undefined,
          vectorUrl: undefined, // No hay campo vector en la BD
          photoUrl: sello.foto_sello || undefined,
        },
        tasks: productionTasks,
      };
    });

    return items;
  } catch (error) {
    console.error('Error fetching production items:', error);
    throw error;
  }
};

// Actualizar estado de producción de un sello
export const updateProductionItem = async (
  itemId: string,
  updates: Partial<ProductionItem>
): Promise<ProductionItem> => {
  try {
    // Obtener el item actual completo antes de actualizar para preservar valores que no se están actualizando
    // Esto es necesario para mantener el vectorizationState actual si no se está actualizando explícitamente
    const currentItem = await getProductionItems().then(items => items.find(item => item.id === itemId));
    
    // Obtener también los archivos del sello para calcular vectorizationState si es necesario
    const { data: currentSello } = await supabase
      .from('sellos')
      .select('archivo_base, foto_sello')
      .eq('id', itemId)
      .single();
    
    // Usar el vectorizationState actual del item si existe, sino calcularlo desde archivos
    // Esto preserva estados como 'EN_PROCESO' que no se pueden calcular desde archivos
    let currentVectorizationState: 'BASE' | 'VECTORIZADO' | 'DESCARGADO' | 'EN_PROCESO' = 'BASE';
    if (currentItem && currentItem.vectorizationState) {
      // Si tenemos el item actual, usar su vectorizationState
      currentVectorizationState = currentItem.vectorizationState;
    } else if (currentSello) {
      // Si no tenemos el item, calcular desde archivos como fallback
      if (currentSello.foto_sello && currentSello.archivo_base) {
        currentVectorizationState = 'DESCARGADO';
      } else if (currentSello.foto_sello) {
        currentVectorizationState = 'VECTORIZADO';
      }
    }

    // Mapear estado de producción a estado de fabricación
    const mapToFabricationState = (state: string): string => {
      const mapping: Record<string, string> = {
        'PENDIENTE': 'Sin Hacer',
        'EN_PROGRESO': 'Haciendo',
        'COMPLETADO': 'Hecho',
        'REVISAR': 'Verificar',
        'REHACER': 'Rehacer',
      };
      return mapping[state] || 'Sin Hacer';
    };

    const updateData: Partial<SelloRow> = {};

    if (updates.productionState) {
      updateData.estado_fabricacion = mapToFabricationState(updates.productionState) as any;
      // Regla de negocio: si el usuario cambia el estado de fabricación, se debe limpiar Aspire
      // (Aspire solo aplica cuando está "Programado").
      if (updates.aspireState === undefined) {
        (updateData as any).estado_aspire = null;
      }
    }

    // Guardar vectorizationState en la BD si se está actualizando explícitamente
    if (updates.vectorizationState !== undefined) {
      (updateData as any).estado_vectorizacion = updates.vectorizationState;
    }

    if (updates.notes !== undefined) {
      updateData.nota = updates.notes || null;
    }

    if (updates.files) {
      if (updates.files.baseUrl !== undefined) {
        updateData.archivo_base = updates.files.baseUrl || null;
      }
      if (updates.files.photoUrl !== undefined) {
        updateData.foto_sello = updates.files.photoUrl || null;
      }
    }

    if (updates.aspireState !== undefined) {
      (updateData as any).estado_aspire = updates.aspireState || null;
      // Regla de negocio: si hay estado Aspire, el estado de fabricación debe ser "Programado".
      // Si se limpia Aspire (y no se está seteando explícitamente productionState), volver a "Sin Hacer"
      // para evitar que quede "Programado" sin Aspire asociado.
      if (updates.aspireState) {
        updateData.estado_fabricacion = 'Programado' as any;
      } else if (!updates.productionState) {
        updateData.estado_fabricacion = 'Sin Hacer' as any;
      }
    }

    if (updates.machine !== undefined) {
      updateData.maquina = updates.machine || null;
      // IMPORTANTE: No actualizar programa automáticamente cuando se cambia la máquina
      // El programa solo se actualiza si se pasa explícitamente en updates.program
    }

    if (updates.deadline !== undefined) {
      updateData.fecha_limite = updates.deadline ? updates.deadline.split('T')[0] : null;
    }

    if (updates.program !== undefined) {
      (updateData as any).programa_nombre = updates.program || null;
    }
    // Si program NO está en updates, NO tocar programa_nombre en la BD

    // Guardar isPriority en la columna es_prioritario (separada del estado de fabricación)
    if (updates.isPriority !== undefined) {
      (updateData as any).es_prioritario = updates.isPriority;
    }
    // Esto asegura que el programa no cambie automáticamente

    const { error } = await supabase
      .from('sellos')
      .update(updateData)
      .eq('id', itemId);

    if (error) throw error;

    // Obtener el sello actualizado con sus relaciones
    const { data: updatedSello, error: fetchError } = await supabase
      .from('sellos')
      .select(`
        *,
        ordenes!inner (
          id,
          taken_by,
          clientes (*)
        )
      `)
      .eq('id', itemId)
      .single();

    if (fetchError || !updatedSello) {
      // Si falla, obtener todos los items y buscar el actualizado
      const items = await getProductionItems();
      const updatedItem = items.find(item => item.id === itemId);
      if (!updatedItem) throw new Error('Item not found after update');
      return updatedItem;
    }

    // Mapear el sello actualizado a ProductionItem
    const orden = updatedSello.ordenes as unknown as OrdenRow & { clientes: ClienteRow; taken_by?: string | null };
    const cliente = orden.clientes;
    
    // Obtener información del usuario si existe taken_by
    let takenBy: { id: string; name: string } | null = null;
    if (orden.taken_by) {
      try {
        const { data: usuario } = await supabase
          .from('solicitudes_registro')
          .select('user_id, nombre, apellido, email')
          .eq('user_id', orden.taken_by)
          .eq('estado', 'APROBADO')
          .single();

        if (usuario) {
          const name = usuario.nombre && usuario.apellido 
            ? `${usuario.nombre} ${usuario.apellido}` 
            : usuario.nombre || usuario.apellido || usuario.email || 'Usuario';
          takenBy = { id: usuario.user_id, name };
        }
      } catch (error) {
        console.warn('Error fetching user information:', error);
      }
    }

    // Calcular medidas
    const widthMm = updatedSello.ancho_real ? Number(updatedSello.ancho_real) * 10 : 50;
    const heightMm = updatedSello.largo_real ? Number(updatedSello.largo_real) * 10 : 30;

    // Mapear tipo de sello
    const stampTypeMap: Record<string, 'CLASICO' | '3MM' | 'LACRE' | 'ALIMENTO' | 'ABC'> = {
      'Clasico': 'CLASICO',
      '3mm': '3MM',
      'Lacre': 'LACRE',
      'Alimento': 'ALIMENTO',
      'ABC': 'ABC',
    };
    const stampType = updatedSello.tipo ? (stampTypeMap[updatedSello.tipo] || 'CLASICO') : 'CLASICO';

    // Obtener estado de vectorización desde la BD actualizada, o usar el valor de updates
    let vectorizationState: 'BASE' | 'VECTORIZADO' | 'DESCARGADO' | 'EN_PROCESO';
    
    if (updates.vectorizationState !== undefined) {
      // Si se especificó explícitamente en updates, usar ese valor (ya se guardó en la BD)
      vectorizationState = updates.vectorizationState;
    } else if ((updatedSello as any).estado_vectorizacion) {
      // Si no se especificó en updates, usar el valor guardado en la BD
      vectorizationState = (updatedSello as any).estado_vectorizacion as 'BASE' | 'VECTORIZADO' | 'DESCARGADO' | 'EN_PROCESO';
    } else {
      // Si no hay valor en la BD, mantener el valor actual que calculamos antes de actualizar
      vectorizationState = currentVectorizationState;
    }

    // Obtener programa desde el campo programa_nombre
    // IMPORTANTE: NUNCA inferir el programa desde la máquina al actualizar
    // Solo usar el valor que está en la BD, o el valor explícitamente pasado en updates
    let program = (updatedSello as any).programa_nombre || '';
    
    // Si el programa fue explícitamente actualizado en los updates, usar ese valor
    if (updates.program !== undefined) {
      program = updates.program || '';
    }
    // Si no hay programa en la BD y no se pasó en updates, dejar vacío
    // NO usar mapeo basado en máquina aquí para evitar cambios automáticos

    // Obtener tareas de la orden (solo tareas de producción)
    const { data: tareas } = await supabase
      .from('tareas')
      .select('*')
      .eq('orden_id', orden.id)
      .eq('contexto', 'PRODUCCION');

    // Mapear tareas a ProductionTask
    const mapTareaToProductionTask = (tarea: any): ProductionTask => ({
      id: tarea.id,
      orderId: tarea.orden_id,
      title: tarea.titulo,
      description: tarea.descripcion || undefined,
      status: tarea.estado === 'PENDING' ? 'PENDIENTE' :
              tarea.estado === 'IN_PROGRESS' ? 'EN_PROGRESO' :
              tarea.estado === 'COMPLETED' ? 'COMPLETADO' : 'PENDIENTE',
      createdAt: tarea.created_at,
      completedAt: tarea.completada_at || undefined,
      dueDate: tarea.fecha_limite ? `${tarea.fecha_limite}T00:00:00Z` : undefined,
    });
    
    const productionTasks = (tareas || []).map(mapTareaToProductionTask);

    const updatedItem: ProductionItem = {
      id: updatedSello.id,
      orderId: updatedSello.orden_id,
      designName: updatedSello.diseno || 'Sin diseño',
      requestedWidthMm: widthMm,
      requestedHeightMm: heightMm,
      stampType,
      productionState: mapToProductionState(updatedSello.estado_fabricacion),
      isPriority: (updatedSello as any).es_prioritario === true || (updatedSello as any).es_prioritario === 'true',
      vectorizationState,
      program,
      aspireState: (updatedSello as any).estado_aspire || null,
      machine: updatedSello.maquina || null,
      notes: updatedSello.nota || undefined,
      deadline: updatedSello.fecha_limite ? `${updatedSello.fecha_limite}T00:00:00Z` : null,
      takenBy,
      files: {
        baseUrl: updatedSello.archivo_base || undefined,
        vectorUrl: undefined,
        photoUrl: updatedSello.foto_sello || undefined,
      },
      tasks: productionTasks,
    };

    return updatedItem;
  } catch (error) {
    console.error('Error updating production item:', error);
    throw error;
  }
};

