import type { LogoInkMeasurements } from '@/lib/utils/mockupPipeline';
import type { UiStep } from './mockupPageShared';

export const MOCKUP_PAGE_SLOT_COUNT_KEY = 'mockup_page_slot_count_v1';

export type MockupSlotDraftV1 = {
  v: 1;
  savedAt: string;
  uiStep: UiStep;
  sampleName: string;
  whatsapp: string;
  skipAnalysis: boolean;
  useCuero: boolean;
  useMadera: boolean;
  anchoDisenoCm: string;
  activeRowId: string | null;
  /** Solo si aún no hay fila en Supabase (paso 1 con imagen local). */
  sourceDataUrl: string | null;
  logoMetrics: LogoInkMeasurements | null;
};

export function mockupSlotDraftStorageKey(slotIndex: number): string {
  return `mockup_slot_draft_v1_${slotIndex}`;
}

export function readMockupSlotDraft(slotIndex: number): MockupSlotDraftV1 | null {
  try {
    const raw = localStorage.getItem(mockupSlotDraftStorageKey(slotIndex));
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<MockupSlotDraftV1>;
    if (j.v !== 1) return null;
    return {
      v: 1,
      savedAt: typeof j.savedAt === 'string' ? j.savedAt : new Date().toISOString(),
      uiStep: j.uiStep === 2 || j.uiStep === 3 ? j.uiStep : 1,
      sampleName: typeof j.sampleName === 'string' ? j.sampleName : '',
      whatsapp: typeof j.whatsapp === 'string' ? j.whatsapp : '',
      skipAnalysis: Boolean(j.skipAnalysis),
      useCuero: Boolean(j.useCuero),
      useMadera: Boolean(j.useMadera),
      anchoDisenoCm: typeof j.anchoDisenoCm === 'string' ? j.anchoDisenoCm : '',
      activeRowId: typeof j.activeRowId === 'string' && j.activeRowId.length > 0 ? j.activeRowId : null,
      sourceDataUrl: typeof j.sourceDataUrl === 'string' && j.sourceDataUrl.length > 0 ? j.sourceDataUrl : null,
      logoMetrics: j.logoMetrics && typeof j.logoMetrics === 'object' ? (j.logoMetrics as LogoInkMeasurements) : null,
    };
  } catch {
    return null;
  }
}

export function writeMockupSlotDraft(slotIndex: number, draft: MockupSlotDraftV1): void {
  try {
    localStorage.setItem(mockupSlotDraftStorageKey(slotIndex), JSON.stringify(draft));
  } catch {
    // cuota u otro
  }
}

export function clearMockupSlotDraft(slotIndex: number): void {
  try {
    localStorage.removeItem(mockupSlotDraftStorageKey(slotIndex));
  } catch {
    // ignore
  }
}
