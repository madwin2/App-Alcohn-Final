import { describe, expect, it } from 'vitest';
import {
  conteoVotos,
  contarIdeasNuevas,
  esIdeaNuevaParaMi,
  filtrarIdeasCorcho,
  fraseEstadoIdeaNotificacion,
  labelEstadoIdea,
  ordenarIdeasCorcho,
  puedeVotarIdea,
  puntajeIdea,
  siguienteVoto,
  type IdeaCorchoBase,
} from './corcho';

function idea(
  partial: Partial<IdeaCorchoBase> & Pick<IdeaCorchoBase, 'id' | 'autorUserId'>,
): IdeaCorchoBase {
  return {
    titulo: partial.titulo ?? 'Idea',
    descripcion: partial.descripcion ?? null,
    estado: partial.estado ?? 'propuesta',
    comentarioEstado: partial.comentarioEstado ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00Z',
    votos: partial.votos ?? [],
    vistaPorMi: partial.vistaPorMi ?? false,
    ...partial,
  };
}

describe('corcho', () => {
  it('labels y frase de notificación de estado', () => {
    expect(labelEstadoIdea('propuesta')).toBe('Propuesta');
    expect(labelEstadoIdea('aprobada')).toBe('Aprobada');
    expect(fraseEstadoIdeaNotificacion('aprobada')).toBe('aprobada');
    expect(fraseEstadoIdeaNotificacion('descartada')).toBe('descartada');
  });

  it('puntaje y conteo de votos', () => {
    const votos = [
      { userId: 'a', valor: 1 as const },
      { userId: 'b', valor: 1 as const },
      { userId: 'c', valor: -1 as const },
    ];
    expect(puntajeIdea(votos)).toBe(1);
    expect(conteoVotos(votos)).toEqual({ up: 2, down: 1 });
  });

  it('Nueva: no propia y sin vista; propias nunca', () => {
    const mia = idea({ id: '1', autorUserId: 'yo', vistaPorMi: false });
    const ajena = idea({ id: '2', autorUserId: 'otro', vistaPorMi: false });
    const vista = idea({ id: '3', autorUserId: 'otro', vistaPorMi: true });
    expect(esIdeaNuevaParaMi(mia, 'yo')).toBe(false);
    expect(esIdeaNuevaParaMi(ajena, 'yo')).toBe(true);
    expect(esIdeaNuevaParaMi(vista, 'yo')).toBe(false);
  });

  it('no se vota propia ni descartada', () => {
    expect(
      puedeVotarIdea({ autorUserId: 'yo', estado: 'propuesta' }, 'yo'),
    ).toBe(false);
    expect(
      puedeVotarIdea({ autorUserId: 'otro', estado: 'descartada' }, 'yo'),
    ).toBe(false);
    expect(
      puedeVotarIdea({ autorUserId: 'otro', estado: 'aprobada' }, 'yo'),
    ).toBe(true);
  });

  it('toggle de voto: same saca, distinto cambia', () => {
    expect(siguienteVoto(null, 1)).toBe(1);
    expect(siguienteVoto(1, 1)).toBeNull();
    expect(siguienteVoto(1, -1)).toBe(-1);
    expect(siguienteVoto(-1, -1)).toBeNull();
    expect(siguienteVoto(-1, 1)).toBe(1);
  });

  it('filtra por autor, estado y solo nuevas', () => {
    const items = [
      idea({ id: '1', autorUserId: 'a', estado: 'propuesta', vistaPorMi: false }),
      idea({ id: '2', autorUserId: 'b', estado: 'aprobada', vistaPorMi: false }),
      idea({ id: '3', autorUserId: 'a', estado: 'descartada', vistaPorMi: true }),
    ];
    expect(
      filtrarIdeasCorcho(items, { viewerUserId: 'yo', autorUserId: 'a' }).map((x) => x.id),
    ).toEqual(['1', '3']);
    expect(
      filtrarIdeasCorcho(items, { viewerUserId: 'yo', estado: 'aprobada' }).map((x) => x.id),
    ).toEqual(['2']);
    expect(
      filtrarIdeasCorcho(items, { viewerUserId: 'yo', soloNuevas: true }).map((x) => x.id),
    ).toEqual(['1', '2']);
  });

  it('ordena nuevas primero y después por puntaje (S12)', () => {
    const items = [
      idea({
        id: 'vieja-alta',
        autorUserId: 'a',
        vistaPorMi: true,
        votos: [{ userId: 'x', valor: 1 }, { userId: 'y', valor: 1 }],
        createdAt: '2026-01-01T00:00:00Z',
      }),
      idea({
        id: 'nueva-baja',
        autorUserId: 'b',
        vistaPorMi: false,
        votos: [],
        createdAt: '2026-02-01T00:00:00Z',
      }),
      idea({
        id: 'nueva-alta',
        autorUserId: 'c',
        vistaPorMi: false,
        votos: [{ userId: 'x', valor: 1 }],
        createdAt: '2026-01-15T00:00:00Z',
      }),
    ];
    expect(ordenarIdeasCorcho(items, 'yo').map((x) => x.id)).toEqual([
      'nueva-alta',
      'nueva-baja',
      'vieja-alta',
    ]);
    expect(ordenarIdeasCorcho(items, 'yo', 'recientes').map((x) => x.id)).toEqual([
      'nueva-baja',
      'nueva-alta',
      'vieja-alta',
    ]);
  });

  it('cuenta ideas nuevas', () => {
    const items = [
      idea({ id: '1', autorUserId: 'yo', vistaPorMi: false }),
      idea({ id: '2', autorUserId: 'otro', vistaPorMi: false }),
      idea({ id: '3', autorUserId: 'otro', vistaPorMi: true }),
    ];
    expect(contarIdeasNuevas(items, 'yo')).toBe(1);
  });
});
