import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const source = await readFile(new URL('aspire-gadgets/preparation/SyncPreparation.lua', root), 'utf8');
const executionSource = await readFile(new URL('aspire-gadgets/preparation/ExecutionPlan.lua', root), 'utf8');
const rules = JSON.parse(await readFile(new URL('supabase/functions/_shared/preparationRules.json', root), 'utf8'));
function lua(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '{' + value.map(lua).join(',') + '}';
  return '{' + Object.entries(value).map(([k,v]) => `[${JSON.stringify(k)}]=${lua(v)}`).join(',') + '}';
}
const start = '-- BEGIN ALCOHN PREPARATION GENERATED';
const end = '-- END ALCOHN PREPARATION GENERATED';
const block = `${start}\nlocal PreparationSync = (function()\nlocal EXECUTION_RULES = ${lua(rules)}\nlocal ExecutionPlan = (function()\n${executionSource}\nend)()\n${source}\nend)()\n${end}\n`;
for (const machine of ['Chica', 'Grande', 'XL']) {
  const path = new URL(`aspire-gadgets/ArmarPrograma_${machine}.lua`, root);
  let text = await readFile(path, 'utf8');
  text = text.replace(/local GADGET_VERSION = "[^"]+"/, 'local GADGET_VERSION = "3.2.0"');
  text = text.replace(/gadget_protocol=\d+/g, `gadget_protocol=${rules.protocol}`);
  if (text.includes(start)) text = text.slice(0, text.indexOf(start)) + block + text.slice(text.indexOf(end) + end.length).replace(/^\r?\n/, '');
  else text = text.replace('function main()', block + '\nfunction main()');
  if (!text.includes('local ACTIVE_PREPARATION_REVISION')) text = text.replace(/local GADGET_VERSION = "[^"]+"/, 'local GADGET_VERSION = "3.2.0"\nlocal ACTIVE_PREPARATION_REVISION = nil');
  text = text.replace('?accion=paquete&programa_id=', `?accion=paquete&gadget_protocol=${rules.protocol}&programa_id=`);
  if (!text.includes('jsonPayload = jsonPayload:gsub')) text = text.replace('local function postJson(url, jsonPayload)', `local function postJson(url, jsonPayload)
  if ACTIVE_PREPARATION_REVISION then
    jsonPayload = jsonPayload:gsub("^%s*{", '{"preparation_revision":' .. tostring(ACTIVE_PREPARATION_REVISION) .. ',', 1)
  end`);
  if (!text.includes('PreparationSync.run,')) text = text.replace('  LARGO_MAXIMO_MM = tonumber(manifest.largo_maximo_mm)', `  if manifest.preparation then
    ACTIVE_PREPARATION_REVISION = manifest.preparation.revision
    local ok, err = pcall(PreparationSync.run, {
      job = job, manifest = manifest, folder = folder, message = DisplayMessage,
      resolvePath = resolveCrv3dPath, copySelection = copySelectionToLayer,
      layerObjects = getObjectsFromLayer,
      clearLayer = vaciarCapa, buildReport = buildReportJson,
      writeReport = writeSyncBlob, postReport = postSyncReport, upload = uploadAspireFile, machiningSeconds = sumMachiningSeconds,
      importSelected = function(path)
        job.Selection:Clear()
        local before, counts = snapshotLayerNames(job), snapshotLayerObjectCounts(job)
        local imported
        if path:lower():match("%.svg$") then stripHiddenSvgFile(path); imported = job:ImportSVG(path)
        else imported = job:ImportDxfDwg(path) end
        if not imported or not selectImportedSvg(job, before, counts) then error("No se pudo importar/seleccionar el vector") end
      end,
    })
    if not ok then DisplayMessage("Preparacion pendiente: " .. tostring(err)) end
    return true
  end

  LARGO_MAXIMO_MM = tonumber(manifest.largo_maximo_mm)`);
  text = text.replace('layerObjects = function(name) return getObjectsFromLayer(job.LayerManager:GetLayerWithName(name)) end,', 'layerObjects = getObjectsFromLayer,');
  text = text.replace('upload = uploadAspireFile,\n', 'upload = uploadAspireFile, machiningSeconds = sumMachiningSeconds,\n');
  text = text.replace('local function uploadAspireFile(programaId, token, filepath)', 'local function uploadAspireFile(programaId, token, filepath, preparationEventId)');
  if (!text.includes('local preparationEventField')) text = text.replace('local function uploadAspireFile(programaId, token, filepath, preparationEventId)', `local function uploadAspireFile(programaId, token, filepath, preparationEventId)
  local preparationEventField = ""
  if ACTIVE_PREPARATION_REVISION then
    if type(preparationEventId) ~= "string" or not preparationEventId:match("^[%w_-]+$") then
      return false, "Falta la identidad del resultado. Volve a sincronizar antes de subir."
    end
    preparationEventField = ',"preparation_event_id":' .. jsonString(preparationEventId)
  end`);
  if (!text.includes('pedir = pedir:sub')) text = text.replace('  local ok1, body1, code1 = postJson(', `  pedir = pedir:sub(1, -2) .. preparationEventField .. "}"
  local ok1, body1, code1 = postJson(`);
  if (!text.includes('confirmar = confirmar:sub')) text = text.replace('  local ok3, body3, code3 = postJson(', `  confirmar = confirmar:sub(1, -2) .. preparationEventField .. "}"
  local ok3, body3, code3 = postJson(`);
  await writeFile(path, text);
}
