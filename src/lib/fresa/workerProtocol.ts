import type { FresaAnalysisOptions, FresaProfile } from './config';
import type { PaintShape } from './analyze';
import type { CheckOutput, FixOutput } from './engine';

export type WorkerRequest =
  | {
      id: number;
      type: 'check';
      shapes: PaintShape[];
      mmPerUnit: number;
      profile: FresaProfile;
      options: FresaAnalysisOptions;
    }
  | {
      id: number;
      type: 'fix';
      shapes: PaintShape[];
      mmPerUnit: number;
      zoneIds: string[];
      profile: FresaProfile;
      options: FresaAnalysisOptions;
    };

export type WorkerResponse =
  | { id: number; ok: true; type: 'check'; result: CheckOutput }
  | { id: number; ok: true; type: 'fix'; result: FixOutput }
  | { id: number; ok: false; error: string };
