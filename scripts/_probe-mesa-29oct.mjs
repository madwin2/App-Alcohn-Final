/**
 * Solo lectura: calcula libres reales del programa «29 OCT x19 C».
 * Uso: node scripts/_probe-mesa-29oct.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    try {
      const raw = readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (!process.env[m[1]]) process.env[m[1]] = v;
      }
    } catch {
      /* archivo ausente */
    }
  }
}
loadEnv();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Falta VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
const sb = createClient(url, key);

const GAP = 8;
const WIDTH_TOL = 0.05;

const { data: programas, error: pErr } = await sb
  .from('programa')
  .select('id, nombre, maquina, fecha, cantidad_sellos')
  .ilike('nombre', '%29 OCT%x19%C%')
  .order('created_at', { ascending: false })
  .limit(5);
if (pErr) throw pErr;
console.log('Programas:', programas);

const prog = programas?.[0];
if (!prog) {
  const { data: alt } = await sb.from('programa').select('id, nombre, maquina, fecha, cantidad_sellos')
    .ilike('nombre', '%29%OCT%').eq('maquina', 'C').order('created_at', { ascending: false }).limit(10);
  console.log('Alternativas 29 OCT C:', alt);
  process.exit(1);
}

const { data: sellos, error: sErr } = await sb
  .from('sellos')
  .select('id, diseno, tipo, tipo_planchuela, ancho_real, largo_real, ancho_fabricacion_mm, largo_fabricacion_mm, estado_fabricacion, programa_id')
  .eq('programa_id', prog.id);
if (sErr) throw sErr;

const { data: prepRows, error: prepErr } = await sb
  .from('programa_preparacion')
  .select('programa_id, revision, documento')
  .eq('programa_id', prog.id)
  .maybeSingle();
if (prepErr) console.warn('prep:', prepErr);

console.log('\n===', prog.nombre, prog.id, '===');
console.log('Sellos asignados DB:', sellos?.length);

function dims(s) {
  const w = s.ancho_fabricacion_mm != null ? Number(s.ancho_fabricacion_mm) : (s.ancho_real != null ? Number(s.ancho_real) * 10 : 0);
  const h = s.largo_fabricacion_mm != null ? Number(s.largo_fabricacion_mm) : (s.largo_real != null ? Number(s.largo_real) * 10 : 0);
  return { short: Math.min(w, h), long: Math.max(w, h), w, h };
}

console.log('\nSellos DB (short×long → planchuela):');
for (const s of sellos || []) {
  const d = dims(s);
  console.log(`  ${s.diseno || s.id}: ${d.short.toFixed(2)}×${d.long.toFixed(2)} fab=(${d.w},${d.h}) tipo_p=${s.tipo_planchuela} estado=${s.estado_fabricacion}`);
}

const doc = prepRows?.documento;
if (!doc) {
  console.log('\nSin documento de preparación guardado.');
  // Estimación solo con DB + planchuela por lado corto
  const cols = {
    12: { usable: 11.5, span: 400 - 8.958 },
    19: { usable: 18, span: 400 - 8.958 },
    25: { usable: 24, span: 400 - 8.958 },
    38: { usable: 36.5, span: 400 - 8.958 },
  };
  const buckets = { 12: [], 19: [], 25: [], 38: [] };
  for (const s of sellos || []) {
    const d = dims(s);
    let p = s.tipo_planchuela;
    if (!p) {
      if (d.short <= 11.5) p = 12;
      else if (d.short <= 18) p = 19;
      else if (d.short <= 24) p = 25;
      else p = 38;
    }
    if (!buckets[p]) p = 38;
    buckets[p].push({ name: s.diseno, ...d });
  }
  for (const [p, list] of Object.entries(buckets)) {
    const span = cols[p].span;
    const used = list.reduce((sum, s, i) => sum + s.long + (i < list.length - 1 ? GAP : 0), 0);
    const free = Math.max(0, span - used - (list.length ? GAP : 0));
    console.log(`P${p}: n=${list.length} used=${used.toFixed(1)} free≈${free.toFixed(1)} | ${list.map((s) => `${s.name}:${s.long.toFixed(1)}`).join(', ')}`);
  }
  process.exit(0);
}

console.log('\nPreparación revision', prepRows.revision, 'gapMm', doc.gapMm);
console.log('Columnas:');
for (const c of doc.columns || []) {
  const span = c.topY - c.bottomY;
  console.log(`  ${c.id}: nominal=${c.nominalMm} usable=${c.usableMm} top=${c.topY} bottom=${c.bottomY} span=${span.toFixed(3)} available=${c.available}`);
}

const active = (doc.stamps || []).filter((s) => !s.excluded);
console.log('\nSellos en mesa (preparation):', active.length);
const byCol = new Map();
for (const s of active) {
  const list = byCol.get(s.columnId) || [];
  list.push(s);
  byCol.set(s.columnId, list);
}

for (const [colId, stamps] of byCol) {
  const col = (doc.columns || []).find((c) => c.id === colId);
  if (!col) continue;
  stamps.sort((a, b) => b.topY - a.topY);
  const total = col.topY - col.bottomY;
  const used = stamps.reduce((sum, s, i) => sum + s.heightMm + (i < stamps.length - 1 ? GAP : 0), 0);
  const free = Math.max(0, Math.floor((total - used - (stamps.length ? GAP : 0)) * 10) / 10);
  console.log(`\n--- ${colId} (P${col.nominalMm}) ---`);
  console.log(`  count=${stamps.length} totalSpan=${total.toFixed(3)} used(altos+gaps)=${used.toFixed(3)} freeMm(formula)=${free}`);
  let top = col.topY;
  for (const s of stamps) {
    const overWidth = s.widthMm > col.usableMm + WIDTH_TOL;
    console.log(`  ${s.name}: w=${s.widthMm} h=${s.heightMm} topY=${s.topY} bottom=${(s.topY - s.heightMm).toFixed(3)} packedWouldTop=${top.toFixed(3)} ${overWidth ? 'WIDTH_OVER' : ''}`);
    top -= s.heightMm + GAP;
  }
  const lastBottomIfPacked = top + GAP; // after loop, top is after last gap
  // recompute pack last bottom
  let t = col.topY;
  for (let i = 0; i < stamps.length; i++) {
    t -= stamps[i].heightMm;
    if (i < stamps.length - 1) t -= GAP;
  }
  console.log(`  lastBottom if repacked=${t.toFixed(3)} col.bottomY=${col.bottomY} overflows=${t < col.bottomY - 0.01}`);
  console.log(`  ¿Entra sello h=55? ${free >= 55 ? 'SÍ' : 'NO'} (free=${free})`);
  console.log(`  ¿Entra sello h=53.29? ${free >= 53.29 ? 'SÍ' : 'NO'}`);
}

// Simular add de 55 mm en cada columna donde ancho 28.77 entre
console.log('\n=== Simulación add 28.77×55 ===');
for (const col of doc.columns || []) {
  if (!col.available) continue;
  if (28.77 > col.usableMm + WIDTH_TOL) {
    console.log(`  ${col.id}: ancho no entra`);
    continue;
  }
  const stamps = [...(byCol.get(col.id) || [])].sort((a, b) => b.topY - a.topY);
  const row = [...stamps, { heightMm: 55, widthMm: 28.77, name: 'PROBE' }];
  let t = col.topY;
  for (let i = 0; i < row.length; i++) {
    const top = t;
    t -= row[i].heightMm;
    const bottom = t;
    if (i < row.length - 1) t -= GAP;
    if (i === row.length - 1) {
      const ok = bottom >= col.bottomY - 0.01;
      console.log(`  ${col.id}: after probe lastBottom=${bottom.toFixed(3)} ok=${ok}`);
    }
  }
}
