import { chequearSvg } from '@/lib/fresa/chequeoFresa';
import { fetchSvgText, isSvgUrl } from '@/lib/fresa/useFresaReport';
import { observedSvgForStamp, preparationFingerprint, type PreparationDocument, type PreparationObservation } from './preparation';
import { FRESA_ANALYSIS_VERSION } from '@/lib/fresa/config';

/** Chequeo previo completo; nunca toca el vector comercial ni presume leer EPS. */
export async function checkPreparation(document: PreparationDocument, observation?: PreparationObservation | null): Promise<PreparationDocument> {
  const stamps = [];
  for (const s of document.stamps) {
    const mode = s.fine?.mode ?? 'auto';
    if (s.excluded) { stamps.push(s); continue; }
    const actual = observation?.stamps.find((a) => a.instanceId === s.instanceId);
    const base = { mode, scope: s.fine?.scope ?? 'full' as const, widthMm: s.widthMm, heightMm: s.heightMm, recipe: s.recipe, analysisVersion: FRESA_ANALYSIS_VERSION };
    try {
      const observedSvg = !s.vectorSvg && observedSvgForStamp(s, observation);
      const svg = s.vectorSvg || observedSvg || (isSvgUrl(s.sourceUrl) ? await fetchSvgText(s.sourceUrl) : null);
      if (!svg) throw new Error('Sin SVG');
      const report = await chequearSvg(svg, { mode: 'fabricacion', longSideMm: Math.max(s.widthMm, s.heightMm), stampType: s.recipe });
      if (!report.passes || report.status === 'error') throw new Error('Sin análisis');
      stamps.push({ ...s, fine: { ...base, needsFine: report.passes.outcome !== 'sin_repaso', inputHash: preparationFingerprint(svg),
        geometryHash: observedSvg ? actual?.geometryHash : undefined, outcome: report.passes.outcome } });
    } catch {
      stamps.push({ ...s, fine: { ...base, needsFine: true, inputHash: '', outcome: 'sin_analisis' } });
    }
  }
  return { ...document, stamps };
}
