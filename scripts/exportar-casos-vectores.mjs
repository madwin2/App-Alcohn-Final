/**
 * Exporta casos reales del registro de ediciones (`vector_ediciones`) como
 * casos de prueba de la corrección automática (PLAN_CORRECCION_AUTONOMA_VECTORES §5).
 *
 * Solo LEE de la base (producción). Baja el vector original y el que se guardó
 * de cada caso a `src/lib/fresa/__fixtures__/casos/<id>/` (original.svg,
 * final.svg, caso.json). Después, `npm test -- casosReales` corre la
 * automática contra todos y avisa si alguno empeora.
 *
 * Uso:
 *   node scripts/exportar-casos-vectores.mjs [--desde 2026-10-01] [--max 200] [--out carpeta]
 *
 * Necesita VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env / .env.local
 * (la tabla solo se lee con usuario o con la clave de servicio).
 */
import fs from 'fs';
import path from 'path';

function loadEnv(file) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

loadEnv('.env');
loadEnv('.env.local');

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const desde = arg('desde', '2000-01-01');
const max = Number(arg('max', '200'));
const out = arg('out', 'src/lib/fresa/__fixtures__/casos');

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Falta VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env/.env.local');
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

// Casos útiles: había algo para corregir y quedó una versión buena (aceptada o editada a mano).
const params = new URLSearchParams({
  select: 'id,created_at,tipo_caso,resultado,eleccion,tipo_sello,alimento,svg_original_path,svg_final_path,chequeo_original,chequeo_final',
  resultado: 'in.(aceptada,editada)',
  tipo_caso: 'neq.sin_problemas',
  created_at: `gte.${desde}`,
  order: 'created_at.desc',
  limit: String(max),
});
const res = await fetch(`${url}/rest/v1/vector_ediciones?${params}`, { headers });
const rows = await res.json();
if (!res.ok) {
  console.error('No se pudo leer vector_ediciones:', rows);
  process.exit(1);
}

const bajar = async (p) => {
  const r = await fetch(`${url}/storage/v1/object/public/vector/${p.split('/').map(encodeURIComponent).join('/')}`);
  if (!r.ok) throw new Error(`${p}: ${r.status}`);
  return r.text();
};

let ok = 0;
for (const row of rows) {
  if (!row.svg_original_path || !row.svg_final_path || !row.chequeo_original) continue;
  const dir = path.join(out, row.id);
  if (fs.existsSync(path.join(dir, 'caso.json'))) continue;
  try {
    const [original, final] = await Promise.all([bajar(row.svg_original_path), bajar(row.svg_final_path)]);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'original.svg'), original);
    fs.writeFileSync(path.join(dir, 'final.svg'), final);
    const c = row.chequeo_original;
    fs.writeFileSync(
      path.join(dir, 'caso.json'),
      JSON.stringify(
        {
          id: row.id,
          fecha: row.created_at,
          tipoCaso: row.tipo_caso,
          resultado: row.resultado,
          eleccion: row.eleccion,
          // La medida a la que se analizó el original: el lado largo alcanza para repetirlo.
          target: {
            mode: 'fabricacion',
            longSideMm: Math.max(c.anchoMm, c.altoMm),
            alimento: Boolean(row.alimento),
            stampType: row.tipo_sello,
          },
          lugaresOriginal: c.lugares,
          lugaresFinal: row.chequeo_final?.lugares ?? null,
        },
        null,
        2,
      ),
    );
    ok++;
  } catch (e) {
    console.warn('No se pudo bajar', row.id, e.message);
  }
}
console.log(`${ok} casos nuevos en ${out} (${rows.length} leídos).`);
