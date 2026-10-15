// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { flattenPathData } from './pathData';
import { parseSvgShapes } from './svgShapes';
import { analyzeBlackRegion, buildBlackRegion } from './analyze';
import { FRESA_ALIMENTO, FRESA_FINA, cutRadiusAtDepth, depthForRadius, minGapWidthMm } from './config';
import { planFix } from './fix';
import { groupZones } from './engine';
import { autoCorregir, chequearSvg, corregirSvg, corregirYSimplificar } from './chequeoFresa';
import { bounds, components, regionArea } from './geometry';
import { MAX_ARC_LETTER_RADIAL_MM, buildLayout } from './layout';

/** SVG en mm (1 unidad = 1 mm). */
const svg = (body: string, w = 20, h = 10) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${body}</svg>`;

const rectD = (x: number, y: number, w: number, h: number) => `M${x} ${y}H${x + w}V${y + h}H${x}Z`;

/** Polígono cerrado (mm) a partir de puntos. */
const polyD = (pts: Array<[number, number]>) =>
  `M${pts.map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`).join('L')}Z`;

/** Círculo como path (para combinar dos en un aro con evenodd). */
const circleD = (cx: number, cy: number, r: number) =>
  `M${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}Z`;

/**
 * Sello redondo de 40 mm: 7 "letras" (rectángulos de 2,2 × 3 mm puestos en
 * sentido radial) en arco arriba, centros a 13 mm del centro, y un aro afuera.
 * - `gapToRing`: blanco entre el borde de afuera de las letras y el aro.
 * - `stepDeg`: ángulo entre letras (`tightPair`: el par 3–4 más junto).
 * - `innerRing`: aro adentro, con su borde de afuera a ese radio.
 * - `diamond`: un rombo a la izquierda (como una estrella) con las puntas a
 *   0,22 mm del aro de afuera y del de adentro.
 * - `raise`: la letra del medio corrida esos mm hacia afuera.
 */
function arcSvg(o: {
  gapToRing: number;
  stepDeg?: number;
  tightPair?: number;
  innerRing?: number;
  diamond?: boolean;
  raise?: number;
}) {
  const c = 20;
  const step = o.stepDeg ?? 14;
  const parts: string[] = [];
  for (let k = 0; k < 7; k++) {
    let deg = -90 + (k - 3) * step;
    if (o.tightPair != null) deg += k <= 3 ? o.tightPair / 2 : -o.tightPair / 2;
    const th = (deg * Math.PI) / 180;
    const u: [number, number] = [Math.cos(th), Math.sin(th)];
    const v: [number, number] = [-Math.sin(th), Math.cos(th)];
    const lift = k === 3 ? (o.raise ?? 0) : 0;
    const p = (r: number, t: number): [number, number] => [
      c + (r + lift) * u[0] + t * v[0],
      c + (r + lift) * u[1] + t * v[1],
    ];
    parts.push(polyD([p(11.5, -1.1), p(14.5, -1.1), p(14.5, 1.1), p(11.5, 1.1)]));
  }
  const ri = 14.5 + o.gapToRing;
  let body = `<path d="${parts.join('')}"/><path d="${circleD(c, c, ri + 0.8)}${circleD(c, c, ri)}" fill-rule="evenodd"/>`;
  if (o.innerRing != null)
    body += `<path d="${circleD(c, c, o.innerRing)}${circleD(c, c, o.innerRing - 0.6)}" fill-rule="evenodd"/>`;
  if (o.diamond && o.innerRing != null) {
    const outer = ri - 0.22;
    const inner = o.innerRing + 0.22;
    const mid = (outer + inner) / 2;
    body += `<path d="${polyD([[c - outer, c], [c - mid, c - 1], [c - inner, c], [c - mid, c + 1]])}"/>`;
  }
  return svg(body, 40, 40);
}

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

  it('reconoce un texto en arco: centro, radio y letras en orden', () => {
    const { black } = analyzeSvgText(arcSvg({ gapToRing: 0.8 }));
    const layout = buildLayout(black);
    expect(layout.arcs).toHaveLength(1);
    const arc = layout.arcs[0];
    expect(arc.glyphs).toHaveLength(7);
    expect(Math.hypot(arc.cx - 20000, arc.cy - 20000)).toBeLessThan(300);
    expect(Math.abs(arc.r - 13000)).toBeLessThan(300);
    // Ordenadas por ángulo: de izquierda a derecha en el arco de arriba.
    const xs = arc.centers.map((c) => c.x);
    expect([...xs].sort((a, z) => a - z)).toEqual(xs);
    // Sus letras no forman renglones (antes el arco se partía en renglones falsos).
    expect(layout.lines.flatMap((l) => l.glyphs)).toHaveLength(0);
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

describe('corrección de texto en arco', () => {
  /** Componente radial (µm) de cada movimiento: negativo = hacia el centro (20, 20) mm. */
  const radial = (moves: ReturnType<typeof planFix>['moves']) =>
    moves.map((m) => {
      const b = bounds(m.region)!;
      const ux = (b.minX + b.maxX) / 2 - 20000;
      const uy = (b.minY + b.maxY) / 2 - 20000;
      return (m.dx * ux + m.dy * uy) / Math.hypot(ux, uy);
    });

  it('si las letras están pegadas al aro, acerca todo el arco al centro sin deformarlo', () => {
    const { black, result } = analyzeSvgText(arcSvg({ gapToRing: 0.3 }));
    expect(serious(result.zones).length).toBeGreaterThan(0);
    const fixed = planFix(black, result.zones);
    expect(serious(analyzeBlackRegion(fixed.black).zones)).toHaveLength(0);
    expect(fixed.operations.every((o) => o.kind === 'separar' && o.axis === 'radial')).toBe(true);
    expect(fixed.removedAreaMm2).toBe(0);
    // Se movieron las 7 letras, todas hacia adentro y lo mismo: el arco sigue parejo.
    const r = radial(fixed.moves);
    expect(r).toHaveLength(7);
    expect(r.every((x) => x < 0)).toBe(true);
    expect(Math.max(...r) - Math.min(...r)).toBeLessThan(3);
    // Solo se trasladan: el área negra no cambia.
    expect(regionArea(fixed.black)).toBeCloseTo(regionArea(black), -4);
  });

  it('si dos letras del arco están muy juntas, abre el arco en ese par', () => {
    // Par 3–4 a 11,5° en vez de 14°: casi se tocan del lado de adentro.
    const { black, result } = analyzeSvgText(arcSvg({ gapToRing: 0.8, tightPair: 2.5 }));
    expect(serious(result.zones).length).toBeGreaterThan(0);
    const fixed = planFix(black, result.zones);
    expect(serious(analyzeBlackRegion(fixed.black).zones)).toHaveLength(0);
    expect(fixed.operations.map((o) => o.kind === 'separar' && o.axis)).toEqual(['arco']);
    expect(components(fixed.black)).toHaveLength(components(black).length);
  });

  it('si casi todos los pares del arco están justos, abre el espaciado parejo a lo largo del arco', () => {
    const { black, result } = analyzeSvgText(arcSvg({ gapToRing: 0.8, stepDeg: 11.6 }));
    expect(serious(result.zones).length).toBeGreaterThan(2);
    const fixed = planFix(black, result.zones);
    expect(fixed.operations[0]).toMatchObject({ kind: 'espaciar', axis: 'arco' });
    expect(serious(analyzeBlackRegion(fixed.black).zones)).toHaveLength(0);
    // Las letras se corren a lo largo del arco: casi nada en sentido radial.
    const r = radial(fixed.moves);
    expect(fixed.moves.every((m, i) => Math.abs(r[i]) < 0.1 * Math.hypot(m.dx, m.dy))).toBe(true);
  });

  it('si el arco entero no tiene lugar, corre solo la letra pegada, poco', () => {
    // La letra del medio está 0,42 mm más afuera (a 0,38 mm del aro); las demás,
    // a 0,5 mm de un aro de adentro: si baja todo el arco, se pegan a ese aro.
    const { black, result } = analyzeSvgText(arcSvg({ gapToRing: 0.8, raise: 0.42, innerRing: 11 }));
    expect(serious(result.zones).length).toBeGreaterThan(0);
    const fixed = planFix(black, result.zones);
    expect(serious(analyzeBlackRegion(fixed.black).zones)).toHaveLength(0);
    expect(fixed.moves).toHaveLength(1);
    const [r] = radial(fixed.moves);
    expect(r).toBeLessThan(0);
    expect(-r).toBeLessThanOrEqual(MAX_ARC_LETTER_RADIAL_MM * 1000 + 1);
  });

  it('una pieza encajada entre dos aros sin lugar no se mueve (no acerca una punta para "resolver" la otra)', () => {
    const { black, result } = analyzeSvgText(arcSvg({ gapToRing: 0.8, innerRing: 10.9, diamond: true }));
    const before = serious(result.zones);
    expect(before.length).toBeGreaterThan(0);
    const fixed = planFix(black, result.zones);
    expect(fixed.moves).toHaveLength(0);
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

  it('modo pedido con un diseño parado: 50×10 es 10 de ancho × 50 de alto', async () => {
    const body = `<path d="${rectD(0, 0, 10, 50)}"/>`;
    const r = await chequearSvg(svg(body, 10, 50), { mode: 'pedido', requestedWidthMm: 50, requestedHeightMm: 10 });
    expect(r.widthMm).toBeCloseTo(10, 2);
    expect(r.heightMm).toBeCloseTo(50, 2);
  });

  it('modo pedido emula la medida que guarda Confirmar', async () => {
    const body = `<path d="${rectD(0, 0, 20, 10)}"/>`;
    const r = await chequearSvg(svg(body), { mode: 'pedido', requestedWidthMm: 40, requestedHeightMm: 20 });
    expect(r.widthMm).toBeCloseTo(40, 2);
    expect(r.heightMm).toBeCloseTo(20, 2);
  });

  /** Rectángulo con un nodo cada 0,2 mm en cada lado (como sale de la vectorización). */
  const denseRectD = (x: number, y: number, w: number, h: number) => {
    const pts: Array<[number, number]> = [];
    const edge = (x0: number, y0: number, x1: number, y1: number) => {
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 0.2));
      for (let k = 0; k < n; k++) pts.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
    };
    edge(x, y, x + w, y);
    edge(x + w, y, x + w, y + h);
    edge(x + w, y + h, x, y + h);
    edge(x, y + h, x, y);
    return polyD(pts);
  };

  it('corrección automática: simplifica aunque la fresa ya llegue bien, sin cambiar el diseño', async () => {
    const text = svg(`<path d="${denseRectD(2, 2, 6, 6)}${denseRectD(11, 2, 6, 6)}"/>`);
    const before = await chequearSvg(text, { mode: 'declarado' });
    expect(before.status).toBe('ok');
    const res = (await corregirYSimplificar(text, before, []))!;
    const simp = res.operations.find((o) => o.kind === 'simplificar');
    expect(simp && simp.kind === 'simplificar' && simp.despues).toBe(8);
    expect(res.after.status).toBe('ok');
    expect(res.after.widthMm).toBeCloseTo(before.widthMm, 2);
    const area = (t: string) => regionArea(buildBlackRegion(parseSvgShapes(t).shapes, 1)) / 1e6;
    expect(area(res.svg)).toBeCloseTo(72, 2);
  });

  it('corrección automática: corrige y después simplifica', async () => {
    // Dos bloques a 0,2 mm (la fresa no pasa), llenos de nodos.
    const text = svg(`<path d="${denseRectD(2, 2, 6, 6)}"/><path d="${denseRectD(8.2, 2, 6, 6)}"/>`);
    const { report, fix } = await autoCorregir(text, { mode: 'declarado' });
    expect(report.status).toBe('revisar');
    expect(fix).not.toBeNull();
    const kinds = fix!.operations.map((o) => o.kind);
    expect(kinds).toContain('simplificar');
    expect(kinds.some((k) => k !== 'simplificar')).toBe(true);
    const places = (r: typeof report) => r.groupCounts.alta + r.groupCounts.media;
    expect(places(fix!.after)).toBeLessThan(places(report));
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

describe('logo con bloque de texto y medida fija', () => {
  /**
   * Ícono centrado arriba, nombre (5 letras, huecos de 0,8 mm) y tagline
   * (7 letras, huecos de 0,3 mm) justificados al mismo ancho (13,2 mm).
   */
  function logoSvg() {
    const x0 = 1;
    const width = 13.2;
    const row = (n: number, gap: number, y: number, h: number) => {
      const w = (width - (n - 1) * gap) / n;
      return Array.from({ length: n }, (_, k) => rectD(x0 + k * (w + gap), y, w, h)).join('');
    };
    const icon = rectD(x0 + width / 2 - 2.5, 0.5, 5, 4);
    return svg(`<path d="${icon}${row(5, 0.8, 5.5, 2.5)}${row(7, 0.3, 8.8, 1.6)}"/>`, 16, 11);
  }

  const lineWidths = (text: string) => {
    const black = buildBlackRegion(parseSvgShapes(text).shapes, 1);
    const layout = buildLayout(black);
    return layout.lines.filter((l) => l.straight).map((l) => (l.bounds.maxX - l.bounds.minX) / 1000);
  };

  it('al abrir el espaciado del tagline ensancha también el nombre y mantiene la medida', async () => {
    const text = logoSvg();
    const before = await chequearSvg(text, { mode: 'declarado' });
    expect(before.status).toBe('revisar');
    const ids = before.check!.zones.filter((z) => z.severity !== 'baja').map((z) => z.id);
    const res = await corregirSvg(text, before, ids);
    expect(res.after.status).toBe('ok');
    expect(res.operations.map((o) => o.kind)).toContain('acompanar');
    // Nombre y tagline siguen del mismo ancho.
    const [nombre, tagline] = lineWidths(res.svg);
    expect(Math.abs(nombre - tagline) / tagline).toBeLessThan(0.01);
    // La medida del sello no cambió: todo se encajó en la caja original.
    expect(res.fitScale).toBeLessThan(1);
    expect(res.svg).toContain('data-alcohn="encaje-medida"');
    expect(Math.max(res.after.widthMm, res.after.heightMm)).toBeCloseTo(Math.max(before.widthMm, before.heightMm), 1);
    expect(res.after.widthMm).toBeLessThanOrEqual(before.widthMm + 0.01);
    expect(res.after.heightMm).toBeLessThanOrEqual(before.heightMm + 0.01);
    expect(res.fabricationMm.widthMm).toBeCloseTo(res.after.widthMm, 3);
  });

  it('si no hay forma de corregir sin romper, sugiere agrandar un poco (sin aplicarlo)', async () => {
    // Ojo de 0,43 mm con paredes de 0,3 mm (ya más finas que el mínimo): no se
    // pueden afinar. Agrandando ~4 % el ojo llega a 0,45 mm.
    const text = svg(`<path d="${rectD(2, 2, 1.03, 1.03)}${rectD(2.3, 2.3, 0.43, 0.43)}" fill-rule="evenodd"/>`);
    const before = await chequearSvg(text, { mode: 'declarado' });
    expect(before.status).toBe('revisar');
    const ids = before.check!.zones.filter((z) => z.severity !== 'baja').map((z) => z.id);
    const res = await corregirSvg(text, before, ids);
    expect(res.after.status).toBe('revisar');
    expect(res.scaleUp).not.toBeNull();
    expect(res.scaleUp!.factor).toBeGreaterThan(1.02);
    expect(res.scaleUp!.factor).toBeLessThanOrEqual(1.06);
    expect(res.scaleUp!.widthMm).toBeCloseTo(res.after.widthMm * res.scaleUp!.factor, 3);
  });

  it('no sugiere agrandar más allá del tope de la planchuela', async () => {
    // Sello de 11,5 × 11,5 mm (planchuela 12, tope 11,5): ya está en el tope.
    // El mismo ojo imposible que arriba, más un punto en la otra esquina.
    const text = svg(
      `<path d="${rectD(0, 0, 1.03, 1.03)}${rectD(0.3, 0.3, 0.43, 0.43)}" fill-rule="evenodd"/>` +
        `<path d="${rectD(10.9, 10.9, 0.6, 0.6)}"/>`,
      11.5,
      11.5,
    );
    const before = await chequearSvg(text, {
      mode: 'fabricacion',
      longSideMm: 11.5,
      requestedWidthMm: 11.5,
      requestedHeightMm: 11.5,
    });
    expect(before.status).toBe('revisar');
    const ids = before.check!.zones.filter((z) => z.severity !== 'baja').map((z) => z.id);
    const res = await corregirSvg(text, before, ids);
    expect(res.after.status).toBe('revisar');
    expect(res.scaleUp).toBeNull();
  });

  it('sellos Alimento: profundidad final 3 mm y mínima 1 mm', () => {
    expect(FRESA_ALIMENTO.finalDepthMm).toBe(3);
    expect(FRESA_ALIMENTO.minDepthMm).toBe(1);
  });
});
