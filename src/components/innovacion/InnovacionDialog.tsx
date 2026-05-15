import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { innovacionDialogSurface } from '@/components/innovacion/innovacion-ui';

/**
 * Contenido de diálogo para Innovación: overlay oscuro + superficie del módulo (Radix Dialog).
 */
export const InnovacionDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-black/75 backdrop-blur-md',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'motion-reduce:animate-none motion-reduce:data-[state=closed]:animate-none',
      )}
    />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 p-6 duration-200 sm:rounded-2xl',
        innovacionDialogSurface,
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
        'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
        'motion-reduce:animate-none motion-reduce:data-[state=closed]:animate-none',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className={cn(
          'absolute right-4 top-4 rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-zinc-400 opacity-90 transition',
          'hover:bg-white/10 hover:text-zinc-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40',
        )}
      >
        <X className="h-4 w-4" aria-hidden />
        <span className="sr-only">Cerrar</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
InnovacionDialogContent.displayName = 'InnovacionDialogContent';
