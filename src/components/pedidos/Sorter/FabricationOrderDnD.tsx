import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { FabricationState } from '@/lib/types/index';

interface FabricationOrderDnDProps {
  fabricationPriority: FabricationState[];
  onOrderChange: (newOrder: FabricationState[]) => void;
}

const fabricationLabels: Record<FabricationState, string> = {
  'SIN_HACER': 'Sin Hacer',
  'HACIENDO': 'Haciendo',
  'VERIFICAR': 'Verificar',
  'HECHO': 'Hecho',
  'REHACER': 'Rehacer',
  'PRIORIDAD': 'Prioridad',
  'RETOCAR': 'Retocar'
};

function SortableItem({ state }: { state: FabricationState }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: state });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 border rounded-lg bg-card ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <span className="text-sm font-medium">{fabricationLabels[state]}</span>
    </div>
  );
}

export function FabricationOrderDnD({ fabricationPriority, onOrderChange }: FabricationOrderDnDProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = fabricationPriority.indexOf(active.id);
      const newIndex = fabricationPriority.indexOf(over.id);
      
      onOrderChange(arrayMove(fabricationPriority, oldIndex, newIndex));
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">
        Arrastra para reordenar la prioridad de fabricación:
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={fabricationPriority}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {fabricationPriority.map((state) => (
              <SortableItem key={state} state={state} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
