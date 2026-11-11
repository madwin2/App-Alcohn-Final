import { emptyDocument, columnUsage, addStamp, columnStamps, type MesaSource } from '../src/lib/programas/mesa';

const src = (id: string, w: number, h: number): MesaSource => ({
  id, designName: id, widthMm: w, heightMm: h, stampType: 'Clasico', tipoPlanchuela: 38, vectorPreviewUrl: `https://x/${id}.svg`,
});

let d = emptyDocument('p1', 'C');
console.log('span', d.columns.find((c) => c.id === 'p38')!.topY - d.columns.find((c) => c.id === 'p38')!.bottomY);

// Dims reales 29 OCT P38 (fab short×long)
for (const [id, w, h] of [
  ['Stella', 36.48, 58.71],
  ['RC', 36.5, 53.29],
  ['Aires', 34.66, 40],
  ['Antonio', 30.65, 70.94],
  ['Vaca', 25.66, 40],
  ['SX', 26.42, 30],
] as const) {
  const r = addStamp(d, src(id, w, h));
  console.log(id, r.added, r.added ? '' : r.reason);
  if (!r.added) process.exit(1);
  d = r.doc;
}
console.log('usage', columnUsage(d).find((x) => x.columnId === 'p38'));
console.log('heights', columnStamps(d, 'p38').map((s) => `${s.name}:${s.widthMm}×${s.heightMm}`));
const r = addStamp(d, src('BG', 28.77, 55));
console.log('BG', r.added, r.added ? '' : r.reason);
