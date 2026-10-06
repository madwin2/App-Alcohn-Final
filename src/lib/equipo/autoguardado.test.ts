import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  colaAutoguardadoVacia,
  encolarAutoguardado,
  flushAutoguardado,
  notaVacia,
  respuestaAutoguardadoVigente,
  type PatchAutoguardado,
} from './autoguardado';

const patch = (titulo: string): PatchAutoguardado => ({
  titulo,
  contenido: '',
  fijada: false,
});

describe('autoguardado', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('encola y flushea el último patch', () => {
    let estado = colaAutoguardadoVacia();
    estado = encolarAutoguardado(estado, 'n1', patch('Hola'));
    estado = encolarAutoguardado(estado, 'n1', patch('Hola mundo'));
    expect(estado.pendiente?.patch.titulo).toBe('Hola mundo');
    expect(estado.versiones.n1).toBe(2);

    const { estado: next, enviado } = flushAutoguardado(estado);
    expect(enviado?.version).toBe(2);
    expect(enviado?.patch.titulo).toBe('Hola mundo');
    expect(next.pendiente).toBeNull();
  });

  it('flush de otra nota no saca el pendiente', () => {
    let estado = encolarAutoguardado(colaAutoguardadoVacia(), 'n1', patch('a'));
    const { estado: next, enviado } = flushAutoguardado(estado, 'n2');
    expect(enviado).toBeNull();
    expect(next.pendiente?.id).toBe('n1');
  });

  it('ignora respuesta de versión anterior', () => {
    let estado = colaAutoguardadoVacia();
    estado = encolarAutoguardado(estado, 'n1', patch('v1'));
    const v1 = estado.versiones.n1;
    estado = encolarAutoguardado(estado, 'n1', patch('v2'));
    expect(respuestaAutoguardadoVigente(estado, 'n1', v1)).toBe(false);
    expect(respuestaAutoguardadoVigente(estado, 'n1', estado.versiones.n1)).toBe(true);
  });

  it('notaVacia', () => {
    expect(notaVacia('', '')).toBe(true);
    expect(notaVacia('  ', '\n')).toBe(true);
    expect(notaVacia('x', '')).toBe(false);
  });
});
