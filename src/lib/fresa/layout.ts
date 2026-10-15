/**
 * Lectura del "armado" del diseño: qué piezas negras hay, cómo se agrupan en
 * letras y en líneas, y cómo está alineada cada línea respecto de las demás.
 *
 * Sirve para corregir como lo haría una persona: si dos letras están muy
 * juntas se separan moviendo letras enteras, sin romper la alineación del
 * bloque (si las líneas están alineadas a la izquierda, se corre hacia la
 * derecha lo que está a la derecha del hueco; si están centradas, se reparte).
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

export interface Layout {
  pieces: Piece[];
  /** Piezas que no se mueven nunca: marcos, recuadros y partes grandes de un dibujo. */
  containers: Set<number>;
  /** Líneas ordenadas de arriba hacia abajo. */
  lines: Line[];
  lineOf: Map<number, number>;
  glyphOf: Map<number, number>;
}

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

  // Líneas: piezas que se superponen bastante en vertical. Las más altas
  // primero, para que definan la "caja" de cada línea.
  const free = pieces.filter((p) => !containers.has(p.id));
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
  return { pieces, containers, lines, lineOf, glyphOf };
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
 * Cómo separar dos piezas: devuelve, para un desplazamiento total `d` (µm),
 * cuánto se mueve cada pieza. `null` si no hay una forma coherente de hacerlo
 * (misma letra, un marco, piezas fuera de las líneas).
 */
export function separationPlan(
  layout: Layout,
  a: number,
  b: number,
): { axis: 'x' | 'y'; shiftsFor: (d: number) => PieceShift } | null {
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
