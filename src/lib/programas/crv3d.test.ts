import { describe, expect, it } from 'vitest';
import * as CFB from 'cfb';
import {
  __crv3dTestUtils,
  Crv3dParseError,
  parseCrv3d,
} from './crv3d';

const IDS = {
  a: '9b0e3235-b9a5-431c-9889-8ab5a3a4c684',
  b: '7e0788cc-bce6-499b-b8ae-1e81c0d0dd6b',
  c: 'a9bfb818-7d8a-44df-a2eb-b2aa04a9b6b9',
  d: 'a8851155-2e93-48eb-bbbf-d3b56b20af9f',
  e: '73058203-66e9-41a1-88a5-a804c6760566',
  f: '93ec5863-cc78-4d1f-9ac5-12fe8f89d384',
} as const;

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** GIF mínimo de 1×1 (header válido). */
function tinyGif(): Uint8Array {
  return new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00,
    0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
    0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
  ]);
}

/**
 * OLE2 sintético con capas estilo Aspire: 6 sellos (hueco en 005),
 * capa Corte, un parámetro string ALCOHN y preview GIF.
 */
function buildFixtureCrv3d(): ArrayBuffer {
  const { writeLayerRecord, writeStringParam, writeWideString } = __crv3dTestUtils;

  const layersBlob = concat(
    writeLayerRecord(`001_${IDS.a}.svg`, 12),
    writeLayerRecord(`002_${IDS.b}.svg`, 8),
    // Capa interna pegada al nombre (precaución 1.3)
    writeLayerRecord(`003_${IDS.c}.svgCapa 1`, 5),
    writeLayerRecord(`004_${IDS.d}.svg`, 4),
    // 005 ausente a propósito
    writeLayerRecord(`006_${IDS.e}.svg`, 3),
    writeLayerRecord(`007_${IDS.f}.svg`, 2),
    // Duplicado del mismo UUID (precaución 1.3)
    writeLayerRecord(`006_${IDS.e}.svg`, 1),
    writeLayerRecord('Corte', 6),
    writeLayerRecord('Importar - Rrrr.eps', 0),
  );

  const docBlob = concat(
    writeStringParam('PlateOrCylinder', 'Plate'),
    writeStringParam('ALCOHN_PROGRAMA_V1', '{"version":1,"sellos_presentes":["x"]}'),
  );

  const versionBlob = concat(writeWideString('Aspire'), writeWideString('10.514'));
  const preview = tinyGif();

  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, 'VersionData/Version', versionBlob);
  CFB.utils.cfb_add(cfb, 'VectorData/DocumentData', docBlob);
  CFB.utils.cfb_add(cfb, 'VectorData/2dDataV2', layersBlob);
  CFB.utils.cfb_add(cfb, 'PreviewData/Preview2D_GIF', preview);

  const written = CFB.write(cfb, { type: 'array', fileType: 'cfb' }) as number[];
  return new Uint8Array(written).buffer;
}

describe('parseCrv3d', () => {
  it('detecta los 6 sellos del fixture y ninguno más (dedupe)', () => {
    const info = parseCrv3d(buildFixtureCrv3d());
    expect(info.selloIds).toEqual([IDS.a, IDS.b, IDS.c, IDS.d, IDS.e, IDS.f]);
    expect(info.piezasEnCorte).toBe(6);
  });

  it('encuentra el hueco de numeración (005)', () => {
    const info = parseCrv3d(buildFixtureCrv3d());
    const ordenes = info.layers
      .filter((l) => l.selloId && l.orden != null)
      .map((l) => l.orden as number);
    const unique = [...new Set(ordenes)].sort((a, b) => a - b);
    const esperado = new Set(Array.from({ length: Math.max(...unique) }, (_, i) => i + 1));
    for (const n of unique) esperado.delete(n);
    expect([...esperado]).toEqual([5]);
  });

  it('extrae el UUID aunque el nombre tenga capa interna pegada', () => {
    const info = parseCrv3d(buildFixtureCrv3d());
    const layer = info.layers.find((l) => l.name.includes('svgCapa'));
    expect(layer?.selloId).toBe(IDS.c);
    expect(layer?.orden).toBe(3);
  });

  it('lee un parámetro string escrito por el gadget', () => {
    const info = parseCrv3d(buildFixtureCrv3d());
    expect(info.version).toBe('Aspire 10.514');
    expect(info.parameters.ALCOHN_PROGRAMA_V1).toContain('"version":1');
    expect(info.parameters.PlateOrCylinder).toBe('Plate');
    expect(info.previewGif?.byteLength).toBeGreaterThan(0);
  });

  it('no explota con un archivo que no es OLE2', () => {
    const junk = new TextEncoder().encode('esto no es un crv3d').buffer;
    expect(() => parseCrv3d(junk)).toThrow(Crv3dParseError);
    expect(() => parseCrv3d(junk)).toThrow(/OLE2/i);
  });
});
