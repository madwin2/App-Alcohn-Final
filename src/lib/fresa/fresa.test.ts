// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { flattenPathData } from './pathData';
import { parseSvgShapes } from './svgShapes';
import { analyzeBlackRegion, buildBlackRegion } from './analyze';
import { FRESA_FINA, cutRadiusAtDepth, depthForRadius, minGapWidthMm } from './config';
import { fixZones } from './fix';
import { groupZones } from './engine';
import { chequearSvg, corregirSvg } from './chequeoFresa';
import { regionArea } from './geometry';

/** SVG en mm (1 unidad = 1 mm). */
const svg = (body: string, w = 20, h = 10) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${body}</svg>`;

const rectD = (x: number, y: number, w: number, h: number) => `M${x} ${y}H${x + w}V${y + h}H${x}Z`;

function analyzeSvgText(text: string) {
  const parsed = parseSvgShapes(text);
  const black = buildBlackRegion(parsed.shapes, parsed.declaredMmPerUnit ?? 1);
  return { parsed, black, result: analyzeBlackRegion(black) };
}

describe('perfil de fresa', () => {
  it('usa 30° por lado: hueco mínimo ≈ 0,56 mm para llegar a 0,4 mm', () => {
    expect(cutRadiusAtDepth(FRESA_FINA, 0.4)).toBeCloseTo(0.05 + 0.4 * Math.tan(Math.PI / 6), 6);
    expect(minGapWidthMm(FRESA_FINA)).toBeCloseTo(0.5619, 3);
    expect(depthForRadius(FRESA_FINA, cutRadiusAtDepth(FRESA_FINA, 0.25))).toBeCloseTo(0.25, 6);
    expect(depthForRadius(FRESA_FINA, 0.01)).toBe(0);
  });
});

describe('pathData', () => {
  it('entiende la sintaxis compacta de Illustrator', () => {
    const [sub] = flattenPathData('M1,1l-.4-.04c-.5-.05-.91-.22-1.22-.51h2v.5z', 0.001);
    expect(sub.closed).toBe(true);
    expect(sub.points[0]).toEqual({ x: 1, y: 1 });
    expect(sub.points[1].x).toBeCloseTo(0.6, 9);
    expect(sub.points[1].y).toBeCloseTo(0.96, 9);
  });

  it('acepta flags de arco pegados', () => {
    const a = flattenPathData('M0 0a5 5 0 105 5', 0.001)[0].points;
    const b = flattenPathData('M0 0a5 5 0 1 0 5 5', 0.001)[0].points;
    expect(a.length).toBe(b.length);
    expect(a[a.length - 1]).toEqual({ x: 5, y: 5 });
  });

  it('aplana un círculo con el error pedido', () => {
    const [sub] = flattenPathData('M10 5A5 5 0 1 1 0 5A5 5 0 1 1 10 5Z', 0.002);
    for (const p of sub.points) expect(Math.abs(Math.hypot(p.x - 5, p.y - 5) - 5)).toBeLessThan(0.003);
  });

  it('refleja el control en S', () => {
    const [sub] = flattenPathData('M0 0C0 1 1 1 1 0S2 -1 2 0', 0.0005);
    // Por simetría, el punto medio de la segunda curva queda debajo del eje.
    const tail = sub.points.filter((p) => p.x > 1.4 && p.x < 1.6);
    expect(tail.every((p) => p.y < 0)).toBe(true);
  });
});

describe('svgShapes', () => {
  it('resuelve clases de <style>, grupos con transform y figuras ocultas', () => {
    const parsed = parseSvgShapes(
      svg(`<defs><style>.st0{fill:#231f20}.w{fill:#fff}</style></defs>
        <g transform="translate(2 1)"><path class="st0" d="${rectD(0, 0, 4, 4)}"/></g>
        <rect class="w" x="3" y="2" width="1" height="1"/>
        <circle cx="15" cy="5" r="2" style="display:none"/>
        <ellipse cx="15" cy="5" rx="2" ry="1" fill="none" stroke="black" stroke-width="0.2"/>`),
    );
    expect(parsed.shapes).toHaveLength(3);
    expect(parsed.shapes[0].fill).toBe('dark');
    expect(parsed.shapes[0].rings[0][0]).toEqual({ x: 2, y: 1 });
    expect(parsed.shapes[1].fill).toBe('light');
    expect(parsed.shapes[2].stroke).toBe('dark');
    expect(parsed.warnings.join(' ')).toContain('trazo');
    expect(parsed.declaredMmPerUnit).toBe(1);
  });

  it('el blanco pintado encima resta del negro', () => {
    const { black } = analyzeSvgText(
      svg(`<path d="${rectD(1, 1, 6, 6)}"/><rect x="3" y="3" width="2" height="2" fill="white"/>`),
    );
    expect(regionArea(black) / 1e6).toBeCloseTo(36 - 4, 3);
  });
});

describe('análisis', () => {
  it('un bloque negro solo no tiene problemas', () => {
    const { result } = analyzeSvgText(svg(`<path d="${rectD(2, 2, 10, 5)}"/>`));
    expect(result.zones).toHaveLength(0);
  });

  it('marca un paso angosto entre dos piezas y estima ancho y profundidad', () => {
    // Dos barras separadas por 0,30 mm: la fresa llega a ≈ 0,17 mm (< 0,2 → alta).
    const { result } = analyzeSvgText(svg(`<path d="${rectD(2, 2, 5, 5)}${rectD(7.3, 2, 5, 5)}"/>`));
    const pasos = result.zones.filter((z) => z.kind === 'paso_angosto');
    expect(pasos).toHaveLength(1);
    expect(pasos[0].severity).toBe('alta');
    expect(pasos[0].gapWidthMm).toBeGreaterThan(0.25);
    expect(pasos[0].gapWidthMm).toBeLessThan(0.36);
    expect(pasos[0].reachDepthMm).toBeLessThan(0.2);
  });

  it('un paso de 0,45 mm es gravedad media y uno de 0,70 mm está bien', () => {
    const media = analyzeSvgText(svg(`<path d="${rectD(2, 2, 5, 5)}${rectD(7.45, 2, 5, 5)}"/>`)).result;
    expect(media.zones.map((z) => [z.kind, z.severity])).toEqual([['paso_angosto', 'media']]);
    expect(media.zones[0].reachDepthMm).toBeGreaterThanOrEqual(0.25);
    const ok = analyzeSvgText(svg(`<path d="${rectD(2, 2, 5, 5)}${rectD(7.7, 2, 5, 5)}"/>`)).result;
    expect(ok.zones.filter((z) => z.kind === 'paso_angosto')).toHaveLength(0);
  });

  it('detecta un hueco cerrado chico (el ojo de una letra)', () => {
    const { result } = analyzeSvgText(svg(`<path d="${rectD(2, 2, 4, 4)}${rectD(3.8, 3.8, 0.4, 0.4)}" fill-rule="evenodd"/>`));
    expect(result.zones.map((z) => z.kind)).toEqual(['hueco_cerrado']);
    expect(result.zones[0].severity).toBe('alta');
  });

  it('una ranura dentro de la misma pieza es "rincón" y la gravedad depende del tamaño', () => {
    // U con ranura de 0,3 mm × 3 mm (pieza única).
    const u = `M2 2H8V7H5.15V4H4.85V7H2Z`;
    const { result } = analyzeSvgText(svg(`<path d="${u}"/>`));
    const rincones = result.zones.filter((z) => z.kind === 'rincon');
    expect(rincones).toHaveLength(1);
    expect(rincones[0].severity).toBe('media');
  });

  it('las esquinas normales no se informan', () => {
    // L: esquina interior de 90° del blanco.
    const { result } = analyzeSvgText(svg(`<path d="M2 2H4V6H8V8H2Z"/>`));
    expect(result.zones).toHaveLength(0);
  });

  it('agrupa zonas cercanas de la misma gravedad', () => {
    const { result } = analyzeSvgText(
      svg(`<path d="${rectD(2, 2, 3, 5)}${rectD(5.3, 2, 3, 5)}${rectD(8.6, 2, 3, 5)}"/>`),
    );
    expect(result.zones.length).toBe(2);
    // Están a 3 mm: grupos distintos con pad 0,5; un solo grupo con pad 4.
    expect(groupZones(result.zones).length).toBe(2);
    expect(groupZones(result.zones, 4).length).toBe(1);
  });
});

describe('corrección', () => {
  it('abre el paso angosto lo justo y el resultado ya no tiene problemas', () => {
    const { black, result } = analyzeSvgText(svg(`<path d="${rectD(2, 2, 5, 5)}${rectD(7.3, 2, 5, 5)}"/>`));
    const fixed = fixZones(black, result.zones);
    const after = analyzeBlackRegion(fixed.black);
    expect(after.zones.filter((z) => z.severity !== 'baja')).toHaveLength(0);
    // Sacar ≈ (0,56 − 0,30) × 5 mm de negro; no mucho más.
    const removed = (regionArea(black) - regionArea(fixed.black)) / 1e6;
    expect(removed).toBeGreaterThan(0.9);
    expect(removed).toBeLessThan(2.2);
  });
});

describe('chequearSvg / corregirSvg', () => {
  it('escala a la medida de fabricación: el mismo diseño más chico tiene problemas', async () => {
    const body = `<path d="${rectD(2, 2, 5, 5)}${rectD(7.6, 2, 5, 5)}"/>`; // hueco 0,6 mm a escala 1
    const grande = await chequearSvg(svg(body), { mode: 'fabricacion', longSideMm: 10.6 });
    expect(grande.status).toBe('ok');
    expect(grande.widthMm).toBeCloseTo(10.6, 3);
    const chico = await chequearSvg(svg(body), { mode: 'fabricacion', longSideMm: 7 });
    expect(chico.status).toBe('revisar');
    expect(chico.sizeSource).toBe('fabricacion');
  });

  it('modo pedido emula la medida que guarda Confirmar', async () => {
    const body = `<path d="${rectD(0, 0, 20, 10)}"/>`;
    const r = await chequearSvg(svg(body), { mode: 'pedido', requestedWidthMm: 40, requestedHeightMm: 20 });
    expect(r.widthMm).toBeCloseTo(40, 2);
    expect(r.heightMm).toBeCloseTo(20, 2);
  });

  it('corrige el SVG, deja intactas las figuras no tocadas y queda sin problemas', async () => {
    const untouched = `<path id="lejos" d="${rectD(15, 2, 3, 3)}"/>`;
    const text = svg(`<path d="${rectD(2, 2, 5, 5)}"/><path d="${rectD(7.3, 2, 5, 5)}"/>${untouched}`);
    const before = await chequearSvg(text, { mode: 'fabricacion', longSideMm: 16 });
    expect(before.status).toBe('revisar');
    const ids = before.check!.zones.filter((z) => z.severity !== 'baja').map((z) => z.id);
    const res = await corregirSvg(text, before, ids);
    expect(res.after.status).toBe('ok');
    expect(res.svg).toContain('id="lejos"');
    expect(res.svg).toContain('data-alcohn="corregido-fresa"');
    expect(res.svg).toContain('width="20mm"');
    expect(res.removedAreaMm2).toBeGreaterThan(0);
  });

  it('informa error con un SVG inválido o vacío', async () => {
    expect((await chequearSvg('no es svg', { mode: 'declarado' })).status).toBe('error');
    expect((await chequearSvg(svg(''), { mode: 'declarado' })).status).toBe('error');
  });
});
