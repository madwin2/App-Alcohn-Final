import { describe, expect, it } from 'vitest';
import { filtrarYOrdenarNotas, type NotaOrdenable } from './notasPersonales';

function nota(partial: Partial<NotaOrdenable> & Pick<NotaOrdenable, 'id'>): NotaOrdenable {
  return {
    titulo: '',
    contenido: '',
    fijada: false,
    updatedAt: '2026-01-01T12:00:00Z',
    ...partial,
  };
}

describe('filtrarYOrdenarNotas', () => {
  it('ordena fijadas primero y luego por updatedAt desc', () => {
    const input: NotaOrdenable[] = [
      nota({ id: 'a', titulo: 'Vieja', updatedAt: '2026-01-01T10:00:00Z' }),
      nota({ id: 'b', titulo: 'Fijada', fijada: true, updatedAt: '2025-12-01T10:00:00Z' }),
      nota({ id: 'c', titulo: 'Reciente', updatedAt: '2026-02-01T10:00:00Z' }),
    ];
    const out = filtrarYOrdenarNotas(input, '');
    expect(out.map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });

  it('filtra por título o contenido', () => {
    const input: NotaOrdenable[] = [
      nota({ id: '1', titulo: 'Lista CNC', contenido: 'pasos' }),
      nota({ id: '2', titulo: 'Otra', contenido: 'recordar aceite' }),
    ];
    const out = filtrarYOrdenarNotas(input, 'aceite');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('2');
  });
});
