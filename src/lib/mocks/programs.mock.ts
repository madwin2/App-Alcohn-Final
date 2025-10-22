import { Program } from '@/lib/types/index';

// Datos mock para la página de Programas
export const mockPrograms: Program[] = [
  {
    id: '1',
    name: 'Sistema de Gestión de Pedidos',
    description: 'Programa principal para la gestión completa de pedidos, desde la creación hasta el seguimiento de envíos.',
    version: 'v2.1.0',
    status: 'active',
    category: 'ADMINISTRATION',
    createdAt: '2024-01-15T10:00:00Z',
    lastUpdated: '2024-01-20T14:30:00Z',
    createdBy: 'admin',
    tags: ['pedidos', 'gestión', 'sistema'],
    settings: {
      autoSave: true,
      notifications: true,
      theme: 'dark'
    }
  },
  {
    id: '2',
    name: 'Herramientas de Diseño Vectorial',
    description: 'Conjunto de herramientas para diseño y vectorización de sellos personalizados.',
    version: 'v1.5.2',
    status: 'active',
    category: 'DESIGN',
    createdAt: '2024-01-10T09:00:00Z',
    lastUpdated: '2024-01-18T16:45:00Z',
    createdBy: 'designer',
    tags: ['diseño', 'vector', 'herramientas'],
    settings: {
      autoSave: false,
      gridSnap: true,
      precision: 'high'
    }
  },
  {
    id: '3',
    name: 'Control de Calidad',
    description: 'Sistema para verificar y controlar la calidad de los productos antes del envío.',
    version: 'v1.0.1',
    status: 'active',
    category: 'QUALITY',
    createdAt: '2024-01-05T11:30:00Z',
    lastUpdated: '2024-01-15T12:20:00Z',
    createdBy: 'quality',
    tags: ['calidad', 'verificación', 'control'],
    settings: {
      autoCheck: true,
      strictMode: true,
      reports: true
    }
  },
  {
    id: '4',
    name: 'Línea de Producción Automatizada',
    description: 'Programa para automatizar y optimizar los procesos de la línea de producción.',
    version: 'v3.0.0',
    status: 'active',
    category: 'PRODUCTION',
    createdAt: '2024-01-01T08:00:00Z',
    lastUpdated: '2024-01-22T10:15:00Z',
    createdBy: 'production',
    tags: ['producción', 'automatización', 'optimización'],
    settings: {
      autoStart: true,
      monitoring: true,
      alerts: true
    }
  },
  {
    id: '5',
    name: 'Sistema de Inventario Legacy',
    description: 'Sistema heredado para gestión de inventario. En proceso de migración.',
    version: 'v0.9.8',
    status: 'inactive',
    category: 'ADMINISTRATION',
    createdAt: '2023-12-20T14:00:00Z',
    lastUpdated: '2024-01-10T09:30:00Z',
    createdBy: 'legacy',
    tags: ['inventario', 'legacy', 'migración'],
    settings: {
      autoSave: false,
      compatibility: 'legacy',
      migration: 'pending'
    }
  },
  {
    id: '6',
    name: 'Herramientas de Análisis',
    description: 'Conjunto de herramientas para análisis de datos y generación de reportes.',
    version: 'v2.0.3',
    status: 'active',
    category: 'OTHER',
    createdAt: '2024-01-12T13:45:00Z',
    lastUpdated: '2024-01-19T15:10:00Z',
    createdBy: 'analyst',
    tags: ['análisis', 'reportes', 'datos'],
    settings: {
      autoRefresh: true,
      exportFormats: ['pdf', 'excel', 'csv'],
      scheduledReports: true
    }
  }
];
