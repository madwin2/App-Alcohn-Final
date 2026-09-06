import { ProductionItem } from '@/lib/types/index';

interface CellMaquinaProps {
  item: ProductionItem;
}

const getMaquinaChipVisual = (machine: string | null | undefined) => {
  if (!machine) {
    return {
      backgroundImage: `linear-gradient(60deg, rgba(107,114,128,0.05) 0%, rgba(107,114,128,0) 100%)`,
      backgroundColor: `rgba(107,114,128,0.1)`,
      boxShadow: 'none',
      borderColor: `rgba(107,114,128,0.70)`,
      textClass: '',
      textColor: `rgba(107,114,128,0.82)`,
      width: '40px',
    };
  }

  switch (machine) {
    case 'C':
      return {
        backgroundImage: `linear-gradient(60deg, rgba(168,85,247,0.05) 0%, rgba(168,85,247,0) 100%)`,
        backgroundColor: `rgba(168,85,247,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(168,85,247,0.70)`,
        textClass: '',
        textColor: `rgba(168,85,247,0.82)`,
        width: '40px',
      };
    case 'G':
      return {
        backgroundImage: `linear-gradient(60deg, rgba(59,130,246,0.05) 0%, rgba(59,130,246,0) 100%)`,
        backgroundColor: `rgba(59,130,246,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(59,130,246,0.70)`,
        textClass: '',
        textColor: `rgba(59,130,246,0.82)`,
        width: '40px',
      };
    case 'XL':
      return {
        backgroundImage: `linear-gradient(60deg, rgba(249,115,22,0.05) 0%, rgba(249,115,22,0) 100%)`,
        backgroundColor: `rgba(249,115,22,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(249,115,22,0.70)`,
        textClass: '',
        textColor: `rgba(249,115,22,0.82)`,
        width: '40px',
      };
    default:
      return {
        backgroundImage: `linear-gradient(60deg, rgba(107,114,128,0.05) 0%, rgba(107,114,128,0) 100%)`,
        backgroundColor: `rgba(107,114,128,0.1)`,
        boxShadow: 'none',
        borderColor: `rgba(107,114,128,0.70)`,
        textClass: '',
        textColor: `rgba(107,114,128,0.82)`,
        width: '40px',
      };
  }
};

export function CellMaquina({ item }: CellMaquinaProps) {
  const visual = getMaquinaChipVisual(item.machine);
  return (
    <div className="w-full h-12 flex items-center justify-center">
      <span
        className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
        style={{
          backgroundImage: visual.backgroundImage,
          backgroundColor: visual.backgroundColor,
          boxShadow: visual.boxShadow,
          borderColor: visual.borderColor,
          backdropFilter: 'saturate(140%) blur(3px)',
          color: visual.textColor,
          width: visual.width,
        }}
        title={item.machine ? `Máquina ${item.machine} (asignada por el programa)` : 'Sin programa'}
      >
        {item.machine || '—'}
      </span>
    </div>
  );
}
