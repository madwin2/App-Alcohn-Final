import { supabase } from '../client';
import { Order, OrderItem, Customer, NewOrderFormData, Task, ShippingCarrier, ShippingServiceDest, ShippingState } from '../../types/index';
import { 
  mapOrdenToOrder, 
  mapSelloToOrderItem, 
  mapClienteToCustomer, 
  mapCustomerToCliente, 
  mapOrderItemToSello, 
  mapOrderToOrden,
  mapShippingCarrierToDB,
  mapShippingServiceToDB,
  mapSaleStateToDB,
  mapFabricationStateToDB,
  mapStampTypeToDB,
  mapShippingStateToDB,
} from '../mappers';
import { Database } from '../types';
import { uploadFile, generateFilePath, uploadVectorFileWithPreview } from './storage.service';
import { runMigrations } from '../migrations';

type ClienteRow = Database['public']['Tables']['clientes']['Row'];
type OrdenRow = Database['public']['Tables']['ordenes']['Row'];
type SelloRow = Database['public']['Tables']['sellos']['Row'];

// Obtener todas las órdenes con sus relaciones
export const getOrders = async (): Promise<Order[]> => {
  try {
    // Ejecutar migraciones necesarias (solo la primera vez)
    await runMigrations();
    // Obtener todas las órdenes con sus clientes
    const { data: ordenes, error: ordenesError } = await supabase
      .from('ordenes')
      .select(`
        *,
        clientes (*)
      `)
      .order('fecha', { ascending: false });

    if (ordenesError) throw ordenesError;
    if (!ordenes) return [];

    // Obtener todos los sellos para todas las órdenes
    const ordenIds = ordenes.map(o => o.id);
    const { data: sellos, error: sellosError } = await supabase
      .from('sellos')
      .select('*')
      .in('orden_id', ordenIds);

    if (sellosError) throw sellosError;

    // Obtener todas las tareas para todas las órdenes (solo tareas de pedidos)
    const { data: tareas, error: tareasError } = await supabase
      .from('tareas')
      .select('*')
      .in('orden_id', ordenIds)
      .eq('contexto', 'PEDIDOS');

    if (tareasError) throw tareasError;

    // Obtener información de usuarios únicos que han creado pedidos (si existe taken_by)
    const takenByUserIds = [...new Set(ordenes.map(o => (o as any).taken_by).filter(Boolean))];
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

    // Agrupar sellos por orden
    const sellosPorOrden = new Map<string, SelloRow[]>();
    sellos?.forEach(sello => {
      const lista = sellosPorOrden.get(sello.orden_id) || [];
      lista.push(sello);
      sellosPorOrden.set(sello.orden_id, lista);
    });

    // Agrupar tareas por orden
    const tareasPorOrden = new Map<string, any[]>();
    tareas?.forEach(tarea => {
      const lista = tareasPorOrden.get(tarea.orden_id) || [];
      lista.push(tarea);
      tareasPorOrden.set(tarea.orden_id, lista);
    });

    // Mapear a Order
    const orders: Order[] = ordenes.map(orden => {
      const cliente = orden.clientes as unknown as ClienteRow;
      const sellosDeOrden = sellosPorOrden.get(orden.id) || [];
      const tareasDeOrden = tareasPorOrden.get(orden.id) || [];
      const takenByUserId = (orden as any).taken_by;
      const takenBy = takenByUserId && usersMap.has(takenByUserId) 
        ? usersMap.get(takenByUserId)! 
        : null;
      return mapOrdenToOrder(orden, cliente, sellosDeOrden, tareasDeOrden, takenBy);
    });

    return orders;
  } catch (error) {
    console.error('Error fetching orders:', error);
    throw error;
  }
};

// Obtener una orden por ID
export const getOrderById = async (orderId: string): Promise<Order | null> => {
  try {
    const { data: orden, error: ordenError } = await supabase
      .from('ordenes')
      .select(`
        *,
        clientes (*)
      `)
      .eq('id', orderId)
      .single();

    if (ordenError) throw ordenError;
    if (!orden) return null;

    const { data: sellos, error: sellosError } = await supabase
      .from('sellos')
      .select('*')
      .eq('orden_id', orderId);

    if (sellosError) throw sellosError;

    const { data: tareas, error: tareasError } = await supabase
      .from('tareas')
      .select('*')
      .eq('orden_id', orderId)
      .eq('contexto', 'PEDIDOS');

    if (tareasError) throw tareasError;

    const cliente = orden.clientes as unknown as ClienteRow;
    // Obtener información del usuario si existe taken_by
    let takenBy: { id: string; name: string } | null = null;
    if ((orden as any).taken_by) {
      try {
        const { data: usuario } = await supabase
          .from('solicitudes_registro')
          .select('user_id, nombre, apellido, email')
          .eq('user_id', (orden as any).taken_by)
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
    return mapOrdenToOrder(orden, cliente, sellos || [], tareas || [], takenBy);
  } catch (error) {
    console.error('Error fetching order:', error);
    throw error;
  }
};

// Buscar cliente por teléfono
export const findCustomerByPhone = async (phone: string): Promise<Customer | null> => {
  try {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('telefono', phone)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
    if (!data) return null;

    return mapClienteToCustomer(data);
  } catch (error) {
    console.error('Error finding customer:', error);
    throw error;
  }
};

// Crear cliente
export const createCustomer = async (customer: Customer): Promise<Customer> => {
  try {
    const clienteData = mapCustomerToCliente(customer);
    const { data, error } = await supabase
      .from('clientes')
      .insert(clienteData)
      .select()
      .single();

    if (error) throw error;
    return mapClienteToCustomer(data);
  } catch (error) {
    console.error('Error creating customer:', error);
    throw error;
  }
};

// Crear orden completa (cliente, orden, sellos)
export const createOrder = async (formData: NewOrderFormData): Promise<Order> => {
  try {
    // 1. Buscar o crear cliente
    let cliente: Customer;
    const existingCliente = await findCustomerByPhone(formData.customer.phoneE164);
    
    if (existingCliente) {
      cliente = existingCliente;
      // Actualizar datos del cliente si es necesario
      const customerForMapping: Customer = {
        id: cliente.id,
        firstName: formData.customer.firstName,
        lastName: formData.customer.lastName,
        phoneE164: formData.customer.phoneE164,
        email: formData.customer.email,
      };
      const clienteData = mapCustomerToCliente(customerForMapping);
      await supabase
        .from('clientes')
        .update(clienteData)
        .eq('id', cliente.id);
    } else {
      cliente = await createCustomer({
        id: '', // Se generará en la BD
        firstName: formData.customer.firstName,
        lastName: formData.customer.lastName,
        phoneE164: formData.customer.phoneE164,
        email: formData.customer.email,
        dni: undefined,
      });
    }

    // 2. Obtener usuario actual para taken_by
    const { data: { user } } = await supabase.auth.getUser();
    const takenByUserId = user?.id || null;

    // 3. Crear orden
    const ordenData = mapOrderToOrden(
      {
        shipping: formData.shipping,
        saleStateOrder: 'SEÑADO',
        orderDate: new Date().toISOString(),
      },
      cliente.id
    );

    // Agregar taken_by si existe usuario
    if (takenByUserId) {
      (ordenData as any).taken_by = takenByUserId;
    }

    const { data: orden, error: ordenError } = await supabase
      .from('ordenes')
      .insert(ordenData)
      .select()
      .single();

    if (ordenError) throw ordenError;

    // 3. Crear sello primero (sin archivos aún)
    const selloDataSinArchivos = mapOrderItemToSello(
      {
        id: '',
        orderId: orden.id,
        designName: formData.order.designName,
        requestedWidthMm: formData.order.requestedWidthMm,
        requestedHeightMm: formData.order.requestedHeightMm,
        stampType: formData.order.stampType,
        notes: formData.order.notes,
        itemValue: formData.values.totalValue,
        fabricationState: formData.states.fabrication,
        isPriority: formData.states.isPriority,
        saleState: formData.states.sale,
        shippingState: formData.states.shipping,
        depositValueItem: formData.values.depositValue,
        restPaidAmountItem: formData.values.totalValue - formData.values.depositValue,
        paidAmountItemCached: formData.values.depositValue,
        balanceItemCached: formData.values.totalValue - formData.values.depositValue,
        files: {}, // Sin archivos aún
        contact: formData.customer,
      },
      orden.id,
      {
        id: cliente.id,
        nombre: cliente.firstName,
        apellido: cliente.lastName,
        telefono: cliente.phoneE164,
        mail: cliente.email || null,
        dni: cliente.dni || null,
        medio_contacto: formData.customer.channel === 'WHATSAPP' ? 'Whatsapp' : 
                       formData.customer.channel === 'INSTAGRAM' ? 'Instagram' :
                       formData.customer.channel === 'FACEBOOK' ? 'Facebook' :
                       formData.customer.channel === 'MAIL' ? 'Mail' : 'Whatsapp',
        created_at: null,
        updated_at: null,
      }
    );

    const { data: sello, error: selloError } = await supabase
      .from('sellos')
      .insert(selloDataSinArchivos)
      .select()
      .single();

    if (selloError) throw selloError;

    // 4. Subir archivos a Storage si existen (ahora que tenemos el ID del sello)
    const fileUrls: { baseUrl?: string; vectorUrl?: string; vectorPreviewUrl?: string; photoUrl?: string } = {};
    
    if (formData.files?.base) {
      try {
        const filePath = generateFilePath(orden.id, 'base', formData.files.base.name, sello.id);
        fileUrls.baseUrl = await uploadFile('base', formData.files.base, filePath);
      } catch (error) {
        console.error('Error uploading base file:', error);
        // Continuar sin el archivo base si falla
      }
    }
    
    if (formData.files?.vector) {
      try {
        const filePath = generateFilePath(orden.id, 'vector', formData.files.vector.name, sello.id);
        const isEps = formData.files.vector.name.toLowerCase().endsWith('.eps');
        
        if (isEps) {
          // Si es EPS, usar la función que genera preview
          const result = await uploadVectorFileWithPreview('vector', formData.files.vector, filePath);
          fileUrls.vectorUrl = result.originalUrl;
          fileUrls.vectorPreviewUrl = result.previewUrl;
        } else {
          // Para otros formatos, subir normalmente
          fileUrls.vectorUrl = await uploadFile('vector', formData.files.vector, filePath);
        }
      } catch (error) {
        console.error('Error uploading vector file:', error);
        // Continuar sin el archivo vector si falla
      }
    }
    
    if (formData.files?.photo) {
      try {
        const filePath = generateFilePath(orden.id, 'foto', formData.files.photo.name, sello.id);
        fileUrls.photoUrl = await uploadFile('foto', formData.files.photo, filePath);
      } catch (error) {
        console.error('Error uploading photo file:', error);
        // Continuar sin el archivo foto si falla
      }
    }

    // 5. Actualizar el sello con las URLs de los archivos si se subieron
    if (Object.keys(fileUrls).length > 0) {
      const updateData: any = {};
      if (fileUrls.baseUrl) updateData.archivo_base = fileUrls.baseUrl;
      if (fileUrls.photoUrl) updateData.foto_sello = fileUrls.photoUrl;
      if (fileUrls.vectorPreviewUrl) updateData.archivo_vector_preview = fileUrls.vectorPreviewUrl;
      
      // Si se subió un vector, setear estado_vectorizacion = 'VECTORIZADO'
      // Si no se subió vector, setear estado_vectorizacion = 'BASE' (por defecto)
      if (fileUrls.vectorUrl || fileUrls.vectorPreviewUrl) {
        updateData.estado_vectorizacion = 'VECTORIZADO';
      } else {
        updateData.estado_vectorizacion = 'BASE';
      }
      
      await supabase
        .from('sellos')
        .update(updateData)
        .eq('id', sello.id);
    } else {
      // Si no se subieron archivos, setear estado_vectorizacion = 'BASE' por defecto
      await supabase
        .from('sellos')
        .update({ estado_vectorizacion: 'BASE' })
        .eq('id', sello.id);
    }

    // 6. Obtener la orden completa
    return await getOrderById(orden.id) || orden as unknown as Order;
  } catch (error) {
    console.error('Error creating order:', error);
    throw error;
  }
};

// Actualizar orden
export const updateOrder = async (orderId: string, updates: Partial<Order>): Promise<Order> => {
  try {
    // Primero obtener la orden existente para tener el cliente_id
    const existingOrder = await getOrderById(orderId);
    if (!existingOrder) {
      throw new Error('Order not found');
    }

    // Actualizar cliente si se proporciona
    if (updates.customer) {
      const clienteData = mapCustomerToCliente(updates.customer);
      const { error: clienteError } = await supabase
        .from('clientes')
        .update(clienteData)
        .eq('id', existingOrder.customer.id);

      if (clienteError) throw clienteError;
    }

    // Preparar datos de orden para actualizar
    const ordenData: any = {};

    // Si el estado de envío viene en algún item, usarlo para actualizar estado_envio de la orden
    // (el estado de envío es un campo a nivel orden, no por sello)
    let newShippingStateFromItems: ShippingState | undefined;
    if (updates.items && updates.items.length > 0) {
      for (const item of updates.items) {
        if (item.shippingState !== undefined) {
          newShippingStateFromItems = item.shippingState as ShippingState;
          break;
        }
      }
    }

    if (updates.shipping) {
      // Si carrier es 'OTRO' o vacío/null, no guardar empresa_envio (o guardarlo como null)
      if (updates.shipping.carrier && updates.shipping.carrier !== 'OTRO') {
        ordenData.empresa_envio = mapShippingCarrierToDB(updates.shipping.carrier);
        ordenData.tipo_envio = updates.shipping.service ? mapShippingServiceToDB(updates.shipping.service) : null;
      } else {
        // Para 'OTRO' o vacío, no guardar empresa_envio (o guardarlo como null/Retiro)
        ordenData.empresa_envio = null;
        ordenData.tipo_envio = null;
      }
      ordenData.seguimiento = updates.shipping.trackingNumber || null;
    }
    
    if (updates.saleStateOrder) {
      ordenData.estado_orden = mapSaleStateToDB(updates.saleStateOrder);
    }

    // Actualizar estado_envio si vino desde los items
    if (newShippingStateFromItems) {
      ordenData.estado_envio = mapShippingStateToDB(newShippingStateFromItems);
    }
    
    if (updates.orderDate) {
      ordenData.fecha = updates.orderDate.split('T')[0];
    }

    // Actualizar fecha límite en todos los sellos de la orden si se proporciona
    if (updates.deadlineAt !== undefined) {
      const fechaLimite = updates.deadlineAt ? updates.deadlineAt.split('T')[0] : null;
      const { error: fechaLimiteError } = await supabase
        .from('sellos')
        .update({ fecha_limite: fechaLimite })
        .eq('orden_id', orderId);

      if (fechaLimiteError) throw fechaLimiteError;
    }

    // Actualizar orden solo si hay datos para actualizar
    if (Object.keys(ordenData).length > 0) {
      const { error: ordenError } = await supabase
        .from('ordenes')
        .update(ordenData)
        .eq('id', orderId);

      if (ordenError) throw ordenError;
    }

    // Si hay actualizaciones en los items, actualizar los sellos
    if (updates.items && updates.items.length > 0) {
      // Obtener todos los sellos de la orden de una vez para calcular restantes correctamente
      // e inspeccionar el estado de fabricación actual (para manejar prioridad)
      const { data: allSellos } = await supabase
        .from('sellos')
        .select('id, valor, senia, estado_fabricacion, es_prioritario')
        .eq('orden_id', orderId);

      const sellosMap = new Map(allSellos?.map(s => [s.id, s]) || []);

      for (const item of updates.items) {
        // Solo actualizar si el item tiene un ID (item específico)
        if (!item.id) {
          console.warn('Item update sin ID, saltando...');
          continue;
        }

        const selloData: any = {};
        const currentSello = sellosMap.get(item.id);
        
        if (item.stampType !== undefined) {
          selloData.tipo = mapStampTypeToDB(item.stampType);
        }
        if (item.designName !== undefined) {
          selloData.diseno = item.designName;
        }
        if (item.notes !== undefined) {
          selloData.nota = item.notes || null;
        }
        if (item.itemValue !== undefined) {
          selloData.valor = item.itemValue;
        }
        if (item.depositValueItem !== undefined) {
          selloData.senia = item.depositValueItem;
        }
        
        // El restante se calcula automáticamente por el trigger de la base de datos
        // No es necesario calcularlo manualmente aquí
        if (item.fabricationState !== undefined) {
          const isCurrentlyPriority = currentSello?.estado_fabricacion === 'Prioridad';
          const priorityExplicitlyChanged = item.isPriority !== undefined;

          // Regla:
          // - Si el sello está en 'Prioridad' y NO se está cambiando explícitamente isPriority,
          //   NO pisar estado_fabricacion para que la prioridad se mantenga.
          // - En cualquier otro caso, sí actualizar estado_fabricacion según fabricationState.
          if (!(isCurrentlyPriority && !priorityExplicitlyChanged)) {
            selloData.estado_fabricacion = mapFabricationStateToDB(item.fabricationState);
          }
        }
        // Manejar isPriority: guardar en la columna es_prioritario (separada del estado de fabricación)
        if (item.isPriority !== undefined) {
          selloData.es_prioritario = item.isPriority;
        }
        if (item.saleState !== undefined) {
          selloData.estado_venta = mapSaleStateToDB(item.saleState);
        }
        // Manejar eliminación de archivos: si files existe y el campo está presente (incluso si es undefined), actualizar
        if (item.files && 'baseUrl' in item.files) {
          selloData.archivo_base = item.files.baseUrl || null;
        }
        if (item.files && 'photoUrl' in item.files) {
          selloData.foto_sello = item.files.photoUrl || null;
        }
        // El vector se maneja a través de vectorPreviewUrl (archivo_vector_preview en BD)
        // Si se elimina vectorUrl o vectorPreviewUrl, eliminamos el preview
        if (item.files && ('vectorUrl' in item.files || 'vectorPreviewUrl' in item.files)) {
          // Si vectorPreviewUrl está presente (incluso si es undefined), actualizar
          if ('vectorPreviewUrl' in item.files) {
            selloData.archivo_vector_preview = item.files.vectorPreviewUrl || null;
          } else if ('vectorUrl' in item.files && !item.files.vectorUrl) {
            // Si vectorUrl se elimina, también eliminar el preview
            selloData.archivo_vector_preview = null;
          }
        }
        if (item.requestedWidthMm !== undefined) {
          selloData.ancho_real = item.requestedWidthMm ? (item.requestedWidthMm / 10).toString() : null;
        }
        if (item.requestedHeightMm !== undefined) {
          selloData.largo_real = item.requestedHeightMm ? (item.requestedHeightMm / 10).toString() : null;
        }

        // Actualizar fecha_limite si viene en el item (aunque normalmente viene en deadlineAt de la orden)
        // Esto permite actualizar fecha_limite por item si es necesario

        // Solo actualizar si hay datos para actualizar
        if (Object.keys(selloData).length > 0) {
          // Si es_prioritario está en selloData pero la columna no existe, intentar sin ella
          const hasPriorityUpdate = 'es_prioritario' in selloData;
          const selloDataWithoutPriority = { ...selloData };
          if (hasPriorityUpdate) {
            delete selloDataWithoutPriority.es_prioritario;
          }

          const { error: selloError } = await supabase
            .from('sellos')
            .update(selloData)
            .eq('id', item.id)
            .eq('orden_id', orderId); // Asegurar que el sello pertenece a la orden

          // Si el error es por columna no encontrada (es_prioritario), intentar sin ella
          if (selloError && hasPriorityUpdate && (
            selloError.message?.includes('column "es_prioritario"') ||
            selloError.message?.includes('does not exist') ||
            selloError.code === '42703' // PostgreSQL error code for undefined column
          )) {
            console.warn('Columna es_prioritario no existe aún. Ejecuta la migración migration_add_es_prioritario.sql. Continuando sin actualizar prioridad...');
            // Intentar actualizar sin es_prioritario
            const { error: retryError } = await supabase
              .from('sellos')
              .update(selloDataWithoutPriority)
              .eq('id', item.id)
              .eq('orden_id', orderId);
            
            if (retryError) {
              console.error('Error updating stamp:', retryError);
              throw retryError;
            }
          } else if (selloError) {
            console.error('Error updating stamp:', selloError);
            throw selloError;
          }
        }
      }

      // Los valores totales (valor_total, senia_total, restante) se calculan automáticamente
      // por los triggers de la base de datos, no es necesario calcularlos manualmente aquí
      
      // Solo actualizar estados generales si todos los items tienen el mismo estado
      const updatedOrder = await getOrderById(orderId);
      if (updatedOrder && updatedOrder.items.length > 0) {
        // Verificar si todos los items tienen el mismo estado
        const allSaleStates = updatedOrder.items.map(item => item.saleState).filter(Boolean);
        const uniqueSaleStates = [...new Set(allSaleStates)];

        const ordenUpdateData: any = {};

        // Actualizar estado general solo si todos los items tienen el mismo estado de venta
        if (uniqueSaleStates.length === 1 && uniqueSaleStates[0]) {
          ordenUpdateData.estado_orden = mapSaleStateToDB(uniqueSaleStates[0] as any);
        }

        // Actualizar la orden solo si hay cambios en estados
        if (Object.keys(ordenUpdateData).length > 0) {
          const { error: ordenUpdateError } = await supabase
            .from('ordenes')
            .update(ordenUpdateData)
            .eq('id', orderId);

          if (ordenUpdateError) {
            console.error('Error updating order state:', ordenUpdateError);
            throw ordenUpdateError;
          }
        }
      }
    }

    // Obtener la orden actualizada
    return await getOrderById(orderId) || existingOrder;
  } catch (error) {
    console.error('Error updating order:', error);
    throw error;
  }
};

// Eliminar orden (cascada elimina sellos)
export const deleteOrder = async (orderId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('ordenes')
      .delete()
      .eq('id', orderId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting order:', error);
    throw error;
  }
};

// Agregar sello a una orden existente
export const addStampToOrder = async (orderId: string, item: Partial<OrderItem>, files?: { base?: File; vector?: File; photo?: File }): Promise<OrderItem> => {
  try {
    const orden = await getOrderById(orderId);
    if (!orden) throw new Error('Order not found');

    const selloData = mapOrderItemToSello(
      item as OrderItem,
      orderId,
      {
        id: orden.customer.id,
        nombre: orden.customer.firstName,
        apellido: orden.customer.lastName,
        telefono: orden.customer.phoneE164,
        mail: orden.customer.email || null,
        dni: orden.customer.dni || null,
        medio_contacto: null,
        created_at: null,
        updated_at: null,
      }
    );

    const { data: sello, error } = await supabase
      .from('sellos')
      .insert(selloData)
      .select()
      .single();

    if (error) throw error;

    // Subir archivos si existen
    const fileUrls: { baseUrl?: string; vectorUrl?: string; vectorPreviewUrl?: string; photoUrl?: string } = {};
    
    if (files?.base) {
      try {
        const filePath = generateFilePath(orderId, 'base', files.base.name, sello.id);
        fileUrls.baseUrl = await uploadFile('base', files.base, filePath);
      } catch (error) {
        console.error('Error uploading base file:', error);
      }
    }
    
    if (files?.vector) {
      try {
        const filePath = generateFilePath(orderId, 'vector', files.vector.name, sello.id);
        const isEps = files.vector.name.toLowerCase().endsWith('.eps');
        
        if (isEps) {
          const result = await uploadVectorFileWithPreview('vector', files.vector, filePath);
          fileUrls.vectorUrl = result.originalUrl;
          fileUrls.vectorPreviewUrl = result.previewUrl;
        } else {
          fileUrls.vectorUrl = await uploadFile('vector', files.vector, filePath);
        }
      } catch (error) {
        console.error('Error uploading vector file:', error);
      }
    }
    
    if (files?.photo) {
      try {
        const filePath = generateFilePath(orderId, 'foto', files.photo.name, sello.id);
        fileUrls.photoUrl = await uploadFile('foto', files.photo, filePath);
      } catch (error) {
        console.error('Error uploading photo file:', error);
      }
    }

    // Actualizar el sello con las URLs de los archivos si se subieron
    if (Object.keys(fileUrls).length > 0) {
      const updateData: any = {};
      if (fileUrls.baseUrl) updateData.archivo_base = fileUrls.baseUrl;
      if (fileUrls.photoUrl) updateData.foto_sello = fileUrls.photoUrl;
      if (fileUrls.vectorPreviewUrl) updateData.archivo_vector_preview = fileUrls.vectorPreviewUrl;
      
      // Si se subió un vector, setear estado_vectorizacion = 'VECTORIZADO'
      // Si no se subió vector, setear estado_vectorizacion = 'BASE' (por defecto)
      if (fileUrls.vectorUrl || fileUrls.vectorPreviewUrl) {
        updateData.estado_vectorizacion = 'VECTORIZADO';
      } else {
        updateData.estado_vectorizacion = 'BASE';
      }
      
      await supabase
        .from('sellos')
        .update(updateData)
        .eq('id', sello.id);
    }

    return mapSelloToOrderItem(sello, {
      id: orden.customer.id,
      nombre: orden.customer.firstName,
      apellido: orden.customer.lastName,
      telefono: orden.customer.phoneE164,
      mail: orden.customer.email || null,
      dni: orden.customer.dni || null,
      medio_contacto: null,
      created_at: null,
      updated_at: null,
    });
  } catch (error) {
    console.error('Error adding stamp to order:', error);
    throw error;
  }
};

// Crear tarea
export const createTask = async (orderId: string, title: string, description?: string, dueDate?: Date, contexto: 'PEDIDOS' | 'PRODUCCION' = 'PEDIDOS'): Promise<Task> => {
  try {
    const { data: tarea, error } = await supabase
      .from('tareas')
      .insert({
        orden_id: orderId,
        titulo: title,
        descripcion: description || null,
        fecha_limite: dueDate ? dueDate.toISOString().split('T')[0] : null,
        estado: 'PENDING',
        contexto: contexto,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: tarea.id,
      orderId: tarea.orden_id,
      title: tarea.titulo,
      description: tarea.descripcion || undefined,
      status: tarea.estado as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED',
      createdAt: tarea.created_at,
      completedAt: tarea.completada_at || undefined,
      dueDate: tarea.fecha_limite ? `${tarea.fecha_limite}T00:00:00Z` : undefined,
    };
  } catch (error) {
    console.error('Error creating task:', error);
    throw error;
  }
};

// Actualizar tarea
export const updateTask = async (taskId: string, updates: Partial<Task>): Promise<Task> => {
  try {
    const updateData: any = {};
    
    if (updates.title !== undefined) updateData.titulo = updates.title;
    if (updates.description !== undefined) updateData.descripcion = updates.description || null;
    if (updates.status !== undefined) {
      updateData.estado = updates.status;
      if (updates.status === 'COMPLETED' && !updates.completedAt) {
        updateData.completada_at = new Date().toISOString();
      } else if (updates.status !== 'COMPLETED') {
        updateData.completada_at = null;
      }
    }
    if (updates.dueDate !== undefined) {
      updateData.fecha_limite = updates.dueDate ? updates.dueDate.split('T')[0] : null;
    }
    if (updates.completedAt !== undefined) {
      updateData.completada_at = updates.completedAt || null;
    }

    const { data: tarea, error } = await supabase
      .from('tareas')
      .update(updateData)
      .eq('id', taskId)
      .select()
      .single();

    if (error) throw error;

    return {
      id: tarea.id,
      orderId: tarea.orden_id,
      title: tarea.titulo,
      description: tarea.descripcion || undefined,
      status: tarea.estado as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED',
      createdAt: tarea.created_at,
      completedAt: tarea.completada_at || undefined,
      dueDate: tarea.fecha_limite ? `${tarea.fecha_limite}T00:00:00Z` : undefined,
    };
  } catch (error) {
    console.error('Error updating task:', error);
    throw error;
  }
};

// Eliminar tarea
export const deleteTask = async (taskId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('tareas')
      .delete()
      .eq('id', taskId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting task:', error);
    throw error;
  }
};

//
export const deleteStamp = async (stampId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('sellos')
      .delete()
      .eq('id', stampId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting stamp:', error);
    throw error;
  }
};

// Obtener costo de envío según empresa y tipo de servicio
export const getShippingCost = async (
  carrier: ShippingCarrier | null | undefined,
  service: ShippingServiceDest | null | undefined
): Promise<number> => {
  // Si no hay empresa seleccionada, es "OTRO", o no hay servicio, retornar 0 (no suma al restante)
  if (!carrier || carrier === 'OTRO' || !service) {
    return 0;
  }

  try {
    // Mapear el carrier del frontend al formato de la base de datos
    const empresaMap: Record<ShippingCarrier, string> = {
      'ANDREANI': 'Andreani',
      'CORREO_ARGENTINO': 'Correo Argentino',
      'VIA_CARGO': 'Via Cargo',
      'OTRO': 'Retiro', // No debería llegar aquí por el check anterior
    };

    // Mapear el service del frontend al formato de la base de datos
    const servicioMap: Record<ShippingServiceDest, string> = {
      'DOMICILIO': 'Domicilio',
      'SUCURSAL': 'Sucursal',
    };

    const empresa = empresaMap[carrier];
    const servicio = servicioMap[service];

    if (!empresa || !servicio) {
      return 0;
    }

    const { data, error } = await supabase
      .from('costos_de_envio')
      .select('costo')
      .eq('empresa', empresa)
      .eq('servicio', servicio)
      .eq('activo', true)
      .order('activo_desde', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.warn('Error fetching shipping cost:', error);
      return 0;
    }

    return data?.costo ? Number(data.costo) : 0;
  } catch (error) {
    console.error('Error getting shipping cost:', error);
    return 0;
  }
};

// Obtener sellos disponibles para asignar fotos
// Criterios: estado_fabricacion = 'Hecho', foto_sello IS NULL, estado_venta = 'Señado'
export interface AvailableStampForPhoto {
  id: string;
  designName: string;
  orderId: string;
  orderDate: string;
  customerName: string;
}

export const getAvailableStampsForPhoto = async (): Promise<AvailableStampForPhoto[]> => {
  try {
    // Obtener sellos con estado_fabricacion = 'Hecho', estado_venta = 'Señado' (o NULL, que se mapea a 'Señado') y sin foto_sello
    // Primero los que tienen estado_venta = 'Señado' explícitamente
    const { data: sellosSeñado, error: sellosSeñadoError } = await supabase
      .from('sellos')
      .select('id, diseno, orden_id')
      .eq('estado_fabricacion', 'Hecho')
      .eq('estado_venta', 'Señado')
      .is('foto_sello', null);
    
    // Los que tienen estado_venta = 'Señado' y foto_sello vacío
    const { data: sellosSeñadoVacio, error: sellosSeñadoVacioError } = await supabase
      .from('sellos')
      .select('id, diseno, orden_id')
      .eq('estado_fabricacion', 'Hecho')
      .eq('estado_venta', 'Señado')
      .eq('foto_sello', '');
    
    // Los que tienen estado_venta IS NULL (que se mapean a 'Señado' por defecto)
    const { data: sellosNull, error: sellosNullError } = await supabase
      .from('sellos')
      .select('id, diseno, orden_id')
      .eq('estado_fabricacion', 'Hecho')
      .is('estado_venta', null)
      .is('foto_sello', null);
    
    // Los que tienen estado_venta IS NULL y foto_sello vacío
    const { data: sellosNullVacio, error: sellosNullVacioError } = await supabase
      .from('sellos')
      .select('id, diseno, orden_id')
      .eq('estado_fabricacion', 'Hecho')
      .is('estado_venta', null)
      .eq('foto_sello', '');
    
    // Combinar todos los resultados y eliminar duplicados
    const allSellos = [
      ...(sellosSeñado || []),
      ...(sellosSeñadoVacio || []),
      ...(sellosNull || []),
      ...(sellosNullVacio || [])
    ];
    
    const uniqueSellos = Array.from(
      new Map(allSellos.map((s: any) => [s.id, s])).values()
    );
    
    if (sellosSeñadoError || sellosSeñadoVacioError || sellosNullError || sellosNullVacioError) {
      throw sellosSeñadoError || sellosSeñadoVacioError || sellosNullError || sellosNullVacioError;
    }
    
    if (uniqueSellos.length === 0) return [];

    // Obtener los IDs de las órdenes únicas
    const ordenIds = [...new Set(uniqueSellos.map((s: any) => s.orden_id))];

    // Obtener las órdenes con sus clientes
    const { data: ordenes, error: ordenesError } = await supabase
      .from('ordenes')
      .select('id, fecha, cliente_id, clientes(id, nombre, apellido)')
      .in('id', ordenIds);

    if (ordenesError) throw ordenesError;

    // Crear un mapa de orden_id -> orden para acceso rápido
    const ordenesMap = new Map((ordenes || []).map((o: any) => [o.id, o]));

    // Combinar los datos
    return uniqueSellos.map((sello: any) => {
      const orden = ordenesMap.get(sello.orden_id);
      const cliente = orden?.clientes;

      return {
        id: sello.id,
        designName: sello.diseno || 'Sin diseño',
        orderId: sello.orden_id,
        orderDate: orden?.fecha || new Date().toISOString(),
        customerName: cliente 
          ? `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim() || 'Sin nombre'
          : 'Sin nombre',
      };
    });
  } catch (error) {
    console.error('Error getting available stamps for photo:', error);
    throw error;
  }
};

// Asignar una foto a un sello
export const assignPhotoToStamp = async (stampId: string, photoFile: File): Promise<void> => {
  try {
    // Obtener información del sello para generar el path y verificar el estado de venta
    const { data: sello, error: selloError } = await supabase
      .from('sellos')
      .select('orden_id, estado_venta')
      .eq('id', stampId)
      .single();

    if (selloError) throw selloError;
    if (!sello) throw new Error('Sello no encontrado');

    // Generar el path para la foto
    const filePath = generateFilePath(sello.orden_id, 'foto', photoFile.name, stampId);
    
    // Subir la foto
    const photoUrl = await uploadFile('foto', photoFile, filePath);

    // Preparar los datos de actualización
    const updateData: { foto_sello: string; estado_venta?: string } = { foto_sello: photoUrl };
    
    // Si el estado de venta actual es "Señado", cambiarlo a "Foto Enviada"
    if (sello.estado_venta === 'Señado') {
      updateData.estado_venta = 'Foto';
    }

    // Actualizar el sello con la URL de la foto y el estado de venta si corresponde
    const { error: updateError } = await supabase
      .from('sellos')
      .update(updateData)
      .eq('id', stampId);

    if (updateError) throw updateError;

    // Si había una foto pendiente asignada a este sello, marcarla como asignada
    await supabase
      .from('fotos_pendientes')
      .update({ asignada: true, sello_id: stampId, updated_at: new Date().toISOString() })
      .eq('sello_id', stampId)
      .eq('asignada', false);
  } catch (error) {
    console.error('Error assigning photo to stamp:', error);
    throw error;
  }
};

// Guardar una foto pendiente de asignación
export interface PendingPhoto {
  id: string;
  url: string;
  nombreArchivo: string;
  fechaSubida: string;
  selloId?: string;
}

export const savePendingPhoto = async (photoFile: File, selloId?: string): Promise<PendingPhoto> => {
  try {
    // Subir la foto a storage en una carpeta temporal
    const tempPath = `pendientes/${Date.now()}_${photoFile.name}`;
    const photoUrl = await uploadFile('foto', photoFile, tempPath);

    // Guardar en la tabla de fotos pendientes
    const { data, error } = await supabase
      .from('fotos_pendientes')
      .insert({
        url: photoUrl,
        nombre_archivo: photoFile.name,
        sello_id: selloId || null,
        asignada: false,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      url: data.url,
      nombreArchivo: data.nombre_archivo,
      fechaSubida: data.fecha_subida,
      selloId: data.sello_id || undefined,
    };
  } catch (error) {
    console.error('Error saving pending photo:', error);
    throw error;
  }
};

// Obtener todas las fotos pendientes
export const getPendingPhotos = async (): Promise<PendingPhoto[]> => {
  try {
    const { data, error } = await supabase
      .from('fotos_pendientes')
      .select('*')
      .eq('asignada', false)
      .order('fecha_subida', { ascending: false });

    if (error) throw error;

    return (data || []).map((foto: any) => ({
      id: foto.id,
      url: foto.url,
      nombreArchivo: foto.nombre_archivo,
      fechaSubida: foto.fecha_subida,
      selloId: foto.sello_id || undefined,
    }));
  } catch (error) {
    console.error('Error getting pending photos:', error);
    throw error;
  }
};

// Asignar una foto pendiente a un sello
export const assignPendingPhotoToStamp = async (pendingPhotoId: string, stampId: string): Promise<void> => {
  try {
    // Obtener la foto pendiente
    const { data: pendingPhoto, error: getError } = await supabase
      .from('fotos_pendientes')
      .select('url, nombre_archivo')
      .eq('id', pendingPhotoId)
      .eq('asignada', false)
      .single();

    if (getError) throw getError;
    if (!pendingPhoto) throw new Error('Foto pendiente no encontrada');

    // Obtener información del sello para generar el path final y verificar el estado de venta
    const { data: sello, error: selloError } = await supabase
      .from('sellos')
      .select('orden_id, estado_venta')
      .eq('id', stampId)
      .single();

    if (selloError) throw selloError;
    if (!sello) throw new Error('Sello no encontrado');

    // Generar el path final para la foto
    const finalPath = generateFilePath(sello.orden_id, 'foto', pendingPhoto.nombre_archivo, stampId);
    
    // Copiar la foto del path temporal al path final
    // Primero necesitamos descargar la foto y subirla al nuevo path
    const response = await fetch(pendingPhoto.url);
    const blob = await response.blob();
    const file = new File([blob], pendingPhoto.nombre_archivo, { type: blob.type });
    
    const finalUrl = await uploadFile('foto', file, finalPath);

    // Preparar los datos de actualización
    const updateData: { foto_sello: string; estado_venta?: string } = { foto_sello: finalUrl };
    
    // Si el estado de venta actual es "Señado", cambiarlo a "Foto Enviada"
    if (sello.estado_venta === 'Señado') {
      updateData.estado_venta = 'Foto';
    }

    // Actualizar el sello con la URL final y el estado de venta si corresponde
    const { error: updateError } = await supabase
      .from('sellos')
      .update(updateData)
      .eq('id', stampId);

    if (updateError) throw updateError;

    // Marcar la foto pendiente como asignada
    const { error: markError } = await supabase
      .from('fotos_pendientes')
      .update({ 
        asignada: true, 
        sello_id: stampId,
        updated_at: new Date().toISOString()
      })
      .eq('id', pendingPhotoId);

    if (markError) throw markError;
  } catch (error) {
    console.error('Error assigning pending photo to stamp:', error);
    throw error;
  }
};

// Eliminar una foto pendiente
export const deletePendingPhoto = async (pendingPhotoId: string): Promise<void> => {
  try {
    // Obtener la URL de la foto para eliminarla de storage
    const { data: pendingPhoto, error: getError } = await supabase
      .from('fotos_pendientes')
      .select('url')
      .eq('id', pendingPhotoId)
      .single();

    if (getError) throw getError;

    // Extraer el path de la URL
    const urlParts = pendingPhoto.url.split('/');
    const pathIndex = urlParts.findIndex((part: string) => part === 'foto');
    const path = urlParts.slice(pathIndex + 1).join('/');

    // Eliminar de storage
    await supabase.storage
      .from('foto')
      .remove([path])
      .catch(() => {
        // Ignorar errores si el archivo no existe
      });

    // Eliminar de la tabla
    const { error } = await supabase
      .from('fotos_pendientes')
      .delete()
      .eq('id', pendingPhotoId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting pending photo:', error);
    throw error;
  }
};

