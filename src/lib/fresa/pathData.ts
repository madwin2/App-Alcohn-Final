/**
 * Parser y aplanado del atributo `d` de un <path> SVG.
 *
 * Devuelve sub-trayectos como polilíneas (lista de puntos) en el mismo sistema
 * de coordenadas del path. Soporta todos los comandos de SVG 1.1 (M L H V C S Q
 * T A Z, absolutos y relativos) y la sintaxis compacta que exporta Illustrator
 * (`-.4-.04`, `1.5.5`, flags de arco pegados `a1 1 0 011 1`).
 */

export interface Pt {
  x: number;
  y: number;
}

/** Sub-trayecto aplanado. `closed` = terminaba en Z (los abiertos se cierran igual para relleno). */
export interface FlatSubpath {
  points: Pt[];
  closed: boolean;
}

const CMD_RE = /[MmZzLlHhVvCcSsQqTtAa]/;
const NUM_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;

type Token = { cmd: string } | { num: number; raw: string };

function tokenize(d: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = d.length;
  while (i < n) {
    const ch = d[i];
    if (ch === ' ' || ch === ',' || ch === '\n' || ch === '\r' || ch === '\t') {
      i++;
      continue;
    }
    if (CMD_RE.test(ch)) {
      tokens.push({ cmd: ch });
      i++;
      continue;
    }
    const m = NUM_RE.exec(d.slice(i, i + 40));
    if (!m) {
      // Carácter inválido: SVG dice que se renderiza hasta el error.
      break;
    }
    tokens.push({ num: parseFloat(m[0]), raw: m[0] });
    i += m[0].length;
  }
  return tokens;
}

/** Aplana una curva cúbica con subdivisión adaptativa por planitud. */
function flattenCubic(out: Pt[], p0: Pt, p1: Pt, p2: Pt, p3: Pt, tol: number, depth = 0): void {
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  const d1 = Math.abs((p1.x - p3.x) * dy - (p1.y - p3.y) * dx);
  const d2 = Math.abs((p2.x - p3.x) * dy - (p2.y - p3.y) * dx);
  const len2 = dx * dx + dy * dy;
  const flatEnough =
    len2 > 0 ? (d1 + d2) * (d1 + d2) <= tol * tol * len2 * 16 : Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(p2.x - p0.x, p2.y - p0.y) <= tol;
  if (flatEnough || depth > 18) {
    out.push(p3);
    return;
  }
  const p01 = mid(p0, p1);
  const p12 = mid(p1, p2);
  const p23 = mid(p2, p3);
  const p012 = mid(p01, p12);
  const p123 = mid(p12, p23);
  const p0123 = mid(p012, p123);
  flattenCubic(out, p0, p01, p012, p0123, tol, depth + 1);
  flattenCubic(out, p0123, p123, p23, p3, tol, depth + 1);
}

function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function flattenQuad(out: Pt[], p0: Pt, p1: Pt, p2: Pt, tol: number): void {
  // Elevación de grado a cúbica: reutiliza el aplanado adaptativo.
  const c1 = { x: p0.x + (2 / 3) * (p1.x - p0.x), y: p0.y + (2 / 3) * (p1.y - p0.y) };
  const c2 = { x: p2.x + (2 / 3) * (p1.x - p2.x), y: p2.y + (2 / 3) * (p1.y - p2.y) };
  flattenCubic(out, p0, c1, c2, p2, tol);
}

/** Arco elíptico SVG (parametrización por extremos) → puntos. Implementa SVG 1.1 F.6.5/F.6.6. */
function flattenArc(
  out: Pt[],
  p0: Pt,
  rxIn: number,
  ryIn: number,
  phiDeg: number,
  largeArc: boolean,
  sweep: boolean,
  p1: Pt,
  tol: number,
): void {
  if (p0.x === p1.x && p0.y === p1.y) return;
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) {
    out.push(p1);
    return;
  }
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx2 = (p0.x - p1.x) / 2;
  const dy2 = (p0.y - p1.y) / 2;
  const x1p = cos * dx2 + sin * dy2;
  const y1p = -sin * dx2 + cos * dy2;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (p0.x + p1.x) / 2;
  const cy = sin * cxp + cos * cyp + (p0.y + p1.y) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  else if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  // Cantidad de segmentos para que la flecha (sagitta) quede bajo la tolerancia.
  const r = Math.max(rx, ry);
  const step = tol >= r ? Math.PI / 2 : 2 * Math.acos(1 - tol / r);
  const segs = Math.max(2, Math.min(720, Math.ceil(Math.abs(dTheta) / Math.max(step, 1e-4))));
  for (let i = 1; i <= segs; i++) {
    const t = theta1 + (dTheta * i) / segs;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push(i === segs ? p1 : { x: cos * ex - sin * ey + cx, y: sin * ex + cos * ey + cy });
  }
}

/**
 * Aplana un path SVG. `tol` = error máximo admitido (en unidades del path) entre
 * la curva real y la polilínea.
 */
export function flattenPathData(d: string, tol: number): FlatSubpath[] {
  const tokens = tokenize(d);
  const subpaths: FlatSubpath[] = [];
  // El cast evita que TS lo "fije" en null: se asigna dentro de closures.
  let current = null as Pt[] | null;
  let cur: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  let lastCtrl: Pt | null = null; // último control (cúbica o cuadrática) para S/T
  let lastCmd = '';
  let i = 0;
  let cmd = '';

  const isNum = (t: Token | undefined): t is { num: number; raw: string } => !!t && 'num' in t;
  const next = (): number | null => {
    const t = tokens[i];
    if (!isNum(t)) return null;
    i++;
    return t.num;
  };
  /**
   * Lee un flag de arco (0/1). Los flags pueden venir pegados entre sí o al
   * número siguiente ("011", "01.5"): se toma el primer dígito y el resto vuelve
   * a la lista de tokens.
   */
  const nextFlag = (): number | null => {
    const t = tokens[i];
    if (!isNum(t)) return null;
    const raw = t.raw.replace(/^\+/, '');
    if (raw.length > 1 && (raw[0] === '0' || raw[0] === '1')) {
      const rest = raw.slice(1);
      tokens[i] = { num: parseFloat(rest), raw: rest };
      return raw[0] === '1' ? 1 : 0;
    }
    i++;
    return t.num ? 1 : 0;
  };

  const startSub = (p: Pt) => {
    if (current && current.length > 1) subpaths.push({ points: current, closed: false });
    current = [p];
    start = p;
  };
  const ensureSub = () => {
    if (!current) {
      current = [cur];
      start = cur;
    }
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if ('cmd' in t) {
      cmd = t.cmd;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        if (current) {
          if (current.length > 1) subpaths.push({ points: current, closed: true });
          current = null;
        }
        cur = start;
        lastCtrl = null;
        lastCmd = 'Z';
        continue;
      }
    } else if (!cmd) {
      break; // números sin comando inicial: path inválido
    }

    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? cur.x : 0;
    const oy = rel ? cur.y : 0;

    switch (C) {
      case 'M': {
        const x = next();
        const y = next();
        if (x == null || y == null) {
          i = tokens.length;
          break;
        }
        cur = { x: ox + x, y: oy + y };
        startSub(cur);
        // Pares siguientes después de M son L implícitos.
        cmd = rel ? 'l' : 'L';
        lastCtrl = null;
        break;
      }
      case 'L': {
        const x = next();
        const y = next();
        if (x == null || y == null) {
          i = tokens.length;
          break;
        }
        ensureSub();
        cur = { x: ox + x, y: oy + y };
        current!.push(cur);
        lastCtrl = null;
        break;
      }
      case 'H': {
        const x = next();
        if (x == null) {
          i = tokens.length;
          break;
        }
        ensureSub();
        cur = { x: ox + x, y: cur.y };
        current!.push(cur);
        lastCtrl = null;
        break;
      }
      case 'V': {
        const y = next();
        if (y == null) {
          i = tokens.length;
          break;
        }
        ensureSub();
        cur = { x: cur.x, y: oy + y };
        current!.push(cur);
        lastCtrl = null;
        break;
      }
      case 'C':
      case 'S': {
        let c1: Pt;
        if (C === 'C') {
          const x1 = next();
          const y1 = next();
          if (x1 == null || y1 == null) {
            i = tokens.length;
            break;
          }
          c1 = { x: ox + x1, y: oy + y1 };
        } else {
          c1 =
            lastCtrl && (lastCmd === 'C' || lastCmd === 'S')
              ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y }
              : cur;
        }
        const x2 = next();
        const y2 = next();
        const x = next();
        const y = next();
        if (x2 == null || y2 == null || x == null || y == null) {
          i = tokens.length;
          break;
        }
        ensureSub();
        const c2 = { x: ox + x2, y: oy + y2 };
        const end = { x: ox + x, y: oy + y };
        flattenCubic(current!, cur, c1, c2, end, tol);
        lastCtrl = c2;
        cur = end;
        break;
      }
      case 'Q':
      case 'T': {
        let c: Pt;
        if (C === 'Q') {
          const x1 = next();
          const y1 = next();
          if (x1 == null || y1 == null) {
            i = tokens.length;
            break;
          }
          c = { x: ox + x1, y: oy + y1 };
        } else {
          c =
            lastCtrl && (lastCmd === 'Q' || lastCmd === 'T')
              ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y }
              : cur;
        }
        const x = next();
        const y = next();
        if (x == null || y == null) {
          i = tokens.length;
          break;
        }
        ensureSub();
        const end = { x: ox + x, y: oy + y };
        flattenQuad(current!, cur, c, end, tol);
        lastCtrl = c;
        cur = end;
        break;
      }
      case 'A': {
        const rx = next();
        const ry = next();
        const rot = next();
        const large = nextFlag();
        const sweep = nextFlag();
        const x = next();
        const y = next();
        if (rx == null || ry == null || rot == null || large == null || sweep == null || x == null || y == null) {
          i = tokens.length;
          break;
        }
        ensureSub();
        const end = { x: ox + x, y: oy + y };
        flattenArc(current!, cur, rx, ry, rot, large === 1, sweep === 1, end, tol);
        cur = end;
        lastCtrl = null;
        break;
      }
      default:
        i = tokens.length;
    }
    lastCmd = C;
  }
  if (current && current.length > 1) subpaths.push({ points: current, closed: false });
  return subpaths;
}

/** Aplana una elipse (o círculo) completa centrada en (cx, cy). */
export function flattenEllipse(cx: number, cy: number, rx: number, ry: number, tol: number): Pt[] {
  const r = Math.max(rx, ry);
  if (!(r > 0)) return [];
  const step = tol >= r ? Math.PI / 2 : 2 * Math.acos(1 - tol / r);
  const segs = Math.max(8, Math.min(720, Math.ceil((2 * Math.PI) / Math.max(step, 1e-4))));
  const pts: Pt[] = [];
  for (let k = 0; k < segs; k++) {
    const t = (2 * Math.PI * k) / segs;
    pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return pts;
}

/** Rectángulo SVG (con esquinas redondeadas opcionales rx/ry). */
export function flattenRect(x: number, y: number, w: number, h: number, rxIn: number, ryIn: number, tol: number): Pt[] {
  if (!(w > 0) || !(h > 0)) return [];
  let rx = Math.max(0, rxIn);
  let ry = Math.max(0, ryIn);
  if (rx === 0 && ry > 0) rx = ry;
  if (ry === 0 && rx > 0) ry = rx;
  rx = Math.min(rx, w / 2);
  ry = Math.min(ry, h / 2);
  if (rx === 0 || ry === 0) {
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  }
  const d = [
    `M${x + rx},${y}`,
    `H${x + w - rx}`,
    `A${rx},${ry} 0 0 1 ${x + w},${y + ry}`,
    `V${y + h - ry}`,
    `A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}`,
    `H${x + rx}`,
    `A${rx},${ry} 0 0 1 ${x},${y + h - ry}`,
    `V${y + ry}`,
    `A${rx},${ry} 0 0 1 ${x + rx},${y}`,
    'Z',
  ].join(' ');
  return flattenPathData(d, tol)[0]?.points ?? [];
}

/** Comando de path en forma absoluta y canónica (H/V → L, S → C, T → Q). Conserva las curvas tal cual. */
export interface AbsSegment {
  c: 'M' | 'L' | 'C' | 'Q' | 'A' | 'Z';
  v: number[];
}

/**
 * Pasa un `d` a sub-trayectos con comandos absolutos, para poder mover uno sin
 * tocar los demás (en un path compuesto, un `m` relativo depende del anterior).
 */
export function absoluteSubpaths(d: string): AbsSegment[][] {
  const tokens = tokenize(d);
  const subs: AbsSegment[][] = [];
  let current = null as AbsSegment[] | null;
  let cur: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  let lastCtrl: Pt | null = null;
  let lastCmd = '';
  let i = 0;
  let cmd = '';
  const isNum = (t: Token | undefined): t is { num: number; raw: string } => !!t && 'num' in t;
  const next = (): number | null => {
    const t = tokens[i];
    if (!isNum(t)) return null;
    i++;
    return t.num;
  };
  const nextFlag = (): number | null => {
    const t = tokens[i];
    if (!isNum(t)) return null;
    const raw = t.raw.replace(/^\+/, '');
    if (raw.length > 1 && (raw[0] === '0' || raw[0] === '1')) {
      const rest = raw.slice(1);
      tokens[i] = { num: parseFloat(rest), raw: rest };
      return raw[0] === '1' ? 1 : 0;
    }
    i++;
    return t.num ? 1 : 0;
  };
  const begin = (p: Pt) => {
    current = [{ c: 'M', v: [p.x, p.y] }];
    subs.push(current);
    start = p;
  };
  const push = (seg: AbsSegment) => {
    if (!current) begin(cur);
    current!.push(seg);
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if ('cmd' in t) {
      cmd = t.cmd;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        if (current) {
          current.push({ c: 'Z', v: [] });
          current = null;
        }
        cur = start;
        lastCtrl = null;
        lastCmd = 'Z';
        continue;
      }
    } else if (!cmd) {
      break;
    }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? cur.x : 0;
    const oy = rel ? cur.y : 0;
    let ok = true;
    switch (C) {
      case 'M': {
        const x = next();
        const y = next();
        if (x == null || y == null) {
          ok = false;
          break;
        }
        cur = { x: ox + x, y: oy + y };
        begin(cur);
        cmd = rel ? 'l' : 'L';
        lastCtrl = null;
        break;
      }
      case 'L':
      case 'H':
      case 'V': {
        const a = next();
        const b = C === 'L' ? next() : 0;
        if (a == null || b == null) {
          ok = false;
          break;
        }
        cur = C === 'L' ? { x: ox + a, y: oy + b } : C === 'H' ? { x: ox + a, y: cur.y } : { x: cur.x, y: oy + a };
        push({ c: 'L', v: [cur.x, cur.y] });
        lastCtrl = null;
        break;
      }
      case 'C':
      case 'S': {
        let c1: Pt;
        if (C === 'C') {
          const x1 = next();
          const y1 = next();
          if (x1 == null || y1 == null) {
            ok = false;
            break;
          }
          c1 = { x: ox + x1, y: oy + y1 };
        } else {
          c1 =
            lastCtrl && (lastCmd === 'C' || lastCmd === 'S')
              ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y }
              : cur;
        }
        const x2 = next();
        const y2 = next();
        const x = next();
        const y = next();
        if (x2 == null || y2 == null || x == null || y == null) {
          ok = false;
          break;
        }
        const c2 = { x: ox + x2, y: oy + y2 };
        cur = { x: ox + x, y: oy + y };
        push({ c: 'C', v: [c1.x, c1.y, c2.x, c2.y, cur.x, cur.y] });
        lastCtrl = c2;
        break;
      }
      case 'Q':
      case 'T': {
        let c: Pt;
        if (C === 'Q') {
          const x1 = next();
          const y1 = next();
          if (x1 == null || y1 == null) {
            ok = false;
            break;
          }
          c = { x: ox + x1, y: oy + y1 };
        } else {
          c =
            lastCtrl && (lastCmd === 'Q' || lastCmd === 'T')
              ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y }
              : cur;
        }
        const x = next();
        const y = next();
        if (x == null || y == null) {
          ok = false;
          break;
        }
        cur = { x: ox + x, y: oy + y };
        push({ c: 'Q', v: [c.x, c.y, cur.x, cur.y] });
        lastCtrl = c;
        break;
      }
      case 'A': {
        const rx = next();
        const ry = next();
        const rot = next();
        const large = nextFlag();
        const sweep = nextFlag();
        const x = next();
        const y = next();
        if (rx == null || ry == null || rot == null || large == null || sweep == null || x == null || y == null) {
          ok = false;
          break;
        }
        cur = { x: ox + x, y: oy + y };
        push({ c: 'A', v: [rx, ry, rot, large, sweep, cur.x, cur.y] });
        lastCtrl = null;
        break;
      }
      default:
        ok = false;
    }
    if (!ok) break;
    lastCmd = C;
  }
  return subs;
}

export function translateSegments(segs: AbsSegment[], dx: number, dy: number): AbsSegment[] {
  return segs.map((s) => {
    if (s.c === 'Z') return s;
    const v = [...s.v];
    if (s.c === 'A') {
      v[5] += dx;
      v[6] += dy;
    } else {
      for (let k = 0; k + 1 < v.length; k += 2) {
        v[k] += dx;
        v[k + 1] += dy;
      }
    }
    return { c: s.c, v };
  });
}

const fmtNum = (n: number) => {
  const s = n.toFixed(4);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
};

export function segmentsToD(subs: AbsSegment[][]): string {
  return subs
    .map((segs) => segs.map((s) => (s.c === 'Z' ? 'Z' : `${s.c}${s.v.map(fmtNum).join(' ')}`)).join(''))
    .join('');
}

/** Lista de puntos de <polygon>/<polyline>. */
export function parsePointList(raw: string): Pt[] {
  const nums = (raw.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);
  const pts: Pt[] = [];
  for (let k = 0; k + 1 < nums.length; k += 2) pts.push({ x: nums[k], y: nums[k + 1] });
  return pts;
}
