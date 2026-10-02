import { describe, expect, it } from 'vitest';
import {
  clasesTipoFeedback,
  contarFeedbackNoLeido,
  emojiTipoFeedback,
  filtrarFeedbackPorTipo,
  fraseTipoFeedbackNotificacion,
  labelTipoFeedback,
  ordenarFeedbackCronologico,
  type FeedbackFiltrable,
} from './feedback';

function fb(
  partial: Partial<FeedbackFiltrable> & Pick<FeedbackFiltrable, 'id' | 'tipo'>,
): FeedbackFiltrable {
  return {
    titulo: partial.titulo ?? null,
    texto: partial.texto ?? 'texto',
    leidoAt: partial.leidoAt ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('feedback', () => {
  it('labels y frase de notificación (tipo, no contenido)', () => {
    expect(labelTipoFeedback('felicitacion')).toBe('Felicitación');
    expect(fraseTipoFeedbackNotificacion('felicitacion')).toBe('una felicitación');
    expect(fraseTipoFeedbackNotificacion('mejora')).toBe('una mejora');
    expect(fraseTipoFeedbackNotificacion('correccion')).toBe('una corrección');
    expect(emojiTipoFeedback('correccion')).toBe('🔧');
    expect(clasesTipoFeedback('felicitacion')).toContain('emerald');
  });

  it('cuenta no leídos, filtra y ordena cronológico', () => {
    const items = [
      fb({ id: '1', tipo: 'felicitacion', createdAt: '2026-01-01T00:00:00Z', leidoAt: '2026-01-02' }),
      fb({ id: '2', tipo: 'mejora', createdAt: '2026-03-01T00:00:00Z' }),
      fb({ id: '3', tipo: 'correccion', createdAt: '2026-02-01T00:00:00Z' }),
    ];
    expect(contarFeedbackNoLeido(items)).toBe(2);
    expect(filtrarFeedbackPorTipo(items, 'mejora').map((x) => x.id)).toEqual(['2']);
    expect(filtrarFeedbackPorTipo(items, 'todos')).toHaveLength(3);
    expect(ordenarFeedbackCronologico(items).map((x) => x.id)).toEqual(['2', '3', '1']);
  });
});
