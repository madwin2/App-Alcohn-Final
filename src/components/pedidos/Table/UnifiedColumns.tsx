import { ColumnDef } from '@tanstack/react-table';
import { Order } from '@/lib/types/index';
import { getColumnsForViewMode, createColumnDef } from '@/lib/utils/columnConfig';
import { CellFecha } from './cells/CellFecha';
import { CellCliente } from './cells/CellCliente';
import { CellContacto } from './cells/CellContacto';
import { CellDisenio } from './cells/CellDisenio';
import { CellEnvio } from './cells/CellEnvio';
import { CellSena } from './cells/CellSena';
import { CellValor } from './cells/CellValor';
import { CellRestante } from './cells/CellRestante';
import { CellSeguimiento } from './cells/CellSeguimiento';
import { CellFoto } from './cells/CellFoto';
import { CellFabricacion } from './cells/CellFabricacion';
import { CellVenta } from './cells/CellVenta';
import { CellEnvioEstado } from './cells/CellEnvioEstado';
import { CellTipo } from './cells/CellTipo';
import { CellBase } from './cells/CellBase';
import { CellVector } from './cells/CellVector';
import { CellTasks } from './cells/CellTasks';
import { CellDeadline } from './cells/CellDeadline';
import { CellPrioridad } from './cells/CellPrioridad';
import { CompactProgressIndicator } from './cells/CellProgressIndicator';

interface UnifiedColumnsProps {
  onTipoChange?: (orderId: string, newTipo: any) => void;
  onFabricacionChange?: (orderId: string, newState: any) => void;
  onVentaChange?: (orderId: string, newState: any) => void;
  onEnvioEstadoChange?: (orderId: string, newState: any) => void;
  onEnvioChange?: (orderId: string, newCarrier: string) => void;
  onDateChange?: (orderId: string, newDate: Date) => void;
  onDeadlineChange?: (orderId: string, newDeadline: Date | null) => void;
  onTaskCreate?: (orderId: string, title: string, description?: string, dueDate?: Date) => void;
  onTaskUpdate?: (taskId: string, updates: any) => void;
  onTaskDelete?: (taskId: string) => void;
  isSubitem?: boolean;
  onProgressChange?: (orderId: string, newStep: any) => void;
  editingRowId?: string | null;
  onUpdate?: (orderId: string, updates: any) => void;
  onExpand?: (orderId: string) => void;
}

export function createUnifiedColumns({
  onTipoChange,
  onFabricacionChange,
  onVentaChange,
  onEnvioEstadoChange,
  onEnvioChange,
  onDateChange,
  onDeadlineChange,
  onTaskCreate,
  onTaskUpdate,
  onTaskDelete,
  onProgressChange,
  editingRowId,
  onUpdate,
  onExpand,
  isSubitem = false
}: UnifiedColumnsProps): ColumnDef<Order>[] {
  const columnConfigs = getColumnsForViewMode('items');
  
  const cellRenderers: Record<string, (props: any) => React.ReactNode> = {
    // Indicadores
    indicadores: ({ row }) => (
      <div className="flex items-center justify-center gap-1">
        <CellTasks
          order={row.original}
          onTaskCreate={onTaskCreate}
          onTaskUpdate={onTaskUpdate}
          onTaskDelete={onTaskDelete}
        />
        <CellDeadline
          order={row.original}
          onDeadlineChange={onDeadlineChange}
        />
      </div>
    ),
    
    // Fecha
    fecha: ({ row }) => (
      <CellFecha
        order={row.original}
        onDateChange={onDateChange}
        editingRowId={editingRowId}
      />
    ),
    
    // Cliente
    cliente: ({ row }) => (
      <CellCliente
        order={row.original}
        onUpdate={onUpdate}
        editingRowId={editingRowId}
      />
    ),
    
    // Contacto
    contacto: ({ row }) => (
      <CellContacto
        order={row.original}
        onUpdate={onUpdate}
        editingRowId={editingRowId}
      />
    ),
    
    // Tipo
    tipo: ({ row }) => (
      <CellTipo
        order={row.original}
        onTipoChange={onTipoChange}
      />
    ),
    
    // Diseño
    disenio: ({ row }) => (
      <CellDisenio
        order={row.original}
        showNotes={true}
        onExpand={() => onExpand?.(row.original.id)}
        editingRowId={editingRowId}
        onUpdate={onUpdate}
      />
    ),
    
    // Empresa/Envío
    envio: ({ row }) => (
      <CellEnvio
        order={row.original}
        onEnvioChange={onEnvioChange}
      />
    ),
    
    // Seña
    sena: ({ row }) => (
      <CellSena
        order={row.original}
        onUpdate={onUpdate}
        editingRowId={editingRowId}
      />
    ),
    
    // Valor
    valor: ({ row }) => (
      <CellValor
        order={row.original}
        onUpdate={onUpdate}
        editingRowId={editingRowId}
      />
    ),
    
    // Restante
    restante: ({ row }) => (
      <CellRestante
        order={row.original}
        onUpdate={onUpdate}
        editingRowId={editingRowId}
      />
    ),
    
    // Prioridad
    prioridad: ({ row }) => (
      <CellPrioridad order={row.original} />
    ),
    
    // Fabricación
    fabricacion: ({ row }) => (
      <CellFabricacion
        order={row.original}
        onFabricacionChange={onFabricacionChange}
      />
    ),
    
    // Venta
    venta: ({ row }) => (
      <CellVenta
        order={row.original}
        onVentaChange={onVentaChange}
        isSubitem={isSubitem}
      />
    ),
    
    // Envío Estado
    envioEstado: ({ row }) => (
      <CellEnvioEstado
        order={row.original}
        onEnvioEstadoChange={onEnvioEstadoChange}
      />
    ),
    
    // Seguimiento
    seguimiento: ({ row }) => (
      <CellSeguimiento
        order={row.original}
        onUpdate={onUpdate}
        editingRowId={editingRowId}
      />
    ),
    
    // Base
    base: ({ row }) => (
      <CellBase
        order={row.original}
        onUpdate={onUpdate}
        editingRowId={editingRowId}
      />
    ),
    
    // Vector
    vector: ({ row }) => (
      <CellVector
        order={row.original}
        onUpdate={onUpdate}
        editingRowId={editingRowId}
      />
    ),
    
    // Foto
    foto: ({ row }) => (
      <CellFoto
        order={row.original}
        onUpdate={onUpdate}
        editingRowId={editingRowId}
      />
    ),
  };

  return columnConfigs.map(config => 
    createColumnDef<Order>(config, cellRenderers[config.id])
  );
}
