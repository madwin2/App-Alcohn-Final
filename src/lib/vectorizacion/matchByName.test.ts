import { describe, expect, it } from 'vitest';
import { autoAssign, normalizeName, rankMatches } from './matchByName';

const sellos = [
  { selloId: '1', label: 'Acme S.A. — Juan Pérez', designName: 'Acme S.A.' },
  { selloId: '2', label: 'Nueva Marca — Ana', designName: 'Nueva Marca' },
  { selloId: '3', label: 'Kolibry Joyas — Adriana', designName: 'Kolibry Joyas' },
];

describe('matchByName', () => {
  it('matchea exacto', () => {
    expect(rankMatches('Acme S.A.svg', sellos)[0]).toMatchObject({ selloId: '1', score: 1 });
  });

  it('ignora acentos y palabras de ruido', () => {
    expect(normalizeName('logo-acmÉ-vector-final.svg')).toBe('acme');
    expect(rankMatches('logo-acme-vector-final.svg', sellos)[0].selloId).toBe('1');
  });

  it('tolera un typo de una letra', () => {
    const ranked = rankMatches('acma-sa.svg', sellos);
    expect(ranked[0].selloId).toBe('1');
    expect(ranked[0].score).toBeGreaterThan(0.5);
  });

  it('auto-asigna con confianza y deja el resto manual', () => {
    const assigned = autoAssign(['acme-sa.svg', 'logo-nuevo-final.svg'], sellos);
    expect(assigned['acme-sa.svg']).toBe('1');
    expect(assigned['logo-nuevo-final.svg']).toBeNull();
  });

  it('si dos archivos apuntan al mismo sello, gana el de mayor score', () => {
    const assigned = autoAssign(['Acme S.A.svg', 'acme.svg'], sellos);
    const values = Object.values(assigned).filter(Boolean);
    expect(values).toHaveLength(1);
    expect(values[0]).toBe('1');
    expect(assigned['Acme S.A.svg']).toBe('1');
    expect(assigned['acme.svg']).toBeNull();
  });

  it('no asigna si no hay match', () => {
    expect(autoAssign(['xyz-desconocido.svg'], sellos)['xyz-desconocido.svg']).toBeNull();
  });
});
