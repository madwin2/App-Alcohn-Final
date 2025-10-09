import React from 'react';
import { cn } from '@/lib/utils';

export type ProgressStep = 
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

const PROGRESS_STEPS: { key: ProgressStep; label: string; shortLabel: string; abbreviation: string }[] = [
  { key: 'HECHO', label: 'Hecho', shortLabel: 'Hecho', abbreviation: 'H' },
  { key: 'FOTO', label: 'Foto', shortLabel: 'Foto', abbreviation: 'F' },
  { key: 'TRANSFERIDO', label: 'Transferido', shortLabel: 'Transferido', abbreviation: 'T' },
  { key: 'HACER_ETIQUETA', label: 'Hacer Etiqueta', shortLabel: 'Etiqueta', abbreviation: 'HE' },
  { key: 'ETIQUETA_LISTA', label: 'Etiqueta Lista', shortLabel: 'Lista', abbreviation: 'EL' },
  { key: 'DESPACHADO', label: 'Despachado', shortLabel: 'Despachado', abbreviation: 'D' },
  { key: 'SEGUIMIENTO_ENVIADO', label: 'Seguimiento Enviado', shortLabel: 'Enviado', abbreviation: 'SE' }
];

export function ProgressIndicator({ 
  currentStep, 
  onStepChange, 
  className 
}: ProgressIndicatorProps) {
  const currentIndex = PROGRESS_STEPS.findIndex(step => step.key === currentStep);
  
  return (
    <div className={cn("flex items-center relative", className)}>
      {/* Continuous line below all states */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-600 rounded-full" />
      
      {PROGRESS_STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isNext = index === currentIndex + 1;
        const isFuture = index > currentIndex + 1;
        
        return (
          <React.Fragment key={step.key}>
            {/* Step Indicator */}
            <div className="relative flex items-center">
              <button
                onClick={() => onStepChange?.(step.key)}
                className={cn(
                  "relative z-10 flex items-center justify-center transition-all duration-200 hover:scale-105",
                  isCompleted && "text-white font-bold text-sm",
                  isCurrent && "text-black font-bold text-sm min-w-fit px-3 py-1",
                  isNext && "text-red-600 font-bold text-sm",
                  isFuture && "text-gray-400 font-bold text-sm"
                )}
                title={step.label}
              >
                <span className="whitespace-nowrap">{step.abbreviation}</span>
              </button>
              
              {/* Current State Background with Tail */}
              {isCurrent && (
                <div className="absolute inset-0 pointer-events-none">
                  <div 
                    className="bg-white"
                    style={{
                      clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 30%, -15% 50%, 0% 70%)',
                      borderRadius: '8px',
                      width: '110%',
                      left: '-5%',
                      height: '32px'
                    }}
                  />
                </div>
              )}
            </div>
            
            {/* Colored line segments */}
            <div className={cn(
              "absolute bottom-0 h-1 transition-colors duration-200",
              isCompleted && "bg-white",
              isCurrent && "bg-white", 
              isNext && "bg-red-600",
              isFuture && "bg-gray-600"
            )} style={{
              left: `${index * (100 / PROGRESS_STEPS.length)}%`,
              width: `${100 / PROGRESS_STEPS.length}%`
            }} />
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
    <div className={cn("flex items-center relative", className)}>
      {/* Continuous line below all states */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-600 rounded-full" />
      
      {PROGRESS_STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isNext = index === currentIndex + 1;
        const isFuture = index > currentIndex + 1;
        
        return (
          <React.Fragment key={step.key}>
            {/* Step Indicator - Más pequeño */}
            <div className="relative flex items-center">
              <button
                onClick={() => onStepChange?.(step.key)}
                className={cn(
                  "relative z-10 flex items-center justify-center transition-all duration-200 hover:scale-110",
                  isCompleted && "text-white font-bold text-xs",
                  isCurrent && "text-black font-bold text-xs min-w-fit px-2 py-0.5",
                  isNext && "text-red-600 font-bold text-xs",
                  isFuture && "text-gray-400 font-bold text-xs"
                )}
                title={step.label}
              >
                <span className="whitespace-nowrap">{step.abbreviation}</span>
              </button>
              
              {/* Current State Background with Tail */}
              {isCurrent && (
                <div className="absolute inset-0 pointer-events-none">
                  <div 
                    className="bg-white"
                    style={{
                      clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 30%, -15% 50%, 0% 70%)',
                      borderRadius: '6px',
                      width: '110%',
                      left: '-5%',
                      height: '24px'
                    }}
                  />
                </div>
              )}
            </div>
            
            {/* Colored line segments */}
            <div className={cn(
              "absolute bottom-0 h-0.5 transition-colors duration-200",
              isCompleted && "bg-white",
              isCurrent && "bg-white", 
              isNext && "bg-red-600",
              isFuture && "bg-gray-600"
            )} style={{
              left: `${index * (100 / PROGRESS_STEPS.length)}%`,
              width: `${100 / PROGRESS_STEPS.length}%`
            }} />
          </React.Fragment>
        );
      })}
    </div>
  );
}
