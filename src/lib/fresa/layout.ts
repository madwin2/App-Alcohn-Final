/**
 * Lectura del "armado" del diseño: qué piezas negras hay, cómo se agrupan en
 * letras y en líneas, y cómo está alineada cada línea respecto de las demás.
 *
 * Sirve para corregir como lo haría una persona: si dos letras están muy
 * juntas se separan moviendo letras enteras, sin romper la alineación del
 * bloque (si las líneas están alineadas a la izquierda, se corre hacia la
 * derecha lo que está a la derecha del hueco; si están centradas, se reparte).
 *
 * El texto en arco (típico de los sellos redondos: un texto arriba y otro abajo
 * siguiendo un aro) se reconoce aparte: letras cuyos centros caen sobre un mismo
 * círculo. Ahí se separa en sentido radial (todo el tramo se acerca o se aleja
 * del centro, como achicar o agrandar el radio del arco) o a lo largo del arco
 * (se abre el espaciado girando las letras alrededor del centro). Las letras se
 * trasladan, no se giran: en los corrimientos de décimas de mm no se nota.
 */
import { UM, components, type Bounds, type Paths64 } from './geometry';

export interface Piece {
  id: number;
  /** Región de la pieza en su posición original (µm). */
  paths: Paths64;
  bounds: Bounds;
}

export type LineAlign = 'left' | 'right' | 'center';

export interface Line {
  /** Letras (grupos de piezas) ordenadas de izquierda a derecha. */
  glyphs: number[][];
  bounds: Bounds;
  align: LineAlign;
  /**
   * Texto recto: letras de alto parecido apoyadas en una misma base. Solo en
   * estas líneas se separan letras a lo largo; un texto en arco o un dibujo no.
   */
  straight: boolean;
}

/**
 * Tramo de texto en arco: letras seguidas sobre un mismo círculo. Un círculo
 * puede tener varios tramos (el texto de arriba, el de abajo, una estrella suelta).
 */
export interface Arc {
  /** Centro y radio (µm) del círculo por el que pasan los centros de las letras. */
  cx: number;
  cy: number;
  r: number;
  /**
   * Radio del borde de adentro del tramo (µm): ahí las letras quedan más
   * juntas, así que el espaciado se mide ahí.
   */
  inner: number;
  /** Letras (grupos de piezas) ordenadas por ángulo. */
  glyphs: number[][];
  /** Centro de cada letra (µm). */
  centers: Pt[];
}

export interface Layout {
  pieces: Piece[];
  /** Piezas que no se mueven nunca: marcos, recuadros y partes grandes de un dibujo. */
  containers: Set<number>;
  /** Líneas ordenadas de arriba hacia abajo. */
  lines: Line[];
  lineOf: Map<number, number>;
  glyphOf: Map<number, number>;
  /** Tramos de texto en arco (sus piezas no están en `lines`). */
  arcs: Arc[];
  arcOf: Map<number, number>;
  arcGlyphOf: Map<number, number>;
}

type Pt = { x: number; y: number };

/** Desplazamiento (µm) por pieza. */
export type PieceShift = Map<number, { dx: number; dy: number }>;

const unionBounds = (list: Bounds[]): Bounds => ({
  minX: Math.min(...list.map((b) => b.minX)),
  minY: Math.min(...list.map((b) => b.minY)),
  maxX: Math.max(...list.map((b) => b.maxX)),
  maxY: Math.max(...list.map((b) => b.maxY)),
});

const contains = (outer: Bounds, inner: Bounds) =>
  outer.minX <= inner.minX && outer.minY <= inner.minY && outer.maxX >= inner.maxX && outer.maxY >= inner.maxY;

const overlap1d = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

const median = (xs: number[]) => {
  const s = [...xs].sort((a, z) => a - z);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * ¿Las letras forman un renglón recto? La mayoría tiene un alto parecido y se
 * apoya en la misma base (las que bajan, como la Q o la p, son minoría). En un
 * arco la base va subiendo y bajando.
 */
function isStraight(glyphs: Bounds[]): boolean {
  if (glyphs.length < 2) return false;
  const hs = glyphs.map((b) => b.maxY - b.minY);
  const h = median(hs);
  if (!(h > 0)) return false;
  // En texto recto la base varía < 6 % del alto; en un arco, 20–40 %.
  const tol = 0.08 * h;
  const share = (vals: number[]) => {
    const m = median(vals);
    return vals.filter((v) => Math.abs(v - m) <= tol).length / vals.length;
  };
  const similar = hs.filter((x) => x >= 0.45 * h && x <= 1.7 * h).length / hs.length;
  const base = share(glyphs.map((b) => b.maxY));
  const need = glyphs.length >= 3 ? 0.6 : 1;
  return similar >= 0.75 && base >= need;
}

export function buildLayout(black: Paths64): Layout {
  const pieces: Piece[] = components(black).map((c, id) => ({ id, paths: c.paths, bounds: c.bounds }));

  // Fijas: marcos (encierran a otras piezas) y partes de un dibujo, que son
  // mucho más altas que la pieza típica del diseño (las letras).
  const containers = new Set<number>();
  for (const p of pieces) {
    let inside = 0;
    for (const q of pieces) if (q.id !== p.id && contains(p.bounds, q.bounds)) inside++;
    if (inside >= 2) containers.add(p.id);
  }
  const typicalH = median(pieces.filter((p) => !containers.has(p.id)).map((p) => p.bounds.maxY - p.bounds.minY));
  for (const p of pieces) if (p.bounds.maxY - p.bounds.minY > 2.5 * typicalH) containers.add(p.id);

  // Texto en arco: al agrupar por altura un arco se parte en "renglones"
  // falsos (dos letras de los extremos a la misma altura), así que se busca
  // antes de armar los renglones. Para no confundir un bloque de texto recto
  // con un arco, se le pasan los renglones rectos que se ven a primera vista.
  const loose = pieces.filter((p) => !containers.has(p.id));
  const straightRows = buildLines(loose, pieces)
    .filter((l) => l.straight && l.glyphs.length >= 3)
    .map((l) => l.glyphs);
  const arcs = detectArcs(loose, straightRows);
  const inArc = new Set(arcs.flatMap((a) => a.glyphs.flat()));

  const lines = buildLines(
    loose.filter((p) => !inArc.has(p.id)),
    pieces,
  );
  lines.sort((a, z) => a.bounds.minY + a.bounds.maxY - (z.bounds.minY + z.bounds.maxY));

  // Alineación: se compara cada renglón recto con los demás renglones rectos
  // (un arco o una pieza suelta no definen alineación). Tolerancia: 1,5 % del
  // ancho del bloque, al menos 0,25 mm. Sin otro renglón con quien comparar,
  // se toma como centrado (se reparte a los dos lados).
  const textLines = lines.filter((l) => l.straight);
  if (textLines.length) {
    const block = unionBounds(textLines.map((l) => l.bounds));
    const tol = Math.max(0.25 * UM, 0.015 * (block.maxX - block.minX));
    for (const l of textLines) {
      const others = textLines.filter((o) => o !== l);
      const left = others.some((o) => Math.abs(o.bounds.minX - l.bounds.minX) <= tol);
      const right = others.some((o) => Math.abs(o.bounds.maxX - l.bounds.maxX) <= tol);
      l.align = left ? 'left' : right ? 'right' : 'center';
    }
  }

  const lineOf = new Map<number, number>();
  const glyphOf = new Map<number, number>();
  lines.forEach((l, li) =>
    l.glyphs.forEach((g, gi) =>
      g.forEach((id) => {
        lineOf.set(id, li);
        glyphOf.set(id, gi);
      }),
    ),
  );
  const arcOf = new Map<number, number>();
  const arcGlyphOf = new Map<number, number>();
  arcs.forEach((a, ai) =>
    a.glyphs.forEach((g, gi) =>
      g.forEach((id) => {
        arcOf.set(id, ai);
        arcGlyphOf.set(id, gi);
      }),
    ),
  );
  return { pieces, containers, lines, lineOf, glyphOf, arcs, arcOf, arcGlyphOf };
}

/**
 * Renglones: piezas que se superponen bastante en vertical. Las más altas
 * primero, para que definan la "caja" de cada renglón.
 */
function buildLines(free: Piece[], pieces: Piece[]): Line[] {
  const byHeight = [...free].sort(
    (a, z) => z.bounds.maxY - z.bounds.minY - (a.bounds.maxY - a.bounds.minY),
  );
  const rows: Array<{ core: Bounds; members: Piece[] }> = [];
  for (const p of byHeight) {
    const h = p.bounds.maxY - p.bounds.minY;
    let best: (typeof rows)[number] | null = null;
    let bestOv = 0;
    for (const r of rows) {
      const ov = overlap1d(p.bounds.minY, p.bounds.maxY, r.core.minY, r.core.maxY);
      const need = 0.5 * Math.min(h, r.core.maxY - r.core.minY);
      if (ov >= need && ov > bestOv) {
        best = r;
        bestOv = ov;
      }
    }
    if (best) best.members.push(p);
    else rows.push({ core: p.bounds, members: [p] });
  }

  // Piezas sueltas chicas (puntos, tildes) que quedaron solas: van con la
  // línea que tengan justo abajo o arriba y que las cubra en horizontal.
  const medianH = (() => {
    const hs = rows.map((r) => r.core.maxY - r.core.minY).sort((a, z) => a - z);
    return hs.length ? hs[Math.floor(hs.length / 2)] : 0;
  })();
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.members.length !== 1 || r.core.maxY - r.core.minY > 0.35 * medianH) continue;
    const p = r.members[0];
    let target: (typeof rows)[number] | null = null;
    let bestDist = Infinity;
    for (const o of rows) {
      if (o === r || o.members.length < 2) continue;
      const ob = unionBounds(o.members.map((m) => m.bounds));
      if (!overlap1d(p.bounds.minX, p.bounds.maxX, ob.minX, ob.maxX)) continue;
      const dist = p.bounds.minY > ob.maxY ? p.bounds.minY - ob.maxY : ob.minY - p.bounds.maxY;
      if (dist < 0.6 * medianH && dist < bestDist) {
        bestDist = dist;
        target = o;
      }
    }
    if (target) {
      target.members.push(p);
      rows.splice(i, 1);
    }
  }

  const lines: Line[] = rows.map((r) => {
    // Letras: piezas que se pisan en horizontal (la i y su punto, una tilde).
    const sorted = [...r.members].sort((a, z) => a.bounds.minX - z.bounds.minX);
    const glyphs: Array<{ ids: number[]; minX: number; maxX: number }> = [];
    for (const p of sorted) {
      const w = p.bounds.maxX - p.bounds.minX;
      const g = glyphs.find((x) => {
        const ov = overlap1d(p.bounds.minX, p.bounds.maxX, x.minX, x.maxX);
        return ov >= 0.5 * Math.min(w, x.maxX - x.minX);
      });
      if (g) {
        g.ids.push(p.id);
        g.minX = Math.min(g.minX, p.bounds.minX);
        g.maxX = Math.max(g.maxX, p.bounds.maxX);
      } else {
        glyphs.push({ ids: [p.id], minX: p.bounds.minX, maxX: p.bounds.maxX });
      }
    }
    glyphs.sort((a, z) => a.minX + a.maxX - (z.minX + z.maxX));
    const glyphBounds = glyphs.map((g) => unionBounds(g.ids.map((id) => pieces[id].bounds)));
    return {
      glyphs: glyphs.map((g) => g.ids),
      bounds: unionBounds(r.members.map((m) => m.bounds)),
      align: 'center' as LineAlign,
      straight: isStraight(glyphBounds),
    };
  });
  return lines;
}

// ---------------------------------------------------------------- texto en arco

const centerOf = (b: Bounds): Pt => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });

interface Circle {
  cx: number;
  cy: number;
  r: number;
}

function circleThrough(a: Pt, b: Pt, c: Pt): Circle | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-6) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { cx, cy, r: Math.hypot(a.x - cx, a.y - cy) };
}

/** Círculo por mínimos cuadrados (Kåsa), en coordenadas centradas. */
function fitCircle(pts: Pt[]): Circle | null {
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let suu = 0;
  let svv = 0;
  let suv = 0;
  let bu = 0;
  let bv = 0;
  for (const p of pts) {
    const u = p.x - mx;
    const v = p.y - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    bu += (u * u * u + u * v * v) / 2;
    bv += (v * v * v + v * u * u) / 2;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-6) return null;
  const uc = (bu * svv - bv * suv) / det;
  const vc = (suu * bv - suv * bu) / det;
  return { cx: uc + mx, cy: vc + my, r: Math.sqrt(uc * uc + vc * vc + (suu + svv) / pts.length) };
}

/** Distancia máxima de los puntos a la recta que mejor los ajusta (≈ 0 en un renglón recto). */
function sagitta(pts: Pt[]): number {
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const nx = -Math.sin(th);
  const ny = Math.cos(th);
  return Math.max(...pts.map((p) => Math.abs((p.x - mx) * nx + (p.y - my) * ny)));
}

/**
 * Busca círculos por los que pasan los centros de varias letras. Se acepta un
 * círculo si tiene al menos 3 letras seguidas sobre él, si de verdad se curva
 * (un renglón recto no es un arco) y si no corta un renglón recto por la mitad
 * (eso es un bloque de texto, no un arco). Las letras de cada círculo se
 * ordenan por ángulo y se cortan en tramos donde hay un salto grande.
 *
 * `straightRows`: renglones rectos de 3 o más letras que se ven a primera
 * vista (letras = ids de piezas).
 */
function detectArcs(loose: Piece[], straightRows: number[][][]): Arc[] {
  if (loose.length < 4) return [];
  const size = (b: Bounds) => Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const typ = median(loose.map((p) => size(p.bounds)));
  if (!(typ > 0)) return [];

  // Letras: las piezas chicas (puntos, tildes) van con la letra más cercana.
  const glyphs = loose.filter((p) => size(p.bounds) >= 0.4 * typ).map((p) => ({ ids: [p.id], b: p.bounds }));
  for (const p of loose) {
    if (size(p.bounds) >= 0.4 * typ) continue;
    const c = centerOf(p.bounds);
    let best: (typeof glyphs)[number] | null = null;
    let bestD = 0.8 * typ;
    for (const g of glyphs) {
      const q = centerOf(g.b);
      const d = Math.hypot(q.x - c.x, q.y - c.y);
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    if (best) {
      best.ids.push(p.id);
      best.b = unionBounds([best.b, p.bounds]);
    }
  }
  const box = unionBounds(loose.map((p) => p.bounds));
  const diag = Math.hypot(box.maxX - box.minX, box.maxY - box.minY);
  // Tolerancia: las letras de un arco no tienen todas el mismo alto.
  const tol = 0.3 * typ;
  type G = { ids: number[]; c: Pt };

  /** Letras sobre el círculo, en tramos ordenados por ángulo; `null` si no es un arco. */
  const evaluate = (pool: G[], k: Circle): G[][] | null => {
    let members = pool.filter((g) => Math.abs(Math.hypot(g.c.x - k.cx, g.c.y - k.cy) - k.r) <= tol);
    if (members.length < 4) return null;
    const ids = new Set(members.flatMap((g) => g.ids));
    for (const row of straightRows) {
      const inside = row.filter((g) => g.some((id) => ids.has(id))).length;
      if (inside && (inside < row.length || row.length >= 5)) return null;
    }
    if (sagitta(members.map((g) => g.c)) < 0.35 * typ) return null;
    // Orden por ángulo, empezando después del salto más grande.
    const ang = (p: Pt) => Math.atan2(p.y - k.cy, p.x - k.cx);
    members.sort((a, z) => ang(a.c) - ang(z.c));
    let start = 0;
    let gapMax = -1;
    members.forEach((g, i) => {
      let gap = ang(g.c) - ang(members[(i + members.length - 1) % members.length].c);
      if (gap <= 0) gap += 2 * Math.PI;
      if (gap > gapMax) {
        gapMax = gap;
        start = i;
      }
    });
    members = [...members.slice(start), ...members.slice(0, start)];
    // Tramos: letras seguidas, con centros a menos de ~1,8 letras de distancia.
    const runs: G[][] = [];
    for (const g of members) {
      const run = runs[runs.length - 1];
      const last = run?.[run.length - 1];
      if (last && Math.hypot(g.c.x - last.c.x, g.c.y - last.c.y) <= 1.8 * typ) run.push(g);
      else runs.push([g]);
    }
    return runs.some((r) => r.length >= 3) ? runs : null;
  };

  const arcs: Arc[] = [];
  let pool: G[] = glyphs.map((g) => ({ ids: g.ids, c: centerOf(g.b) }));
  for (let pass = 0; pass < 4 && pool.length >= 4; pass++) {
    // Ternas de letras → el círculo válido con más letras encima. Con muchas
    // piezas se recorre una muestra fija (siempre la misma: determinístico).
    const n = pool.length;
    const every = Math.max(1, Math.ceil((n * (n - 1) * (n - 2)) / 6 / 20000));
    let best: { circle: Circle; runs: G[][]; count: number } | null = null;
    let t = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        for (let k = j + 1; k < n; k++) {
          if (t++ % every) continue;
          const c = circleThrough(pool[i].c, pool[j].c, pool[k].c);
          if (!c || c.r < 1.2 * typ || c.r > diag) continue;
          const m = pool.filter((g) => Math.abs(Math.hypot(g.c.x - c.cx, g.c.y - c.cy) - c.r) <= tol).length;
          if (m < 4 || m <= (best?.count ?? 0)) continue;
          const runs = evaluate(pool, c);
          if (runs) best = { circle: c, runs, count: m };
        }
    if (!best) break;
    // Ajuste fino con todas las letras del círculo.
    for (let it = 0; it < 2; it++) {
      const refit = fitCircle(best.runs.flat().map((g) => g.c));
      if (!refit || refit.r > diag) break;
      const runs = evaluate(pool, refit);
      if (!runs || runs.flat().length < best.count) break;
      best = { circle: refit, runs, count: runs.flat().length };
    }
    const { circle, runs } = best;
    const byId = new Map(loose.map((p) => [p.id, p]));
    const innerOf = (ids: number[]) =>
      Math.min(
        ...ids.flatMap((id) =>
          byId.get(id)!.paths.flatMap((ring) => ring.map((q) => Math.hypot(q.x - circle.cx, q.y - circle.cy))),
        ),
      );
    for (const r of runs)
      arcs.push({
        cx: Math.round(circle.cx),
        cy: Math.round(circle.cy),
        r: Math.round(circle.r),
        inner: Math.max(1, Math.round(innerOf(r.flatMap((g) => g.ids)))),
        glyphs: r.map((g) => g.ids),
        centers: r.map((g) => g.c),
      });
    const used = new Set(runs.flat());
    pool = pool.filter((g) => !used.has(g));
  }
  return arcs;
}

/** Traslación (µm) que lleva `p` a girar `angle` rad alrededor del centro del arco. */
function rotationShift(arc: Arc, p: Pt, angle: number): { dx: number; dy: number } {
  const ux = p.x - arc.cx;
  const uy = p.y - arc.cy;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { dx: Math.round(ux * c - uy * s - ux), dy: Math.round(ux * s + uy * c - uy) };
}

/** Traslación (µm) de `d` en sentido radial (positivo: hacia afuera). */
function radialShift(arc: Arc, p: Pt, d: number): { dx: number; dy: number } {
  const ux = p.x - arc.cx;
  const uy = p.y - arc.cy;
  const len = Math.hypot(ux, uy) || 1;
  return { dx: Math.round((ux / len) * d), dy: Math.round((uy / len) * d) };
}

function setGlyph(m: PieceShift, ids: number[], t: { dx: number; dy: number }) {
  if (t.dx || t.dy) for (const id of ids) m.set(id, t);
}

/**
 * Abrir el espaciado de todo un tramo de arco por igual: cada letra gira
 * respecto de la anterior lo necesario para que el hueco se abra `t` µm en el
 * borde de adentro, anclado en el medio del tramo (el texto sigue centrado
 * donde estaba).
 */
export function arcTrackingPlan(layout: Layout, arcIdx: number): ((t: number) => PieceShift) | null {
  const arc = layout.arcs[arcIdx];
  if (!arc || arc.glyphs.length < 3) return null;
  const anchor = (arc.glyphs.length - 1) / 2;
  return (t) => {
    const m: PieceShift = new Map();
    arc.glyphs.forEach((g, k) => setGlyph(m, g, rotationShift(arc, arc.centers[k], ((k - anchor) * t) / arc.inner)));
    return m;
  };
}

/**
 * - `x`, `y`: renglones rectos (a lo largo / entre renglones).
 * - `radial`: un tramo de texto en arco se acerca o se aleja del centro.
 * - `arco`: dos letras de un mismo tramo se separan a lo largo del arco.
 */
export type SeparationAxis = 'x' | 'y' | 'radial' | 'arco';

export interface SeparationPlan {
  axis: SeparationAxis;
  shiftsFor: (d: number) => PieceShift;
  /** Tope propio del corrimiento (µm), si es menor que el general. */
  maxUm?: number;
  /** Qué probar si este plan no sirve. */
  fallback?: SeparationPlan;
}

/**
 * Corrimiento de una letra sola de un texto en arco hacia el centro o hacia
 * afuera (las demás quedan donde estaban, así que esa letra deja de estar
 * exactamente sobre la curva). El dueño acepta "lo que se necesite sin
 * deformarlo mucho" (Q-VEC-012): hasta el 8 % del alto de la letra, entre
 * `MIN` y `MAX` mm. Con eso el salto no se nota a simple vista.
 */
export const MAX_ARC_LETTER_RADIAL_MM = 0.35;
export const MIN_ARC_LETTER_RADIAL_MM = 0.15;
export const ARC_LETTER_RADIAL_SHARE = 0.08;

/**
 * Separación cuando alguna de las dos piezas es de un texto en arco.
 * `undefined`: ninguna lo es (sigue la lógica de renglones rectos).
 */
function arcSeparationPlan(layout: Layout, a: number, b: number, near?: Pt): SeparationPlan | null | undefined {
  const aa = layout.arcOf.get(a);
  const ab = layout.arcOf.get(b);
  if (aa == null && ab == null) return undefined;

  // Dos letras del mismo tramo: se abre el arco en ese par, mitad para cada lado.
  if (aa != null && aa === ab) {
    const arc = layout.arcs[aa];
    const ga = layout.arcGlyphOf.get(a)!;
    const gb = layout.arcGlyphOf.get(b)!;
    if (ga === gb) return null;
    const split = Math.min(ga, gb);
    return {
      axis: 'arco',
      shiftsFor: (d) => {
        const m: PieceShift = new Map();
        const lo = -Math.round(d / 2);
        const hi = d + lo;
        arc.glyphs.forEach((g, k) => setGlyph(m, g, rotationShift(arc, arc.centers[k], (k <= split ? lo : hi) / arc.inner)));
        return m;
      },
    };
  }
  // Letra de un arco contra otra cosa (un aro, un dibujo, un renglón): todo el
  // tramo se aleja de esa pieza en sentido radial (como achicar o agrandar el
  // radio del arco). Si no hay lugar (el tramo está encajado entre dos aros y
  // otra letra choca del otro lado), se corre solo esa letra, poco. Dos arcos
  // distintos no tienen un movimiento coherente.
  if ((aa != null && ab != null) || !near) return null;
  const arc = layout.arcs[(aa ?? ab)!];
  const gi = layout.arcGlyphOf.get(aa != null ? a : b)!;
  const c = arc.centers[gi];
  const sign = Math.hypot(near.x - arc.cx, near.y - arc.cy) < Math.hypot(c.x - arc.cx, c.y - arc.cy) ? 1 : -1;
  const glyphH = Math.max(
    ...arc.glyphs[gi].map((id) => {
      const pb = layout.pieces[id].bounds;
      return Math.max(pb.maxX - pb.minX, pb.maxY - pb.minY);
    }),
  );
  const letterMax = Math.min(
    MAX_ARC_LETTER_RADIAL_MM * UM,
    Math.max(MIN_ARC_LETTER_RADIAL_MM * UM, ARC_LETTER_RADIAL_SHARE * glyphH),
  );
  const letter: SeparationPlan = {
    axis: 'radial',
    maxUm: letterMax,
    shiftsFor: (d) => {
      const m: PieceShift = new Map();
      setGlyph(m, arc.glyphs[gi], radialShift(arc, c, sign * d));
      return m;
    },
  };
  return {
    axis: 'radial',
    shiftsFor: (d) => {
      const m: PieceShift = new Map();
      arc.glyphs.forEach((g, k) => setGlyph(m, g, radialShift(arc, arc.centers[k], sign * d)));
      return m;
    },
    fallback: arc.glyphs.length > 1 ? letter : undefined,
  };
}

/**
 * Abrir el espaciado de todo un renglón por igual (tracking): cada letra se
 * corre `k · t` respecto de la anterior, anclado según la alineación. Es lo
 * coherente cuando la mayoría de los pares de letras están muy juntos.
 */
export function trackingPlan(layout: Layout, lineIdx: number): ((t: number) => PieceShift) | null {
  const line = layout.lines[lineIdx];
  if (!line?.straight || line.glyphs.length < 3) return null;
  const n = line.glyphs.length;
  const anchor = line.align === 'left' ? 0 : line.align === 'right' ? n - 1 : (n - 1) / 2;
  return (t) => {
    const m: PieceShift = new Map();
    line.glyphs.forEach((g, k) => {
      const dx = Math.round((k - anchor) * t);
      if (dx) for (const id of g) m.set(id, { dx, dy: 0 });
    });
    return m;
  };
}

/**
 * Renglones que forman bloque con `li`: texto recto que comparte con él los dos
 * bordes (justificado, como un nombre y su tagline del mismo ancho) o, salvo
 * `onlyJustified`, tiene la misma alineación y casi el mismo ancho. Si a uno se le abre el espaciado, a
 * estos hay que ensancharlos en la misma proporción para que el bloque no
 * quede desparejo.
 */
export function blockPartners(layout: Layout, li: number, onlyJustified = false): number[] {
  const L = layout.lines[li];
  if (!L?.straight) return [];
  const width = (l: Line) => l.bounds.maxX - l.bounds.minX;
  const wL = width(L);
  const tol = Math.max(0.25 * UM, 0.015 * wL);
  const out: number[] = [];
  layout.lines.forEach((o, i) => {
    if (i === li || !o.straight || o.glyphs.length < 3) return;
    const wo = width(o);
    const ov = overlap1d(o.bounds.minX, o.bounds.maxX, L.bounds.minX, L.bounds.maxX);
    if (ov < 0.6 * Math.min(wo, wL)) return;
    const justified =
      Math.abs(o.bounds.minX - L.bounds.minX) <= tol && Math.abs(o.bounds.maxX - L.bounds.maxX) <= tol;
    // "Casi el mismo ancho": a la vista se ven iguales (hasta 5 %).
    const similar = o.align === L.align && Math.abs(wo - wL) <= 0.05 * wL;
    if (justified || (!onlyJustified && similar)) out.push(i);
  });
  return out;
}

/**
 * Espaciado de los renglones compañeros para que acompañen un ensanche de
 * `growUm` del renglón `li` (misma proporción de ancho). Vacío si no tiene.
 */
export function partnersGrowth(layout: Layout, li: number, growUm: number, onlyJustified = false): PieceShift {
  const m: PieceShift = new Map();
  const L = layout.lines[li];
  if (!L || growUm <= 0) return m;
  const wL = L.bounds.maxX - L.bounds.minX;
  for (const pi of blockPartners(layout, li, onlyJustified)) {
    const P = layout.lines[pi];
    const plan = trackingPlan(layout, pi);
    if (!plan) continue;
    const grow = (growUm * (P.bounds.maxX - P.bounds.minX)) / wL;
    const t = Math.round(grow / (P.glyphs.length - 1));
    for (const [id, d] of plan(t)) m.set(id, d);
  }
  return m;
}

/**
 * Cómo separar dos piezas: devuelve, para un desplazamiento total `d` (µm),
 * cuánto se mueve cada pieza. `null` si no hay una forma coherente de hacerlo
 * (misma letra, un marco, piezas fuera de las líneas).
 */
export function separationPlan(
  layout: Layout,
  a: number,
  b: number,
  /** Un punto del hueco (µm): dice de qué lado de un arco está la otra pieza. */
  near?: Pt,
): SeparationPlan | null {
  const arcPlan = arcSeparationPlan(layout, a, b, near);
  if (arcPlan !== undefined) return arcPlan;
  if (layout.containers.has(a) || layout.containers.has(b)) return null;
  const la = layout.lineOf.get(a);
  const lb = layout.lineOf.get(b);
  if (la == null || lb == null) return null;

  if (la === lb) {
    const ga = layout.glyphOf.get(a)!;
    const gb = layout.glyphOf.get(b)!;
    if (ga === gb) return null;
    const line = layout.lines[la];
    if (!line.straight) return null;
    const split = Math.min(ga, gb);
    const leftIds = line.glyphs.slice(0, split + 1).flat();
    const rightIds = line.glyphs.slice(split + 1).flat();
    return {
      axis: 'x',
      shiftsFor: (d) => {
        const m: PieceShift = new Map();
        const l = line.align === 'right' ? -d : line.align === 'center' ? -Math.round(d / 2) : 0;
        const r = line.align === 'left' ? d : line.align === 'center' ? d - Math.round(d / 2) : 0;
        if (l) for (const id of leftIds) m.set(id, { dx: l, dy: 0 });
        if (r) for (const id of rightIds) m.set(id, { dx: r, dy: 0 });
        return m;
      },
    };
  }

  // Líneas distintas: se separan las líneas manteniendo el centro vertical
  // del bloque (lo de arriba sube la mitad, lo de abajo baja la mitad).
  const upper = Math.min(la, lb);
  const lower = Math.max(la, lb);
  if (!layout.lines[upper].straight || !layout.lines[lower].straight) return null;
  return {
    axis: 'y',
    shiftsFor: (d) => {
      const m: PieceShift = new Map();
      const up = -Math.round(d / 2);
      const down = d + up;
      layout.lines.forEach((l, li) => {
        const dy = li <= upper ? up : li >= lower ? down : 0;
        if (!dy) return;
        for (const id of l.glyphs.flat()) m.set(id, { dx: 0, dy });
      });
      return m;
    },
  };
}
