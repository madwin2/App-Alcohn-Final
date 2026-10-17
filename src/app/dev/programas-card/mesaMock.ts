/** Datos ficticios para el prototipo de la mesa de armado. Sin red ni base. */
import { addDays, format } from 'date-fns';
import type { MesaSource } from '@/lib/programas/mesa';

const FONT: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'], L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'], N: ['110', '101', '101', '101', '101'], O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'], R: ['110', '101', '110', '101', '101'], S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'], U: ['101', '101', '101', '101', '111'],
};

/** Sello con marco y dos iniciales en bloques: geometría real para el chequeo de fresa. */
export function mockStampSvg(initials: string, w: number, h: number): string {
  const frame = Math.max(0.8, Math.min(w, h) * 0.06);
  const letters = initials.toUpperCase().split('').filter((c) => FONT[c]).slice(0, 2);
  const cell = Math.min((w - 4 * frame) / (letters.length * 4), (h - 4 * frame) / 6);
  const totalW = letters.length * 4 * cell - cell;
  const x0 = (w - totalW) / 2, y0 = (h - 5 * cell) / 2;
  const squares: string[] = [];
  letters.forEach((ch, li) => FONT[ch].forEach((row, ry) => row.split('').forEach((bit, rx) => {
    if (bit !== '1') return;
    const x = x0 + (li * 4 + rx) * cell, y = y0 + ry * cell;
    squares.push(`M${x.toFixed(2)} ${y.toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h${(-cell).toFixed(2)}Z`);
  })));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">`
    + `<path fill-rule="evenodd" d="M0 0H${w}V${h}H0Z M${frame} ${frame}V${h - frame}H${w - frame}V${frame}Z"/>`
    + `<path d="${squares.join('')}"/></svg>`;
}

const RAW: [string, number, number, string, number | null, number, boolean?][] = [
  // nombre, ancho, largo, tipo, planchuela, vence en días, prioritario
  ['Panadería Sol', 22, 45, 'Alimento', 25, 0, true],
  ['Estudio Luna', 12, 30, 'Clasico', 19, 3],
  ['Taller Río', 14, 35, '3mm', 19, 5],
  ['Café Norte', 20, 40, 'Clasico', 25, 2],
  ['Marca Ocre', 8, 25, 'Clasico', 12, 6],
  ['Hornos del Sur', 32, 50, 'Alimento', 38, 1, true],
  ['Cuero Hábil', 30, 45, 'Clasico', 38, 8],
  ['Bodega Uno', 9, 30, '3mm', 12, 4],
  ['Granja Pampa', 18, 18, 'Alimento', 19, 9],
  ['Atelier Mora', 24, 60, 'Clasico', 25, 12],
  ['Dulce Rosa', 16, 40, 'Clasico', 19, 7],
  ['Ferretería Tano', 36, 70, '3mm', 38, 10],
  ['Sellos Pampa', 11, 28, 'Clasico', 12, -1],
  ['Herrería Gómez', 25, 25, '3mm', 25, 14],
  ['Mate Bueno', 13, 33, 'Clasico', 19, 5],
  ['Lienzo Fino', 60, 60, 'Clasico', 63, 6],
  ['Rancho Alto', 34, 40, 'Clasico', 38, 15],
  ['Pan de Campo', 20, 30, 'Alimento', 25, 3],
];

export function mockQueue(today = new Date()): MesaSource[] {
  return RAW.map(([name, w, h, tipo, plan, due, priority], i) => {
    const words = name.split(' ').filter((x) => x.length > 2);
    const initials = (words[0]?.[0] ?? 'A') + (words[1]?.[0] ?? words[0]?.[1] ?? 'B');
    return {
      id: `mesa-${i}`, designName: name, widthMm: w, heightMm: h, stampType: tipo, tipoPlanchuela: plan,
      vectorPreviewUrl: `data:image/svg+xml,${encodeURIComponent(mockStampSvg(initials.normalize('NFD').replace(/[^A-Za-z]/g, ''), w, h))}`,
      isPriority: !!priority,
      deadlineAt: format(addDays(today, due), 'yyyy-MM-dd'),
      orderDate: format(addDays(today, due - 20), 'yyyy-MM-dd'),
    };
  });
}
