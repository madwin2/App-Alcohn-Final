// Uso: node scripts/build-preparation-qualification.mjs <archivo Lua de salida>.
// Genera el instrumento local; no lo ejecuta ni accede a producción.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';
const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const rules = JSON.parse(await read('supabase/functions/_shared/preparationRules.json'));
let proofs = {};
const templateFiles = {};
if (['cam', 'flow', 'app'].includes(process.argv[3])) {
  if (!process.argv[4]) throw Error('Falta la carpeta de plantillas exportadas para calificar CAM.');
  const module = ts.transpileModule(await read('supabase/functions/_shared/nativeTemplate.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  const { inspectNativeTemplate, foodSelectorLayers } = await import('data:text/javascript;base64,' + Buffer.from(module).toString('base64'));
  for (const index of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const name = `Native-${String(index).padStart(3, '0')}.ToolpathTemplate`;
    const bytes = await readFile(join(process.argv[4], name));
    const purpose = index === 9 ? 'fine_full' : index === 10 ? 'fine_internal' : index === 12 ? 'food_perimeter' : 'automatic';
    const inspection = inspectNativeTemplate(bytes, purpose);
    if (inspection.issues.length) throw Error(name + ': ' + inspection.issues.join('; '));
    let hash = 7; for (const byte of bytes) hash = (hash * 31 + byte) % 2147483647;
    const selectorLayers = process.argv[5] === 'ALIMENTO' && purpose === 'automatic' ? foodSelectorLayers(inspection) : undefined;
    proofs[name] = { fingerprint: `${bytes.length}:${hash}`, selectors: inspection.selectors, toolpathCount: inspection.selectors.length,
      stage: inspection.stage, subOrder: inspection.subOrder,
      ...(selectorLayers ? { selectorLayers } : {}),
      ...(index === 9 ? { selectionLayers: ['REPASO CLASICO'] } : index === 10 ? { selectionLayers: ['REPASO INTERIOR CLASICO'] }
        : index === 12 ? { selectionLayers: ['Corte Alimento'] } : {}) };
  }
  if (['flow', 'app'].includes(process.argv[3])) for (const recipe of ['CLASICO','3MM','ALIMENTO']) {
    templateFiles[recipe] = [];
    for (const index of [1,2,3,4,recipe === 'CLASICO' ? 5 : 6,recipe === 'CLASICO' ? 7 : 8,9,10,11,...(recipe === 'ALIMENTO' ? [12] : [])]) {
      const original = `Native-${String(index).padStart(3, '0')}.ToolpathTemplate`;
      const name = `Flow-${recipe}-${String(index).padStart(3, '0')}.ToolpathTemplate`;
      const bytes = await readFile(join(process.argv[4], original));
      await writeFile(join(process.argv[4], name), bytes);
      const purpose = index === 9 ? 'fine_full' : index === 10 ? 'fine_internal' : index === 12 ? 'food_perimeter' : 'automatic';
      const inspection = inspectNativeTemplate(bytes, purpose);
      const selectorLayers = recipe === 'ALIMENTO' && purpose === 'automatic' ? foodSelectorLayers(inspection) : undefined;
      proofs[name] = { ...proofs[original], ...(selectorLayers ? { selectorLayers } : {}),
        ...(index === 9 ? { selectionLayers: [rules.recipes[recipe].fineLayer] }
          : index === 10 ? { selectionLayers: [rules.recipes[recipe].fineInteriorLayer] } : {}) };
      templateFiles[recipe].push(name);
    }
  }
}
function lua(value) {
  if (value == null) return 'nil';
  if (typeof value === 'string') return '"' + Array.from(value).map((c) => c === '\\' ? '\\\\' : c === '"' ? '\\"' : c.charCodeAt(0) < 32 ? '\\' + c.charCodeAt(0).toString().padStart(3, '0') : c).join('') + '"';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return '{' + value.map(lua).join(',') + '}';
  return '{' + Object.entries(value).map(([k, v]) => `[${JSON.stringify(k)}]=${lua(v)}`).join(',') + '}';
}
const source = await read('aspire-gadgets/preparation/SyncPreparation.lua');
const qualifier = await read('aspire-gadgets/preparation/QualifyGeometry.lua');
const cam = await read('aspire-gadgets/preparation/QualifyCam.lua');
const flow = await read('aspire-gadgets/preparation/QualifyFlow.lua');
const app = await read('aspire-gadgets/preparation/QualifyApp.lua');
const plan = await read('aspire-gadgets/preparation/ExecutionPlan.lua');
if (!process.argv[2]) throw Error('Falta la ruta de salida local.');
let appRecord = null;
if (process.argv[3] === 'app') {
  const payload = JSON.parse(await readFile(process.argv[6], 'utf8'));
  appRecord = payload.record;
  const doc = appRecord?.document;
  if (payload.kind !== 'alcohn-local-aspire-test' || doc?.machine !== 'C' || !/^simulation-C-\d+$/.test(doc.programId)
    || !Number.isInteger(appRecord.revision) || appRecord.revision < 1 || !Array.isArray(doc.stamps) || !doc.stamps.length || doc.stamps.length > 8)
    throw Error('Solo se admiten los datos ficticios exportados por la pantalla de prueba C.');
  for (const stamp of doc.stamps) {
    if (!/^sim-[0-7]$/.test(stamp.selloId) || !stamp.instanceId.startsWith(doc.programId + ':') || !stamp.sourceUrl.startsWith('data:image/svg+xml,')) throw Error('Fuente ajena a la prueba ficticia.');
    const svg = stamp.vectorSvg ?? decodeURIComponent(stamp.sourceUrl.slice(stamp.sourceUrl.indexOf(',') + 1));
    if (/<script|<foreignObject|<!DOCTYPE|<!ENTITY/i.test(svg) || svg.length > 500_000) throw Error('SVG de prueba inválido.');
    await writeFile(join(process.argv[4], `app-${stamp.selloId}.svg`), svg);
  }
  // Conserva el plan descargado exactamente; las plantillas se toman de la copia local calificada.
  await writeFile(join(process.argv[4], `app-plan-r${appRecord.revision}.json`), JSON.stringify(payload, null, 2));
}
const method = process.argv[3] === 'app' ? (process.argv[5] === 'edit' ? 'qualifyAppEdit' : 'qualifyApp') : process.argv[3] === 'flow' ? 'qualifyFlow' : process.argv[3] === 'cam' ? 'qualifyCam' : 'qualify';
await writeFile(process.argv[2], `-- VECTRIC LUA SCRIPT\nlocal PreparationSync=(function()\nlocal EXECUTION_RULES=${lua(rules)}\nlocal QUALIFICATION_APP_RECORD=${lua(appRecord)}\nlocal QUALIFICATION_RECIPE=${lua(['3MM','ALIMENTO'].includes(process.argv[5]) ? process.argv[5] : 'CLASICO')}\nlocal QUALIFICATION_PROOFS=${lua(proofs)}\nlocal QUALIFICATION_TEMPLATE_FILES=${lua(templateFiles)}\nlocal ExecutionPlan=(function()\n${plan}\nend)()\n${source.replace(/return PreparationSync\s*$/, () => `${qualifier}\n${cam}\n${flow}\n${app}\nreturn PreparationSync`)}\nend)()\nfunction main() return PreparationSync.${method}() end\n`);
