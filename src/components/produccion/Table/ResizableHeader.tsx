import React, { useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

interface ResizableHeaderProps {
  id: string;
  header: string;
  size: number;
  onResize: (columnId: string, size: number) => void;
  className?: string;
  children?: React.ReactNode;
}

export function ResizableHeader({ 
  id, 
  header, 
  size, 
  onResize, 
  className,
  children 
}: ResizableHeaderProps) {
  const [isResizing, setIsResizing] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    
    const startX = e.clientX;
    const startSize = size;
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const newSize = Math.max(10, startSize + deltaX);
      onResize(id, newSize);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <th
      ref={setNodeRef}
      style={{
        ...style,
        width: `${size}px`,
      }}
      className={cn(
        'relative select-none group',
        isDragging && 'opacity-50',
        className
      )}
    >
      <div className="flex items-center justify-between h-full px-2">
        {children}
      </div>
      
      {/* Resize handle - Área más grande y visible */}
      <div
        className="absolute top-0 right-0 w-6 h-full cursor-col-resize z-20"
        onMouseDown={handleResizeMouseDown}
        title="Arrastra para redimensionar"
      />
      
      {/* Drag area - Solo en el centro del header, excluyendo el área de resize */}
      <div 
        className="absolute inset-0 flex items-center justify-center cursor-move pr-6"
        {...attributes}
        {...listeners}
        title="Arrastra para reordenar"
      >
      </div>
    </th>
  );
}





