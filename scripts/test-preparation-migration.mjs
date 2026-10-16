// PostgreSQL en memoria, sin credenciales ni acceso a Supabase.
// node scripts/test-preparation-migration.mjs <ruta a node_modules/@electric-sql/pglite/dist/index.js>
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const pid = '00000000-0000-4000-8000-000000000001';
const sid = '00000000-0000-4000-8000-000000000002';
const sid2 = '00000000-0000-4000-8000-000000000004';
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth; CREATE SCHEMA storage;
  CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000000003'::uuid $$;
  INSERT INTO auth.users VALUES (auth.uid());
  CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);
  CREATE TABLE storage.objects(id uuid,bucket_id text);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE TABLE public.programa(id uuid PRIMARY KEY,maquina text,bloqueado boolean DEFAULT false,estado_programa text DEFAULT 'BORRADOR',
    dirty boolean DEFAULT true,archivo_aspire_url text,archivo_aspire_nombre text,archivo_aspire_subido_at timestamptz,preview_url text);
  CREATE TABLE public.sellos(id uuid PRIMARY KEY,programa_id uuid REFERENCES public.programa(id),estado_fabricacion text DEFAULT 'Programado',archivo_vector_preview text);
  INSERT INTO programa(id,maquina) VALUES ('${pid}','C');
  INSERT INTO sellos(id,programa_id,archivo_vector_preview) VALUES ('${sid}','${pid}','source.svg');
  INSERT INTO sellos(id,programa_id,archivo_vector_preview) VALUES ('${sid2}','${pid}','source.svg');
  CREATE FUNCTION legacy_dirty() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    UPDATE programa SET dirty=true WHERE id=NEW.programa_id; RETURN NEW; END $$;
  CREATE TRIGGER legacy_dirty AFTER UPDATE ON sellos FOR EACH ROW EXECUTE FUNCTION legacy_dirty();
`);
await db.exec(await readFile(new URL('../migration_programas_preparacion_v2.sql', import.meta.url), 'utf8'));
const doc = { version: 2, machine: 'C', programId: pid, stamps: [sid,sid2].map((selloId) => ({ selloId, excluded: false, sourceUrl: 'source.svg' })) };
const save = (rev, document = doc) => db.query('SELECT guardar_programa_preparacion($1,$2,$3::jsonb)', [pid, rev, JSON.stringify(document)]);
await save(0);
await assert.rejects(save(null), /REVISION_CONFLICT/);
await assert.rejects(save(0), /REVISION_CONFLICT/);
await assert.rejects(save(1, { ...doc, stamps: [] }), /PROGRAM_CONTENT_CHANGED/);
await db.exec('SET ROLE anon');
await assert.rejects(db.query('SELECT * FROM programa_preparacion'), /permission denied/);
await db.exec('RESET ROLE; SET ROLE authenticated');
await assert.rejects(db.query('UPDATE programa_preparacion SET revision=99'), /permission denied/);
await db.exec('RESET ROLE');
await assert.rejects(db.query("UPDATE sellos SET estado_fabricacion='Haciendo' WHERE id=$1", [sid]), /Sincronizá/);
const report = (revision, issues = []) => db.query('SELECT registrar_programa_preparacion_resultado($1,$2,$3::jsonb,$4)',
  [pid, revision, JSON.stringify({ revision, recalculated: true, execution: { verified: true, rulesVersion: 1 }, issues }), `event-${revision}-${issues.length}`]);
const confirm = (rev, event = `event-${rev}-0`) => db.query('SELECT confirmar_programa_preparacion_archivo($1,$2,$3,$4,$5,$6)', [pid, rev, 'file.crv3d', 'file.crv3d', null, event]);
await db.query('SELECT registrar_programa_preparacion_resultado($1,1,$2::jsonb,$3)',
  [pid, JSON.stringify({ revision: 1, recalculated: true, issues: [] }), 'missing-execution-proof']);
await assert.rejects(confirm(1), /REVISION_NOT_READY/);
await report(1, [{ severity: 'error' }]);
await assert.rejects(confirm(1), /REVISION_NOT_READY/);
await report(1); await confirm(1);
assert.equal((await db.query('SELECT estado_programa,dirty FROM programa')).rows[0].estado_programa, 'LISTO');
await save(1);
const historical = await report(1);
assert.equal(historical.rows[0].registrar_programa_preparacion_resultado.current, false);
await assert.rejects(confirm(1), /REVISION_NOT_READY/);
assert.equal((await db.query('SELECT dirty FROM programa')).rows[0].dirty, true);
await report(2); await confirm(2);
await db.query('SELECT registrar_programa_preparacion_resultado($1,2,$2::jsonb,$3)',
  [pid, JSON.stringify({ revision: 2, recalculated: true, execution: { verified: true, rulesVersion: 1 }, issues: [] }), 'new-geometry-same-plan']);
await assert.rejects(db.query("UPDATE sellos SET estado_fabricacion='Haciendo' WHERE id=$1", [sid]), /Sincronizá/);
await assert.rejects(confirm(2), /RESULT_NOT_CURRENT/);
await assert.rejects(confirm(2, null), /RESULT_NOT_CURRENT/);
await confirm(2, 'new-geometry-same-plan');
const lateRetry = await report(2);
assert.equal(lateRetry.rows[0].registrar_programa_preparacion_resultado.current, false);
assert.equal((await db.query('SELECT estado_programa FROM programa')).rows[0].estado_programa, 'LISTO');
assert.equal((await db.query('SELECT archivo_revision FROM programa_preparacion')).rows[0].archivo_revision, 2);
await db.query("UPDATE sellos SET archivo_vector_preview='changed.svg' WHERE id=$1", [sid]);
await assert.rejects(confirm(2, 'new-geometry-same-plan'), /PROGRAM_CONTENT_CHANGED/);
await assert.rejects(db.query("UPDATE sellos SET estado_fabricacion='Haciendo' WHERE id=$1", [sid]), /Sincronizá/);
await db.query("UPDATE sellos SET archivo_vector_preview='source.svg' WHERE id=$1", [sid]);
await db.query("UPDATE sellos SET estado_fabricacion='Haciendo' WHERE programa_id=$1", [pid]);
assert.equal((await db.query("SELECT count(*)::int n FROM sellos WHERE estado_fabricacion='Haciendo'")).rows[0].n,2);
await assert.rejects(save(2), /PROGRAM_NOT_EDITABLE/);
await assert.rejects(confirm(2, 'new-geometry-same-plan'), /PROGRAM_NOT_EDITABLE/);
// Descartar: vuelve al flujo legado sin perder historial ni chocar revisiones.
await db.exec(await readFile(new URL('../migration_programas_preparacion_descartar.sql', import.meta.url), 'utf8'));
const discard = (rev) => db.query('SELECT descartar_programa_preparacion($1,$2)', [pid, rev]);
await assert.rejects(discard(2), /PROGRAM_NOT_EDITABLE/);
await db.query("UPDATE sellos SET estado_fabricacion='Programado' WHERE programa_id=$1", [pid]);
await assert.rejects(discard(1), /REVISION_CONFLICT/);
await discard(2);
assert.equal((await db.query('SELECT count(*)::int n FROM programa_preparacion')).rows[0].n, 0);
assert.equal((await db.query('SELECT count(*)::int n FROM programa_preparacion_revisiones')).rows[0].n, 2);
assert.equal((await db.query('SELECT estado_programa FROM programa')).rows[0].estado_programa, 'BORRADOR');
await discard(0); // sin preparación: no hace nada
await db.query("UPDATE sellos SET estado_fabricacion='Haciendo' WHERE id=$1", [sid]); // legado: el trigger ya no bloquea
await db.query("UPDATE sellos SET estado_fabricacion='Programado' WHERE programa_id=$1", [pid]);
await assert.rejects(save(2), /REVISION_CONFLICT/);
const again = await save(0);
assert.equal(again.rows[0].guardar_programa_preparacion.revision, 3);
await assert.rejects(report(2).then(() => confirm(2)), /REVISION_NOT_READY/);
await assert.rejects(db.query("UPDATE sellos SET estado_fabricacion='Haciendo' WHERE id=$1", [sid]), /Sincronizá/);
console.log('Descartar: historial conservado, flujo legado habilitado y nueva preparación desde r3.');
assert.equal((await db.query("SELECT to_regprocedure('public.confirmar_programa_preparacion_archivo(uuid,integer,text,text,text)') old")).rows[0].old, null);
console.log('Migración: CAS, permisos, pertenencia, revisiones viejas, archivo, inicio y bloqueo verificados sin producción.');
console.log('Subida atrasada con la misma revisión: rechazada por identidad del resultado.');
await db.close();
