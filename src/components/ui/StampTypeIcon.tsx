import { StampType } from '@/lib/types/index';

interface StampTypeIconProps {
  stampType: StampType;
  className?: string;
}

// Componente para mostrar el icono SVG del tipo de sello
export function StampTypeIcon({ stampType, className = "w-4 h-4" }: StampTypeIconProps) {
  // Solo mostrar icono si no es CLASICO
  if (stampType === 'CLASICO') {
    return null;
  }

  const iconPath = `/icons/${stampType}.svg`;

  return (
    <img 
      src={iconPath} 
      alt={`Icono ${stampType}`}
      className={className}
      onError={(e) => {
        // Si no existe el icono, ocultar el elemento
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}
