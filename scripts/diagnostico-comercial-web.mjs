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

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or key in .env/.env.local');
  process.exit(1);
}

async function sbGet(table, params = '') {
  const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=exact',
    },
  });
  const count = res.headers.get('content-range')?.split('/')[1];
  const data = await res.json();
  if (!res.ok) throw new Error(`${table}: ${res.status} ${JSON.stringify(data)}`);
  return { data, count: count ?? String(data.length) };
}

async function sbGetIds(table, select, filter, chunkSize = 200) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const { data } = await sbGet(
      table,
      `${select}&${filter}&limit=${chunkSize}&offset=${offset}`,
    );
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < chunkSize) break;
    offset += chunkSize;
  }
  return rows;
}

(async () => {
  const webMockups = await sbGetIds(
    'mockup_solicitudes',
    'select=cliente_id,whatsapp,nombre_muestra,origen',
    'origen=eq.web&cliente_id=not.is.null',
    1000,
  );
  const webClientes = await sbGetIds(
    'clientes',
    'select=id',
    'medio_contacto=eq.Web',
    1000,
  );
  const allOrdenes = await sbGetIds('ordenes', 'select=cliente_id,origen', 'order=created_at.desc', 1000);

  const webClienteIds = new Set(webClientes.map((c) => c.id));
  const mockupClienteIds = new Set(webMockups.map((m) => m.cliente_id).filter(Boolean));
  const ordenClienteIds = new Set(allOrdenes.map((o) => o.cliente_id).filter(Boolean));

  const mockupNotInWebList = [...mockupClienteIds].filter((id) => !webClienteIds.has(id));
  const ordenNotInWebList = [...ordenClienteIds].filter((id) => !webClienteIds.has(id));

  console.log('=== DIAGNOSTICO COMERCIAL WEB ===');
  console.log('Clientes medio_contacto=Web:', webClientes.length);
  console.log('Mockups web con cliente_id:', webMockups.length, '| clientes unicos:', mockupClienteIds.size);
  console.log('Ordenes (muestra paginada):', allOrdenes.length, '| clientes unicos:', ordenClienteIds.size);
  console.log('Mockup cliente_ids NO en lista Web:', mockupNotInWebList.length);
  console.log('Orden cliente_ids NO en lista Web:', ordenNotInWebList.length);

  if (mockupNotInWebList.length) {
    const sample = mockupNotInWebList.slice(0, 20).join(',');
    const { data: det } = await sbGet('clientes', `select=id,nombre,apellido,telefono,medio_contacto&id=in.(${sample})`);
    console.log('\nClientes de mockups web fuera de lista Web (muestra):');
    for (const c of det ?? []) {
      const nombre = [c.nombre, c.apellido].filter(Boolean).join(' ');
      console.log(` - ${c.id.slice(0, 8)} | medio=${c.medio_contacto ?? 'null'} | ${nombre || '(sin nombre)'} | ${c.telefono || '(sin tel)'}`);
    }
    const found = new Set((det ?? []).map((c) => c.id));
    const missing = mockupNotInWebList.filter((id) => !found.has(id));
    if (missing.length) console.log(` IDs sin registro en clientes: ${missing.length}`);
  }

  const mockupsSinClienteEnWeb = webMockups.filter((m) => m.cliente_id && !webClienteIds.has(m.cliente_id));
  const conWhatsapp = mockupsSinClienteEnWeb.filter((m) => m.whatsapp?.trim());
  console.log('\nMockups web con cliente fuera de lista Web pero con whatsapp en mockup:', conWhatsapp.length);

  const webOrdenes = allOrdenes.filter((o) => o.origen === 'Web');
  const appOrdenes = allOrdenes.filter((o) => o.origen !== 'Web');
  console.log('\nOrdenes en muestra: Web=', webOrdenes.length, '| no-Web=', appOrdenes.length);
  const appOnlyClienteIds = new Set(appOrdenes.map((o) => o.cliente_id));
  const soloAppSinWeb = [...appOnlyClienteIds].filter(
    (id) => !mockupClienteIds.has(id) && !webClienteIds.has(id),
  );
  console.log('Clientes solo con ordenes App (sin mockup web ni cliente Web):', soloAppSinWeb.length);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
