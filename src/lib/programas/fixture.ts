/**
 * Geometría de la fijación (soporte) de cada máquina, en mm.
 *
 * Fuente para C: «Base Fijacion sellos STK v2 23 06 24.svg» (el mismo dibujo
 * que se importa en el archivo base de Aspire). Perfil: base de 16,3 mm, un
 * canal de 19 × 7,6 mm a cada lado de cada planchuela (compartido cuando dos
 * planchuelas están a 19 mm) donde van las trabas móviles que las aprietan;
 * planchuelas de 11,1 mm de alto. Vista superior: 296 × 416 mm, ranura de
 * 7 mm partida en dos tramos dentro de cada canal y regla en cm.
 *
 * Mundo: origen en la esquina superior izquierda de la base, x a la derecha,
 * y hacia abajo (como se ve la máquina), z hacia arriba desde la cara de la
 * base. Aspire: x igual (corrido `offsetX`), y negativa hacia abajo.
 */
import type { PreparationMachine, SupportColumn } from './preparation';

export const FIXTURE = {
  plateThicknessMm: 16.34,
  channelWidthMm: 19,
  channelDepthMm: 7.64,
  slotWidthMm: 7,
  barHeightMm: 11.13,
  /** Alto de la traba sobre la cara de la base (las trabas no llegan a la cara del bronce). */
  clampHeightMm: 6.5,
  /** Margen de la base alrededor de los canales extremos. */
  sideMarginMm: 18.9,
};

/** C: la base del SVG va de x=65,58 a 361,58 y las planchuelas de Aspire están corridas 0,22 mm. */
const KNOWN: Partial<Record<PreparationMachine, { widthMm: number; heightMm: number; offsetX: number; drawing: true }>> = {
  C: { widthMm: 296, heightMm: 416, offsetX: 0.22, drawing: true },
};

export interface Rect { x0: number; x1: number; y0: number; y1: number }
export interface FixtureModel {
  machine: PreparationMachine;
  widthMm: number;
  heightMm: number;
  /** worldX = aspireX + offsetX; worldY = -aspireY. */
  offsetX: number;
  /** Hay dibujo real de la base (regla, agujeros) para esta máquina. */
  hasDrawing: boolean;
  bars: (Rect & { columnId: string; nominalMm: number })[];
  channels: Rect[];
  slots: Rect[];
  /** Trabas móviles: una por tramo de ranura, a lo largo del canal. */
  clamps: Rect[];
}

const EPS = 0.6;

export function buildFixture(machine: PreparationMachine, columns: SupportColumn[]): FixtureModel {
  const known = KNOWN[machine];
  const offsetX = known?.offsetX ?? 0;
  const bars = [...columns].sort((a, b) => a.centerX - b.centerX).map((c) => ({
    columnId: c.id, nominalMm: c.nominalMm,
    x0: c.centerX + offsetX - c.nominalMm / 2, x1: c.centerX + offsetX + c.nominalMm / 2,
    y0: -c.topY, y1: -c.bottomY,
  }));
  const W = FIXTURE.channelWidthMm;
  const channels: Rect[] = [];
  const heightMm = known?.heightMm ?? Math.ceil(Math.max(...bars.map((b) => b.y1)) + 16);
  const add = (x0: number) => {
    const prev = channels[channels.length - 1];
    if (prev && x0 < prev.x1 - EPS) return; // ya lo cubre el canal compartido
    channels.push({ x0, x1: x0 + W, y0: 0, y1: heightMm });
  };
  for (const b of bars) { add(b.x0 - W); add(b.x1); }
  const minX = channels.length ? channels[0].x0 - FIXTURE.sideMarginMm : 0;
  const maxX = channels.length ? channels[channels.length - 1].x1 + FIXTURE.sideMarginMm : 100;
  // Sin dibujo real: base generada alrededor de los canales, con origen en su borde.
  const shift = known ? 0 : -minX;
  const sx = (r: Rect) => ({ ...r, x0: r.x0 + shift, x1: r.x1 + shift });
  const ch = channels.map(sx);
  const mid = heightMm / 2;
  const slots = ch.flatMap((c) => {
    const cx = (c.x0 + c.x1) / 2, half = FIXTURE.slotWidthMm / 2;
    return [{ x0: cx - half, x1: cx + half, y0: 8.6, y1: mid - 4 }, { x0: cx - half, x1: cx + half, y0: mid + 4, y1: heightMm - 8.6 }];
  });
  const clamps = ch.flatMap((c) => [
    { x0: c.x0 + 0.5, x1: c.x1 - 0.5, y0: 14, y1: mid - 10 },
    { x0: c.x0 + 0.5, x1: c.x1 - 0.5, y0: mid + 10, y1: heightMm - 14 },
  ]);
  return {
    machine, widthMm: known?.widthMm ?? maxX - minX, heightMm, offsetX: offsetX + shift, hasDrawing: !!known,
    bars: bars.map((b) => ({ ...b, x0: b.x0 + shift, x1: b.x1 + shift })), channels: ch, slots, clamps,
  };
}

export const toWorld = (f: FixtureModel, aspireX: number, aspireY: number) => ({ x: aspireX + f.offsetX, y: -aspireY });
export const toAspire = (f: FixtureModel, worldX: number, worldY: number) => ({ x: worldX - f.offsetX, y: -worldY });
