import { describe, expect, it } from 'vitest';
import {
  parseSellosEnOtraPlanchuela,
  parseSellosNoImportados,
} from '@/lib/supabase/services/programs.service';

describe('parseSellosNoImportados', () => {
  it('lee sellos_no_importados del sync_payload', () => {
    const items = parseSellosNoImportados({
      sellos_no_importados: [
        { sello_id: 'abc-123', motivo: 'formato .eps no soportado', diseno: 'M 2x1,5' },
        { selloId: 'def-456', motivo: 'error' },
      ],
    });
    expect(items).toEqual([
      { sello_id: 'abc-123', motivo: 'formato .eps no soportado', diseno: 'M 2x1,5' },
      { sello_id: 'def-456', motivo: 'error', diseno: undefined },
    ]);
  });

  it('devuelve vacío si no hay datos', () => {
    expect(parseSellosNoImportados(null)).toEqual([]);
    expect(parseSellosNoImportados({})).toEqual([]);
  });
});

describe('parseSellosEnOtraPlanchuela', () => {
  it('lee sellos_en_otra_planchuela del sync_payload', () => {
    const items = parseSellosEnOtraPlanchuela({
      sellos_en_otra_planchuela: [
        { sello_id: 'abc-123', diseno: 'Chaverle', planificada: 25, real: 38 },
        { selloId: 'def-456', planificada: '19', real: '38' },
      ],
    });
    expect(items).toEqual([
      { sello_id: 'abc-123', diseno: 'Chaverle', planificada: 25, real: 38 },
      { sello_id: 'def-456', diseno: undefined, planificada: 19, real: 38 },
    ]);
  });

  it('devuelve vacío si no hay datos', () => {
    expect(parseSellosEnOtraPlanchuela(null)).toEqual([]);
    expect(parseSellosEnOtraPlanchuela({})).toEqual([]);
  });
});
