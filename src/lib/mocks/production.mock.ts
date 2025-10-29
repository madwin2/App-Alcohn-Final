import { ProductionItem, ProductionTask, ProductionState, VectorizationState, ProgramType, StampType } from '../types/index';

// Mock tasks para producción
const mockProductionTasks: ProductionTask[] = [
  {
    id: 'task-1',
    orderId: 'order-1',
    title: 'Revisar diseño base',
    description: 'Verificar calidad del archivo base',
    dueDate: '2024-01-15',
    status: 'PENDIENTE',
    createdAt: '2024-01-10',
    assignedTo: 'Juan Pérez'
  },
  {
    id: 'task-2',
    orderId: 'order-1',
    title: 'Vectorizar logo',
    description: 'Convertir a formato vectorial',
    dueDate: '2024-01-16',
    status: 'EN_PROGRESO',
    createdAt: '2024-01-10',
    assignedTo: 'María García'
  },
  {
    id: 'task-3',
    orderId: 'order-2',
    title: 'Ajustar medidas',
    description: 'Corregir dimensiones según especificaciones',
    dueDate: '2024-01-14',
    status: 'COMPLETADO',
    createdAt: '2024-01-08',
    completedAt: '2024-01-12',
    assignedTo: 'Carlos López'
  }
];

// Mock production items
export const mockProductionItems: ProductionItem[] = [
  {
    id: 'prod-1',
    orderId: 'order-1',
    designName: 'Logo Empresa ABC',
    requestedWidthMm: 50,
    requestedHeightMm: 30,
    stampType: 'CLASICO',
    productionState: 'EN_PROGRESO',
    isPriority: false,
    vectorizationState: 'BASE',
    program: 'ILLUSTRATOR',
    notes: 'Revisar colores corporativos',
    files: {
      baseUrl: '/files/base-1.jpg',
      vectorUrl: '/files/vector-1.ai',
      photoUrl: '/files/photo-1.jpg'
    },
    tasks: mockProductionTasks.filter(task => task.orderId === 'order-1')
  },
  {
    id: 'prod-2',
    orderId: 'order-2',
    designName: 'Sello Alimentario',
    requestedWidthMm: 40,
    requestedHeightMm: 40,
    stampType: 'ALIMENTO',
    productionState: 'COMPLETADO',
    isPriority: false,
    vectorizationState: 'VECTORIZADO',
    program: 'PHOTOSHOP',
    notes: 'Aprobado por cliente',
    files: {
      baseUrl: '/files/base-2.jpg',
      vectorUrl: '/files/vector-2.ai',
      photoUrl: '/files/photo-2.jpg'
    },
    tasks: mockProductionTasks.filter(task => task.orderId === 'order-2')
  },
  {
    id: 'prod-3',
    orderId: 'order-3',
    designName: 'Logo Restaurante',
    requestedWidthMm: 60,
    requestedHeightMm: 25,
    stampType: '3MM',
    productionState: 'PENDIENTE',
    isPriority: true,
    vectorizationState: 'EN_PROCESO',
    program: 'COREL',
    notes: 'Esperando aprobación de diseño',
    files: {
      baseUrl: '/files/base-3.jpg'
    },
    tasks: []
  },
  {
    id: 'prod-4',
    orderId: 'order-4',
    designName: 'Sello Médico',
    requestedWidthMm: 35,
    requestedHeightMm: 35,
    stampType: 'LACRE',
    productionState: 'REVISAR',
    isPriority: false,
    vectorizationState: 'DESCARGADO',
    program: 'AUTOCAD',
    notes: 'Revisar texto médico',
    files: {
      baseUrl: '/files/base-4.jpg',
      vectorUrl: '/files/vector-4.ai',
      photoUrl: '/files/photo-4.jpg'
    },
    tasks: []
  },
  {
    id: 'prod-5',
    orderId: 'order-5',
    designName: 'Logo Tienda',
    requestedWidthMm: 45,
    requestedHeightMm: 20,
    stampType: 'ABC',
    productionState: 'REHACER',
    isPriority: false,
    vectorizationState: 'BASE',
    program: 'ILLUSTRATOR',
    notes: 'Cliente pidió cambios en el diseño',
    files: {
      baseUrl: '/files/base-5.jpg'
    },
    tasks: []
  }
];





