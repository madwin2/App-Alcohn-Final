import { describe, expect, it } from 'vitest';
import { linkStatusFromApi, linkTokenFromUrl, parseEstadoPedidoText } from './link-revision.js';
import { matchEtiqueta, type MatchCandidate } from './match-names.js';
import { parseScheduleHours, scheduleSlot } from './check-links-schedule.js';

describe('linkTokenFromUrl', () => {
  it('saca el token de los dos formatos de link', () => {
    expect(linkTokenFromUrl('https://andreani.com/cuenta/completa-tu-envio/eyJ.abc.d-_e')).toBe('eyJ.abc.d-_e');
    expect(linkTokenFromUrl('https://pymes.andreani.com/completa-tu-envio/eyJxyz')).toBe('eyJxyz');
    expect(linkTokenFromUrl('https://andreani.com/otra-cosa')).toBeNull();
  });
});

describe('linkStatusFromApi', () => {
  it('link sin usar: pedidoId null', () => {
    expect(linkStatusFromApi({ pedidoId: null, estadoPedido: 'Link de envio pendiente' })).toEqual({
      kind: 'sin_usar',
    });
  });

  it('link completado: pedidoId', () => {
    expect(linkStatusFromApi({ pedidoId: 'e9b790ea-054e', estadoPedido: null })).toEqual({
      kind: 'usado',
      pedidoId: 'e9b790ea-054e',
    });
  });

  it('respuesta sin el campo: desconocido', () => {
    expect(linkStatusFromApi({ message: 'error' }).kind).toBe('desconocido');
    expect(linkStatusFromApi(null).kind).toBe('desconocido');
  });
});

describe('parseEstadoPedidoText', () => {
  const page = [
    'Ir al inicio',
    '¡Listo!',
    'Detalle de los envíos',
    '',
    'Eleonora Mendoza  - Ruta 52 9',
    '',
    'DNI: 28137274',
    'eleomza10@gmail.com',
    'Cel: 2616522518',
    '',
    '360003142100320',
    '',
    '¿Qué querés hacer ahora?',
  ].join('\n');

  it('lee nombre (línea antes de DNI) y seguimiento', () => {
    expect(parseEstadoPedidoText(page)).toEqual({
      destinatario: 'Eleonora Mendoza',
      tracking: '360003142100320',
      trackings: ['360003142100320'],
    });
  });

  it('prefiere el nombre del DOM', () => {
    expect(parseEstadoPedidoText(page, ' Eleonora  Mendoza ').destinatario).toBe('Eleonora Mendoza');
  });

  it('no confunde DNI ni celular con seguimiento', () => {
    const sinTracking = page.replace('360003142100320', '');
    expect(parseEstadoPedidoText(sinTracking).tracking).toBeNull();
  });

  it('dos seguimientos: no elige ninguno', () => {
    const r = parseEstadoPedidoText(`${page}\n360003142100999`);
    expect(r.tracking).toBeNull();
    expect(r.trackings).toHaveLength(2);
  });
});

describe('matchEtiqueta', () => {
  const eleo: MatchCandidate = {
    ordenId: 'eleo',
    customerName: 'Eleo Mendoza',
    shippingName: null,
    linkName: 'Eleonora Mendoza',
    linkTracking: '360003142100320',
  };
  const juan: MatchCandidate = { ordenId: 'juan', customerName: 'Juan Perez', shippingName: null };

  it('empareja por el seguimiento del link aunque el nombre no coincida', () => {
    expect(matchEtiqueta('360003142100320', 'Otra Persona', [juan, eleo])).toEqual({
      kind: 'hit',
      ordenId: 'eleo',
    });
  });

  it('usa el nombre del link si todavía no hay seguimiento', () => {
    const sinTracking = { ...eleo, linkTracking: null };
    expect(matchEtiqueta('360000000000001', 'Eleonora Mendoza', [juan, sinTracking])).toEqual({
      kind: 'hit',
      ordenId: 'eleo',
    });
  });

  it('no empareja por nombre un pedido cuyo link apunta a otro seguimiento', () => {
    expect(matchEtiqueta('360000000000001', 'Eleonora Mendoza', [juan, eleo])).toEqual({ kind: 'none' });
  });

  it('sin datos del link sigue emparejando por nombre como antes', () => {
    expect(matchEtiqueta('360000000000001', 'Juan Perez', [juan])).toEqual({ kind: 'hit', ordenId: 'juan' });
  });
});

describe('revisión programada', () => {
  it('horas: apagada por defecto, lista y off', () => {
    expect(parseScheduleHours(undefined)).toEqual([]);
    expect(parseScheduleHours('')).toEqual([]);
    expect(parseScheduleHours('18, 9,9 ,25')).toEqual([9, 18]);
    expect(parseScheduleHours('off')).toEqual([]);
  });

  it('usa hora Argentina (UTC-3)', () => {
    // 13:30 UTC = 10:30 en Argentina
    expect(scheduleSlot(new Date('2026-10-27T13:30:00Z'), [10, 14])).toBe('2026-10-27 10');
    expect(scheduleSlot(new Date('2026-10-27T10:30:00Z'), [10, 14])).toBeNull();
  });
});
