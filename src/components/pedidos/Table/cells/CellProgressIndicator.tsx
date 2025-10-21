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
    <div className={cn("flex flex-col items-center gap-2", className)}>
      {/* Letters row - uniform spacing for all states including 2-letter ones */}
      <div className="flex items-center">
        {PROGRESS_STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isNext = index === currentIndex + 1;
          const isFuture = index > currentIndex + 1;
          
          return (
            <button
              key={step.key}
              onClick={() => onStepChange?.(step.key)}
              className={cn(
                "relative flex items-center justify-center transition-all duration-200 hover:scale-105",
                isCompleted && "text-white font-bold text-xs",
                isCurrent && "text-black font-bold text-xs",
                isNext && "text-red-600 font-bold text-xs",
                isFuture && "text-gray-400 font-bold text-xs"
              )}
              title={step.label}
              style={{
                width: '40px', // Reduced width for more compact design
                height: '24px'
              }}
            >
              {/* Current State Background - Simple white circle */}
              {isCurrent && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded-full" />
                </div>
              )}
              
              <span className="relative z-10 whitespace-nowrap">{step.abbreviation}</span>
            </button>
          );
        })}
      </div>
      
      {/* Progress bar below letters - perfectly aligned with each letter */}
      <div className="relative w-full h-1 bg-gray-600 rounded-full">
        {PROGRESS_STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isNext = index === currentIndex + 1;
          const isFuture = index > currentIndex + 1;
          
          return (
            <div
              key={step.key}
              className={cn(
                "absolute top-0 h-1 transition-colors duration-200 rounded-full",
                isCompleted && "bg-white",
                isCurrent && "bg-white", 
                isNext && "bg-red-600",
                isFuture && "bg-gray-600"
              )}
              style={{
                left: `${index * (100 / PROGRESS_STEPS.length)}%`,
                width: `${100 / PROGRESS_STEPS.length}%`
              }}
            />
          );
        })}
      </div>
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
    <div className={cn("flex flex-col items-center gap-1", className)}>
      {/* Letters row - uniform spacing for all states including 2-letter ones */}
      <div className="flex items-center">
        {PROGRESS_STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isNext = index === currentIndex + 1;
          const isFuture = index > currentIndex + 1;
          
          return (
            <button
              key={step.key}
              onClick={() => onStepChange?.(step.key)}
              className={cn(
                "relative flex items-center justify-center transition-all duration-200 hover:scale-110",
                isCompleted && "text-white font-bold text-[10px]",
                isCurrent && "text-black font-bold text-[10px]",
                isNext && "text-red-600 font-bold text-[10px]",
                isFuture && "text-gray-400 font-bold text-[10px]"
              )}
              title={step.label}
              style={{
                width: '28px', // Reduced width for more compact design
                height: '16px'
              }}
            >
              {/* Current State Background - Simple white circle */}
              {isCurrent && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full" />
                </div>
              )}
              
              <span className="relative z-10 whitespace-nowrap">{step.abbreviation}</span>
            </button>
          );
        })}
      </div>
      
      {/* Progress bar below letters - perfectly aligned with each letter */}
      <div className="relative w-full h-0.5 bg-gray-600 rounded-full">
        {PROGRESS_STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isNext = index === currentIndex + 1;
          const isFuture = index > currentIndex + 1;
          
          return (
            <div
              key={step.key}
              className={cn(
                "absolute top-0 h-0.5 transition-colors duration-200 rounded-full",
                isCompleted && "bg-white",
                isCurrent && "bg-white", 
                isNext && "bg-red-600",
                isFuture && "bg-gray-600"
              )}
              style={{
                left: `${index * (100 / PROGRESS_STEPS.length)}%`,
                width: `${100 / PROGRESS_STEPS.length}%`
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
