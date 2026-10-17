import { describe, expect, it } from 'vitest';
import { buildFixture, toAspire, toWorld } from './fixture';
import { defaultColumns } from './preparation';

// Medidas del SVG «Base Fijacion sellos STK v2», relativas al borde izquierdo de la base (x=65,58).
const SVG_LEFT = 65.58;
const svgBars = [[103.48, 128.48], [147.48, 159.68], [244.06, 263.11], [282.11, 320.21]];
const svgChannels = [[84.48, 103.48], [128.48, 147.48], [159.68, 178.68], [225.06, 244.06], [263.11, 282.11], [320.21, 339.21]];

describe('fijación', () => {
  it('C reproduce el SVG real: planchuelas y seis canales de trabas', () => {
    const f = buildFixture('C', defaultColumns('C'));
    expect(f.hasDrawing).toBe(true);
    expect(f.widthMm).toBe(296);
    f.bars.forEach((b, i) => {
      expect((b.x0 + b.x1) / 2).toBeCloseTo((svgBars[i][0] + svgBars[i][1]) / 2 - SVG_LEFT, 0);
    });
    expect(f.channels).toHaveLength(6);
    f.channels.forEach((c, i) => {
      expect(c.x0).toBeCloseTo(svgChannels[i][0] - SVG_LEFT, 0);
      expect(c.x1).toBeCloseTo(svgChannels[i][1] - SVG_LEFT, 0);
    });
    expect(f.clamps).toHaveLength(12);
  });

  it('G y XL generan su base alrededor de las planchuelas', () => {
    for (const m of ['G', 'XL'] as const) {
      const f = buildFixture(m, defaultColumns(m));
      expect(f.hasDrawing).toBe(false);
      expect(f.channels[0].x0).toBeGreaterThan(0);
      expect(f.channels[f.channels.length - 1].x1).toBeLessThan(f.widthMm);
      expect(f.bars.every((b) => b.x0 > 0 && b.x1 < f.widthMm && b.y1 < f.heightMm)).toBe(true);
    }
  });

  it('convierte ida y vuelta entre Aspire y el mundo', () => {
    const f = buildFixture('C', defaultColumns('C'));
    const w = toWorld(f, 50.176, -8.958);
    expect(w.y).toBeCloseTo(8.958, 6);
    const a = toAspire(f, w.x, w.y);
    expect(a.x).toBeCloseTo(50.176, 6); expect(a.y).toBeCloseTo(-8.958, 6);
  });
});
