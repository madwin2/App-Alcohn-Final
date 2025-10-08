import { Order, FabricationState, SaleState, ShippingState, ShippingCarrier, ShippingServiceDest, ShippingOriginMethod, StampType, Task, ProgressStep } from '../types/index';

// Datos mock para testing
export const mockOrders: Order[] = [
  {
    id: '1',
    customer: {
      id: 'c1',
      firstName: 'María',
      lastName: 'González',
      phoneE164: '+5491123456789',
      email: 'maria.gonzalez@email.com',
      dni: '12345678'
    },
    orderDate: '2024-01-15T10:30:00Z',
    takenBy: { id: 'u1', name: 'Juan Pérez' },
    totalValue: 15000,
    depositValueOrder: 5000,
    restPaidAmountOrder: 10000,
    saleStateOrder: 'SEÑADO',
    saleStateOrderChangedAt: '2024-01-15T10:30:00Z',
    deadlineAt: '2024-01-25T18:00:00Z',
    paidAmountCached: 5000,
    balanceAmountCached: 10000,
    tasks: [
      {
        id: 't1',
        orderId: '1',
        title: 'Revisar diseño final',
        description: 'Verificar que el logo cumple con los estándares de la empresa',
        status: 'PENDING',
        createdAt: '2024-01-15T10:30:00Z'
      },
      {
        id: 't2',
        orderId: '1',
        title: 'Confirmar medidas',
        description: 'Validar que las dimensiones sean correctas',
        status: 'COMPLETED',
        createdAt: '2024-01-15T09:00:00Z',
        completedAt: '2024-01-15T11:00:00Z'
      }
    ],
    progressStep: 'HECHO' as ProgressStep,
    shipping: {
      carrier: 'ANDREANI',
      service: 'DOMICILIO',
      origin: 'ENTREGA_EN_SUCURSAL',
      trackingNumber: 'AR123456789'
    },
    items: [
      {
        id: 'i1',
        orderId: '1',
        designName: 'Logo Empresa ABC',
        requestedWidthMm: 50,
        requestedHeightMm: 30,
        stampType: 'CLASICO',
        notes: 'Urgente para lanzamiento',
        itemValue: 15000,
        fabricationState: 'SIN_HACER',
        saleState: 'SEÑADO',
        shippingState: 'SIN_ENVIO',
        depositValueItem: 5000,
        restPaidAmountItem: 10000,
        paidAmountItemCached: 5000,
        balanceItemCached: 10000,
        files: {
          baseUrl: 'https://via.placeholder.com/40x40/4F46E5/FFFFFF?text=B',
          vectorUrl: 'https://via.placeholder.com/40x40/059669/FFFFFF?text=V',
          photoUrl: 'https://via.placeholder.com/40x40/DC2626/FFFFFF?text=P'
        },
        contact: {
          channel: 'WHATSAPP',
          phoneE164: '+5491123456789'
        }
      }
    ]
  },
  {
    id: '2',
    customer: {
      id: 'c2',
      firstName: 'Carlos',
      lastName: 'Rodríguez',
      phoneE164: '+5491123456790',
      email: 'carlos.rodriguez@email.com'
    },
    orderDate: '2024-01-14T14:20:00Z',
    takenBy: { id: 'u2', name: 'Ana López' },
    totalValue: 8500,
    depositValueOrder: 8500,
    restPaidAmountOrder: 0,
    saleStateOrder: 'TRANSFERIDO',
    saleStateOrderChangedAt: '2024-01-16T09:15:00Z',
    paidAmountCached: 8500,
    balanceAmountCached: 0,
    progressStep: 'FOTO' as ProgressStep,
    shipping: {
      carrier: 'CORREO_ARGENTINO',
      service: 'SUCURSAL',
      origin: 'RETIRO_EN_ORIGEN',
      trackingNumber: 'CA987654321'
    },
    items: [
      {
        id: 'i2',
        orderId: '2',
        designName: 'Sello Personalizado',
        requestedWidthMm: 25,
        requestedHeightMm: 25,
        stampType: '3MM',
        notes: 'Con fecha de vencimiento',
        itemValue: 8500,
        fabricationState: 'HECHO',
        saleState: 'TRANSFERIDO',
        shippingState: 'DESPACHADO',
        depositValueItem: 8500,
        restPaidAmountItem: 0,
        paidAmountItemCached: 8500,
        balanceItemCached: 0,
        files: {
          baseUrl: 'https://via.placeholder.com/40x40/4F46E5/FFFFFF?text=B',
          vectorUrl: 'https://via.placeholder.com/40x40/059669/FFFFFF?text=V'
        },
        contact: {
          channel: 'INSTAGRAM',
          phoneE164: '+5491123456790'
        },
        trackingNumber: 'CA987654321'
      }
    ]
  },
  {
    id: '3',
    customer: {
      id: 'c3',
      firstName: 'Laura',
      lastName: 'Martínez',
      phoneE164: '+5491123456791',
      email: 'laura.martinez@email.com',
      dni: '87654321'
    },
    orderDate: '2024-01-13T16:45:00Z',
    takenBy: { id: 'u1', name: 'Juan Pérez' },
    totalValue: 12000,
    depositValueOrder: 6000,
    restPaidAmountOrder: 6000,
    saleStateOrder: 'FOTO_ENVIADA',
    saleStateOrderChangedAt: '2024-01-17T11:30:00Z',
    paidAmountCached: 6000,
    balanceAmountCached: 6000,
    shipping: {
      carrier: 'VIA_CARGO',
      service: 'DOMICILIO',
      origin: 'ENTREGA_EN_SUCURSAL'
    },
    items: [
      {
        id: 'i3',
        orderId: '3',
        designName: 'Marca de Agua',
        requestedWidthMm: 40,
        requestedHeightMm: 40,
        stampType: 'ALIMENTO',
        itemValue: 12000,
        fabricationState: 'HACIENDO',
        saleState: 'FOTO_ENVIADA',
        shippingState: 'HACER_ETIQUETA',
        depositValueItem: 6000,
        restPaidAmountItem: 6000,
        paidAmountItemCached: 6000,
        balanceItemCached: 6000,
        files: {
          baseUrl: 'https://via.placeholder.com/40x40/4F46E5/FFFFFF?text=B',
          photoUrl: 'https://via.placeholder.com/40x40/DC2626/FFFFFF?text=P'
        },
        contact: {
          channel: 'FACEBOOK',
          phoneE164: '+5491123456791'
        }
      }
    ]
  },
  {
    id: '4',
    customer: {
      id: 'c4',
      firstName: 'Roberto',
      lastName: 'Silva',
      phoneE164: '+5491123456792'
    },
    orderDate: '2024-01-12T09:15:00Z',
    takenBy: { id: 'u3', name: 'María García' },
    totalValue: 20000,
    depositValueOrder: 0,
    restPaidAmountOrder: 20000,
    saleStateOrder: 'DEUDOR',
    saleStateOrderChangedAt: '2024-01-12T09:15:00Z',
    deadlineAt: '2024-01-22T18:00:00Z',
    paidAmountCached: 0,
    balanceAmountCached: 20000,
    shipping: {
      carrier: 'ANDREANI',
      service: 'SUCURSAL',
      origin: 'RETIRO_EN_ORIGEN'
    },
    items: [
      {
        id: 'i4',
        orderId: '4',
        designName: 'Logo Corporativo',
        requestedWidthMm: 60,
        requestedHeightMm: 40,
        stampType: 'ABC',
        itemValue: 20000,
        fabricationState: 'PRIORIDAD',
        saleState: 'DEUDOR',
        shippingState: 'SIN_ENVIO',
        depositValueItem: 0,
        restPaidAmountItem: 20000,
        paidAmountItemCached: 0,
        balanceItemCached: 20000,
        files: {
          baseUrl: 'https://via.placeholder.com/40x40/4F46E5/FFFFFF?text=B',
          vectorUrl: 'https://via.placeholder.com/40x40/059669/FFFFFF?text=V'
        },
        contact: {
          channel: 'MAIL',
          phoneE164: '+5491123456792'
        }
      }
    ]
  },
  {
    id: '5',
    customer: {
      id: 'c5',
      firstName: 'Patricia',
      lastName: 'Fernández',
      phoneE164: '+5491123456793',
      email: 'patricia.fernandez@email.com'
    },
    orderDate: '2024-01-11T13:30:00Z',
    takenBy: { id: 'u2', name: 'Ana López' },
    totalValue: 7500,
    depositValueOrder: 7500,
    restPaidAmountOrder: 0,
    saleStateOrder: 'TRANSFERIDO',
    saleStateOrderChangedAt: '2024-01-15T16:20:00Z',
    paidAmountCached: 7500,
    balanceAmountCached: 0,
    shipping: {
      carrier: 'CORREO_ARGENTINO',
      service: 'DOMICILIO',
      origin: 'ENTREGA_EN_SUCURSAL',
      trackingNumber: 'CA456789123'
    },
    items: [
      {
        id: 'i5',
        orderId: '5',
        designName: 'Sello de Fecha',
        requestedWidthMm: 30,
        requestedHeightMm: 15,
        stampType: 'LACRE',
        itemValue: 7500,
        fabricationState: 'VERIFICAR',
        saleState: 'TRANSFERIDO',
        shippingState: 'ETIQUETA_LISTA',
        depositValueItem: 7500,
        restPaidAmountItem: 0,
        paidAmountItemCached: 7500,
        balanceItemCached: 0,
        files: {
          baseUrl: 'https://via.placeholder.com/40x40/4F46E5/FFFFFF?text=B',
          vectorUrl: 'https://via.placeholder.com/40x40/059669/FFFFFF?text=V',
          photoUrl: 'https://via.placeholder.com/40x40/DC2626/FFFFFF?text=P'
        },
        contact: {
          channel: 'WHATSAPP',
          phoneE164: '+5491123456793'
        },
        trackingNumber: 'CA456789123'
      }
    ]
  },
  {
    id: '6',
    customer: {
      id: 'c6',
      firstName: 'Diego',
      lastName: 'Herrera',
      phoneE164: '+5491123456794',
      email: 'diego.herrera@email.com',
      dni: '11223344'
    },
    orderDate: '2024-01-10T11:00:00Z',
    takenBy: { id: 'u1', name: 'Juan Pérez' },
    totalValue: 18000,
    depositValueOrder: 9000,
    restPaidAmountOrder: 9000,
    saleStateOrder: 'SEÑADO',
    saleStateOrderChangedAt: '2024-01-10T11:00:00Z',
    paidAmountCached: 9000,
    balanceAmountCached: 9000,
    shipping: {
      carrier: 'VIA_CARGO',
      service: 'SUCURSAL',
      origin: 'RETIRO_EN_ORIGEN'
    },
    items: [
      {
        id: 'i6',
        orderId: '6',
        designName: 'Marca de Calidad',
        requestedWidthMm: 45,
        requestedHeightMm: 35,
        stampType: 'CLASICO',
        itemValue: 18000,
        fabricationState: 'RETOCAR',
        saleState: 'SEÑADO',
        shippingState: 'SIN_ENVIO',
        depositValueItem: 9000,
        restPaidAmountItem: 9000,
        paidAmountItemCached: 9000,
        balanceItemCached: 9000,
        files: {
          baseUrl: 'https://via.placeholder.com/40x40/4F46E5/FFFFFF?text=B',
          vectorUrl: 'https://via.placeholder.com/40x40/059669/FFFFFF?text=V'
        },
        contact: {
          channel: 'INSTAGRAM',
          phoneE164: '+5491123456794'
        }
      }
    ]
  },
  {
    id: '7',
    customer: {
      id: 'c7',
      firstName: 'Sandra',
      lastName: 'Morales',
      phoneE164: '+5491123456795'
    },
    orderDate: '2024-01-09T15:45:00Z',
    takenBy: { id: 'u3', name: 'María García' },
    totalValue: 9500,
    depositValueOrder: 9500,
    restPaidAmountOrder: 0,
    saleStateOrder: 'TRANSFERIDO',
    saleStateOrderChangedAt: '2024-01-14T10:15:00Z',
    paidAmountCached: 9500,
    balanceAmountCached: 0,
    shipping: {
      carrier: 'OTRO',
      service: 'DOMICILIO',
      origin: 'ENTREGA_EN_SUCURSAL',
      trackingNumber: 'OT123456789'
    },
    items: [
      {
        id: 'i7',
        orderId: '7',
        designName: 'Sello de Seguridad',
        requestedWidthMm: 35,
        requestedHeightMm: 25,
        stampType: '3MM',
        itemValue: 9500,
        fabricationState: 'HECHO',
        saleState: 'TRANSFERIDO',
        shippingState: 'SEGUIMIENTO_ENVIADO',
        depositValueItem: 9500,
        restPaidAmountItem: 0,
        paidAmountItemCached: 9500,
        balanceItemCached: 0,
        files: {
          baseUrl: 'https://via.placeholder.com/40x40/4F46E5/FFFFFF?text=B',
          vectorUrl: 'https://via.placeholder.com/40x40/059669/FFFFFF?text=V',
          photoUrl: 'https://via.placeholder.com/40x40/DC2626/FFFFFF?text=P'
        },
        contact: {
          channel: 'FACEBOOK',
          phoneE164: '+5491123456795'
        },
        trackingNumber: 'OT123456789'
      }
    ]
  },
  {
    id: '8',
    customer: {
      id: 'c8',
      firstName: 'Miguel',
      lastName: 'Vargas',
      phoneE164: '+5491123456796',
      email: 'miguel.vargas@email.com',
      dni: '55667788'
    },
    orderDate: '2024-01-08T08:30:00Z',
    takenBy: { id: 'u2', name: 'Ana López' },
    totalValue: 14000,
    depositValueOrder: 7000,
    restPaidAmountOrder: 7000,
    saleStateOrder: 'FOTO_ENVIADA',
    saleStateOrderChangedAt: '2024-01-16T14:45:00Z',
    paidAmountCached: 7000,
    balanceAmountCached: 7000,
    shipping: {
      carrier: 'ANDREANI',
      service: 'DOMICILIO',
      origin: 'ENTREGA_EN_SUCURSAL'
    },
    items: [
      {
        id: 'i8',
        orderId: '8',
        designName: 'Logo de Evento',
        requestedWidthMm: 55,
        requestedHeightMm: 30,
        stampType: 'ALIMENTO',
        itemValue: 14000,
        fabricationState: 'REHACER',
        saleState: 'FOTO_ENVIADA',
        shippingState: 'HACER_ETIQUETA',
        depositValueItem: 7000,
        restPaidAmountItem: 7000,
        paidAmountItemCached: 7000,
        balanceItemCached: 7000,
        files: {
          baseUrl: 'https://via.placeholder.com/40x40/4F46E5/FFFFFF?text=B',
          photoUrl: 'https://via.placeholder.com/40x40/DC2626/FFFFFF?text=P'
        },
        contact: {
          channel: 'MAIL',
          phoneE164: '+5491123456796'
        }
      }
    ]
  }
];

// Función para obtener contadores por estado de fabricación
export const getFabricationCounts = (orders: Order[]) => {
  const counts = {
    SIN_HACER: 0,
    HACIENDO: 0,
    VERIFICAR: 0,
    HECHO: 0,
    REHACER: 0,
    PRIORIDAD: 0,
    RETOCAR: 0
  };

  orders.forEach(order => {
    order.items.forEach(item => {
      counts[item.fabricationState]++;
    });
  });

  return counts;
};
