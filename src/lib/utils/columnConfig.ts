import { ColumnDef } from '@tanstack/react-table';
import { Order } from '../types/index';

export interface ColumnConfig {
  id: string;
  header: string;
  size: number;
  align: 'left' | 'center' | 'right';
  resizable: boolean;
  sortable: boolean;
  viewModes: ('items' | 'orders')[];
}

export const ORDER_COLUMNS_CONFIG: ColumnConfig[] = [
  // Columnas para vista "Por Item"
  {
    id: 'indicadores',
    header: '',
    size: 16,
    align: 'center',
    resizable: true,
    sortable: false,
    viewModes: ['items']
  },
  {
    id: 'fecha',
    header: 'Fecha',
    size: 80,
    align: 'left',
    resizable: true,
    sortable: true,
    viewModes: ['items', 'orders']
  },
  {
    id: 'cliente',
    header: 'Cliente',
    size: 30,
    align: 'left',
    resizable: true,
    sortable: true,
    viewModes: ['items']
  },
  {
    id: 'nombre',
    header: 'Nombre',
    size: 120,
    align: 'left',
    resizable: true,
    sortable: true,
    viewModes: ['orders']
  },
  {
    id: 'contacto',
    header: 'Contacto',
    size: 80,
    align: 'left',
    resizable: true,
    sortable: true,
    viewModes: ['items', 'orders']
  },
  {
    id: 'cantidad',
    header: 'Cantidad',
    size: 80,
    align: 'center',
    resizable: true,
    sortable: true,
    viewModes: ['orders']
  },
  {
    id: 'tipo',
    header: 'Tipo',
    size: 50,
    align: 'center',
    resizable: true,
    sortable: true,
    viewModes: ['items']
  },
  {
    id: 'disenio',
    header: 'Diseño',
    size: 220,
    align: 'left',
    resizable: true,
    sortable: true,
    viewModes: ['items', 'orders']
  },
  {
    id: 'envio',
    header: 'Empresa',
    size: 80,
    align: 'left',
    resizable: true,
    sortable: true,
    viewModes: ['items', 'orders']
  },
  {
    id: 'sena',
    header: 'Seña',
    size: 70,
    align: 'left',
    resizable: true,
    sortable: true,
    viewModes: ['items', 'orders']
  },
  {
    id: 'valor',
    header: 'Valor',
    size: 70,
    align: 'left',
    resizable: true,
    sortable: true,
    viewModes: ['items', 'orders']
  },
  {
    id: 'restante',
    header: 'Restante',
    size: 100,
    align: 'left',
    resizable: true,
    sortable: true,
    viewModes: ['items', 'orders']
  },
  {
    id: 'fabricacion',
    header: 'Fabricación',
    size: 20,
    align: 'center',
    resizable: true,
    sortable: true,
    viewModes: ['items']
  },
  {
    id: 'venta',
    header: 'Venta',
    size: 20,
    align: 'center',
    resizable: true,
    sortable: true,
    viewModes: ['items']
  },
  {
    id: 'envioEstado',
    header: 'Envío',
    size: 20,
    align: 'center',
    resizable: true,
    sortable: true,
    viewModes: ['items']
  },
  {
    id: 'seguimiento',
    header: 'Seguimiento',
    size: 120,
    align: 'left',
    resizable: true,
    sortable: true,
    viewModes: ['items', 'orders']
  },
  {
    id: 'base',
    header: 'Base',
    size: 60,
    align: 'center',
    resizable: true,
    sortable: true,
    viewModes: ['items']
  },
  {
    id: 'vector',
    header: 'Vector',
    size: 60,
    align: 'center',
    resizable: true,
    sortable: true,
    viewModes: ['items']
  },
  {
    id: 'foto',
    header: 'Foto',
    size: 60,
    align: 'center',
    resizable: true,
    sortable: true,
    viewModes: ['items', 'orders']
  },
  {
    id: 'estado',
    header: 'Estado',
    size: 100,
    align: 'center',
    resizable: true,
    sortable: true,
    viewModes: ['orders']
  }
];

export function getColumnsForViewMode(viewMode: 'items' | 'orders'): ColumnConfig[] {
  return ORDER_COLUMNS_CONFIG.filter(col => col.viewModes.includes(viewMode));
}

export function createColumnDef<T>(
  config: ColumnConfig,
  cellRenderer: (props: any) => React.ReactNode
): ColumnDef<T> {
  return {
    id: config.id,
    header: config.header,
    size: config.size,
    meta: { align: config.align },
    cell: cellRenderer,
  };
}
