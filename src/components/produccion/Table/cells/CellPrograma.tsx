import { ProductionItem, ProgramType } from '@/lib/types/index';

interface CellProgramaProps {
  item: ProductionItem;
  onProgramaChange?: (itemId: string, newProgram: ProgramType) => void;
}

const programaLabels: Record<ProgramType, string> = {
  'ILLUSTRATOR': 'AI',
  'PHOTOSHOP': 'PS',
  'COREL': 'CDR',
  'AUTOCAD': 'CAD',
  'OTRO': 'Otro'
};

const programaColors: Record<ProgramType, string> = {
  'ILLUSTRATOR': 'bg-orange-100 text-orange-800',
  'PHOTOSHOP': 'bg-blue-100 text-blue-800',
  'COREL': 'bg-purple-100 text-purple-800',
  'AUTOCAD': 'bg-green-100 text-green-800',
  'OTRO': 'bg-gray-100 text-gray-800'
};

export function CellPrograma({ item, onProgramaChange }: CellProgramaProps) {
  return (
    <div className="flex justify-center">
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${programaColors[item.program]}`}>
        {programaLabels[item.program]}
      </span>
    </div>
  );
}











