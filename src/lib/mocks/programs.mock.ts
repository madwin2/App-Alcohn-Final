import { Program } from '@/lib/types/index';

// Datos mock para la página de Programas
export const mockPrograms: Program[] = [
  {
    id: '1',
    name: '15 ENE x12 yC',
    description: 'Programa para sellos de cuero con diseño personalizado',
    version: 'v2.1.0',
    status: 'active',
    category: 'PRODUCTION',
    machine: 'C',
    stampCount: 12,
    productionDate: '2024-01-15',
    notes: 'Sellos para cliente premium - alta calidad requerida',
    fabricationState: 'HACIENDO',
    isVerified: true,
    stamps: [
      {
        id: 's1',
        designName: 'Logo Empresa',
        widthMm: 25,
        heightMm: 25,
        stampType: 'CLASICO',
        previewUrl: '/preview/stamp1.jpg'
      },
      {
        id: 's2',
        designName: 'Texto Personalizado',
        widthMm: 38,
        heightMm: 12,
        stampType: 'ABC',
        previewUrl: '/preview/stamp2.jpg'
      }
    ],
    lengthUsed: 63,
    createdAt: '2024-01-15T10:00:00Z',
    lastUpdated: '2024-01-20T14:30:00Z',
    createdBy: 'admin',
    tags: ['cuero', 'premium', 'personalizado']
  },
  {
    id: '2',
    name: '20 ENE x8 yG',
    description: 'Programa para sellos de madera con grabado profundo',
    version: 'v1.5.2',
    status: 'active',
    category: 'PRODUCTION',
    machine: 'G',
    stampCount: 8,
    productionDate: '2024-01-20',
    notes: 'Grabado profundo - verificar calidad antes de continuar',
    fabricationState: 'VERIFICAR',
    isVerified: false,
    stamps: [
      {
        id: 's3',
        designName: 'Escudo Familiar',
        widthMm: 19,
        heightMm: 19,
        stampType: '3MM',
        previewUrl: '/preview/stamp3.jpg'
      }
    ],
    lengthUsed: 38,
    createdAt: '2024-01-20T09:00:00Z',
    lastUpdated: '2024-01-22T16:45:00Z',
    createdBy: 'production',
    tags: ['madera', 'grabado', 'profundo']
  },
  {
    id: '3',
    name: '25 ENE x15 yXL',
    description: 'Programa para sellos grandes de metal',
    version: 'v1.0.1',
    status: 'active',
    category: 'PRODUCTION',
    machine: 'XL',
    stampCount: 15,
    productionDate: '2024-01-25',
    notes: 'Sellos grandes - usar material resistente',
    fabricationState: 'SIN_HACER',
    isVerified: false,
    stamps: [
      {
        id: 's4',
        designName: 'Logo Corporativo',
        widthMm: 63,
        heightMm: 25,
        stampType: 'LACRE',
        previewUrl: '/preview/stamp4.jpg'
      }
    ],
    lengthUsed: 63,
    createdAt: '2024-01-25T11:30:00Z',
    lastUpdated: '2024-01-25T12:20:00Z',
    createdBy: 'production',
    tags: ['metal', 'grande', 'corporativo']
  },
  {
    id: '4',
    name: '28 ENE x6 yABC',
    description: 'Programa para sellos pequeños de precisión',
    version: 'v3.0.0',
    status: 'active',
    category: 'PRODUCTION',
    machine: 'ABC',
    stampCount: 6,
    productionDate: '2024-01-28',
    notes: 'Precisión alta - verificar medidas exactas',
    fabricationState: 'HECHO',
    isVerified: true,
    stamps: [
      {
        id: 's5',
        designName: 'Código QR',
        widthMm: 12,
        heightMm: 12,
        stampType: 'ABC',
        previewUrl: '/preview/stamp5.jpg'
      }
    ],
    lengthUsed: 12,
    createdAt: '2024-01-28T08:00:00Z',
    lastUpdated: '2024-01-30T10:15:00Z',
    createdBy: 'production',
    tags: ['pequeño', 'precisión', 'qr']
  },
  {
    id: '5',
    name: '30 ENE x4 yC',
    description: 'Programa para sellos de prueba',
    version: 'v0.9.8',
    status: 'inactive',
    category: 'PRODUCTION',
    machine: 'C',
    stampCount: 4,
    productionDate: '2024-01-30',
    notes: 'Sellos de prueba - no entregar al cliente',
    fabricationState: 'REHACER',
    isVerified: false,
    stamps: [
      {
        id: 's6',
        designName: 'Test Pattern',
        widthMm: 25,
        heightMm: 25,
        stampType: 'CLASICO',
        previewUrl: '/preview/stamp6.jpg'
      }
    ],
    lengthUsed: 25,
    createdAt: '2024-01-30T14:00:00Z',
    lastUpdated: '2024-01-30T15:30:00Z',
    createdBy: 'test',
    tags: ['prueba', 'test', 'no-entregar']
  },
  {
    id: '6',
    name: '02 FEB x20 yG',
    description: 'Programa para sellos de lote grande',
    version: 'v2.0.3',
    status: 'active',
    category: 'PRODUCTION',
    machine: 'G',
    stampCount: 20,
    productionDate: '2024-02-02',
    notes: 'Lote grande - optimizar tiempo de producción',
    fabricationState: 'SIN_HACER',
    isVerified: true,
    stamps: [
      {
        id: 's7',
        designName: 'Marca Registrada',
        widthMm: 38,
        heightMm: 19,
        stampType: 'ALIMENTO',
        previewUrl: '/preview/stamp7.jpg'
      }
    ],
    lengthUsed: 38,
    createdAt: '2024-02-02T13:45:00Z',
    lastUpdated: '2024-02-03T15:10:00Z',
    createdBy: 'production',
    tags: ['lote', 'grande', 'optimización']
  }
];
