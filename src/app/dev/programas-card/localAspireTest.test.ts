import { describe, expect, it } from 'vitest';
import evidence from '@/lib/programas/__fixtures__/aspire-c-app.json';
import { observedSvgForStamp, type PreparationDocument } from '@/lib/programas/preparation';
import { LOCAL_ASPIRE_FILE_LIMIT, readLocalAspirePlan, readLocalAspireReport } from './localAspireTest';

const planPayload = () => ({ kind: 'alcohn-local-aspire-test', record: { document: structuredClone(evidence.plans[1]) as PreparationDocument, revision: 2,
  syncedRevision: 2, observation: evidence.reports[1] } });
const reportPayload = () => ({ programa_id: evidence.plans[1].programId, modo: 'PREPARACION_V2', preparation: structuredClone(evidence.reports[1]) });
const restore = () => readLocalAspirePlan(JSON.stringify(planPayload()));

describe('ida y vuelta local con el informe real de Aspire', () => {
  it('restaura el plan sin importar aprobaciones ni confundir observaciones previas con informes leídos', () => {
    const record = restore();
    expect(record.document).toEqual(evidence.plans[1]);
    expect(record.revision).toBe(2); expect(record.syncedRevision).toBeNull(); expect(record.observation).toBeNull();
  });
  it('lee la geometría corregida del informe sin modificar el plan ni aprobar la fabricación', () => {
    const record = restore(), before = structuredClone(record);
    const observation = readLocalAspireReport(JSON.stringify(reportPayload()), record);
    expect(record).toEqual(before);
    expect(observation.stamps[0].geometryHash).toBe(evidence.edit.after);
    expect(observedSvgForStamp(record.document.stamps[0], observation)).toBe(evidence.reports[1].stamps[0].svg);
    expect(observation.recalculated).toBe(true);
    expect(observation.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(record.syncedRevision).toBeNull();
  });
  it.each(['anterior', 'futura', 'otro programa', 'fuente nueva', 'duplicado', 'sin dibujo'] as const)('rechaza el informe %s sin tocar el plan', (scenario) => {
    const record = restore(), payload = reportPayload(), before = structuredClone(record);
    if (scenario === 'anterior') payload.preparation.revision = 1;
    if (scenario === 'futura') payload.preparation.revision = 3;
    if (scenario === 'otro programa') payload.programa_id = 'otro';
    if (scenario === 'fuente nueva') payload.preparation.stamps[0].sourceUrl = 'otra.svg';
    if (scenario === 'duplicado') payload.preparation.stamps.push(payload.preparation.stamps[0]);
    if (scenario === 'sin dibujo') payload.preparation.stamps[0].svg = '';
    expect(() => readLocalAspireReport(JSON.stringify(payload), record)).toThrow(); expect(record).toEqual(before);
  });
  it('muestra un fallo de CAM como pendiente y mantiene los controles del contrato', () => {
    const payload = reportPayload(); payload.preparation.recalculated = false;
    const observation = readLocalAspireReport(JSON.stringify(payload), restore());
    expect(observation.issues.some((issue) => issue.code === 'TOOLPATHS' && issue.severity === 'error')).toBe(true);
  });
  it.each(['comercial', 'duplicado', 'revisión inválida'] as const)('rechaza un armado %s', (scenario) => {
    const payload = planPayload();
    if (scenario === 'comercial') payload.record.document.stamps[0].sourceUrl = 'https://example.com/pedido.svg';
    if (scenario === 'duplicado') payload.record.document.stamps.push(payload.record.document.stamps[0]);
    if (scenario === 'revisión inválida') payload.record.revision = 1.5;
    expect(() => readLocalAspirePlan(JSON.stringify(payload))).toThrow();
  });
  it('rechaza JSON inválido y archivos demasiado grandes', () => {
    expect(() => readLocalAspirePlan('{')).toThrow('JSON');
    expect(() => readLocalAspireReport(' '.repeat(LOCAL_ASPIRE_FILE_LIMIT + 1), restore())).toThrow('8 MB');
  });
});
