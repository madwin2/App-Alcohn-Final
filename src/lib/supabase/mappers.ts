import { Order, OrderItem, Customer, FabricationState, SaleState, ShippingState, ShippingCarrier, ShippingServiceDest, ShippingOriginMethod, StampType, ProgressStep, Task } from '../types/index';
import { Database } from './types';

type ClienteRow = Database['public']['Tables']['clientes']['Row'];
type OrdenRow = Database['public']['Tables']['ordenes']['Row'];
type SelloRow = Database['public']['Tables']['sellos']['Row'];

// Mapeo de estados de fabricación
const mapFabricationState = (estado: string | null): FabricationState => {
  const mapping: Record<string, FabricationState> = {
    'Sin Hacer': 'SIN_HACER',
    'Haciendo': 'HACIENDO',
    'Verificar': 'VERIFICAR',
    'Hecho': 'HECHO',
    'Rehacer': 'REHACER',
    'Retocar': 'RETOCAR',
    'Programado': 'PROGRAMADO',
    'Prioridad': 'SIN_HACER', // Mapear Prioridad a SIN_HACER por ahora
  };
  return estado ? (mapping[estado] || 'SIN_HACER') : 'SIN_HACER';
};

export const mapFabricationStateToDB = (estado: FabricationState): string => {
  const mapping: Record<FabricationState, string> = {
    'SIN_HACER': 'Sin Hacer',
    'HACIENDO': 'Haciendo',
    'VERIFICAR': 'Verificar',
    'HECHO': 'Hecho',
    'REHACER': 'Rehacer',
    'RETOCAR': 'Retocar',
    'PROGRAMADO': 'Programado',
  };
  return mapping[estado];
};

// Mapeo de estados de venta
const mapSaleState = (estado: string | null): SaleState => {
  const mapping: Record<string, SaleState> = {
    'Señado': 'SEÑADO',
    'Foto': 'FOTO_ENVIADA',
    'Transferido': 'TRANSFERIDO',
    'Deudor': 'DEUDOR',
  };
  return estado ? (mapping[estado] || 'SEÑADO') : 'SEÑADO';
};

export const mapSaleStateToDB = (estado: SaleState): string => {
  const mapping: Record<SaleState, string> = {
    'SEÑADO': 'Señado',
    'FOTO_ENVIADA': 'Foto',
    'TRANSFERIDO': 'Transferido',
    'DEUDOR': 'Deudor', // Mapear DEUDOR a Deudor en la BD
  };
  return mapping[estado];
};

// Mapeo de estados de envío
const mapShippingState = (estado: string | null): ShippingState => {
  const mapping: Record<string, ShippingState> = {
    'Sin envio': 'SIN_ENVIO',
    'Hacer Etiqueta': 'HACER_ETIQUETA',
    'Etiqueta Lista': 'ETIQUETA_LISTA',
    'Despachado': 'DESPACHADO',
    'Seguimiento Enviado': 'SEGUIMIENTO_ENVIADO',
  };
  return estado ? (mapping[estado] || 'SIN_ENVIO') : 'SIN_ENVIO';
};

export const mapShippingStateToDB = (estado: ShippingState): string => {
  const mapping: Record<ShippingState, string> = {
    'SIN_ENVIO': 'Sin envio',
    'HACER_ETIQUETA': 'Hacer Etiqueta',
    'ETIQUETA_LISTA': 'Etiqueta Lista',
    'DESPACHADO': 'Despachado',
    'SEGUIMIENTO_ENVIADO': 'Seguimiento Enviado',
  };
  return mapping[estado];
};

// Mapeo de transportistas
const mapShippingCarrier = (empresa: string | null): ShippingCarrier | null => {
  if (!empresa) return null;
  const mapping: Record<string, ShippingCarrier> = {
    'Andreani': 'ANDREANI',
    'Correo Argentino': 'CORREO_ARGENTINO',
    'Via Cargo': 'VIA_CARGO',
    'Retiro': 'OTRO',
  };
  return mapping[empresa] || 'OTRO';
};

export const mapShippingCarrierToDB = (carrier: ShippingCarrier): string => {
  const mapping: Record<ShippingCarrier, string> = {
    'ANDREANI': 'Andreani',
    'CORREO_ARGENTINO': 'Correo Argentino',
    'VIA_CARGO': 'Via Cargo',
    'OTRO': 'Retiro',
  };
  return mapping[carrier];
};

// Mapeo de tipo de servicio
const mapShippingService = (tipo: string | null): ShippingServiceDest => {
  const mapping: Record<string, ShippingServiceDest> = {
    'Domicilio': 'DOMICILIO',
    'Sucursal': 'SUCURSAL',
  };
  return tipo ? (mapping[tipo] || 'DOMICILIO') : 'DOMICILIO';
};

export const mapShippingServiceToDB = (service: ShippingServiceDest): string => {
  const mapping: Record<ShippingServiceDest, string> = {
    'DOMICILIO': 'Domicilio',
    'SUCURSAL': 'Sucursal',
  };
  return mapping[service];
};

// Mapeo de tipo de sello
const mapStampType = (tipo: string | null): StampType => {
  const mapping: Record<string, StampType> = {
    'Clasico': 'CLASICO',
    '3mm': '3MM',
    'Lacre': 'LACRE',
    'Alimento': 'ALIMENTO',
    'ABC': 'ABC',
  };
  return tipo ? (mapping[tipo] || 'CLASICO') : 'CLASICO';
};

export const mapStampTypeToDB = (tipo: StampType): string => {
  const mapping: Record<StampType, string> = {
    'CLASICO': 'Clasico',
    '3MM': '3mm',
    'LACRE': 'Lacre',
    'ALIMENTO': 'Alimento',
    'ABC': 'ABC',
  };
  return mapping[tipo];
};

// Mapeo de canal de contacto
const mapContactChannel = (medio: string | null): 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'MAIL' | 'OTRO' => {
  const mapping: Record<string, 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'MAIL' | 'OTRO'> = {
    'Whatsapp': 'WHATSAPP',
    'Instagram': 'INSTAGRAM',
    'Facebook': 'FACEBOOK',
    'Mail': 'MAIL',
  };
  return medio ? (mapping[medio] || 'OTRO') : 'OTRO';
};

const mapContactChannelToDB = (channel: 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'MAIL' | 'OTRO'): string => {
  const mapping: Record<string, string> = {
    'WHATSAPP': 'Whatsapp',
    'INSTAGRAM': 'Instagram',
    'FACEBOOK': 'Facebook',
    'MAIL': 'Mail',
    'OTRO': 'Whatsapp', // Default
  };
  return mapping[channel] || 'Whatsapp';
};

// Mapeo de ProgressStep desde estado_orden
const mapProgressStep = (estadoOrden: string | null, estadoEnvio: string | null): ProgressStep | undefined => {
  if (estadoEnvio === 'Seguimiento Enviado') return 'SEGUIMIENTO_ENVIADO';
  if (estadoEnvio === 'Despachado') return 'DESPACHADO';
  if (estadoEnvio === 'Etiqueta Lista') return 'ETIQUETA_LISTA';
  if (estadoEnvio === 'Hacer Etiqueta') return 'HACER_ETIQUETA';
  if (estadoOrden === 'Transferido') return 'TRANSFERIDO';
  if (estadoOrden === 'Foto') return 'FOTO';
  if (estadoOrden === 'Hecho') return 'HECHO';
  return undefined;
};

// Mapear Cliente a Customer
export const mapClienteToCustomer = (cliente: ClienteRow): Customer => ({
  id: cliente.id,
  firstName: cliente.nombre,
  lastName: cliente.apellido,
  phoneE164: cliente.telefono,
  email: cliente.mail || undefined,
  dni: cliente.dni || undefined,
});

// Mapear Sello a OrderItem
export const mapSelloToOrderItem = (sello: SelloRow, cliente: ClienteRow): OrderItem => {
  // Calcular medidas desde largo_real y ancho_real, o usar valores por defecto
  const widthMm = sello.ancho_real ? Number(sello.ancho_real) * 10 : 50; // Convertir de cm a mm
  const heightMm = sello.largo_real ? Number(sello.largo_real) * 10 : 30;

  return {
    id: sello.id,
    orderId: sello.orden_id,
    designName: sello.diseno || 'Sin diseño',
    requestedWidthMm: widthMm,
    requestedHeightMm: heightMm,
    stampType: mapStampType(sello.tipo),
    itemValue: sello.valor ? Number(sello.valor) : 0,
    fabricationState: mapFabricationState(sello.estado_fabricacion),
    // Leer prioridad desde la columna es_prioritario (independiente del estado de fabricación)
    isPriority: (sello as any).es_prioritario === true || (sello as any).es_prioritario === 'true',
    saleState: mapSaleState(sello.estado_venta),
    // El estado de envío real se asigna en mapOrdenToOrder usando orden.estado_envio
    // Aquí usamos un valor por defecto temporal
    shippingState: mapShippingState(null),
    depositValueItem: sello.senia ? Number(sello.senia) : 0,
    restPaidAmountItem: sello.restante ? Number(sello.restante) : 0,
    paidAmountItemCached: sello.senia ? Number(sello.senia) : 0,
    balanceItemCached: sello.restante ? Number(sello.restante) : 0,
    notes: sello.nota || undefined,
    program: (sello as any).programa_nombre || undefined,
    files: {
      baseUrl: sello.archivo_base || undefined,
      // Si hay preview de vector, inferir que el vectorUrl es el EPS original
      // (reemplazando _preview.png por .eps)
      vectorUrl: (sello as any).archivo_vector_preview 
        ? (sello as any).archivo_vector_preview.replace(/_preview\.png$/i, '.eps')
        : undefined,
      vectorPreviewUrl: (sello as any).archivo_vector_preview || undefined, // Preview PNG para EPS
      photoUrl: sello.foto_sello || undefined,
    },
    contact: {
      channel: mapContactChannel(cliente.medio_contacto),
      phoneE164: cliente.telefono,
    },
  };
};

// Mapear tarea de BD a Task
const mapTareaToTask = (tarea: any): Task => ({
  id: tarea.id,
  orderId: tarea.orden_id,
  title: tarea.titulo,
  description: tarea.descripcion || undefined,
  status: tarea.estado as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED',
  createdAt: tarea.created_at,
  completedAt: tarea.completada_at || undefined,
  dueDate: tarea.fecha_limite ? `${tarea.fecha_limite}T00:00:00Z` : undefined,
});

// Mapear Orden completa a Order
export const mapOrdenToOrder = (
  orden: OrdenRow,
  cliente: ClienteRow,
  sellos: SelloRow[],
  tareas: any[] = [],
  takenBy: { id: string; name: string } | null = null
): Order => {
  // Primero mapear sellos a items básicos
  const baseItems = sellos.map(sello => mapSelloToOrderItem(sello, cliente));

  // Asignar el estado de envío a nivel orden a todos los items
  const shippingStateFromOrder = mapShippingState(orden.estado_envio);
  const items = baseItems.map(item => ({
    ...item,
    shippingState: shippingStateFromOrder,
  }));

  // Determinar el estado de venta de la orden basado en los sellos o el estado_orden
  let saleStateOrder: SaleState = 'SEÑADO';
  const estadoOrden = orden.estado_orden as string;
  if (estadoOrden === 'Transferido') {
    saleStateOrder = 'TRANSFERIDO';
  } else if (estadoOrden === 'Foto') {
    saleStateOrder = 'FOTO_ENVIADA';
  } else if (estadoOrden === 'Deudor') {
    saleStateOrder = 'DEUDOR';
  } else if (estadoOrden === 'Señado') {
    saleStateOrder = 'SEÑADO';
  }

  // Determinar origin method basado en tipo_envio
  let origin: ShippingOriginMethod = 'ENTREGA_EN_SUCURSAL';
  if (orden.tipo_envio === 'Retiro') {
    origin = 'RETIRO_EN_ORIGEN';
  } else if (orden.tipo_envio === 'Sucursal') {
    origin = 'RETIRO_EN_ORIGEN';
  }

  return {
    id: orden.id,
    customer: mapClienteToCustomer(cliente),
    orderDate: orden.fecha ? `${orden.fecha}T00:00:00Z` : new Date().toISOString(),
    takenBy: takenBy || null,
    totalValue: orden.valor_total ? Number(orden.valor_total) : 0,
    depositValueOrder: orden.senia_total ? Number(orden.senia_total) : 0,
    restPaidAmountOrder: orden.restante ? Number(orden.restante) : 0,
    saleStateOrder,
    saleStateOrderChangedAt: orden.updated_at || undefined,
    deadlineAt: sellos[0]?.fecha_limite ? `${sellos[0].fecha_limite}T00:00:00Z` : undefined,
    paidAmountCached: orden.senia_total ? Number(orden.senia_total) : 0,
    balanceAmountCached: orden.restante ? Number(orden.restante) : 0,
    shipping: {
      carrier: mapShippingCarrier(orden.empresa_envio),
      service: orden.tipo_envio ? mapShippingService(orden.tipo_envio) : null,
      origin,
      trackingNumber: orden.seguimiento || undefined,
    },
    items,
    tasks: tareas.map(mapTareaToTask),
    progressStep: mapProgressStep(orden.estado_orden, orden.estado_envio),
  };
};

// Funciones de mapeo inverso (de tipos TypeScript a BD)
export const mapCustomerToCliente = (customer: Customer) => ({
  nombre: customer.firstName,
  apellido: customer.lastName,
  telefono: customer.phoneE164,
  mail: customer.email || null,
  dni: customer.dni || null,
  medio_contacto: mapContactChannelToDB(customer.phoneE164 ? 'WHATSAPP' : 'OTRO') as 'Whatsapp' | 'Facebook' | 'Instagram' | 'Mail',
});

export const mapOrderItemToSello = (
  item: OrderItem,
  ordenId: string,
  cliente: ClienteRow
) => ({
  orden_id: ordenId,
  tipo: mapStampTypeToDB(item.stampType) as 'Clasico' | '3mm' | 'Lacre' | 'Alimento' | 'ABC',
  diseno: item.designName,
  nota: item.notes || null,
  valor: item.itemValue || 0,
  senia: item.depositValueItem || 0,
  estado_fabricacion: mapFabricationStateToDB(item.fabricationState) as 'Sin Hacer' | 'Haciendo' | 'Hecho' | 'Rehacer' | 'Retocar' | 'Prioridad' | 'Verificar',
  estado_venta: mapSaleStateToDB(item.saleState) as 'Señado' | 'Foto' | 'Transferido',
  archivo_base: item.files?.baseUrl || null,
  foto_sello: item.files?.photoUrl || null,
  ancho_real: item.requestedWidthMm ? (item.requestedWidthMm / 10).toString() : null, // Convertir de mm a cm
  largo_real: item.requestedHeightMm ? (item.requestedHeightMm / 10).toString() : null,
  fecha_limite: null, // Se puede agregar después
});

export const mapOrderToOrden = (
  order: Partial<Order>,
  clienteId: string,
  direccionId?: string | null
) => ({
  cliente_id: clienteId,
  direccion_id: direccionId || null,
  empresa_envio: order.shipping?.carrier ? mapShippingCarrierToDB(order.shipping.carrier) as 'Andreani' | 'Correo Argentino' | 'Via Cargo' | 'Retiro' : null,
  tipo_envio: order.shipping?.service ? mapShippingServiceToDB(order.shipping.service) as 'Domicilio' | 'Sucursal' | 'Retiro' : null,
  seguimiento: order.shipping?.trackingNumber || null,
  estado_orden: order.saleStateOrder ? mapSaleStateToDB(order.saleStateOrder) as 'Señado' | 'Hecho' | 'Foto' | 'Transferido' | 'Hacer Etiqueta' | 'Etiqueta Lista' | 'Despachado' | 'Seguimiento Enviado' : null,
  estado_envio: order.items?.[0]?.shippingState ? mapShippingStateToDB(order.items[0].shippingState) as 'Sin envio' | 'Hacer Etiqueta' | 'Etiqueta Lista' | 'Despachado' | 'Seguimiento Enviado' : null,
  fecha: order.orderDate ? order.orderDate.split('T')[0] : new Date().toISOString().split('T')[0],
});

