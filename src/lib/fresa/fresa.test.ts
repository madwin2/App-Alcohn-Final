// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { flattenPathData } from './pathData';
import { parseSvgShapes } from './svgShapes';
import { analyzeBlackRegion, buildBlackRegion } from './analyze';
import { FRESA_ALIMENTO, FRESA_FINA, cutRadiusAtDepth, depthForRadius, minGapWidthMm } from './config';
import { planFix } from './fix';
import { groupZones } from './engine';
import { chequearSvg, corregirSvg } from './chequeoFresa';
import { bounds, components, regionArea } from './geometry';
import { buildLayout } from './layout';

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
  it('usa 30° por lado: hueco mínimo ≈ 0,45 mm para bajar 0,3 mm (alimento: ≈ 1,25 mm para 1 mm)', () => {
    expect(cutRadiusAtDepth(FRESA_FINA, 0.4)).toBeCloseTo(0.05 + 0.4 * Math.tan(Math.PI / 6), 6);
    expect(minGapWidthMm(FRESA_FINA)).toBeCloseTo(0.4464, 3);
    expect(minGapWidthMm(FRESA_ALIMENTO)).toBeCloseTo(1.2547, 3);
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

  it('un paso de 0,40 mm no separa y uno de 0,50 mm está bien (la fresa baja más de 0,3 mm)', () => {
    const justo = analyzeSvgText(svg(`<path d="${rectD(2, 2, 5, 5)}${rectD(7.4, 2, 5, 5)}"/>`)).result;
    expect(justo.zones.map((z) => [z.kind, z.severity])).toEqual([['paso_angosto', 'alta']]);
    expect(justo.zones[0].reachDepthMm).toBeGreaterThanOrEqual(0.2);
    const ok = analyzeSvgText(svg(`<path d="${rectD(2, 2, 5, 5)}${rectD(7.5, 2, 5, 5)}"/>`)).result;
    expect(ok.zones.filter((z) => z.kind === 'paso_angosto')).toHaveLength(0);
  });

  it('en alimento el mismo paso de 0,50 mm no separa (mínimo 1 mm)', () => {
    const { black } = analyzeSvgText(svg(`<path d="${rectD(2, 2, 5, 5)}${rectD(7.5, 2, 5, 5)}"/>`));
    const r = analyzeBlackRegion(black, FRESA_ALIMENTO);
    expect(r.zones.map((z) => [z.kind, z.severity])).toEqual([['paso_angosto', 'alta']]);
  });

  it('en un canal que se angosta, marca solo el puente y no todo el canal', () => {
    // Dos piezas separadas por un canal de 0,8 mm con un tramo de 0,3 mm de 1 mm de largo.
    const a = `M2 2H7V4H6.85V5H7V9H2Z`;
    const b = `M7.8 2H12V9H7.8V5H7.15V4H7.8Z`;
    const { result } = analyzeSvgText(svg(`<path d="${a}${b}"/>`, 14, 11));
    const pasos = result.zones.filter((z) => z.kind === 'paso_angosto');
    expect(pasos).toHaveLength(1);
    expect(pasos[0].bounds.minY).toBeGreaterThan(3.5);
    expect(pasos[0].bounds.maxY).toBeLessThan(5.5);
  });

  it('arma el mapa de profundidad de lo que queda menos hondo', () => {
    const { black } = analyzeSvgText(svg(`<path d="${rectD(2, 2, 5, 5)}${rectD(7.3, 2, 5, 5)}"/>`));
    const r = analyzeBlackRegion(black, FRESA_FINA, undefined, true);
    expect(r.depthBands?.length).toBeGreaterThan(0);
    // Canal de 0,30 mm: la fresa baja ≈ 0,17 mm → cae en la franja 0,10–0,20.
    const band = r.depthBands!.find((b) => b.fromMm <= 0.17 && b.toMm >= 0.17);
    expect(band?.rings.length).toBeGreaterThan(0);
  });

  it('detecta un hueco cerrado chico (el ojo de una letra)', () => {
    const { result } = analyzeSvgText(svg(`<path d="${rectD(2, 2, 4, 4)}${rectD(3.8, 3.8, 0.4, 0.4)}" fill-rule="evenodd"/>`));
    expect(result.zones.map((z) => z.kind)).toEqual(['hueco_cerrado']);
    expect(result.zones[0].severity).toBe('alta');
  });

  it('una ranura dentro de la misma pieza que la fresa marca está bien; si casi no entra, se pierde', () => {
    // U con ranura de 0,3 mm × 3 mm (pieza única): la fresa sube y la marca.
    const u = `M2 2H8V7H5.15V4H4.85V7H2Z`;
    const { result } = analyzeSvgText(svg(`<path d="${u}"/>`));
    const rincones = result.zones.filter((z) => z.kind === 'rincon');
    expect(rincones).toHaveLength(1);
    expect(rincones[0].severity).toBe('baja');
    // Ranura de 0,12 mm: la punta casi no entra → el detalle se pierde.
    const fina = analyzeSvgText(svg(`<path d="M2 2H8V7H5.06V4H4.94V7H2Z"/>`)).result;
    expect(fina.zones.filter((z) => z.kind === 'rincon').map((z) => z.severity)).toEqual(['media']);
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

const serious = (zones: { severity: string }[]) => zones.filter((z) => z.severity !== 'baja');

describe('ángulos', () => {
  it('un ángulo que se cierra en punta (interior de una V) está bien y no se corrige', () => {
    // V gruesa: el blanco de adentro se cierra en punta.
    const { result } = analyzeSvgText(svg(`<path d="M2 2H4L7 7.5L10 2H12L8 9H6Z"/>`, 14, 10));
    expect(serious(result.zones)).toHaveLength(0);
    expect(result.zones.every((z) => z.kind === 'angulo' && z.severity === 'baja')).toBe(true);
  });
});

describe('armado del diseño', () => {
  it('reconoce renglones, alineación a la izquierda y texto recto', () => {
    const { black } = analyzeSvgText(
      svg(
        `<path d="${rectD(1, 1, 2, 3)}${rectD(3.5, 1, 2, 3)}${rectD(6, 1, 2, 3)}"/>` +
          `<path d="${rectD(1, 5, 2, 3)}${rectD(3.5, 5, 2, 3)}"/>`,
        20,
        10,
      ),
    );
    const layout = buildLayout(black);
    expect(layout.lines).toHaveLength(2);
    expect(layout.lines.every((l) => l.straight && l.align === 'left')).toBe(true);
  });

  it('un texto en arco no es un renglón recto', () => {
    const arc = [0, 1, 2, 3, 4]
      .map((k) => rectD(1 + k * 2.5, 1 + Math.abs(k - 2) * 0.8, 2, 3))
      .join('');
    const layout = buildLayout(analyzeSvgText(svg(`<path d="${arc}"/>`, 20, 10)).black);
    expect(layout.lines.some((l) => l.glyphs.length >= 3 && l.straight)).toBe(false);
  });
});

describe('corrección', () => {
  it('separa dos letras muy juntas moviéndolas enteras, sin recortar negro', () => {
    const { black, result } = analyzeSvgText(svg(`<path d="${rectD(2, 2, 5, 5)}${rectD(7.3, 2, 5, 5)}"/>`));
    const fixed = planFix(black, result.zones);
    expect(serious(analyzeBlackRegion(fixed.black).zones)).toHaveLength(0);
    expect(fixed.removedAreaMm2).toBe(0);
    expect(fixed.operations.map((o) => o.kind)).toEqual(['separar']);
    // Renglón único: se reparte a los dos lados (queda centrado).
    expect(fixed.moves).toHaveLength(2);
    expect(Math.sign(fixed.moves[0].dx)).not.toBe(Math.sign(fixed.moves[1].dx));
  });

  it('con renglones alineados a la izquierda, corre solo lo que está a la derecha del hueco', () => {
    const { black, result } = analyzeSvgText(
      svg(
        `<path d="${rectD(1, 1, 3, 3)}${rectD(4.8, 1, 3, 3)}${rectD(8.6, 1, 3, 3)}"/>` +
          `<path d="${rectD(1, 5, 3, 3)}${rectD(4.3, 5, 3, 3)}${rectD(8, 5, 3, 3)}"/>`,
        20,
        10,
      ),
    );
    const fixed = planFix(black, result.zones);
    expect(serious(analyzeBlackRegion(fixed.black).zones)).toHaveLength(0);
    expect(fixed.moves.length).toBe(2);
    expect(fixed.moves.every((m) => m.dx > 0 && m.dy === 0)).toBe(true);
    // El borde izquierdo de los dos renglones no se movió.
    const b = bounds(fixed.black)!;
    expect(b.minX).toBe(1000);
  });

  it('si casi todos los pares de un renglón están justos, abre el espaciado parejo', () => {
    // 5 letras de 2 mm con huecos 0,3 / 0,3 / 0,8 / 0,3 mm.
    const xs = [1, 3.3, 5.6, 8.4, 10.7];
    const { black, result } = analyzeSvgText(svg(`<path d="${xs.map((x) => rectD(x, 2, 2, 3)).join('')}"/>`, 20, 10));
    const fixed = planFix(black, result.zones);
    expect(fixed.operations[0]?.kind).toBe('espaciar');
    expect(serious(analyzeBlackRegion(fixed.black).zones)).toHaveLength(0);
    // Todos los corrimientos son múltiplos del mismo paso: el ritmo se mantiene.
    const dxs = fixed.moves.map((m) => m.dx).sort((a, b) => a - b);
    const step = Math.min(...dxs.filter((d) => d > 0));
    expect(dxs.every((d) => Math.abs(d / step - Math.round(d / step)) < 0.02)).toBe(true);
  });

  it('nunca encima piezas para "resolver" un hueco', () => {
    const { black, result } = analyzeSvgText(svg(`<path d="${rectD(2, 2, 5, 5)}${rectD(7.3, 2, 5, 5)}"/>`));
    const fixed = planFix(black, result.zones);
    expect(components(fixed.black)).toHaveLength(2);
  });

  it('agranda en paralelo un ojo chico si los trazos quedan de al menos 0,4 mm', () => {
    // Bloque de 4 mm con ojo de 0,4 mm: sobra grosor alrededor.
    const { black, result } = analyzeSvgText(svg(`<path d="${rectD(2, 2, 4, 4)}${rectD(3.8, 3.8, 0.4, 0.4)}" fill-rule="evenodd"/>`));
    const fixed = planFix(black, result.zones);
    expect(fixed.operations.map((o) => o.kind)).toEqual(['agrandar_ojo']);
    expect(serious(analyzeBlackRegion(fixed.black).zones)).toHaveLength(0);
  });

  it('no afina trazos por debajo de 0,4 mm: ese ojo queda para editar a mano', () => {
    // Anillo de trazo 0,35 mm con ojo de 0,4 mm.
    const { black, result } = analyzeSvgText(
      svg(`<path d="${rectD(2, 2, 1.1, 1.1)}${rectD(2.35, 2.35, 0.4, 0.4)}" fill-rule="evenodd"/>`),
    );
    const fixed = planFix(black, result.zones);
    expect(fixed.operations).toHaveLength(0);
    expect(fixed.black).toEqual(black);
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

  it('mueve letras dentro de un path compuesto sin perder las curvas', async () => {
    // Dos "O" con curvas en un solo path, muy juntas; una figura lejos que no se toca.
    const o = (cx: number) =>
      `M${cx - 2} 5C${cx - 2} 3.3 ${cx - 1.1} 2 ${cx} 2C${cx + 1.1} 2 ${cx + 2} 3.3 ${cx + 2} 5` +
      `C${cx + 2} 6.7 ${cx + 1.1} 8 ${cx} 8C${cx - 1.1} 8 ${cx - 2} 6.7 ${cx - 2} 5Z`;
    const untouched = `<rect id="lejos" x="1" y="9.2" width="0.6" height="0.6"/>`;
    const text = svg(`<path d="${o(4)}${o(8.3)}"/>${untouched}`);
    const before = await chequearSvg(text, { mode: 'declarado' });
    expect(before.status).toBe('revisar');
    const ids = before.check!.zones.filter((z) => z.severity !== 'baja').map((z) => z.id);
    const res = await corregirSvg(text, before, ids);
    expect(res.after.status).toBe('ok');
    expect(res.operations.map((op) => op.kind)).toEqual(['separar']);
    expect(res.removedAreaMm2).toBe(0);
    const d = new DOMParser().parseFromString(res.svg, 'image/svg+xml').querySelector('path')!.getAttribute('d')!;
    expect(d.match(/C/g)).toHaveLength(8);
    expect(res.svg).toContain('id="lejos" x="1" y="9.2"');
    expect(res.svg).not.toContain('data-alcohn="corregido-fresa"');
    expect(res.svg).toContain('width="20mm"');
  });

  it('agranda un ojo y deja intactas las figuras no tocadas', async () => {
    const untouched = `<path id="lejos" d="${rectD(15, 2, 3, 3)}"/>`;
    const text = svg(`<path d="${rectD(2, 2, 4, 4)}${rectD(3.8, 3.8, 0.4, 0.4)}" fill-rule="evenodd"/>${untouched}`);
    const before = await chequearSvg(text, { mode: 'declarado' });
    const ids = before.check!.zones.filter((z) => z.severity !== 'baja').map((z) => z.id);
    const res = await corregirSvg(text, before, ids);
    expect(res.after.status).toBe('ok');
    expect(res.svg).toContain('id="lejos"');
    expect(res.svg).toContain('data-alcohn="corregido-fresa"');
    expect(res.removedAreaMm2).toBeGreaterThan(0);
  });

  it('informa error con un SVG inválido o vacío', async () => {
    expect((await chequearSvg('no es svg', { mode: 'declarado' })).status).toBe('error');
    expect((await chequearSvg(svg(''), { mode: 'declarado' })).status).toBe('error');
  });
});
