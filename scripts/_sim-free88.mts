import { addStamp, columnUsage, emptyDocument, type MesaSource } from '../src/lib/programas/mesa';

const src = (id: string, w: number, h: number): MesaSource => ({
  id, designName: id, widthMm: w, heightMm: h, stampType: 'Clasico', tipoPlanchuela: 38, vectorPreviewUrl: `https://x/${id}.svg`,
});

let doc = emptyDocument('p', 'C');
for (const [id, w, h] of [
  ['Stella', 36.48, 58.71],
  ['RC', 36.5, 53.29],
  ['Aires', 34.66, 40],
  ['Antonio', 30.65, 70.94],
  ['Vaca', 25.66, 40],
] as const) {
  const r = addStamp(doc, src(id, w, h));
  console.log(id, r.added, r.added ? '' : r.reason);
  if (!r.added) process.exit(1);
  doc = r.doc;
}
console.log('usage', columnUsage(doc).find((u) => u.columnId === 'p38'));
const r = addStamp(doc, src('BG', 28.77, 55));
console.log('BG', r.added, r.added ? '' : r.reason);

// Con los 6 (incluye SX 30) — caso DB completo
doc = emptyDocument('p', 'C');
for (const [id, w, h] of [
  ['Stella', 36.48, 58.71],
  ['RC', 36.5, 53.29],
  ['Aires', 34.66, 40],
  ['Antonio', 30.65, 70.94],
  ['Vaca', 25.66, 40],
  ['SX', 26.42, 30],
] as const) {
  doc = addStamp(doc, src(id, w, h)).doc;
}
console.log('usage6', columnUsage(doc).find((u) => u.columnId === 'p38'));
const r6 = addStamp(doc, src('BG2', 28.77, 55));
console.log('BG con 6', r6.added, r6.added ? '' : r6.reason);
