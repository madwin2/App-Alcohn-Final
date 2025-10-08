import React from 'react';
import { cn } from '@/lib/utils';

export type ProgressStep = 
  | 'SIN_HACER'
  | 'HECHO'
  | 'FOTO'
  | 'TRANSFERIDO'
  | 'HACER_ETIQUETA'
  | 'ETIQUETA_LISTA'
  | 'DESPACHADO'
  | 'SEGUIMIENTO_ENVIADO';

export interface ProgressIndicatorProps {
  currentStep: ProgressStep;
  onStepChange?: (step: ProgressStep) => void;
  className?: string;
}

const PROGRESS_STEPS: { key: ProgressStep; label: string; shortLabel: string }[] = [
  { key: 'SIN_HACER', label: 'Sin hacer', shortLabel: 'Sin hacer' },
  { key: 'HECHO', label: 'Hecho', shortLabel: 'Hecho' },
  { key: 'FOTO', label: 'Foto', shortLabel: 'Foto' },
  { key: 'TRANSFERIDO', label: 'Transferido', shortLabel: 'Transferido' },
  { key: 'HACER_ETIQUETA', label: 'Hacer Etiqueta', shortLabel: 'Etiqueta' },
  { key: 'ETIQUETA_LISTA', label: 'Etiqueta Lista', shortLabel: 'Lista' },
  { key: 'DESPACHADO', label: 'Despachado', shortLabel: 'Despachado' },
  { key: 'SEGUIMIENTO_ENVIADO', label: 'Seguimiento Enviado', shortLabel: 'Enviado' }
];

export function ProgressIndicator({ 
  currentStep, 
  onStepChange, 
  className 
}: ProgressIndicatorProps) {
  const currentIndex = PROGRESS_STEPS.findIndex(step => step.key === currentStep);
  
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {PROGRESS_STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isUpcoming = index > currentIndex;
        
        return (
          <React.Fragment key={step.key}>
            {/* Step Circle */}
            <button
              onClick={() => onStepChange?.(step.key)}
              className={cn(
                "relative flex items-center justify-center w-6 h-6 rounded-full border-2 transition-all duration-200 hover:scale-105",
                isCompleted && "bg-primary border-primary text-primary-foreground",
                isCurrent && "bg-background border-primary text-primary ring-2 ring-primary/20",
                isUpcoming && "bg-muted border-muted-foreground/30 text-muted-foreground/50 hover:border-muted-foreground/60"
              )}
              title={step.label}
            >
              {isCompleted ? (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : isCurrent ? (
                <div className="w-2 h-2 bg-primary rounded-full" />
              ) : (
                <div className="w-1.5 h-1.5 bg-muted-foreground/30 rounded-full" />
              )}
            </button>
            
            {/* Connecting Line */}
            {index < PROGRESS_STEPS.length - 1 && (
              <div className={cn(
                "h-0.5 w-4 transition-colors duration-200",
                isCompleted ? "bg-primary" : "bg-muted-foreground/20"
              )} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Versión compacta para la tabla
export function CompactProgressIndicator({ 
  currentStep, 
  onStepChange, 
  className 
}: ProgressIndicatorProps) {
  const currentIndex = PROGRESS_STEPS.findIndex(step => step.key === currentStep);
  
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {PROGRESS_STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isUpcoming = index > currentIndex;
        
        return (
          <React.Fragment key={step.key}>
            {/* Step Circle - Más pequeño */}
            <button
              onClick={() => onStepChange?.(step.key)}
              className={cn(
                "relative flex items-center justify-center w-4 h-4 rounded-full border transition-all duration-200 hover:scale-110",
                isCompleted && "bg-primary border-primary text-primary-foreground",
                isCurrent && "bg-background border-primary text-primary ring-1 ring-primary/30",
                isUpcoming && "bg-muted border-muted-foreground/20 text-muted-foreground/40 hover:border-muted-foreground/40"
              )}
              title={step.label}
            >
              {isCompleted ? (
                <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : isCurrent ? (
                <div className="w-1 h-1 bg-primary rounded-full" />
              ) : (
                <div className="w-0.5 h-0.5 bg-muted-foreground/30 rounded-full" />
              )}
            </button>
            
            {/* Connecting Line - Más delgada */}
            {index < PROGRESS_STEPS.length - 1 && (
              <div className={cn(
                "h-px w-2 transition-colors duration-200",
                isCompleted ? "bg-primary" : "bg-muted-foreground/15"
              )} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
