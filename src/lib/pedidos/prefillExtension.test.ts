import { describe, expect, it } from 'vitest';
import { clienteInicialDesdePrefill, leerPrefillDeHash } from './prefillExtension';

/** Igual que lo arma la extensión (lib/pedido_app.js). */
const hashDe = (datos: object) =>
  '#d=' +
  Buffer.from(JSON.stringify(datos), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

describe('leerPrefillDeHash', () => {
  it('lee los datos que manda la extensión, con tildes y ñ', () => {
    const p = leerPrefillDeHash(
      hashDe({ telefono: '5492235551234', nombre: 'Martín', apellido: 'Peña', email: 'martin@mail.com' }),
    );
    expect(p).toEqual({ telefono: '5492235551234', nombre: 'Martín', apellido: 'Peña', email: 'martin@mail.com' });
  });

  it('deja solo dígitos en el teléfono y descarta un mail inválido', () => {
    const p = leerPrefillDeHash(hashDe({ telefono: '+54 9 223 555-1234', nombre: ' Ana ', email: 'no es mail' }));
    expect(p).toEqual({ telefono: '5492235551234', nombre: 'Ana', apellido: undefined, email: undefined });
  });

  it('sin teléfono, sin hash o con basura devuelve null', () => {
    expect(leerPrefillDeHash(hashDe({ nombre: 'Ana' }))).toBeNull();
    expect(leerPrefillDeHash('')).toBeNull();
    expect(leerPrefillDeHash('#d=%%%')).toBeNull();
    expect(leerPrefillDeHash('#d=bm8tanNvbg')).toBeNull();
  });
});

describe('clienteInicialDesdePrefill', () => {
  const prefill = { telefono: '5492235551234', nombre: 'Juancito 🌻', email: 'juan@chat.com' };

  it('cliente nuevo: usa lo del chat y deja el apellido para completar', () => {
    expect(clienteInicialDesdePrefill(prefill, null)).toEqual({
      firstName: 'Juancito 🌻',
      lastName: '',
      email: 'juan@chat.com',
      phoneE164: '5492235551234',
      channel: 'WHATSAPP',
    });
  });

  it('cliente que ya está en la app: mandan sus datos, el teléfono es el del chat', () => {
    const existente = { firstName: 'Juan', lastName: 'Pérez', email: '', phoneE164: '+5492235551234' };
    expect(clienteInicialDesdePrefill(prefill, existente)).toEqual({
      firstName: 'Juan',
      lastName: 'Pérez',
      email: 'juan@chat.com',
      phoneE164: '5492235551234',
      channel: 'WHATSAPP',
    });
  });
});
