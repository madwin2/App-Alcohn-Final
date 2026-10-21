// Genera la placa de prueba de mecanizado (34 × 34 mm). Ver README.md.
// Negro = relieve (lo que queda y marca); blanco = lo que saca la fresa.
//
// Uso (Windows, con las fuentes del sistema):
//   npm i --no-save opentype.js@1.3.4
//   node prueba-mecanizado/generar-placa.mjs prueba-mecanizado
import opentype from 'opentype.js';
import { writeFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'prueba-mecanizado';
const W = 36, H = 36;
const times = opentype.loadSync('C:/Windows/Fonts/times.ttf');
const arialB = opentype.loadSync('C:/Windows/Fonts/arialbd.ttf');

const f = (n) => +n.toFixed(4);
const rect = (x, y, w, h) => `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}z`;
const circle = (cx, cy, r) =>
  `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0z`;
const poly = (pts) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}z`;

/** Texto como trazos; `cap` = alto de la mayúscula en mm. Devuelve { d, width }. */
function text(font, str, x, baseline, cap) {
  const ratio = font.tables.os2.sCapHeight / font.unitsPerEm;
  const size = cap / ratio;
  const path = font.getPath(str, x, baseline, size);
  const width = font.getAdvanceWidth(str, size);
  return { d: path.toPathData(4), width };
}

const paths = []; // { d, evenodd }
const add = (d, evenodd = false) => paths.push({ d, evenodd });

const X0 = 4.2, X1 = 35; // zona de pruebas (a la izquierda, las letras de fila)
const N = 8;
const pitch = (X1 - X0) / N;
const cx = (i) => X0 + pitch * (i + 0.5);

function rowLabel(letter, yTop, h) {
  const t = text(arialB, letter, 1, yTop + h / 2 + 0.7, 1.4);
  add(t.d);
}

// A · espacio entre trazos (dos barras negras de 0,7 mm con un hueco blanco)
{
  const y = 1.2, h = 4, bar = 0.7;
  const gaps = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.55, 0.8];
  rowLabel('A', y, h);
  gaps.forEach((g, i) => {
    const w = 2 * bar + g;
    const x = cx(i) - w / 2;
    add(rect(x, y, bar, h));
    add(rect(x + bar + g, y, bar, h));
  });
}

// B · grosor de trazo (líneas negras sueltas)
{
  const y = 6.4, h = 4;
  const ws = [0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8];
  rowLabel('B', y, h);
  ws.forEach((w, i) => add(rect(cx(i) - w / 2, y, w, h)));
}

// C · ojos (agujero blanco redondo dentro de un cuadrado negro)
{
  const y = 11.6, s = 2.8;
  const ds = [0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0];
  rowLabel('C', y, s);
  ds.forEach((d, i) => add(rect(cx(i) - s / 2, y, s, s) + circle(cx(i), y + s / 2, d / 2), true));
}

// D · recovecos: ranura en V blanca dentro de negro (1-4) y punta negra (5-8)
{
  const y = 15.6, h = 3.2, angs = [20, 30, 45, 60];
  rowLabel('D', y, h);
  angs.forEach((a, i) => {
    const bw = 3.2, depth = 2.6;
    const half = depth * Math.tan(((a / 2) * Math.PI) / 180);
    const x = cx(i) - bw / 2, c = cx(i);
    add(poly([[x, y], [c - half, y], [c, y + depth], [c + half, y], [x + bw, y], [x + bw, y + h], [x, y + h]]));
  });
  angs.forEach((a, i) => {
    const tall = 3.0;
    const half = tall * Math.tan(((a / 2) * Math.PI) / 180);
    const c = cx(i + 4);
    add(poly([[c, y], [c + half, y + tall], [c - half, y + tall]]));
  });
}

// E y F · letras Times (negras), por alto de mayúscula
function textRow(letter, y, caps, word) {
  const maxCap = Math.max(...caps);
  rowLabel(letter, y, maxCap * 1.35);
  const baseline = y + maxCap;
  const parts = caps.map((c) => ({ c, t: text(times, word, 0, 0, c) }));
  const total = parts.reduce((s, p) => s + p.t.width, 0);
  const gap = (X1 - X0 - total) / (parts.length - 1);
  if (gap < 1) throw new Error(`Fila ${letter}: no entra (${total.toFixed(2)} mm)`);
  let x = X0;
  for (const p of parts) {
    add(text(times, word, x, baseline, p.c).d);
    x += p.t.width + gap;
  }
}
textRow('E', 19.8, [1.0, 1.3, 1.6, 2.0], 'Rabe');
textRow('F', 23.4, [2.5, 3.2], 'Rabeg8');

// G · uso real (cuero y madera): lleno, rayado fino y letras blancas en negro
{
  const y = 29.6, h = 5.6;
  rowLabel('G', y, h);
  // 1 · lleno negro
  add(rect(X0, y, 6, h));
  // 2 · rayado: 0,4 negro / 0,5 blanco
  for (let x = X0 + 7; x + 0.4 <= X0 + 13.2; x += 0.9) add(rect(x, y, 0.4, h));
  // 3 · letras blancas (huecas) en un bloque negro
  const bx = X0 + 14.2, bw = X1 - bx;
  const t = text(times, 'ALCOHN', 0, 0, 2.6);
  const tx = bx + (bw - t.width) / 2;
  add(rect(bx, y, bw, h) + text(times, 'ALCOHN', tx, y + h / 2 + 1.3, 2.6).d, true);
}

const body = paths
  .map((p) => `<path fill="#000000"${p.evenodd ? ' fill-rule="evenodd"' : ''} d="${p.d}"/>`)
  .join('\n');
// El dibujo ocupa exacto 34 × 34 mm (x de 1 a 35, y de 1,2 a 35,2): la app y el
// gadget encajan la caja del dibujo en la medida del sello; así no se escala.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34mm" height="34mm" viewBox="1 1.2 34 34" version="1.1">\n${body}\n</svg>\n`;
writeFileSync(`${OUT}/placa-prueba-34x34.svg`, svg);
console.log('ok', paths.length, 'trazos');
