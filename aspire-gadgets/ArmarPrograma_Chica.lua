-- VECTRIC LUA SCRIPT
-- Armar Programa - Maquina Chica (C) -- v2 (modos Actualizar / Rehacer / Solo recalcular)
--
-- Instalacion (una sola vez por PC, un solo paso):
--   Copiar UNICAMENTE este archivo a la carpeta de Gadgets de Aspire de esa
--   PC (Toolpaths > Gadgets te muestra cual es). No hace falta ninguna otra
--   carpeta ni archivo adicional -- toda la automatizacion por tipo (Clasico
--   y 3mm) ya esta adentro de este mismo archivo.
--
-- Uso normal:
--   1. Abrir programa.crv3d (el .crv3d base que vino en el ZIP descargado).
--   2. Correr este gadget (Toolpaths > Gadgets > Armar Programa Chica).
--   3. Elegir manifest.lua dentro de la carpeta del ZIP ya descomprimida.
--   4. Si el job ya tiene sellos, elegir modo: Actualizar / Rehacer / Solo recalcular.
--   5. Al terminar muestra un resumen (errores arriba) y escribe ALCOHN_PROGRAMA_V1
--      en JobParameters -- guarda el .crv3d para que la app lo lea.
--
-- Por que SVG y no DXF: Illustrator no exporta DXF de forma nativa, pero SVG
-- si. El precio de usar SVG es que Aspire no garantiza documentalmente que
-- deje seleccionado lo recien importado (si lo garantiza para DXF/DWG), asi
-- que este gadget arma la seleccion el mismo comparando las capas antes/
-- despues del import, y ademas valida el tamano contra ancho_mm/largo_mm del
-- manifest (los datos reales de la base) y lo corrige si hace falta -- esto
-- es la defensa contra el bug viejo de "aparecia de otra medida".
--
-- Para que esa validacion casi nunca tenga que corregir nada: al exportar el
-- SVG desde Illustrator, poner las unidades del documento en milimetros y el
-- artboard del tamano real del sello antes de exportar.
--
-- PENDIENTE (fuera de este gadget): el ZIP que arma la app hoy todavia trae
-- los vectores en .eps, no en .svg. Falta actualizar la generacion del
-- paquete (packageZip.ts / el pipeline de vectorizacion) para que el archivo
-- final sea .svg antes de que esto ande de punta a punta sin intervencion.

local MACHINE_LABEL = "Chica"
local MACHINE_CODE = "C"
local REGISTRY_SECTION = "ArmarPrograma_" .. MACHINE_LABEL

-- Capas fijas que ya usa la automatizacion -- nunca son "la capa recien
-- importada", asi que se excluyen siempre de la deteccion de import SVG.
local KNOWN_LAYERS = {
  ["VECTOR"] = true,
  ["VECTOR 3MM"] = true,
  ["Corte"] = true,
  ["Taladrado"] = true,
  ["Offset 1 vector"] = true,
  ["Offset exterior vector"] = true,
  ["Offset exterior vector 3mm"] = true,
  ["Planeado"] = true,
  ["Rectangulo exterior"] = true,
  ["Dispositivo"] = true,
}

-- Posiciones de columnas (identicas a AUTOMATIZACION_SIMPLIFICADA[.lua /
-- _3MM CHICA.lua] originales de esta maquina).
local COLUMNS = {
  -- eff 24.2: tolerancia decidida a mano sobre planchuela de 25mm real (no calculado).
  -- Sin esto, sellos ~24.06mm saltaban a la columna de 38.
  { nom = 25,   eff = 24.2, xpos = 50.176 },
  { nom = 12.7, eff = 11.7, xpos = 87.776 },
  { nom = 19,   eff = 18,   xpos = 187.776 },
  { nom = 38,   eff = 37,   xpos = 235.351 },
}
local TARGET_TOP_Y = -8.958

-- Tolerancia de escala: si el vector importado difiere menos de esto del
-- tamano esperado, se deja como esta (no se toca nada). Si difiere mas, se
-- corrige. Si difiere muchisimo mas (posible archivo equivocado, no un bug
-- de unidades), no se corrige solo y se marca como error para revisar a mano.
local SCALE_TOLERANCE = 0.02
local SCALE_MIN_SANE = 0.2
local SCALE_MAX_SANE = 5.0

local GADGET_VERSION = "2.0.0"
-- URL de la Edge Function programa-sync (editar si cambia el proyecto Supabase).
local SYNC_URL = "https://dgbyrejfcqearevvzdmf.supabase.co/functions/v1/programa-sync"
-- Flags base de curl. --ssl-no-revoke omite la consulta CRL/OCSP (Windows a veces
-- falla con CRYPT_E_NO_REVOCATION_CHECK); NO es -k/--insecure: el certificado
-- sigue validandose. Reusar en 3.E/3.F (bajar paquete, subir .txt).
local CURL_BASE_FLAGS = "-s -S --ssl-no-revoke --retry 3 --retry-delay 1 --retry-all-errors --max-time 60"
-- Limite de planchuela: lo setea main() desde manifest.largo_maximo_mm (no hardcodear).
local LARGO_MAXIMO_MM = nil

-- Capas que el gadget genera y que se vacian SOLO en modo Rehacer desde cero.
local GADGET_GENERATED_LAYERS = {
  "VECTOR",
  "VECTOR 3MM",
  "Corte",
  "Taladrado",
  "Offset 1 vector",
  "Offset exterior vector",
  "Offset exterior vector 3mm",
  "Planeado",
  "Rectangulo exterior",
}

-- CAPTURAR FUNCIONES GLOBALES ANTES DE STRICT (igual que en los scripts originales)
local CreateCopyOfSelectedContours = CreateCopyOfSelectedContours
local GetDefaultContourTolerance = GetDefaultContourTolerance
local CreateCadGroup = CreateCadGroup

function DisplayMessage(message)
  local safe = tostring(message):gsub("[^\x20-\x7E\n]", "")
  DisplayMessageBox(safe)
  print(safe)
end

-- Red de seguridad: si algun control queda con class="LuaButton" sin handler
-- propio, Aspire llama a OnLuaButton_XXXX. Debe devolver true (doc oficial).
function OnLuaButton_XXXX(element_id, dialog)
  return true
end

-- =====================================================================
-- Registro de Windows: solo para recordar la ultima carpeta de programa
-- elegida (comodidad, no obligatorio). Si la clase no existiera en tu
-- version de Aspire, el pcall evita que el gadget se rompa.
-- =====================================================================
local function openRegistry()
  local ok, reg = pcall(Registry, REGISTRY_SECTION)
  if ok then return reg end
  return nil
end

local function regGetString(reg, name, default_value)
  if not reg then return default_value end
  local ok, val = pcall(function() return reg:GetString(name, default_value) end)
  if ok and val and val ~= "" then return val end
  return default_value
end

local function regSetString(reg, name, value)
  if not reg then return end
  pcall(function() reg:SetString(name, value) end)
end

-- =====================================================================
-- Carpeta del programa descargado (manifest.lua + vectores/) -- esto SI
-- cambia en cada descarga, por eso siempre se pregunta con un dialogo.
-- =====================================================================
local function pickManifestFolder()
  local reg = openRegistry()
  local last_dir = regGetString(reg, "last_manifest_dir", "")

  local dlg = FileDialog()
  dlg.InitialDirectory = last_dir
  local ok = dlg:FileOpen("lua", "manifest.lua", "Manifest del programa (manifest.lua) | manifest.lua||")
  if not ok then
    return nil
  end

  regSetString(reg, "last_manifest_dir", dlg.Directory)
  return dlg.Directory
end

local function htmlEscape(s)
  return tostring(s or "")
    :gsub("&", "&amp;")
    :gsub("<", "&lt;")
    :gsub(">", "&gt;")
    :gsub('"', "&quot;")
end

local function extractJsonString(json, key)
  local _, startAt = tostring(json):find('"' .. key .. '"%s*:%s*"')
  if not startAt then return nil end
  local i = startAt + 1
  local out = {}
  local s = tostring(json)
  while i <= #s do
    local c = s:sub(i, i)
    if c == "\\" then
      local n = s:sub(i + 1, i + 1)
      if n == "n" then table.insert(out, "\n")
      elseif n == "r" then table.insert(out, "\r")
      elseif n == "t" then table.insert(out, "\t")
      elseif n == '"' then table.insert(out, '"')
      elseif n == "\\" then table.insert(out, "\\")
      elseif n == "/" then table.insert(out, "/")
      else table.insert(out, n) end
      i = i + 2
    elseif c == '"' then
      break
    else
      table.insert(out, c)
      i = i + 1
    end
  end
  return table.concat(out)
end

local function parseProgramList(json)
  local list = {}
  local arr = tostring(json):match('"programas"%s*:%s*%[(.-)%]')
  if not arr then return list end
  for obj in arr:gmatch("%b{}") do
    local id = obj:match('"id"%s*:%s*"([^"]+)"')
    local nombre = obj:match('"nombre"%s*:%s*"(.-)"')
    local fecha = obj:match('"fecha"%s*:%s*"([^"]*)"') or ""
    if fecha == "" then
      local nullFecha = obj:match('"fecha"%s*:%s*null')
      if nullFecha then fecha = "" end
    end
    local cant = tonumber(obj:match('"cantidad_sellos"%s*:%s*(%-?%d+)')) or 0
    local token = obj:match('"token"%s*:%s*"([^"]+)"') or ""
    if id and nombre then
      table.insert(list, {
        id = id,
        nombre = nombre,
        fecha = fecha,
        cantidad_sellos = cant,
        token = token,
      })
    end
  end
  return list
end

local function parseVectores(json)
  local list = {}
  local arr = tostring(json):match('"vectores"%s*:%s*%[(.-)%]')
  if not arr then return list end
  for obj in arr:gmatch("%b{}") do
    local archivo = obj:match('"archivo"%s*:%s*"([^"]+)"')
    local url = obj:match('"url"%s*:%s*"([^"]+)"')
    if archivo and url then
      table.insert(list, { archivo = archivo, url = url })
    end
  end
  return list
end

local function curlGetToFile(url, headers, outBody, outCode)
  local hdr = ""
  for _, h in ipairs(headers or {}) do
    hdr = hdr .. " -H \"" .. h .. "\""
  end
  local cmd = string.format(
    'curl.exe %s%s -o "%s" -w "%%{http_code}" "%s" > "%s" 2>&1',
    CURL_BASE_FLAGS, hdr, outBody, url, outCode
  )
  os.execute(cmd)
  local code = ""
  local fc = io.open(outCode, "r")
  if fc then code = tostring(fc:read("*a") or ""):gsub("%s", ""); fc:close() end
  local body = ""
  local fb = io.open(outBody, "r")
  if fb then body = tostring(fb:read("*a") or ""); fb:close() end
  return code, body
end

-- Host + path de la URL (sin query/token) para mensajes de error diagnósticos.
local function urlHostPath(url)
  local s = tostring(url or "")
  local noq = s:match("^([^%?]*)") or s
  local rest = noq:match("^https?://(.+)$")
  return rest or noq
end

local function promptInstallKey()
  local html = [[
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"
"http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">
<style type="text/css">
body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; margin: 14px; }
p { margin: 0 0 10px 0; }
</style>
</head>
<body bgcolor="#EEEEFF">
<p><b>Clave de instalacion Alcohn</b> (una sola vez por PC).</p>
<p>La pedis en Configuracion / al equipo. No va en el archivo del gadget.</p>
<br>
<input name="textfield" type="text" size="40" ID="sync_key">
<br><br>
<p align="center">
 <BUTTON style="FONT-WEIGHT:bold; WIDTH:30%" ID="ButtonOK" type=button>OK</BUTTON>
 &nbsp;&nbsp;&nbsp;
 <BUTTON style="FONT-WEIGHT:bold; WIDTH:30%" ID="ButtonCancel" type=button>Cancel</BUTTON>
</p>
</body>
</html>
]]
  local ok, dlg = pcall(HTML_Dialog, true, html, 460, 220, "Clave Alcohn - " .. MACHINE_LABEL)
  if not ok or not dlg then return nil end
  -- Patron oficial Dialog_Simple_Example: Add* antes de ShowDialog, Get* despues.
  dlg:AddTextField("sync_key", "")
  if not dlg:ShowDialog() then return nil end
  local key = tostring(dlg:GetTextField("sync_key") or "")
  key = key:gsub("^%s+", ""):gsub("%s+$", "")
  if key == "" then return nil end
  return key
end

local function ensureInstallKey()
  local reg = openRegistry()
  local key = regGetString(reg, "install_key", "")
  if key ~= "" then return key end
  key = promptInstallKey()
  if not key then return nil end
  regSetString(reg, "install_key", key)
  return key
end

local function chooseProgramFromList(programas)
  local radios = {}
  for i, p in ipairs(programas) do
    local fecha = tostring(p.fecha or "")
    if #fecha > 10 then fecha = fecha:sub(1, 10) end
    local label = string.format(
      "%s  |  %d sellos  |  %s",
      tostring(p.nombre or "?"),
      tonumber(p.cantidad_sellos) or 0,
      fecha
    )
    table.insert(radios, string.format(
      '<input type="radio" name="prog"> %s<br><br>\n',
      htmlEscape(label)
    ))
  end
  table.insert(radios,
    '<input type="radio" name="prog"> Elegir carpeta local (sin internet)<br><br>\n'
  )

  local height = math.min(520, 200 + (#programas + 1) * 36)
  local html = [[
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"
"http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">
<style type="text/css">
body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; margin: 14px; }
p { margin: 0 0 10px 0; }
</style>
</head>
<body bgcolor="#EEEEFF">
<p><b>Elegi el programa</b> (maquina ]] .. MACHINE_LABEL .. [[):</p>
<br>
]] .. table.concat(radios) .. [[
<br>
<p align="center">
 <BUTTON style="FONT-WEIGHT:bold; WIDTH:30%" ID="ButtonOK" type=button>OK</BUTTON>
 &nbsp;&nbsp;&nbsp;
 <BUTTON style="FONT-WEIGHT:bold; WIDTH:30%" ID="ButtonCancel" type=button>Cancel</BUTTON>
</p>
</body>
</html>
]]

  local ok, dlg = pcall(HTML_Dialog, true, html, 520, height, "Programas - " .. MACHINE_LABEL)
  if not ok or not dlg then return nil end
  dlg:AddRadioGroup("prog", 1)
  if not dlg:ShowDialog() then return nil end
  local idx = dlg:GetRadioIndex("prog")
  if idx == #programas + 1 then return "LOCAL" end
  if idx >= 1 and idx <= #programas then return programas[idx] end
  return programas[1]
end

local function downloadProgramPackage(installKey, programaId)
  local tempDir = os.getenv("TEMP") or "C:\\Windows\\Temp"
  local stamp = tostring(os.time())
  local folder = tempDir .. "\\alcohn_prog_" .. tostring(programaId):sub(1, 8) .. "_" .. stamp
  os.execute('cmd /c mkdir "' .. folder .. '" 2>nul')
  os.execute('cmd /c mkdir "' .. folder .. '\\vectores" 2>nul')

  local tmp_body = folder .. "\\_paquete.json"
  local tmp_code = folder .. "\\_paquete.code"
  local url = SYNC_URL .. "?accion=paquete&programa_id=" .. tostring(programaId)
  local code, body = curlGetToFile(
    url,
    { "X-Programa-Sync-Key: " .. installKey },
    tmp_body,
    tmp_code
  )
  pcall(function() os.remove(tmp_code) end)

  if string.sub(code, 1, 1) ~= "2" then
    return nil, "HTTP " .. tostring(code) .. " " .. string.sub(body or "", 1, 80)
  end

  local manifest_lua = extractJsonString(body, "manifest_lua")
  if not manifest_lua or manifest_lua == "" then
    return nil, "paquete sin manifest_lua"
  end

  local mf = io.open(folder .. "\\manifest.lua", "w")
  if not mf then return nil, "no se pudo escribir manifest.lua" end
  mf:write(manifest_lua)
  mf:close()

  local vectores = parseVectores(body)
  if #vectores == 0 then
    return nil, "paquete sin vectores"
  end

  for _, v in ipairs(vectores) do
    local dest = folder .. "\\" .. tostring(v.archivo):gsub("/", "\\")
    local parent = dest:match("^(.*)\\[^\\]+$")
    if parent then os.execute('cmd /c mkdir "' .. parent .. '" 2>nul') end
    local vcode_file = dest .. ".code"
    local vcode, _ = curlGetToFile(v.url, {}, dest, vcode_file)
    pcall(function() os.remove(vcode_file) end)
    if string.sub(vcode, 1, 1) ~= "2" then
      return nil, "fallo bajar " .. tostring(v.archivo)
        .. " desde " .. urlHostPath(v.url)
        .. " (HTTP " .. tostring(vcode) .. ")"
    end
  end

  pcall(function() os.remove(tmp_body) end)
  return folder, nil
end

local function fetchProgramList(installKey)
  local tempDir = os.getenv("TEMP") or "C:\\Windows\\Temp"
  local stamp = tostring(os.time())
  local tmp_body = tempDir .. "\\alcohn_list_" .. stamp .. ".json"
  local tmp_code = tempDir .. "\\alcohn_list_" .. stamp .. ".code"
  local url = SYNC_URL .. "?accion=listar&maquina=" .. MACHINE_CODE
  local code, body = curlGetToFile(
    url,
    { "X-Programa-Sync-Key: " .. installKey },
    tmp_body,
    tmp_code
  )
  pcall(function() os.remove(tmp_body) end)
  pcall(function() os.remove(tmp_code) end)
  if string.sub(code, 1, 1) ~= "2" then
    return nil, "HTTP " .. tostring(code) .. " " .. string.sub(body or "", 1, 80)
  end
  return parseProgramList(body), nil
end

-- Baja el paquete desde la app, o cae al selector de carpeta local.
local function resolveProgramFolder()
  local installKey = ensureInstallKey()
  if not installKey then
    DisplayMessage("Sin clave de instalacion. Se abre el selector de carpeta.")
    return pickManifestFolder()
  end

  local programas, list_err = fetchProgramList(installKey)
  if not programas then
    DisplayMessage(
      "No se pudo listar programas (" .. tostring(list_err) .. ").\n" ..
      "Se abre el selector de carpeta."
    )
    return pickManifestFolder()
  end

  if #programas == 0 then
    DisplayMessage(
      "No hay programas abiertos para maquina " .. MACHINE_LABEL .. ".\n" ..
      "Se abre el selector de carpeta."
    )
    return pickManifestFolder()
  end

  local chosen = chooseProgramFromList(programas)
  if not chosen then return nil end
  if chosen == "LOCAL" then return pickManifestFolder() end

  local folder, dl_err = downloadProgramPackage(installKey, chosen.id)
  if not folder then
    DisplayMessage(
      "No se pudo bajar el paquete (" .. tostring(dl_err) .. ").\n" ..
      "Se abre el selector de carpeta."
    )
    return pickManifestFolder()
  end
  return folder
end

local function loadManifest(folder)
  local path = folder .. "\\manifest.lua"
  local ok, manifest = pcall(dofile, path)
  if not ok or type(manifest) ~= "table" then
    return nil, "No se pudo leer manifest.lua en " .. path .. " (" .. tostring(manifest) .. ")"
  end
  return manifest, nil
end

local function stampLabel(s)
  if type(s) ~= "table" then return "?" end
  local d = s.diseno
  if d and tostring(d) ~= "" then return tostring(d) end
  return tostring(s.sello_id or "?")
end

-- Firma confirmada por sonda: CadObject usa ParameterList, GetString(nombre, default, crear_si_no_existe).
local function sellosPresentes(job)
  local presentes = {}
  local corte = job.LayerManager:GetLayerWithName("Corte")
  if corte then
    local pos = corte:GetHeadPosition()
    while pos do
      local obj, newPos = corte:GetNext(pos)
      pos = newPos
      if obj then
        local ok, id = pcall(function() return obj:GetString("ALCOHN_SELLO_ID", "", false) end)
        if ok and id and id ~= "" then
          presentes[string.lower(tostring(id))] = true
        end
      end
    end
  end
  -- Compatibilidad: UUID en nombres de capa (programas armados antes del tag).
  local lm = job.LayerManager
  local lpos = lm:GetHeadPosition()
  while lpos do
    local layer, newPos = lm:GetNext(lpos)
    lpos = newPos
    if layer then
      local okn, name = pcall(function() return layer.Name end)
      if okn and name then
        local uuid = string.match(string.lower(name),
          "(%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x)")
        if uuid then presentes[uuid] = true end
      end
    end
  end
  return presentes
end

local function countPresentes(presentes)
  local n = 0
  for _ in pairs(presentes) do n = n + 1 end
  return n
end

local function vaciarCapa(job, nombre)
  local layer = job.LayerManager:FindLayerWithName(nombre)
  if not layer then return end
  local objetos = {}
  local pos = layer:GetHeadPosition()
  while pos do
    local obj, newPos = layer:GetNext(pos)
    pos = newPos
    if obj then table.insert(objetos, obj) end
  end
  for _, obj in ipairs(objetos) do
    pcall(function() layer:RemoveObject(obj) end)
  end
end

local function clearGadgetGeneratedLayers(job)
  for _, nombre in ipairs(GADGET_GENERATED_LAYERS) do
    vaciarCapa(job, nombre)
  end
  job:Refresh2DView()
end

local function countObjetosEnCorte(job)
  local corte = job.LayerManager:GetLayerWithName("Corte")
  if not corte then return 0 end
  local n = 0
  local pos = corte:GetHeadPosition()
  while pos do
    local obj, newPos = corte:GetNext(pos)
    pos = newPos
    if obj then n = n + 1 end
  end
  return n
end

local function countSellosTageados(job)
  local corte = job.LayerManager:GetLayerWithName("Corte")
  if not corte then return 0 end
  local n = 0
  local pos = corte:GetHeadPosition()
  while pos do
    local obj, newPos = corte:GetNext(pos)
    pos = newPos
    if obj then
      local ok, id = pcall(function() return obj:GetString("ALCOHN_SELLO_ID", "", false) end)
      if ok and id and id ~= "" then n = n + 1 end
    end
  end
  return n
end

-- Selector 9.5: sellos que estaban en la corrida anterior y ya no estan en el archivo.
-- Devuelve "SIN_MATERIAL" | "REIMPORT" | "LATER" | nil si cancela.
local function chooseDeletedSellosAction(lista_texto)
  local html = [[
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"
"http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">
<style type="text/css">
body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; margin: 14px; }
p { margin: 0 0 10px 0; white-space: pre-wrap; }
label { display: block; margin: 8px 0; }
</style>
</head>
<body bgcolor="#EEEEFF">
<p><b>Estos sellos estan en el programa pero no en el archivo:</b></p>
<p>]] .. lista_texto .. [[</p>
<br>
<input type="radio" name="accion"> Los borre a proposito (no alcanzaba el material)<br><br>
<input type="radio" name="accion"> Se perdieron por error (volver a importarlos ahora)<br><br>
<input type="radio" name="accion"> Decidir despues (no hacer nada)<br><br>
<br>
<p align="center">
 <BUTTON style="FONT-WEIGHT:bold; WIDTH:30%" ID="ButtonOK" type=button>OK</BUTTON>
 &nbsp;&nbsp;&nbsp;
 <BUTTON style="FONT-WEIGHT:bold; WIDTH:30%" ID="ButtonCancel" type=button>Cancel</BUTTON>
</p>
</body>
</html>
]]

  local ok, dlg = pcall(HTML_Dialog, true, html, 480, 340, "Sellos faltantes - " .. MACHINE_LABEL)
  if not ok or not dlg then return nil end

  dlg:AddRadioGroup("accion", 1)

  if not dlg:ShowDialog() then return nil end

  local idx = dlg:GetRadioIndex("accion")
  if idx == 2 then return "REIMPORT" end
  if idx == 3 then return "LATER" end
  return "SIN_MATERIAL"
end

-- Selector de modo (API oficial HTML_Dialog: radios + ButtonOK/Cancel).
-- Devuelve "ARMAR" | "ACTUALIZAR" | "REHACER" | "SOLO_RECALCULAR", o nil si cancela.
local function chooseMode(tiene_sellos)
  if not tiene_sellos then return "ARMAR" end

  local html = [[
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"
"http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">
<style type="text/css">
body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; margin: 14px; }
p { margin: 0 0 10px 0; }
label { display: block; margin: 8px 0; }
</style>
</head>
<body bgcolor="#EEEEFF">
<p><b>Este programa ya tiene sellos.</b> Que queres hacer?</p>
<br>
<input type="radio" name="modo"> Actualizar (solo lo nuevo)<br><br>
<input type="radio" name="modo"> Rehacer desde cero<br><br>
<input type="radio" name="modo"> Solo recalcular<br><br>
<br>
<p align="center">
 <BUTTON style="FONT-WEIGHT:bold; WIDTH:30%" ID="ButtonOK" type=button>OK</BUTTON>
 &nbsp;&nbsp;&nbsp;
 <BUTTON style="FONT-WEIGHT:bold; WIDTH:30%" ID="ButtonCancel" type=button>Cancel</BUTTON>
</p>
</body>
</html>
]]

  local ok, dlg = pcall(HTML_Dialog, true, html, 420, 280, "Modo - Armar programa " .. MACHINE_LABEL)
  if not ok or not dlg then
    DisplayMessage("No se pudo abrir el selector de modo. Cancelado.")
    return nil
  end

  dlg:AddRadioGroup("modo", 1)

  if not dlg:ShowDialog() then
    return nil
  end

  local idx = dlg:GetRadioIndex("modo")
  if idx == 2 then return "REHACER" end
  if idx == 3 then return "SOLO_RECALCULAR" end
  return "ACTUALIZAR"
end

local function jsonEscape(str)
  return tostring(str)
    :gsub("\\", "\\\\")
    :gsub('"', '\\"')
    :gsub("\r", "\\r")
    :gsub("\n", "\\n")
    :gsub("\t", "\\t")
end

local function jsonString(str)
  return '"' .. jsonEscape(str) .. '"'
end

local function jsonStringArray(list)
  local parts = {}
  for _, v in ipairs(list or {}) do
    table.insert(parts, jsonString(v))
  end
  return "[" .. table.concat(parts, ",") .. "]"
end

local function jsonObjectArray(list, fields)
  local parts = {}
  for _, row in ipairs(list or {}) do
    local fields_json = {}
    for _, f in ipairs(fields) do
      local val = row[f]
      if val ~= nil then
        if type(val) == "number" then
          table.insert(fields_json, jsonString(f) .. ":" .. tostring(val))
        else
          table.insert(fields_json, jsonString(f) .. ":" .. jsonString(tostring(val)))
        end
      end
    end
    table.insert(parts, "{" .. table.concat(fields_json, ",") .. "}")
  end
  return "[" .. table.concat(parts, ",") .. "]"
end

local function makeEventId()
  local t = os.time() or 0
  local r = math.random(0, 0xffff)
  return string.format("%s-%08x-%04x", MACHINE_CODE, t, r)
end

local function isoNow()
  return os.date("!%Y-%m-%dT%H:%M:%S")
end

local function jsonNumberObject(obj)
  if not obj or type(obj) ~= "table" then return "{}" end
  local parts = {}
  for k, v in pairs(obj) do
    local n = tonumber(v)
    if n then
      table.insert(parts, jsonString(tostring(k)) .. ":" .. tostring(n))
    end
  end
  return "{" .. table.concat(parts, ",") .. "}"
end

local function buildReportJson(report)
  local evento_id = report.evento_id or makeEventId()
  local maquinado = report.maquinado_segundos
  local maquinado_json = maquinado ~= nil and tostring(tonumber(maquinado) or 0) or "null"
  return table.concat({
    "{",
    '"version":1,',
    '"gadget_version":' .. jsonString(GADGET_VERSION) .. ",",
    '"programa_id":' .. jsonString(report.programa_id or "") .. ",",
    '"token":' .. jsonString(report.token or "") .. ",",
    '"evento_id":' .. jsonString(evento_id) .. ",",
    '"maquina":' .. jsonString(MACHINE_CODE) .. ",",
    '"modo":' .. jsonString(report.modo or "") .. ",",
    '"escrito_at":' .. jsonString(isoNow()) .. ",",
    '"sellos_presentes":' .. jsonStringArray(report.sellos_presentes) .. ",",
    '"sellos_importados_ahora":' .. jsonStringArray(report.sellos_importados_ahora) .. ",",
    '"sellos_no_importados":' .. jsonObjectArray(report.sellos_no_importados, { "sello_id", "motivo", "diseno" }) .. ",",
    '"sellos_borrados_en_maquina":' .. jsonObjectArray(report.sellos_borrados_en_maquina, { "sello_id", "motivo" }) .. ",",
    '"sellos_en_otra_planchuela":' .. jsonObjectArray(report.sellos_en_otra_planchuela, { "sello_id", "diseno", "planificada", "real" }) .. ",",
    '"sobrantes_no_identificados":' .. tostring(report.sobrantes_no_identificados or 0) .. ",",
    '"material_por_planchuela":' .. jsonNumberObject(report.material_por_planchuela) .. ",",
    -- segundos (NO minutos): la Edge Function divide por 60 al guardar maquinado_minutos
    '"maquinado_segundos":' .. maquinado_json .. ",",
    '"control":{"objetos_en_corte":' .. tostring(report.objetos_en_corte or 0) ..
      ',"sellos_tageados":' .. tostring(report.sellos_tageados or 0) .. "}",
    "}",
  }), evento_id
end

local function readJobParamString(job, key)
  local params = job.JobParameters
  if not params then return nil end
  local ok, v = pcall(function() return params:GetString(key, "", false) end)
  if ok and v and v ~= "" then return v end
  return nil
end

local function parseUuidListFromJsonArray(section)
  local set = {}
  if not section then return set end
  for uuid in tostring(section):gmatch('"(%x%x%x%x%x%x%x%x%-[%x%-]+)"') do
    set[string.lower(uuid)] = true
  end
  return set
end

local function parseSellosPresentesFromBlob(json)
  if not json then return {} end
  local section = json:match('"sellos_presentes"%s*:%s*%[(.-)%]')
  return parseUuidListFromJsonArray(section)
end

local function loadExcluidosSet(job)
  local raw = readJobParamString(job, "ALCOHN_EXCLUIDOS_V1")
  if not raw then return {} end
  return parseUuidListFromJsonArray(raw)
end

local function saveExcluidosSet(job, set)
  local params = job.JobParameters
  if not params then return false end
  local list = {}
  for id in pairs(set or {}) do table.insert(list, id) end
  table.sort(list)
  local ok, err = pcall(function()
    params:SetString("ALCOHN_EXCLUIDOS_V1", jsonStringArray(list))
  end)
  return ok, err
end

local function writeSyncBlob(job, jsonPayload)
  local params = job.JobParameters
  if not params then return false, "JobParameters no disponible" end
  local ok, err = pcall(function()
    params:SetString("ALCOHN_PROGRAMA_V1", jsonPayload)
  end)
  if not ok then return false, tostring(err) end
  return true, nil
end

local function postSyncReport(jsonPayload)
  if not SYNC_URL or SYNC_URL == "" then return false, "sin URL" end
  local tempDir = os.getenv("TEMP") or "C:\\Windows\\Temp"
  local stamp = tostring(os.time())
  local tmp_json = tempDir .. "\\alcohn_sync_" .. stamp .. ".json"
  local tmp_body = tempDir .. "\\alcohn_sync_" .. stamp .. "_body.txt"
  local tmp_code = tempDir .. "\\alcohn_sync_" .. stamp .. "_code.txt"

  local f = io.open(tmp_json, "w")
  if not f then return false, "no se pudo escribir el temporal" end
  f:write(jsonPayload)
  f:close()

  local cmd = string.format(
    'curl.exe ' .. CURL_BASE_FLAGS .. ' -X POST -H "Content-Type: application/json" '
      .. '--data-binary "@%s" -o "%s" -w "%%{http_code}" "%s" > "%s" 2>&1',
    tmp_json, tmp_body, SYNC_URL, tmp_code
  )
  os.execute(cmd)

  local code = ""
  local fc = io.open(tmp_code, "r")
  if fc then code = tostring(fc:read("*a") or ""):gsub("%s", ""); fc:close() end

  local body = ""
  local fb = io.open(tmp_body, "r")
  if fb then body = tostring(fb:read("*a") or ""); fb:close() end

  pcall(function() os.remove(tmp_json) end)
  pcall(function() os.remove(tmp_body) end)
  pcall(function() os.remove(tmp_code) end)

  if string.sub(code, 1, 1) == "2" then return true, nil end
  if code == "" or code == "000" then
    return false, "sin conexion con la app"
  end
  return false, "HTTP " .. code .. " " .. string.sub(body, 1, 80)
end

-- =====================================================================
-- Deteccion de "que se acaba de importar" para SVG (ImportSVG no
-- garantiza dejar la seleccion activa, a diferencia de ImportDxfDwg).
-- =====================================================================
local function snapshotLayerNames(job)
  local names = {}
  local lm = job.LayerManager
  local ok, pos = pcall(function() return lm:GetHeadPosition() end)
  if not ok then return names end
  while pos do
    local layer, newPos = lm:GetNext(pos)
    pos = newPos
    if layer then
      local ok2, name = pcall(function() return layer.Name end)
      if ok2 and name then
        names[name] = true
      end
    end
  end
  return names
end

local function selectObjectsFromNewLayers(job, before_names)
  local lm = job.LayerManager
  job.Selection:Clear()
  local added = 0

  local pos = lm:GetHeadPosition()
  while pos do
    local layer, newPos = lm:GetNext(pos)
    pos = newPos
    if layer then
      local ok, name = pcall(function() return layer.Name end)
      name = ok and name or nil
      local is_known = name and KNOWN_LAYERS[name]
      local is_new = name and not before_names[name]
      if is_new and not is_known then
        local lpos = layer:GetHeadPosition()
        while lpos do
          local obj, newLpos = layer:GetNext(lpos)
          lpos = newLpos
          if obj then
            job.Selection:Add(obj, true, false)
            added = added + 1
          end
        end
      end
    end
  end

  return added > 0
end

local function validateAndFixScale(job, expected_ancho_mm, expected_largo_mm)
  local selection = job.Selection
  local bbox = selection:GetBoundingBox()
  if not bbox then
    return false, "no se pudo leer el tamano del vector recien importado"
  end

  local actual_w = bbox.MaxX - bbox.MinX
  local actual_h = bbox.MaxY - bbox.MinY
  local actual_major = math.max(actual_w, actual_h)
  local expected_major = math.max(tonumber(expected_ancho_mm) or 0, tonumber(expected_largo_mm) or 0)

  if actual_major <= 0 or expected_major <= 0 then
    return true, nil
  end

  local ratio = expected_major / actual_major
  if math.abs(ratio - 1.0) <= SCALE_TOLERANCE then
    return true, nil
  end

  if ratio < SCALE_MIN_SANE or ratio > SCALE_MAX_SANE then
    return false, string.format(
      "escala muy distinta (~%.0fmm vs %.0fmm)",
      actual_major, expected_major
    )
  end

  local centerX = (bbox.MinX + bbox.MaxX) / 2
  local centerY = (bbox.MinY + bbox.MaxY) / 2
  local ok, err = pcall(function()
    local scaleMatrix = ScalingMatrix2D(Point2D(centerX, centerY), Vector2D(ratio, ratio))
    selection:Transform(scaleMatrix)
  end)
  if not ok then
    return false, "no se pudo corregir la escala"
  end
  job:Refresh2DView()

  return true, string.format("escala corregida (x%.3f)", ratio)
end

-- =====================================================================
-- Automatizacion de tipo, inlineada (copia fiel de AUTOMATIZACION_
-- SIMPLIFICADA.lua / AUTOMATIZACION_SIMPLIFICADA_3MM CHICA.lua) -- se
-- parametriza por nombre de capa en vez de tener dos archivos separados.
-- =====================================================================

local function copySelectionToLayer(vector_layer_name)
  local job = VectricJob()
  local selection = job.Selection

  if selection.IsEmpty then
    DisplayMessage("Advertencia: No hay objetos seleccionados para copiar")
    return false
  end

  local layer_manager = job.LayerManager
  local vector_layer = layer_manager:GetLayerWithName(vector_layer_name)

  local objects_to_copy = {}
  local pos = selection:GetHeadPosition()
  while pos do
    local obj, newPos = selection:GetNext(pos)
    pos = newPos
    if obj then
      table.insert(objects_to_copy, obj)
    end
  end

  local copied_count = 0

  for i, obj in ipairs(objects_to_copy) do
    local status, cloned_obj = pcall(function() return obj:Clone() end)
    if status and cloned_obj then
      local add_status, add_result = pcall(function()
        vector_layer:AddObject(cloned_obj, true)
        return true
      end)
      if add_status and add_result then
        copied_count = copied_count + 1
      end
    end
  end

  if copied_count == 0 then
    for i, obj in ipairs(objects_to_copy) do
      local status, contour = pcall(function() return obj:GetContour() end)
      if status and contour then
        local new_status, new_obj = pcall(function() return CreateCadContour(contour) end)
        if new_status and new_obj then
          local add_status, add_result = pcall(function()
            vector_layer:AddObject(new_obj, true)
            return true
          end)
          if add_status and add_result then
            copied_count = copied_count + 1
          end
        end
      end
    end
  end

  job:Refresh2DView()

  if copied_count > 0 then
    for _, orig in ipairs(objects_to_copy) do
      local ok_id, raw_id = pcall(function() return orig.RawLayerId end)
      if ok_id and raw_id then
        local src_layer = layer_manager:GetLayerWithId(raw_id)
        if src_layer then
          local lname = ""
          local okn, n = pcall(function() return src_layer.Name end)
          if okn then lname = n or "" end
          local lname_lower = string.lower(lname)
          if lname ~= vector_layer_name and lname_lower ~= "dispositivo" then
            pcall(function() src_layer:RemoveObject(orig) end)
          end
        end
      end
    end
    job:Refresh2DView()
    return true
  else
    DisplayMessage("No se pudo copiar ningun objeto a capa " .. vector_layer_name)
    return false
  end
end

local function getObjectsFromLayer(layer_name)
  local job = VectricJob()
  if not job.Exists then return {} end
  local layer = job.LayerManager:FindLayerWithName(layer_name)
  if not layer then
    DisplayMessage("Advertencia: No se encontro la capa '" .. layer_name .. "'")
    return {}
  end
  local objects = {}
  local pos = layer:GetHeadPosition()
  while pos do
    local obj, newPos = layer:GetNext(pos)
    pos = newPos
    if obj then table.insert(objects, obj) end
  end
  return objects
end

local function createAdditionalElements(column, bbox, sello_id)
  if not column or not bbox then return end
  local job = VectricJob()
  local layer_manager = job.LayerManager
  local corteLayer = layer_manager:GetLayerWithName("Corte")
  local taladradoLayer = layer_manager:GetLayerWithName("Taladrado")

  if not bbox.MinX or not bbox.MaxX or not bbox.MinY or not bbox.MaxY then return end

  local lineLength = column.nom + 8
  local halfLine = lineLength / 2
  local lineX1 = column.xpos - halfLine
  local lineX2 = column.xpos + halfLine
  local lineY = bbox.MinY - 4

  pcall(function()
    local newLineContour = Contour(0.0)
    newLineContour:AppendPoint(Point2D(lineX1, lineY))
    newLineContour:LineTo(Point2D(lineX2, lineY))
    local cad_line = CreateCadContour(newLineContour)
    if cad_line then
      corteLayer:AddObject(cad_line, true)
      -- Tag fuente de verdad para modo Actualizar (sonda 5a/5b OK).
      if sello_id and tostring(sello_id) ~= "" then
        pcall(function() cad_line:SetString("ALCOHN_SELLO_ID", tostring(sello_id)) end)
      end
    end
  end)

  local radius = 3
  local circleCenterX = (bbox.MinX + bbox.MaxX) / 2
  local circleCenterY = (bbox.MinY + bbox.MaxY) / 2

  pcall(function()
    local circleContour = Contour(0.0)
    circleContour:AppendPoint(Point2D(circleCenterX + radius, circleCenterY))
    circleContour:ArcTo(Point2D(circleCenterX, circleCenterY + radius), Point2D(circleCenterX, circleCenterY), true)
    circleContour:ArcTo(Point2D(circleCenterX - radius, circleCenterY), Point2D(circleCenterX, circleCenterY), true)
    circleContour:ArcTo(Point2D(circleCenterX, circleCenterY - radius), Point2D(circleCenterX, circleCenterY), true)
    circleContour:ArcTo(Point2D(circleCenterX + radius, circleCenterY), Point2D(circleCenterX, circleCenterY), true)
    local cad_circle = CreateCadContour(circleContour)
    if cad_circle then taladradoLayer:AddObject(cad_circle, true) end
  end)

  job:Refresh2DView()
end

local function processSingleObject(obj, sello_id)
  local job = VectricJob()
  local selection = job.Selection

  selection:Clear()
  selection:Add(obj, true, false)
  if selection.IsEmpty then
    DisplayMessage("Error: no se pudo seleccionar objeto")
    return false, "no se pudo seleccionar objeto"
  end

  if not job:GroupSelection() then
    DisplayMessage("Advertencia: no se pudo agrupar (puede que ya este agrupado)")
  end

  local bbox = selection:GetBoundingBox()
  if not bbox then return false, "sin bounding box" end

  local centerX = (bbox.MinX + bbox.MaxX) / 2
  local refP1 = Point2D(centerX, 0)
  local refP2 = Point2D(centerX, 1)
  local mirrorMatrix = ReflectionMatrix2D(refP1, refP2)

  local pos = selection:GetHeadPosition()
  while pos do
    local cadObj, newPos = selection:GetNext(pos)
    pos = newPos
    if cadObj and cadObj.IsSelected and cadObj:CanTransform(4) then
      cadObj:Transform(mirrorMatrix)
    end
  end
  job:Refresh2DView()

  bbox = selection:GetBoundingBox()
  if not bbox then return false, "sin bounding box tras espejo" end

  local groupWidth = bbox.MaxX - bbox.MinX
  local groupHeight = bbox.MaxY - bbox.MinY

  local candidate = nil
  local needRotation = false
  for i, col in ipairs(COLUMNS) do
    if groupWidth <= col.eff then
      if candidate == nil or col.eff < candidate.eff then
        candidate = col
        needRotation = false
      end
    elseif groupHeight <= col.eff then
      if candidate == nil or col.eff < candidate.eff then
        candidate = col
        needRotation = true
      end
    end
  end

  if not candidate then
    candidate = COLUMNS[#COLUMNS]
    needRotation = false
  end

  if needRotation then
    local groupCenterX = (bbox.MinX + bbox.MaxX) / 2
    local groupCenterY = (bbox.MinY + bbox.MaxY) / 2
    local rotationMatrix = RotationMatrix2D(Point2D(groupCenterX, groupCenterY), 90)
    selection:Transform(rotationMatrix)
    job:Refresh2DView()
    bbox = selection:GetBoundingBox()
    if not bbox then return false, "sin bounding box tras rotacion" end
    groupHeight = bbox.MaxY - bbox.MinY
  end

  local targetTopY = TARGET_TOP_Y
  local tol = 1.0
  local corteLayer = job.LayerManager:GetLayerWithName("Corte")
  if corteLayer then
    local pos2 = corteLayer:GetHeadPosition()
    while pos2 do
      local obj2, newPos2 = corteLayer:GetNext(pos2)
      pos2 = newPos2
      if obj2 then
        local objBBox = obj2:GetBoundingBox()
        if objBBox then
          local objCenterX = (objBBox.MinX + objBBox.MaxX) / 2
          if math.abs(objCenterX - candidate.xpos) < tol then
            if objBBox.MinY < targetTopY then
              targetTopY = objBBox.MinY - 4
            end
          end
        end
      end
    end
  end

  -- Validar largo ANTES de apilar (5.5). largo_maximo_mm viene del manifest.
  if LARGO_MAXIMO_MM and type(LARGO_MAXIMO_MM) == "number" then
    local bottom_y = targetTopY - groupHeight
    local used_mm = -bottom_y
    if used_mm > LARGO_MAXIMO_MM + 1e-6 then
      return false, string.format(
        "supera el largo maximo de planchuela (%.1f mm > %.0f mm). No se apilo.",
        used_mm, LARGO_MAXIMO_MM
      )
    end
  end

  local groupCenterX = (bbox.MinX + bbox.MaxX) / 2
  local dx = candidate.xpos - groupCenterX
  local dy = targetTopY - bbox.MaxY
  local translationMatrix = TranslationMatrix2D(Vector2D(dx, dy))
  selection:Transform(translationMatrix)
  job:Refresh2DView()

  local updated_bbox = selection:GetBoundingBox()
  if updated_bbox then
    createAdditionalElements(candidate, updated_bbox, sello_id)
  end

  return true, nil, candidate.nom
end

local function offsetOperations(vector_layer_name, offset_ext_layer_name)
  local job = VectricJob()
  if not job.Exists then return false end

  local vector_layer = job.LayerManager:GetLayerWithName(vector_layer_name)
  if not vector_layer then
    DisplayMessage("Error: no se encontro la capa " .. vector_layer_name)
    return false
  end

  job.Selection:Clear()
  local pos = vector_layer:GetHeadPosition()
  while pos ~= nil do
    local object
    object, pos = vector_layer:GetNext(pos)
    job.Selection:Add(object, true, false)
  end

  if job.Selection.IsEmpty then
    DisplayMessage("Error: no hay vectores seleccionados")
    return false
  end

  if job.Selection.GroupSelectionFinished then
    pcall(function() job.Selection:GroupSelectionFinished() end)
  end

  local tolerance = 0.01
  if GetDefaultContourTolerance then
    pcall(function() tolerance = GetDefaultContourTolerance() end)
  end

  local success = pcall(function()
    local group = CreateCopyOfSelectedContours(false, false, tolerance)
    if not group then error("CreateCopyOfSelectedContours devolvio nil") end

    local offset_4mm = group:Offset(4.0, 4.0, 1, true)
    if not offset_4mm then error("Offset de 4mm fallo") end

    local offset_3_5mm = offset_4mm:Offset(-3.5, 3.5, 1, true)
    if not offset_3_5mm then error("Offset interior de 3.5mm fallo") end

    local cad_group_1 = CreateCadGroup(offset_3_5mm)
    local offset1_layer = job.LayerManager:GetLayerWithName("Offset 1 vector")
    offset1_layer:AddObject(cad_group_1, true)

    local offset_1_5mm = offset_3_5mm:Offset(1.5, 1.5, 1, true)
    if not offset_1_5mm then error("Offset exterior de 1.5mm fallo") end

    local cad_group_2 = CreateCadGroup(offset_1_5mm)
    local offset_ext_layer = job.LayerManager:GetLayerWithName(offset_ext_layer_name)
    offset_ext_layer:AddObject(cad_group_2, true)

    job:Refresh2DView()
    return true
  end)

  if not success then
    DisplayMessage("ERROR: el proceso de offset fallo")
    return false
  end
  return true
end

local function ungroupLayers(layer_names)
  local job = VectricJob()
  if not job.Exists then return false end

  local total_ungrouped = 0
  for _, layer_name in ipairs(layer_names) do
    local layer = job.LayerManager:GetLayerWithName(layer_name)
    if layer then
      job.Selection:Clear()
      local pos = layer:GetHeadPosition()
      local layer_selected = 0
      while pos do
        local obj, newPos = layer:GetNext(pos)
        pos = newPos
        if obj then
          job.Selection:Add(obj, true, false)
          layer_selected = layer_selected + 1
        end
      end
      if layer_selected > 0 then
        if job.Selection.GroupSelectionFinished then
          pcall(function() job.Selection:GroupSelectionFinished() end)
        end
        pcall(function()
          if job.UnGroupSelection then
            local ok = job:UnGroupSelection(true, false)
            if ok then total_ungrouped = total_ungrouped + layer_selected end
          end
        end)
      end
    end
  end
  job.Selection:Clear()
  job:Refresh2DView()
  return true
end

-- Corre la automatizacion completa (equivalente al viejo main() de cada
-- script de tipo) sobre la seleccion actual (el vector recien importado).
local function runTypeAutomation(tipo, sello_id)
  local job = VectricJob()
  if not job.Exists then return false, "no hay trabajo activo" end

  local selection = job.Selection
  if selection.IsEmpty then return false, "no hay objetos seleccionados" end

  if not job:GroupSelection() then
    -- puede que ya este agrupado, no es un error fatal
  end

  local upper = string.upper(tostring(tipo or ""))
  local vector_layer_name, offset_ext_layer_name, ungroup_layers
  if upper == "3MM" then
    vector_layer_name = "VECTOR 3MM"
    offset_ext_layer_name = "Offset exterior vector 3mm"
    ungroup_layers = { "VECTOR 3MM", "Offset 1 vector", "Offset exterior vector 3mm" }
  else
    vector_layer_name = "VECTOR"
    offset_ext_layer_name = "Offset exterior vector"
    ungroup_layers = { "VECTOR", "Offset 1 vector", "Offset exterior vector" }
  end

  if not copySelectionToLayer(vector_layer_name) then
    return false, "no se pudo copiar a capa " .. vector_layer_name
  end

  local vector_objects = getObjectsFromLayer(vector_layer_name)
  if #vector_objects == 0 then
    return false, "no se encontraron objetos en capa " .. vector_layer_name
  end

  local latest_obj = vector_objects[#vector_objects]
  local ok_pos, pos_err, col_nom = processSingleObject(latest_obj, sello_id)
  if not ok_pos then
    return false, pos_err or "error procesando el objeto"
  end

  if not offsetOperations(vector_layer_name, offset_ext_layer_name) then
    return false, "error en las operaciones de offset"
  end

  ungroupLayers(ungroup_layers)
  return true, nil, col_nom
end

-- =====================================================================
-- Import + validacion de escala + orquestacion del programa completo
-- =====================================================================
-- Normaliza nom de columna (12.7) a tamaño de planchuela del manifest (12).
local function displayPlanchuela(n)
  local v = tonumber(n)
  if not v then return nil end
  if math.abs(v - 12.7) < 0.15 then return 12 end
  return math.floor(v + 0.5)
end

local function processStamp(job, folder, s)
  local label = stampLabel(s)
  local archivo = tostring(s.archivo or "")
  local vector_path = folder .. "\\" .. archivo
  local lower = string.lower(archivo)
  local warning = nil
  local otra_planchuela = nil

  if string.match(lower, "%.svg$") then
    local before = snapshotLayerNames(job)
    if not job:ImportSVG(vector_path) then
      return false, "no se pudo importar el vector", nil, nil
    end
    if not selectObjectsFromNewLayers(job, before) then
      return false, "importo pero no se pudo seleccionar", nil, nil
    end
  elseif string.match(lower, "%.dxf$") or string.match(lower, "%.dwg$") then
    if not job:ImportDxfDwg(vector_path) then
      return false, "no se pudo importar el vector", nil, nil
    end
  else
    local ext = string.match(lower, "%.([%w]+)$") or "?"
    return false, "el vector esta en ." .. ext .. ", re-vectorizalo.", nil, nil
  end

  local scale_ok, scale_msg = validateAndFixScale(job, s.ancho_mm, s.largo_mm)
  if not scale_ok then
    return false, tostring(scale_msg), nil, nil
  end
  if scale_msg then
    warning = label .. ": " .. scale_msg
  end

  local step_ok, step_err, col_nom = runTypeAutomation(s.tipo, s.sello_id)
  if not step_ok then
    return false, tostring(step_err), warning, nil
  end

  local planificada = displayPlanchuela(s.tipo_planchuela)
  local real = displayPlanchuela(col_nom)
  if planificada and real and planificada ~= real then
    local msg = string.format(
      "%s: va en planchuela %d (planificado en %d).",
      label, real, planificada
    )
    if warning then
      warning = warning .. "\n" .. msg
    else
      warning = msg
    end
    otra_planchuela = {
      sello_id = tostring(s.sello_id or ""),
      diseno = label,
      planificada = planificada,
      real = real,
    }
  end

  return true, nil, warning, otra_planchuela
end

-- Paso 3: por cada columna con al menos un sello posicionado (busca en la
-- capa "Corte" las lineas que ya dejo createAdditionalElements por sello),
-- crea los 2 rectangulos de planchuela (Planeado / Rectangulo exterior) y
-- al final recalcula todas las trayectorias del job.
local PASO3_COLUMNS = COLUMNS

-- Devuelve: err_msg_or_nil, material_por_planchuela { ["19"]=120.5, ... }
local function runPaso3AndRecalculate(job)
  -- Vaciar capas 100% generadas para no duplicar rectangulos al re-correr (5.4).
  vaciarCapa(job, "Planeado")
  vaciarCapa(job, "Rectangulo exterior")

  local material = {}
  local layer_manager = job.LayerManager
  local vectorLayer = layer_manager:GetLayerWithName("Corte")
  local planeadoLayer = layer_manager:GetLayerWithName("Planeado")
  local rectExtLayer = layer_manager:GetLayerWithName("Rectangulo exterior")

  if not vectorLayer or not planeadoLayer or not rectExtLayer then
    return "Paso 3 NO ejecutado: faltan capas en el .crv3d base (Corte / Planeado / Rectangulo exterior).", material
  end

  local tol = 1.0
  local columnas_procesadas = 0

  for i, col in ipairs(PASO3_COLUMNS) do
    local minY = nil
    local pos = vectorLayer:GetHeadPosition()
    while pos do
      local obj, newPos = vectorLayer:GetNext(pos)
      pos = newPos
      if obj then
        local bb = obj:GetBoundingBox()
        if bb then
          local cx = (bb.MinX + bb.MaxX) / 2
          if math.abs(cx - col.xpos) < tol then
            if (minY == nil) or (bb.MinY < minY) then
              minY = bb.MinY
            end
          end
        end
      end
    end

    if minY then
      local topY = 0
      local bottomY = minY - 3
      local largo_mm = math.abs(TARGET_TOP_Y - minY)
      if largo_mm > 0 then
        material[tostring(col.nom)] = math.floor(largo_mm * 10 + 0.5) / 10
      end

      local function addRect(width, layer)
        local halfWidth = width / 2
        local leftX = col.xpos - halfWidth
        local rightX = col.xpos + halfWidth
        local contour = Contour(0.0)
        contour:AppendPoint(Point2D(leftX, topY))
        contour:LineTo(Point2D(rightX, topY))
        contour:LineTo(Point2D(rightX, bottomY))
        contour:LineTo(Point2D(leftX, bottomY))
        contour:LineTo(Point2D(leftX, topY))
        local cadRect = CreateCadContour(contour)
        if cadRect then layer:AddObject(cadRect, true) end
      end

      addRect(col.nom + 6, planeadoLayer)
      addRect(col.nom + 14, rectExtLayer)
      columnas_procesadas = columnas_procesadas + 1
    end
  end

  job:Refresh2DView()

  if columnas_procesadas == 0 then
    return "Paso 3: sin columnas con sellos.", material
  end

  local tm = ToolpathManager()
  local ok, calc_result = pcall(function() return tm:RecalculateAllToolpaths() end)
  if ok and calc_result then
    return nil, material
  else
    return "Paso 3: fallo el recalculo de trayectorias.", material
  end
end

-- Suma MachiningTime(true) de todos los toolpaths (segundos). Llamar despues de recalcular.
local function sumMachiningSeconds()
  local total = 0
  local ok = pcall(function()
    local tm = ToolpathManager()
    local pos = tm:GetHeadPosition()
    while pos do
      local toolpath, newPos = tm:GetNext(pos)
      pos = newPos
      if toolpath then
        local okt, t = pcall(function() return toolpath:MachiningTime(true) end)
        if okt and type(t) == "number" then
          total = total + t
        end
      end
    end
  end)
  if not ok then return nil end
  return total
end

function main()
  math.randomseed(os.time() or 1)

  local job = VectricJob()
  if not job.Exists then
    DisplayMessage("Abri primero el programa.crv3d de la maquina " .. MACHINE_LABEL .. " antes de correr este gadget.")
    return true
  end

  local folder = resolveProgramFolder()
  if not folder then
    DisplayMessage("Cancelado: no se eligio programa ni carpeta.")
    return true
  end

  local manifest, load_err = loadManifest(folder)
  if not manifest then
    DisplayMessage(load_err)
    return true
  end

  if manifest.maquina and manifest.maquina ~= MACHINE_CODE then
    DisplayMessage(
      "Atencion: este gadget es para maquina " .. MACHINE_LABEL .. " (" .. MACHINE_CODE ..
      ") y el programa elegido es de maquina " .. tostring(manifest.maquina) .. ". Cancelado."
    )
    return true
  end

  LARGO_MAXIMO_MM = tonumber(manifest.largo_maximo_mm)

  local presentes = sellosPresentes(job)
  local modo = chooseMode(countPresentes(presentes) > 0)
  if not modo then
    DisplayMessage("Cancelado.")
    return true
  end

  if modo == "REHACER" then
    clearGadgetGeneratedLayers(job)
    presentes = {}
  end

  local ok_count, fail_count, skip_count = 0, 0, 0
  local errors = {}
  local warnings = {}
  local sellos_importados_ahora = {}
  local sellos_no_importados = {}
  local sellos_en_otra_planchuela = {}

  local excluidos = loadExcluidosSet(job)
  local prev_presentes = parseSellosPresentesFromBlob(readJobParamString(job, "ALCOHN_PROGRAMA_V1"))
  local sellos_borrados_en_maquina = {}

  if modo ~= "REHACER" and modo ~= "ARMAR" then
    local missing = {}
    for _, s in ipairs(manifest.sellos or {}) do
      local sid = string.lower(tostring(s.sello_id or ""))
      if sid ~= "" and prev_presentes[sid] and not presentes[sid] and not excluidos[sid] then
        table.insert(missing, s)
      end
    end
    if #missing > 0 then
      local label_lines = {}
      for _, s in ipairs(missing) do table.insert(label_lines, "- " .. stampLabel(s)) end
      local action = chooseDeletedSellosAction(table.concat(label_lines, "\n"))
      if action == "SIN_MATERIAL" then
        for _, s in ipairs(missing) do
          local sid = string.lower(tostring(s.sello_id or ""))
          excluidos[sid] = true
          table.insert(sellos_borrados_en_maquina, {
            sello_id = tostring(s.sello_id),
            motivo = "SIN_MATERIAL",
          })
        end
        saveExcluidosSet(job, excluidos)
      elseif action == "REIMPORT" then
        for _, s in ipairs(missing) do
          local ok_r, err_r, warn_r, otra_r = processStamp(job, folder, s)
          if ok_r then
            if s.sello_id then presentes[string.lower(tostring(s.sello_id))] = true end
            if warn_r then table.insert(warnings, warn_r) end
            if otra_r then table.insert(sellos_en_otra_planchuela, otra_r) end
          else
            table.insert(errors, stampLabel(s) .. ": " .. tostring(err_r or "error"))
            table.insert(sellos_no_importados, {
              sello_id = tostring(s.sello_id or ""),
              motivo = tostring(err_r or "error"),
              diseno = stampLabel(s),
            })
          end
        end
      end
    end
  end

  if modo ~= "SOLO_RECALCULAR" then
    for _, s in ipairs(manifest.sellos or {}) do
      local sid = string.lower(tostring(s.sello_id or ""))
      if modo == "ACTUALIZAR" and sid ~= "" and (presentes[sid] or excluidos[sid]) then
        -- Ya esta: no re-importar ni re-automatizar (conserva correcciones manuales).
        skip_count = skip_count + 1
      else
        local ok, err, warn, otra = processStamp(job, folder, s)
        if ok then
          ok_count = ok_count + 1
          if s.sello_id then table.insert(sellos_importados_ahora, tostring(s.sello_id)) end
          if warn then table.insert(warnings, warn) end
          if otra then table.insert(sellos_en_otra_planchuela, otra) end
        else
          fail_count = fail_count + 1
          table.insert(errors, stampLabel(s) .. ": " .. tostring(err or "error"))
          table.insert(sellos_no_importados, {
            sello_id = tostring(s.sello_id or ""),
            motivo = tostring(err or "error"),
            diseno = stampLabel(s),
          })
        end
      end
    end
  end

  local paso3_msg, material_por_planchuela = runPaso3AndRecalculate(job)
  material_por_planchuela = material_por_planchuela or {}
  local maquinado_segundos = sumMachiningSeconds()

  -- Recalcular presentes al final para el blob.
  presentes = sellosPresentes(job)
  local presentes_list = {}
  for id, _ in pairs(presentes) do table.insert(presentes_list, id) end
  table.sort(presentes_list)

  local objetos_corte = countObjetosEnCorte(job)
  local tageados = countSellosTageados(job)
  -- Sin piezas tageadas = programa viejo (antes del tag): no reportar sobrantes.
  local sobrantes = 0
  if tageados > 0 then
    sobrantes = math.max(0, objetos_corte - tageados)
  end

  local json_payload = buildReportJson({
    programa_id = tostring(manifest.programa_id or ""),
    token = tostring(manifest.token or ""),
    modo = modo,
    sellos_presentes = presentes_list,
    sellos_importados_ahora = sellos_importados_ahora,
    sellos_no_importados = sellos_no_importados,
    sellos_borrados_en_maquina = sellos_borrados_en_maquina,
    sellos_en_otra_planchuela = sellos_en_otra_planchuela,
    sobrantes_no_identificados = sobrantes,
    material_por_planchuela = material_por_planchuela,
    maquinado_segundos = maquinado_segundos,
    objetos_en_corte = objetos_corte,
    sellos_tageados = tageados,
  })

  local blob_ok, blob_err = writeSyncBlob(job, json_payload)
  local post_ok, post_err = false, nil
  if blob_ok then
    post_ok, post_err = postSyncReport(json_payload)
  end

  local function clipLine(s, maxLen)
    maxLen = maxLen or 60
    s = tostring(s or "")
    if #s <= maxLen then return s end
    return string.sub(s, 1, maxLen - 3) .. "..."
  end

  local function modoLabel(m)
    if m == "ACTUALIZAR" then return "Actualizar" end
    if m == "REHACER" then return "Rehacer" end
    if m == "SOLO_RECALCULAR" then return "Solo recalcular" end
    return "Armar"
  end

  local summary_parts = {}

  if fail_count > 0 then
    if fail_count == 1 then
      table.insert(summary_parts, "1 SELLO NO ENTRO")
    else
      table.insert(summary_parts, string.format("%d SELLOS NO ENTRARON", fail_count))
    end
    for _, e in ipairs(errors) do
      table.insert(summary_parts, "  " .. clipLine(e, 58))
    end
    table.insert(summary_parts, "")
  end

  if modo == "SOLO_RECALCULAR" then
    table.insert(summary_parts, "Solo recalcular: listo.")
  else
    table.insert(summary_parts, string.format(
      "%s: %d nuevos, %d ya estaban.",
      modoLabel(modo), ok_count, skip_count
    ))
  end

  for _, w in ipairs(warnings) do
    table.insert(summary_parts, clipLine(w, 60))
  end

  if paso3_msg then
    table.insert(summary_parts, "")
    table.insert(summary_parts, clipLine(paso3_msg, 60))
  end

  if sobrantes > 0 then
    table.insert(summary_parts, "")
    table.insert(summary_parts, string.format(
      "ATENCION: %d pieza(s) en Corte sin sello.",
      sobrantes
    ))
  end

  table.insert(summary_parts, "")
  if not blob_ok then
    table.insert(summary_parts, "No se pudo escribir el reporte en el archivo.")
  elseif not post_ok then
    table.insert(summary_parts, "No se pudo avisar a la app.")
    table.insert(summary_parts, clipLine(tostring(post_err or "error"), 60))
    table.insert(summary_parts, "Subi el archivo desde Programas.")
  else
    table.insert(summary_parts, "App actualizada.")
  end
  table.insert(summary_parts, "Guarda el archivo (Ctrl+S).")

  DisplayMessage(table.concat(summary_parts, "\n"))
  return true
end
