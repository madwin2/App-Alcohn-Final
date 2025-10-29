import { useRef, useEffect } from 'react';

interface EditableInlineProps {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  singleLine?: boolean;
}

// Editor inline que no cambia layout (span contentEditable)
export function EditableInline({
  value,
  onCommit,
  className = '',
  singleLine = true,
}: EditableInlineProps) {
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

