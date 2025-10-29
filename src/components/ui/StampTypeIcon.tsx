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

  // Mapeo de tipos de sellos a sus iconos
  const iconMap: Record<StampType, string> = {
    '3MM': '/icons/3mm.svg',
    'ABC': '/icons/ABC.svg',
    'LACRE': '/icons/LACRE.svg',
    'ALIMENTO': '/icons/ABC.svg', // ALIMENTO usa el mismo icono que ABC
    'CLASICO': '' // No se mostrará, pero necesario para el tipo
  };

  const iconPath = iconMap[stampType];

  if (!iconPath) {
    return null;
  }

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
