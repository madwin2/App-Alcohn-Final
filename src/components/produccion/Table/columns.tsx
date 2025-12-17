import { ColumnDef } from '@tanstack/react-table';
import { ProductionItem, ProductionState, VectorizationState, StampType } from '@/lib/types/index';
import { CellTarea } from './cells/CellTarea';
import { CellDeadline } from './cells/CellDeadline';
import { CellFecha } from './cells/CellFecha';
import { CellTipo } from './cells/CellTipo';
import { CellDisenio } from './cells/CellDisenio';
import { CellMedida } from './cells/CellMedida';
import { CellNotas } from './cells/CellNotas';
import { CellFabricacionAspire } from './cells/CellFabricacionAspire';
import { CellVectorizado } from './cells/CellVectorizado';
import { CellPrograma } from './cells/CellPrograma';
import { CellArchivoBase } from './cells/CellArchivoBase';
import { CellVector } from './cells/CellVector';
import { CellPrioridad } from './cells/CellPrioridad';
import { CellFoto } from './cells/CellFoto';
import { CellMaquina } from './cells/CellMaquina';
import { CellUploader } from './cells/CellUploader';

interface ProductionTableProps {
  onTipoChange?: (itemId: string, newTipo: StampType) => void;
  onFabricacionChange?: (itemId: string, newState: ProductionState) => void;
  onVectorizadoChange?: (itemId: string, newState: VectorizationState) => void;
  onProgramaChange?: (itemId: string, newProgram: string) => void;
  onAspireChange?: (itemId: string, newState: any) => void;
  onMaquinaChange?: (itemId: string, newMachine: any) => void;
  onDateChange?: (itemId: string, newDate: Date) => void;
  onDeadlineChange?: (itemId: string, deadline: Date | null) => void;
  onTaskCreate?: (itemId: string, title: string, description?: string, dueDate?: Date) => void;
  onTaskUpdate?: (taskId: string, updates: any) => void;
  onTaskDelete?: (taskId: string) => void;
  editingRowId?: string | null;
  onUpdate?: (itemId: string, patch: any) => void;
}

export const createProductionColumns = ({
  onTipoChange,
  onFabricacionChange,
  onVectorizadoChange,
  onProgramaChange,
  onAspireChange,
  onMaquinaChange,
  onDateChange,
  onDeadlineChange,
  onTaskCreate,
  onTaskUpdate,
  onTaskDelete,
  editingRowId,
  onUpdate,
}: ProductionTableProps): ColumnDef<ProductionItem>[] => [
  {
    id: 'tarea',
    header: '',
    cell: ({ row }) => (
      <div 
        className="flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CellTarea 
          item={row.original} 
          onTaskCreate={onTaskCreate}
          onTaskUpdate={onTaskUpdate}
          onTaskDelete={onTaskDelete}
        />
      </div>
    ),
    size: 16,
    meta: {
      align: 'center'
    }
  },
  {
    id: 'uploader',
    header: '',
    cell: ({ row }) => <CellUploader item={row.original} />,
    size: 20,
    meta: {
      align: 'center'
    }
  },
  {
    id: 'fecha',
    header: 'Fecha',
    cell: ({ row }) => <CellFecha item={row.original} onDateChange={onDateChange} />,
    size: 80,
    meta: { align: 'left' }
  },
  {
    id: 'fechaLimite',
    header: 'Fecha Límite',
    cell: ({ row }) => <CellDeadline item={row.original} onDeadlineChange={onDeadlineChange} />,
    size: 80,
    meta: { align: 'left' }
  },
  {
    id: 'tipo',
    header: 'TIPO',
    cell: ({ row }) => <CellTipo item={row.original} onTipoChange={onTipoChange} />,
    size: 50,
    meta: { align: 'center' }
  },
  {
    id: 'disenio',
    header: 'Diseño',
    cell: ({ row }) => <CellDisenio item={row.original} />,
    size: 150,
    meta: { align: 'left' }
  },
  {
    id: 'medida',
    header: 'Medida',
    cell: ({ row }) => <CellMedida item={row.original} />,
    size: 80,
    meta: { align: 'left' }
  },
  {
    id: 'notas',
    header: 'Notas',
    cell: ({ row }) => <CellNotas item={row.original} />,
    size: 100,
    meta: { align: 'left' }
  },
  {
    id: 'prioridad',
    header: 'PRIORIDAD',
    cell: ({ row }) => <CellPrioridad item={row.original} />,
    size: 28,
    meta: { align: 'center' }
  },
  {
    id: 'fabricacion',
    header: 'FABRICACIÓN',
    cell: ({ row }) => (
      <CellFabricacionAspire 
        item={row.original} 
        onFabricacionChange={onFabricacionChange}
        onAspireChange={onAspireChange}
      />
    ),
    size: 140,
    meta: { align: 'center' }
  },
  {
    id: 'vectorizado',
    header: 'VECTORIZADO',
    cell: ({ row }) => (
      <CellVectorizado item={row.original} onVectorizadoChange={onVectorizadoChange} />
    ),
    size: 20,
    meta: { align: 'center' }
  },
  {
    id: 'programa',
    header: 'Programa',
    cell: ({ row }) => (
      <CellPrograma item={row.original} onProgramaChange={onProgramaChange} />
    ),
    size: 20,
    meta: { align: 'center' }
  },
  {
    id: 'maquina',
    header: 'Máquina',
    cell: ({ row }) => (
      <CellMaquina item={row.original} onMaquinaChange={onMaquinaChange} />
    ),
    size: 80,
    meta: { align: 'center' }
  },
  {
    id: 'archivoBase',
    header: 'ARCHIVO BASE',
    cell: ({ row }) => <CellArchivoBase item={row.original} />,
    size: 60,
    meta: { align: 'center' }
  },
  {
    id: 'vector',
    header: 'VECTOR',
    cell: ({ row }) => <CellVector item={row.original} />,
    size: 60,
    meta: { align: 'center' }
  },
];
