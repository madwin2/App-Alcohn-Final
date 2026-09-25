import type { ComponentType } from 'react';
import type { ProgramasTourVisualId } from '@/lib/programas/onboarding';
import {
  MockBoard,
  MockDock,
  MockEstados,
  MockHoja,
  MockIntro,
  MockPocket,
  MockTerminados,
  MockVectores,
} from './ProgramasTourMocks';

const VISUALS: Record<ProgramasTourVisualId | 'intro', ComponentType> = {
  intro: MockIntro,
  board: MockBoard,
  pocket: MockPocket,
  estados: MockEstados,
  vectores: MockVectores,
  hoja: MockHoja,
  dock: MockDock,
  terminados: MockTerminados,
};

export function ProgramasTourVisual({ id }: { id: ProgramasTourVisualId | 'intro' }) {
  const Comp = VISUALS[id];
  return (
    <div key={id} className="absolute inset-0 vt-media-in">
      <Comp />
    </div>
  );
}
