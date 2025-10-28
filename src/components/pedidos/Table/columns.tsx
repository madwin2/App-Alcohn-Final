import { ColumnDef } from '@tanstack/react-table';
import React, { useRef, useEffect } from 'react';
import { Order, FabricationState, SaleState, ShippingState, ShippingCarrier, StampType } from '@/lib/types/index';
import { CellFecha } from './cells/CellFecha';
import { CellCliente } from './cells/CellCliente';
import { CellContacto } from './cells/CellContacto';
import { CellDisenio } from './cells/CellDisenio';
import { CellTipo } from './cells/CellTipo';
import { CellSena } from './cells/CellSena';
import { CellEnvio } from './cells/CellEnvio';
import { CellValor } from './cells/CellValor';
import { CellRestante } from './cells/CellRestante';
import { CellFabricacion } from './cells/CellFabricacion';
import { CellVenta } from './cells/CellVenta';
import { CellEnvioEstado } from './cells/CellEnvioEstado';
import { CellSeguimiento } from './cells/CellSeguimiento';
import { CellBase } from './cells/CellBase';
import { CellVector } from './cells/CellVector';
import { CellFoto } from './cells/CellFoto';
import { CellPrioridad } from './cells/CellPrioridad';
import { CellTasks } from './cells/CellTasks';
import { CellDeadline } from './cells/CellDeadline';

interface OrdersTableProps {
  onTipoChange?: (orderId: string, newTipo: StampType) => void;
  onFabricacionChange?: (orderId: string, newState: FabricationState) => void;
  onVentaChange?: (orderId: string, newState: SaleState) => void;
  onEnvioEstadoChange?: (orderId: string, newState: ShippingState) => void;
  onEnvioChange?: (orderId: string, newCarrier: ShippingCarrier) => void;
  onDateChange?: (orderId: string, newDate: Date) => void;
  onDeadlineChange?: (orderId: string, deadline: Date | null) => void;
  onTaskCreate?: (orderId: string, title: string, description?: string) => void;
  onTaskUpdate?: (taskId: string, updates: any) => void;
  onTaskDelete?: (taskId: string) => void;
  editingRowId?: string | null;
  onUpdate?: (orderId: string, patch: any) => void;
}

// Editor inline que no cambia layout (span contentEditable)
function EditableInline({
  value,
  onCommit,
  className = '',
  singleLine = true,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  singleLine?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.textContent = value ?? '';
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (singleLine && e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLSpanElement).blur();
    }
    if (e.key === 'Escape') {
      if (ref.current) ref.current.textContent = value ?? '';
      (e.target as HTMLSpanElement).blur();
    }
  };

  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => onCommit((e.target as HTMLSpanElement).textContent || '')}
      onKeyDown={handleKeyDown}
      className={`inline-block align-middle text-xs leading-none whitespace-nowrap outline-none focus:ring-0 ${className}`}
      style={{ padding: 0 }}
    />
  );
}

export const createColumns = ({
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
  editingRowId,
  onUpdate,
}: OrdersTableProps): ColumnDef<Order>[] => [
  {
    id: 'indicadores',
    header: '',
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5 items-center justify-center">
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
    size: 16,
    meta: {
      align: 'center'
    }
  },
  {
    id: 'fecha',
    header: 'Fecha',
    cell: ({ row }) => <CellFecha order={row.original} onDateChange={onDateChange} />,
    size: 80,
  },
  {
    id: 'cliente',
    header: 'Cliente',
    cell: ({ row }) => {
      const isEditing = editingRowId === row.original.id;
      const o = row.original;
      if (!isEditing) return <CellCliente order={o} />;
      return (
        <div className="flex flex-col gap-0.5">
          <EditableInline value={o.customer.firstName} onCommit={(v) => onUpdate?.(o.id, { customer: { ...o.customer, firstName: v } })} />
          <EditableInline value={o.customer.lastName} onCommit={(v) => onUpdate?.(o.id, { customer: { ...o.customer, lastName: v } })} className="text-muted-foreground" />
        </div>
      );
    },
    size: 30,
  },
  {
    id: 'contacto',
    header: 'Contacto',
    cell: ({ row }) => {
      const isEditing = editingRowId === row.original.id;
      const o = row.original;
      if (!isEditing) return <CellContacto order={o} />;
      return (
        <EditableInline value={o.customer.phoneE164} onCommit={(v) => onUpdate?.(o.id, { customer: { ...o.customer, phoneE164: v } })} className="text-gray-400" />
      );
    },
    size: 80,
  },
  {
    id: 'tipo',
    header: 'Tipo',
    cell: ({ row }) => <CellTipo order={row.original} onTipoChange={onTipoChange} />,
    size: 50,
    meta: { align: 'center' }
  },
  {
    id: 'disenio',
    header: 'Diseño',
    cell: ({ row }) => {
      const isEditing = editingRowId === row.original.id;
      const o = row.original;
      if (!isEditing) return <CellDisenio order={o} />;
      const item = o.items[0];
      return (
        <div className="flex flex-col gap-0.5">
          <EditableInline value={item?.designName || ''} onCommit={(v) => onUpdate?.(o.id, { items: [{ ...item, designName: v }] })} />
          <EditableInline value={`${item?.requestedWidthMm || 0}×${item?.requestedHeightMm || 0}mm`} onCommit={(v) => {
            const [width, height] = v.replace('mm', '').split('×');
            onUpdate?.(o.id, { items: [{ ...item, requestedWidthMm: parseInt(width), requestedHeightMm: parseInt(height) }] });
          }} className="text-muted-foreground" />
          <EditableInline value={item?.notes || ''} onCommit={(v) => onUpdate?.(o.id, { items: [{ ...item, notes: v }] })} className="text-blue-400" />
        </div>
      );
    },
    size: 220,
  },
  {
    id: 'envio',
    header: 'Empresa',
    cell: ({ row }) => (
      <CellEnvio order={row.original} onEnvioChange={onEnvioChange} />
    ),
    size: 80,
    meta: { align: 'left' }
  },
  {
    id: 'sena',
    header: 'Seña',
    cell: ({ row }) => {
      const isEditing = editingRowId === row.original.id;
      const o = row.original;
      if (!isEditing) return <CellSena order={o} />;
      const item = o.items[0];
      return (
        <EditableInline value={String(item?.depositValueItem || 0)} onCommit={(v) => onUpdate?.(o.id, { items: [{ ...item, depositValueItem: Number(v || 0) }] })} />
      );
    },
    size: 70,
    meta: { align: 'left' }
  },
  {
    id: 'valor',
    header: 'Valor',
    cell: ({ row }) => {
      const isEditing = editingRowId === row.original.id;
      const o = row.original;
      if (!isEditing) return <CellValor order={o} />;
      const item = o.items[0];
      return (
        <EditableInline value={String(item?.itemValue || 0)} onCommit={(v) => onUpdate?.(o.id, { items: [{ ...item, itemValue: Number(v || 0) }] })} />
      );
    },
    size: 70,
    meta: { align: 'left' }
  },
  {
    id: 'restante',
    header: 'Restante',
    cell: ({ row }) => <CellRestante order={row.original} />,
    size: 80,
    meta: { align: 'left' }
  },
  {
    id: 'prioridad',
    header: 'Prioridad',
    cell: ({ row }) => <CellPrioridad order={row.original} />,
    size: 28,
    meta: { align: 'center' }
  },
  {
    id: 'fabricacion',
    header: 'Fabricación',
    cell: ({ row }) => (
      <CellFabricacion order={row.original} onFabricacionChange={onFabricacionChange} />
    ),
    size: 20,
    meta: { align: 'center' }
  },
  {
    id: 'venta',
    header: 'Venta',
    cell: ({ row }) => (
      <CellVenta order={row.original} onVentaChange={onVentaChange} />
    ),
    size: 20,
    meta: { align: 'center' }
  },
  {
    id: 'envioEstado',
    header: 'Envío',
    cell: ({ row }) => (
      <CellEnvioEstado order={row.original} onEnvioEstadoChange={onEnvioEstadoChange} />
    ),
    size: 20,
    meta: { align: 'center' }
  },
  { id: 'seguimiento', header: 'Seguimiento', cell: ({ row }) => <CellSeguimiento order={row.original} />, size: 120 },
  { id: 'base', header: 'Base', cell: ({ row }) => <CellBase order={row.original} />, size: 60, meta: { align: 'center' } },
  { id: 'vector', header: 'Vector', cell: ({ row }) => <CellVector order={row.original} />, size: 60, meta: { align: 'center' } },
  { id: 'foto', header: 'Foto', cell: ({ row }) => <CellFoto order={row.original} />, size: 60, meta: { align: 'center' } },
];
