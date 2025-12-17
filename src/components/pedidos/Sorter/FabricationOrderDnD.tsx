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
  'RETOCAR': 'Retocar',
  'PROGRAMADO': 'Programado'
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
      className={`flex items-center justify-between p-3.5 bg-card rounded-lg border transition-all ${
        isDragging ? 'opacity-50 shadow-lg border-primary/50' : 'border-border hover:border-primary/30 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1.5 hover:bg-muted rounded transition-colors"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <span className="text-sm font-medium">{fabricationLabels[state]}</span>
      </div>
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
      <p className="text-xs text-muted-foreground pl-6">
        Arrastra los elementos para reordenar según su prioridad
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
          <div className="space-y-2 pl-6">
            {fabricationPriority.map((state, index) => (
              <div key={state} className="relative">
                <SortableItem state={state} />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-md">
                  #{index + 1}
                </span>
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
