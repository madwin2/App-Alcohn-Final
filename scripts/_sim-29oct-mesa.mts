/**
 * Simula placeSources + addStamp del programa 29 OCT x19 C con dims de DB.
 * npx tsx scripts/_sim-29oct-mesa.mts
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { addStamp, columnUsage, emptyDocument, maxAddableHeightMm, placeSources, type MesaSource } from '../src/lib/programas/mesa';

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
    } catch { /* */ }
  }
}
loadEnv();

const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
const { data: programas } = await sb.from('programa').select('id, nombre, maquina')
  .ilike('nombre', '%29 OCT%x19%C%').limit(1);
const prog = programas![0];
const { data: sellos } = await sb.from('sellos')
  .select('id, diseno, tipo, tipo_planchuela, ancho_real, largo_real, ancho_fabricacion_mm, largo_fabricacion_mm')
  .eq('programa_id', prog.id);

const sources: MesaSource[] = (sellos || []).map((s) => {
  const w = s.ancho_fabricacion_mm != null ? Number(s.ancho_fabricacion_mm) : (s.ancho_real != null ? Number(s.ancho_real) * 10 : 50);
  const h = s.largo_fabricacion_mm != null ? Number(s.largo_fabricacion_mm) : (s.largo_real != null ? Number(s.largo_real) * 10 : 30);
  return {
    id: s.id,
    designName: s.diseno || s.id,
    widthMm: w,
    heightMm: h,
    stampType: 'Clasico',
    tipoPlanchuela: s.tipo_planchuela != null ? Number(s.tipo_planchuela) : undefined,
    vectorPreviewUrl: `https://x/${s.id}.svg`,
  };
});

let doc = placeSources(emptyDocument(prog.id, 'C'), sources);
console.log('Programa:', prog.nombre, 'sellos:', sources.length);
for (const u of columnUsage(doc)) {
  const stamps = doc.stamps.filter((s) => s.columnId === u.columnId && !s.excluded);
  console.log(`P${u.nominalMm}: count=${u.count} used=${u.usedMm.toFixed(1)} free=${u.freeMm} total=${u.totalMm.toFixed(1)}`);
  console.log('  ', stamps.map((s) => `${s.name}:${s.widthMm}×${s.heightMm}`).join(' | '));
}

// Buscar BG grande en cola (no asignado)
const { data: bg } = await sb.from('sellos')
  .select('id, diseno, ancho_fabricacion_mm, largo_fabricacion_mm, ancho_real, largo_real, estado_fabricacion, programa_id')
  .ilike('diseno', '%BG%')
  .order('created_at', { ascending: false })
  .limit(10);
console.log('\nCandidatos BG:', bg);

for (const s of bg || []) {
  const w = s.ancho_fabricacion_mm != null ? Number(s.ancho_fabricacion_mm) : (s.ancho_real != null ? Number(s.ancho_real) * 10 : 50);
  const h = s.largo_fabricacion_mm != null ? Number(s.largo_fabricacion_mm) : (s.largo_real != null ? Number(s.largo_real) * 10 : 30);
  const src: MesaSource = {
    id: `probe-${s.id}`,
    designName: s.diseno || 'BG',
    widthMm: w,
    heightMm: h,
    stampType: 'Clasico',
    vectorPreviewUrl: 'https://x/bg.svg',
  };
  const r = addStamp(doc, src);
  const free38 = maxAddableHeightMm(doc, 'p38');
  console.log(`\nAdd ${s.diseno} ${w}×${h} (orient→ ${Math.min(w,h)}×${Math.max(w,h)}): added=${r.added} reason=${!r.added ? r.reason : 'ok'} | freeP38=${free38}`);
}

// Forzar add 28.77×55
const probe: MesaSource = {
  id: 'probe-55',
  designName: 'PROBE55',
  widthMm: 28.77,
  heightMm: 55,
  stampType: 'Clasico',
  vectorPreviewUrl: 'https://x/p.svg',
};
const r55 = addStamp(doc, probe);
console.log(`\nAdd 28.77×55: added=${r55.added} ${r55.added ? '' : r55.reason}`);
const r55direct = addStamp(doc, probe, { columnId: 'p38', topY: -999 });
console.log(`Add direct p38: added=${r55direct.added} ${r55direct.added ? '' : r55direct.reason}`);
