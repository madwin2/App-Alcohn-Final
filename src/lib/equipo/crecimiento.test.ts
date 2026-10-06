import { describe, expect, it } from 'vitest';
import {
  labelEstadoObjetivo,
  labelTipoObjetivo,
  particionarObjetivos,
  siguienteEstadoObjetivo,
  type ObjetivoParticionable,
} from './crecimiento';

function item(
  partial: Partial<ObjetivoParticionable> & Pick<ObjetivoParticionable, 'id' | 'tipo' | 'estado'>,
): ObjetivoParticionable {
  return {
    titulo: partial.titulo ?? partial.id,
    fechaObjetivo: partial.fechaObjetivo ?? null,
    logradoAt: partial.logradoAt ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('crecimiento', () => {
  it('labels y ciclo de estado', () => {
    expect(labelTipoObjetivo('objetivo')).toBe('Objetivo');
    expect(labelTipoObjetivo('aprender')).toBe('Quiero aprender');
    expect(labelEstadoObjetivo('en_curso')).toBe('En curso');
    expect(siguienteEstadoObjetivo('pendiente')).toBe('en_curso');
    expect(siguienteEstadoObjetivo('en_curso')).toBe('logrado');
    expect(siguienteEstadoObjetivo('logrado')).toBeNull();
  });

  it('particiona por tipo y separa logrados', () => {
    const items = [
      item({ id: 'o1', tipo: 'objetivo', estado: 'pendiente', createdAt: '2026-03-01T00:00:00Z' }),
      item({
        id: 'o2',
        tipo: 'objetivo',
        estado: 'logrado',
        logradoAt: '2026-02-10T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
      }),
      item({ id: 'a1', tipo: 'aprender', estado: 'en_curso', createdAt: '2026-02-01T00:00:00Z' }),
      item({
        id: 'a2',
        tipo: 'aprender',
        estado: 'logrado',
        logradoAt: '2026-04-01T00:00:00Z',
        createdAt: '2026-01-15T00:00:00Z',
      }),
      item({ id: 'o3', tipo: 'objetivo', estado: 'abandonado', createdAt: '2026-04-01T00:00:00Z' }),
      item({ id: 'o4', tipo: 'objetivo', estado: 'en_curso', createdAt: '2026-01-20T00:00:00Z' }),
    ];

    const p = particionarObjetivos(items);
    expect(p.objetivosActivos.map((x) => x.id)).toEqual(['o4', 'o1', 'o3']);
    expect(p.objetivosLogrados.map((x) => x.id)).toEqual(['o2']);
    expect(p.aprenderActivos.map((x) => x.id)).toEqual(['a1']);
    expect(p.aprenderLogrados.map((x) => x.id)).toEqual(['a2']);
  });

  it('logrados ordenados por logradoAt desc', () => {
    const items = [
      item({
        id: 'old',
        tipo: 'objetivo',
        estado: 'logrado',
        logradoAt: '2026-01-01T00:00:00Z',
      }),
      item({
        id: 'new',
        tipo: 'objetivo',
        estado: 'logrado',
        logradoAt: '2026-06-01T00:00:00Z',
      }),
    ];
    expect(particionarObjetivos(items).objetivosLogrados.map((x) => x.id)).toEqual(['new', 'old']);
  });
});
