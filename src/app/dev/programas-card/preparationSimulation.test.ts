import { describe, expect, it } from 'vitest';
import { buildExecutionPlan, validatePreparation } from '@/lib/programas/preparation';
import { emptySimulation, simulateAspireEdit, simulateSync, simulatedDocument, simulationDocument } from './preparationSimulation';

describe('simulación aislada de preparación', () => {
  it('carga ocho sellos y tres recetas con un armado inicial válido, sin aprobar CAM', () => {
    const doc = simulationDocument('sim', 'normal');
    expect(validatePreparation(doc)).toEqual([]); expect(new Set(doc.stamps.map((s) => s.recipe)).size).toBe(3);
    const result = simulateSync(doc, 1, emptySimulation());
    expect(result.state.current).toHaveLength(8); expect(result.observation.issues).toEqual([]);
    expect(result.observation.recalculated).toBe(false); expect(result.observation.execution?.verified).toBe(false);
  });
  it.each([['material', 'MATERIAL'], ['width', 'WIDTH'], ['separation', 'SEPARATION']] as const)('detiene el caso %s con el control real %s', (scenario, code) => {
    const result = simulateSync(simulationDocument('sim', scenario), 1, emptySimulation());
    expect(result.observation.issues.some((i) => i.code === code)).toBe(true); expect(result.state.current).toEqual([]);
  });
  it('combina una corrección de Aspire con el traslado y rehace el corte para el ancho de destino', () => {
    const doc = simulationDocument('sim', 'normal');
    const initial = simulateSync(doc, 1, emptySimulation()).state;
    const edited = simulateAspireEdit(initial, 'geometry'), corrected = edited.current[0].svg;
    const moved = structuredClone(doc); Object.assign(moved.stamps[0], { columnId: 'p38', centerX: moved.columns.find((c) => c.id === 'p38')!.centerX, topY: -180 });
    const result = simulateSync(moved, 2, edited);
    expect(result.state.conflicts).toEqual([]); expect(result.observation.issues).toEqual([]);
    expect(result.state.current[0].svg).toBe(corrected); expect(result.state.current[0].instanceId).toBe(doc.stamps[0].instanceId);
    expect(result.state.current[0].topY).toBe(-180); expect(result.state.current).toHaveLength(8);
    const cut = buildExecutionPlan(simulatedDocument(moved, result.state.current)).stamps[0].cut;
    expect(cut.x2 - cut.x1).toBe(46);
  });
  it('pide elegir cuando la medida cambia en ambos lados y conserva la decisión en el siguiente envío', () => {
    const doc = simulationDocument('sim', 'normal'), initial = simulateSync(doc, 1, emptySimulation()).state;
    const edited = simulateAspireEdit(initial, 'size'), resized = structuredClone(doc);
    resized.stamps[0].widthMm = 14; resized.stamps[0].heightMm = 35;
    const blocked = simulateSync(resized, 2, edited);
    expect(blocked.state.conflicts[0].property).toBe('size'); expect(blocked.state.current[0].widthMm).toBeCloseTo(13.2);
    const keep = simulateSync(resized, 2, blocked.state, 'aspire');
    expect(keep.observation.issues).toEqual([]); expect(keep.state.current[0].widthMm).toBeCloseTo(13.2);
    expect(simulateSync(resized, 2, keep.state).state.current[0].widthMm).toBeCloseTo(13.2);
    expect(simulateSync(resized, 2, blocked.state, 'app').state.current[0].widthMm).toBe(14);
  });
  it('conserva un cambio hecho solo en Aspire y no reinserta piezas que desaparecieron', () => {
    const doc = simulationDocument('sim', 'normal'), initial = simulateSync(doc, 1, emptySimulation()).state;
    const edited = simulateAspireEdit(initial, 'size');
    expect(simulateSync(doc, 2, edited).state.current[0].widthMm).toBeCloseTo(13.2);
    edited.current.shift();
    const result = simulateSync(doc, 2, edited);
    expect(result.state.current).toHaveLength(7); expect(result.observation.issues.some((i) => i.code === 'SIM_MISSING')).toBe(true);
  });
  it('muestra la pieza retirada hasta enviar el plan nuevo y luego la quita del resultado', () => {
    const doc = simulationDocument('sim', 'normal'), initial = simulateSync(doc, 1, emptySimulation()).state;
    const reduced = structuredClone(doc); reduced.stamps.shift();
    expect(simulatedDocument(reduced, initial.current, initial.plan).stamps[0].name).toBe('Marca A');
    expect(simulateSync(reduced, 2, initial).state.current).toHaveLength(7);
  });
});
