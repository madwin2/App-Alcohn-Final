import { describe, expect, it } from 'vitest';
import { nombreAdminEquipo } from './admin';

const m = (nombre: string, esAdmin: boolean, activo = true) => ({ nombre, esAdmin, activo });

describe('nombreAdminEquipo', () => {
  it('toma el nombre de pila del admin activo', () => {
    expect(nombreAdminEquipo([m('Julián Moreno', true), m('Fede', false)])).toBe('Julián');
  });

  it('ignora admins inactivos', () => {
    expect(nombreAdminEquipo([m('Julián', true, false), m('Fede', false)])).toBe('el admin');
  });

  it('junta varios admins', () => {
    expect(nombreAdminEquipo([m('Julián M', true), m('Cachi', true)])).toBe('Julián y Cachi');
  });

  it('fallback si no hay admin o el nombre es genérico', () => {
    expect(nombreAdminEquipo([])).toBe('el admin');
    expect(nombreAdminEquipo([m('Usuario', true)])).toBe('el admin');
  });
});
