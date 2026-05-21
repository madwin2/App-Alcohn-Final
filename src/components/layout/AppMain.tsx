import { cn } from '@/lib/utils/cn';
import type { ReactNode } from 'react';

/** Contenido principal con margen para la sidebar fija (la sidebar vive en AuthenticatedLayout). */
export function AppMain({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-screen flex-1 flex-col bg-background ml-20', className)}>
      {children}
    </div>
  );
}
