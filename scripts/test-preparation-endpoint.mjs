// Ensayo del handler de producción por HTTP de loopback, con PostgreSQL en memoria.
// Sin .env, claves reales, Supabase remoto, CNC ni migraciones en producción.
// node scripts/test-preparation-endpoint.mjs <pglite/dist/index.js> <plantillas-nativas-C>
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.argv[2] || !process.argv[3]) throw Error('Faltan PGlite y la carpeta de plantillas exportadas de C.');
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
const require = createRequire(import.meta.url), objects = new Map(), removed = [];
const pid = '00000000-0000-4000-8000-000000000001', token = 'token-ficticio-solo-local';
const captured = JSON.parse(readFileSync(resolve(root, 'src/lib/programas/__fixtures__/aspire-c-roundtrip.json'), 'utf8'));
// Copia ficticia generada en la calificación nativa; solo se usa para extraer su GIF local.
const previewBytes = new Uint8Array(readFileSync(resolve(process.argv[3], 'App C - prueba real.crv3d')));
const doc = structuredClone(captured.document), observation = structuredClone(captured.observation);
doc.programId = pid;
doc.stamps.forEach((stamp, index) => {
  stamp.selloId = `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`;
  stamp.instanceId = `${pid}:${stamp.selloId}`;
  observation.stamps[index].instanceId = stamp.instanceId; observation.stamps[index].selloId = stamp.selloId;
});
let origin, handler, beforeConfirm, omitMetadata = false;
const value = (v) => v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
function column(name) {
  if (name === '*') return '*';
  if (/^[a-z_]+->>[a-z_]+$/.test(name)) { const [a, b] = name.split('->>'); return `"${a}"->>'${b}'`; }
  if (!/^[a-z_]+$/.test(name)) throw Error('Columna no admitida por el adaptador local: ' + name);
  return `"${name}"`;
}
function query(table) {
  const conditions = [], params = []; let fields = '*', kind = 'select', patch, conflict, single = false, order;
  const bind = (v) => { params.push(value(v)); return '$' + params.length; };
  const builder = {
    select(v = '*') { fields = v; return builder; },
    eq(k, v) { conditions.push(`${column(k)}=${bind(v)}`); return builder; },
    in(k, values) { conditions.push(`${column(k)} IN (${values.map(bind).join(',')})`); return builder; },
    not(k, operator, v) { assert.equal(operator, 'is'); assert.equal(v, null); conditions.push(`${column(k)} IS NOT NULL`); return builder; },
    or(expression) { assert.equal(expression, 'estado_programa.is.null,estado_programa.neq.FINALIZADO'); conditions.push("(estado_programa IS NULL OR estado_programa<>'FINALIZADO')"); return builder; },
    order(k, options) { order = `${column(k)} ${options?.ascending === false ? 'DESC' : 'ASC'}`; return builder; },
    maybeSingle() { single = true; return builder; },
    update(v) { kind = 'update'; patch = v; return builder; },
    insert(v) { kind = 'insert'; patch = v; return builder; },
    upsert(v, options) { kind = 'upsert'; patch = v; conflict = options.onConflict; return builder; },
    async then(done, fail) {
      try {
        const target = column(table), where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
        let sql;
        if (kind === 'select') sql = `SELECT ${fields.split(',').map((f) => column(f.trim())).join(',')} FROM ${target}${where}${order ? ' ORDER BY ' + order : ''}`;
        else if (kind === 'update') sql = `UPDATE ${target} SET ${Object.entries(patch).map(([k, v]) => `${column(k)}=${bind(v)}`).join(',')}${where} RETURNING *`;
        else {
          const entries = Object.entries(patch);
          sql = `INSERT INTO ${target}(${entries.map(([k]) => column(k)).join(',')}) VALUES (${entries.map(([, v]) => bind(v)).join(',')})`;
          if (kind === 'upsert') sql += ` ON CONFLICT (${column(conflict)}) DO UPDATE SET ${entries.filter(([k]) => k !== conflict).map(([k]) => `${column(k)}=EXCLUDED.${column(k)}`).join(',')}`;
          sql += ' RETURNING *';
        }
        const { rows } = await db.query(sql, params);
        return done({ data: single ? rows[0] ?? null : rows, error: null });
      } catch (error) { if (done) return done({ data: null, error: { code: error.code, message: error.message } }); return fail(error); }
    },
  };
  return builder;
}
const client = {
  from: query,
  auth: { getUser: async (jwt) => ({ data: jwt === 'session-ficticia' ? { user: { id: 'usuario-local' } } : null, error: jwt !== 'session-ficticia' }) },
  async rpc(name, args) {
    if (name === 'confirmar_programa_preparacion_archivo' && beforeConfirm) { const action = beforeConfirm; beforeConfirm = null; await action(); }
    const entries = Object.entries(args);
    try { const result = await db.query(`SELECT ${column(name)}(${entries.map(([k], i) => `${column(k)}=>$${i + 1}`).join(',')}) result`, entries.map(([, v]) => value(v))); return { data: result.rows[0].result, error: null }; }
    catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
  },
  storage: { from(bucket) { return {
    async download(path) { const bytes = objects.get(bucket + '/' + path); return { data: bytes ? new Blob([bytes]) : null, error: bytes ? null : { message: 'Archivo local ausente' } }; },
    async createSignedUrl(path) { return { data: { signedUrl: `${origin}/storage/${bucket}/${path}?token=descarga-local` }, error: null }; },
    async createSignedUploadUrl(path, options) { if (path.includes('/r1/')) assert.equal(options.upsert, false); return { data: { path, token: 'subida-local', signedUrl: `${origin}/upload/${bucket}/${path}?token=subida-local` }, error: null }; },
    async list(path, options) { const prefix = bucket + '/' + path + '/'; return { data: [...objects.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, bytes]) => ({ name: key.slice(prefix.length), metadata: omitMetadata ? {} : { size: bytes.length } })).filter((file) => file.name.includes(options.search)), error: null }; },
    getPublicUrl(path) { return { data: { publicUrl: `${origin}/public/${bucket}/${path}` } }; },
    async upload(path, bytes) { objects.set(bucket + '/' + path, new Uint8Array(bytes)); return { error: null }; },
    async remove(paths) { removed.push(...paths.map((p) => bucket + '/' + p)); paths.forEach((p) => objects.delete(bucket + '/' + p)); return { error: null }; },
  }; } },
};
// Ejecuta el código del handler sin iniciar Deno ni importar un cliente remoto.
const modules = new Map();
function load(path) {
  if (modules.has(path)) return modules.get(path).exports;
  if (path.endsWith('.json')) return JSON.parse(readFileSync(path, 'utf8'));
  const module = { exports: {} }; modules.set(path, module);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = (id) => {
    if (id.includes('edge-runtime.d.ts')) return {};
    if (id.includes('@supabase/supabase-js')) return { createClient: () => client };
    if (id === 'npm:cfb@1.2.2') return require('cfb');
    if (id === 'npm:fflate@0.8.2') return { unzipSync() { throw Error('El ensayo no ejecuta descompresión ZIP.'); } };
    if (id.startsWith('.')) return load(resolve(dirname(path), id));
    throw Error('Dependencia no autorizada en el ensayo: ' + id);
  };
  const deno = { serve(fn) { handler = fn; }, env: { get(name) { return { SUPABASE_URL: 'http://servidor-ficticio.invalid', SUPABASE_SERVICE_ROLE_KEY: 'sin-credenciales-reales', PROGRAMA_SYNC_KEY: 'instalacion-local' }[name]; } } };
  new Function('require', 'module', 'exports', 'Deno', 'crypto', 'fetch', code)(localRequire, module, module.exports, deno, webcrypto, () => { throw Error('El handler intentó salir a la red.'); });
  return module.exports;
}
const server = createServer(async (req, res) => {
  try {
    const chunks = []; for await (const part of req) chunks.push(part);
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith('/upload/')) {
      assert.equal(req.method, 'PUT'); assert.equal(url.searchParams.get('token'), 'subida-local');
      objects.set(decodeURIComponent(url.pathname.slice(8)), Buffer.concat(chunks)); res.writeHead(200).end('{}'); return;
    }
    if (url.pathname.startsWith('/storage/')) {
      const bytes = objects.get(decodeURIComponent(url.pathname.slice(9))); res.writeHead(bytes ? 200 : 404).end(bytes ?? ''); return;
    }
    const response = await handler(new Request(url, { method: req.method, headers: req.headers, ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) }));
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: error.message })); }
});
try {
  await new Promise((done) => server.listen(0, '127.0.0.1', done)); origin = `http://127.0.0.1:${server.address().port}`;
  doc.stamps.forEach((stamp, index) => {
    const file = stamp.selloId + '.svg';
    objects.set('vector/' + file, Buffer.from(decodeURIComponent(stamp.sourceUrl.slice(stamp.sourceUrl.indexOf(',') + 1))));
    stamp.sourceUrl = `${origin}/storage/vector/${file}`; observation.stamps[index].sourceUrl = stamp.sourceUrl;
  });
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000000003'::uuid $$;
    INSERT INTO auth.users VALUES (auth.uid());
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);
    CREATE TABLE storage.objects(id uuid,bucket_id text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE TABLE programa(id uuid PRIMARY KEY,nombre text,maquina text,fecha date,cantidad_sellos int,bloqueado boolean DEFAULT false,estado_programa text DEFAULT 'BORRADOR',dirty boolean DEFAULT true,
      archivo_aspire_url text,archivo_aspire_nombre text,archivo_aspire_subido_at timestamptz,preview_url text,sync_at timestamptz,sync_origen text,sync_payload jsonb,maquinado_minutos numeric,material_real_por_planchuela jsonb,updated_at timestamptz);
    CREATE TABLE sellos(id uuid PRIMARY KEY,programa_id uuid REFERENCES programa(id),estado_fabricacion text DEFAULT 'Programado',archivo_vector_preview text,diseno text,tipo text,tipo_planchuela int,
      ancho_real numeric,largo_real numeric,ancho_fabricacion_mm numeric,largo_fabricacion_mm numeric,created_at timestamptz DEFAULT now());
    CREATE TABLE programa_sync_token(programa_id uuid PRIMARY KEY,token text,expires_at timestamptz);
    CREATE TABLE programa_eventos(id serial PRIMARY KEY,programa_id uuid,tipo text,detalle jsonb,usuario_email text);`);
  await db.exec(readFileSync(resolve(root, 'migration_programas_preparacion_v2.sql'), 'utf8'));
  await db.query('INSERT INTO programa(id,nombre,maquina,fecha,cantidad_sellos) VALUES ($1,$2,$3,current_date,8)', [pid, 'Muestra ficticia HTTP', 'C']);
  for (const stamp of doc.stamps) await db.query('INSERT INTO sellos(id,programa_id,archivo_vector_preview,diseno,tipo,tipo_planchuela,ancho_fabricacion_mm,largo_fabricacion_mm) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [stamp.selloId, pid, stamp.sourceUrl, stamp.name, stamp.recipe, Number(stamp.columnId.slice(1)), stamp.sourceWidthMm, stamp.sourceHeightMm]);
  await db.query("INSERT INTO programa_sync_token VALUES ($1,$2,now()+interval '1 day')", [pid, token]);
  for (const recipe of ['CLASICO', '3MM', 'ALIMENTO']) {
    const files = [1, 2, 3, 4, recipe === 'CLASICO' ? 5 : 6, recipe === 'CLASICO' ? 7 : 8, 11];
    const native = (n) => new Uint8Array(readFileSync(resolve(process.argv[3], `Native-${String(n).padStart(3, '0')}.ToolpathTemplate`)));
    doc.recipes[recipe].templates = files.map((n) => `Native-${String(n).padStart(3, '0')}.ToolpathTemplate`);
    doc.recipes[recipe].templatePaths = files.map((n) => `${pid}/${recipe}/${n}.ToolpathTemplate`);
    files.forEach((n, i) => objects.set('programas-plantillas/' + doc.recipes[recipe].templatePaths[i], native(n)));
    doc.recipes[recipe].fineTemplates = {};
    for (const [kind, n, purpose] of [['full', 9, 'fine_full'], ['internal', 10, 'fine_internal']]) {
      const path = `${pid}/${recipe}/${purpose}/${n}.ToolpathTemplate`;
      doc.recipes[recipe].fineTemplates[kind] = { name: `${n}.ToolpathTemplate`, path }; objects.set('programas-plantillas/' + path, native(n));
    }
    if (recipe === 'ALIMENTO') { const path = `${pid}/ALIMENTO/food_perimeter/12.ToolpathTemplate`; doc.recipes.ALIMENTO.perimeterTemplate = { name: 'Corte Forma.ToolpathTemplate', path }; objects.set('programas-plantillas/' + path, native(12)); }
  }
  const save = async (expected) => db.query('SELECT guardar_programa_preparacion($1,$2,$3::jsonb)', [pid, expected, JSON.stringify(doc)]);
  await save(0); observation.revision = 1;
  load(resolve(root, 'supabase/functions/programa-sync/index.ts'));
  const request = async (action, payload, headers = {}, method = payload ? 'POST' : 'GET') => {
    const response = await fetch(`${origin}/?accion=${action}`, { method, headers: { 'content-type': 'application/json', ...headers }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const state = async () => (await db.query('SELECT estado_programa,dirty,archivo_aspire_url,preview_url FROM programa WHERE id=$1', [pid])).rows[0];
  const report = (event) => request('reporte', { programa_id: pid, token, evento_id: event, modo: 'PREPARACION_V2', preparation: observation,
    sellos_presentes: doc.stamps.map((s) => s.selloId), sellos_importados_ahora: [], sellos_no_importados: [], sellos_borrados_en_maquina: [] });
  const upload = (event) => request('pedir-upload', { programa_id: pid, token, filename: 'Muestra.crv3d', preparation_revision: observation.revision, preparation_event_id: event });
  const confirm = (event, path) => request('confirmar-upload', { programa_id: pid, token, filename: 'Muestra.crv3d', path, preparation_revision: observation.revision, preparation_event_id: event, size: 999_999_999 });
  const put = async (url, bytes = new Uint8Array(256)) => assert.equal((await fetch(url, { method: 'PUT', body: bytes })).status, 200);
  assert.equal((await request('listar&maquina=C')).status, 401);
  assert.equal((await request('listar&maquina=C', null, { 'x-programa-sync-key': 'instalacion-local' })).status, 200);
  assert.equal((await request(`paquete&programa_id=${pid}&gadget_protocol=3`, null, { authorization: 'Bearer session-ficticia' })).status, 409);
  const packet = await request(`paquete&programa_id=${pid}&gadget_protocol=4`, null, { authorization: 'Bearer session-ficticia' });
  assert.equal(packet.status, 200, JSON.stringify(packet.data)); assert.match(packet.data.manifest_lua, /^return /); assert.equal(packet.data.manifest.sellos.length, 8);
  for (const file of packet.data.vectores) { assert.equal(new URL(file.url).origin, origin); assert.equal((await fetch(file.url)).status, 200); }
  assert.equal(packet.data.vectores.filter((file) => file.archivo.endsWith('.svg')).length, 8);
  assert.equal((await state()).estado_programa, 'BORRADOR');
  assert.equal((await upload('A')).status, 409); // No hay informe recalculado aún.
  assert.equal((await report('A')).status, 200);
  const a = await upload('A'); assert.equal(a.status, 200); assert.match(a.data.path, /\/r1\/A\//);
  assert.equal((await confirm('A', a.data.path)).status, 409); // Archivo ausente.
  await put(a.data.signedUrl, previewBytes); omitMetadata = true; assert.equal((await confirm('A', a.data.path)).status, 409); omitMetadata = false;
  const confirmedA = await confirm('A', a.data.path); assert.equal(confirmedA.status, 200); assert.equal(confirmedA.data.preview, true);
  assert.equal((await state()).estado_programa, 'LISTO'); const previewA = (await state()).preview_url;
  const duplicate = await report('A'); assert.equal(duplicate.data.duplicate, true); assert.equal((await state()).estado_programa, 'LISTO');
  assert.equal((await report('B')).status, 200); assert.equal((await state()).estado_programa, 'BORRADOR');
  assert.equal((await confirm('A', a.data.path)).status, 409);
  assert.equal((await confirm('B', a.data.path)).status, 409); // Tampoco con el evento nuevo sobre el path viejo.
  const b = await upload('B'); assert.equal(b.status, 200); await put(b.data.signedUrl, previewBytes);
  beforeConfirm = () => db.query('SELECT registrar_programa_preparacion_resultado($1,1,$2::jsonb,$3)', [pid, JSON.stringify(observation), 'C']);
  assert.equal((await confirm('B', b.data.path)).status, 409); assert.equal((await state()).estado_programa, 'BORRADOR');
  assert.equal((await state()).preview_url, previewA);
  assert.equal(objects.has('programas-preview/' + previewA.split('/programas-preview/')[1]), true);
  const c = await upload('C'); await put(c.data.signedUrl); assert.equal((await confirm('C', c.data.path)).status, 200);
  assert.equal((await request('pedir-upload', { programa_id: pid, token: 'incorrecto' })).status, 401);
  await db.query("UPDATE programa_sync_token SET expires_at=now()-interval '1 hour' WHERE programa_id=$1", [pid]);
  assert.equal((await upload('C')).status, 401);
  await db.query("UPDATE programa_sync_token SET expires_at=now()+interval '1 day' WHERE programa_id=$1", [pid]);
  const rawHeaders = { 'x-programa-id': pid, 'x-programa-token': token, 'x-filename': 'Binario.crv3d', 'x-preparation-revision': '1', 'x-preparation-event-id': 'C' };
  assert.equal((await fetch(`${origin}/?accion=subir-archivo`, { method: 'POST', headers: rawHeaders, body: new Uint8Array(256) })).status, 200);
  const countBeforeInvalidRaw = objects.size;
  assert.equal((await fetch(`${origin}/?accion=subir-archivo`, { method: 'POST', headers: { ...rawHeaders, 'x-preparation-event-id': 'B' }, body: new Uint8Array(256) })).status, 409);
  assert.equal(objects.size, countBeforeInvalidRaw);
  // Reintento de un POST cuyo registro de preparación se confirmó antes de fallar el resumen legado.
  await db.query("DELETE FROM programa_eventos WHERE detalle->>'evento_id'='B'");
  const retryB = await report('B'); assert.equal(retryB.data.historical, true); assert.equal((await state()).estado_programa, 'LISTO');
  assert.equal(objects.has('programas-aspire/' + a.data.path), true); assert.equal(removed.length, 0);
  await save(1); assert.equal((await confirm('C', c.data.path)).status, 409);
  const updatedPacket = await request(`paquete&programa_id=${pid}&gadget_protocol=4`, null, { 'x-programa-sync-key': 'instalacion-local' });
  assert.equal(updatedPacket.status, 200, JSON.stringify(updatedPacket.data));
  assert.equal(updatedPacket.data.manifest.preparation.revision, 2);
  assert.equal(updatedPacket.data.manifest.sellos[0].seed_svg, observation.stamps[0].svg);
  assert.equal(updatedPacket.data.manifest.sellos[0].seed_reference.planY, doc.stamps[0].topY);
  const historical = await report('C'); assert.equal(historical.data.historical, true);
  assert.equal((await state()).estado_programa, 'BORRADOR');
  const legacyId = '00000000-0000-4000-8000-000000000099';
  await db.query('INSERT INTO programa(id,nombre,maquina) VALUES ($1,$2,$3)', [legacyId, 'Legado ficticio', 'C']);
  await db.query("INSERT INTO programa_sync_token VALUES ($1,$2,now()+interval '1 day')", [legacyId, token]);
  const legacy = await request('pedir-upload', { programa_id: legacyId, token, filename: 'Legado.crv3d' });
  assert.equal((await request('pedir-upload', { programa_id: legacyId, token, preparation_revision: 1, preparation_event_id: 'A' })).status, 409);
  assert.equal(legacy.status, 200); assert.equal(legacy.data.path.includes('/r1/'), false); await put(legacy.data.signedUrl);
  assert.equal((await request('confirmar-upload', { programa_id: legacyId, token, filename: 'Legado.crv3d', path: legacy.data.path })).status, 200);
  console.log('HTTP local + handler real + PostgreSQL: paquete, autenticación, informe, subida, confirmación y revisión nueva correctos.');
  console.log('Bloqueos comprobados: gadget viejo, falta de informe/archivo/metadatos, resultado anterior, path ajeno y carrera entre informe/subida. Sin red externa ni producción.');
} finally {
  server.closeAllConnections(); await new Promise((done) => server.close(done)); await db.close();
}
