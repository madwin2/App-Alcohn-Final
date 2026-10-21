import { describe, expect, it } from 'vitest';
import {
  CASOS_MINIMOS,
  calidadPorTipo,
  resultadoDe,
  segundosDeEdicion,
  tipoDeCaso,
  type ChequeoResumen,
  type EdicionFila,
} from './edicionesMetricas';

const chequeo = (porTipo: ChequeoResumen['porTipo'], lugares = 1): ChequeoResumen => ({
  lugares,
  alta: lugares,
  media: 0,
  porTipo,
  huecoMinMm: 0.2,
  anchoMm: 30,
  altoMm: 10,
});

describe('tipoDeCaso', () => {
  it('3 mm y Alimento van aparte, aunque tengan problemas', () => {
    expect(tipoDeCaso({ tipoSello: '3MM', chequeoOriginal: chequeo({ paso_angosto: 2 }) })).toBe('3mm');
    expect(tipoDeCaso({ tipoSello: 'CLASICO', alimento: true, chequeoOriginal: null })).toBe('alimento');
  });

  it('por el tipo de lugar donde se pierde el diseño', () => {
    expect(tipoDeCaso({ tipoSello: 'CLASICO', chequeoOriginal: chequeo({}, 0) })).toBe('sin_problemas');
    expect(tipoDeCaso({ tipoSello: 'CLASICO', chequeoOriginal: chequeo({ paso_angosto: 2 }) })).toBe('letras_pegadas');
    expect(tipoDeCaso({ tipoSello: 'CLASICO', chequeoOriginal: chequeo({ hueco_cerrado: 1 }) })).toBe('ojos');
    expect(tipoDeCaso({ tipoSello: 'CLASICO', chequeoOriginal: chequeo({ hueco_cerrado: 1, paso_angosto: 1 }, 2) })).toBe('mixto');
  });
});

describe('resultadoDe', () => {
  it('aceptada, rechazada, editada o sin propuesta', () => {
    expect(resultadoDe('auto', true)).toBe('aceptada');
    expect(resultadoDe('original', true)).toBe('rechazada');
    expect(resultadoDe('manual', true)).toBe('editada');
    expect(resultadoDe('manual', false)).toBe('editada');
    expect(resultadoDe('original', false)).toBe('sin_propuesta');
  });
});

describe('segundosDeEdicion', () => {
  it('suma el tiempo de los editores abiertos', () => {
    expect(segundosDeEdicion([{ kind: 'separar', axis: 'x', mm: 0.1 }])).toBeNull();
    expect(segundosDeEdicion([{ kind: 'manual', cambios: 3, segundos: 40 }, { kind: 'manual', cambios: 1, segundos: 5 }])).toBe(45);
  });
});

describe('calidadPorTipo', () => {
  const filas = (tipo: string, aceptadas: number, otras: number, resto: EdicionFila['resultado'] = 'rechazada'): EdicionFila[] => [
    ...Array.from({ length: aceptadas }, (_, i) => ({ sello_id: `${tipo}-a${i}`, created_at: '2026-10-01', resultado: 'aceptada' as const, tipo_caso: tipo })),
    ...Array.from({ length: otras }, (_, i) => ({ sello_id: `${tipo}-o${i}`, created_at: '2026-10-01', resultado: resto, tipo_caso: tipo })),
  ];

  it('con pocos casos no sube de nivel', () => {
    const [c] = calidadPorTipo(filas('letras_pegadas', 10, 0));
    expect(c.aceptacion).toBe(1);
    expect(c.nivel).toBe(1);
    expect(c.falta).toContain(`de ${CASOS_MINIMOS}`);
  });

  it('90 % aplica sola; 95 % autónoma', () => {
    expect(calidadPorTipo(filas('ojos', 92, 8))[0].nivel).toBe(3);
    expect(calidadPorTipo(filas('ojos', 96, 4, 'editada'))[0].nivel).toBe(4);
    expect(calidadPorTipo(filas('ojos', 85, 15))[0].nivel).toBe(1);
  });

  it('sin propuesta no cuenta para la aceptación', () => {
    const [c] = calidadPorTipo([...filas('ojos', 96, 4), ...filas('ojos', 0, 50, 'sin_propuesta')]);
    expect(c.propuestas).toBe(100);
    expect(c.total).toBe(150);
  });

  it('un sello rehecho por el vector después de guardarlo frena la subida', () => {
    const rows = filas('ojos', 100, 0);
    const rehechos = new Map([['ojos-a3', ['2026-10-05']], ['ojos-a4', ['2026-09-01']]]);
    const [c] = calidadPorTipo(rows, rehechos);
    expect(c.rehechos).toBe(1);
    expect(c.nivel).toBe(1);
  });

  it('los de 3 mm nunca suben', () => {
    const [c] = calidadPorTipo(filas('3mm', 200, 0));
    expect(c.nivel).toBe(1);
  });
});
