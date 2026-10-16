import { describe, expect, it } from 'vitest';
import evidence from './__fixtures__/aspire-c-app.json';
import roundtrip from './__fixtures__/aspire-c-roundtrip.json';
import { validateObservation } from '../../../supabase/functions/_shared/preparationProtocol';
import type { PreparationDocument, PreparationObservation } from './preparation';

// Planes descargados desde la UI y resultados capturados en Aspire 10.514, 2026-10-16.
// Ocho SVG ficticios; sin servidor, TXT ni CNC. No certifican el acabado físico.
describe('armado exportado desde la app y sincronizado en Aspire C real', () => {
  it.each([0, 1])('acepta el informe nativo del plan exportado %i', (index) => {
    const result = validateObservation(evidence.reports[index], evidence.plans[index] as PreparationDocument, index + 1);
    expect(result.stamps).toHaveLength(8);
    expect(result.recalculated).toBe(true);
    expect(result.execution).toMatchObject({ verified: true, stampCount: 8, columnCount: 4 });
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });
  it('conserva el dibujo corregido al cambiar de planchuela y escalar desde la app', () => {
    const actual = (evidence.reports[1] as PreparationObservation).stamps[0];
    expect(actual).toMatchObject({ centerX: 235.351, topY: -180, widthMm: 16, heightMm: 40 });
    expect(evidence.edit.before).not.toBe(evidence.edit.after);
    expect(actual.geometryHash).toBe(evidence.edit.after);
    expect(evidence.first.imports).toBe(8);
    expect(evidence.second.imports).toBe(0);
    expect(evidence.second.stamps).toHaveLength(8);
    evidence.second.stamps.forEach((stamp, i) => {
      expect(stamp.preserved).toBe(true);
      expect(stamp.objectId).toBe(evidence.first.stamps[i].objectId);
    });
    expect(evidence.second.toolpaths).toHaveLength(15);
    expect(evidence.second.toolpaths.every((tp) => tp.valid && tp.feedLength + tp.plungeLength > 0)).toBe(true);
    expect(evidence.second.toolpaths[evidence.second.toolpaths.length - 1]?.name).toBe('Corte Forma');
  });
  it('usa el análisis sobre los dibujos nativos al completar la vuelta a la app', () => {
    const result = validateObservation(roundtrip.observation, roundtrip.document as PreparationDocument, 3);
    expect(result.issues).toEqual([]); expect(result.recalculated).toBe(true);
    expect(roundtrip.document.stamps.filter((stamp) => stamp.fine.needsFine)).toHaveLength(2);
    expect(roundtrip.document.stamps.filter((stamp) => !stamp.fine.needsFine)).toHaveLength(6);
    roundtrip.document.stamps.forEach((stamp) => {
      expect(stamp.fine.geometryHash).toBe(result.stamps.find((s) => s.instanceId === stamp.instanceId)?.geometryHash);
    });
    expect(result.stamps[0]).toMatchObject({ topY: -240, widthMm: 16, heightMm: 40, geometryHash: evidence.edit.after });
    expect(roundtrip.summary.imports).toBe(0);
    expect(roundtrip.summary.stamps.every((stamp) => stamp.preserved)).toBe(true);
    expect(roundtrip.summary.toolpaths).toHaveLength(13);
    expect(roundtrip.summary.toolpaths.every((tp) => tp.valid && tp.feedLength + tp.plungeLength > 0)).toBe(true);
    expect(roundtrip.summary.toolpaths.filter((tp) => tp.name === '4 Perfilado 0.1MM')).toHaveLength(1);
  });
});
