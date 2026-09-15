import type { ComponentType } from 'react';
import {
  MockAsignar,
  MockMenu,
  MockRevision,
  MockRun,
  MockSheet,
  MockTabs,
} from './tourMocks';

export type TourVisualId = 'tabs' | 'sheet' | 'menu' | 'run' | 'revision' | 'asignar';

const VISUALS: Record<TourVisualId, ComponentType> = {
  tabs: MockTabs,
  sheet: MockSheet,
  menu: MockMenu,
  run: MockRun,
  revision: MockRevision,
  asignar: MockAsignar,
};

export function TourVisual({ id }: { id: TourVisualId }) {
  const Comp = VISUALS[id];
  return (
    <div key={id} className="h-full vt-media-in">
      <Comp />
    </div>
  );
}
