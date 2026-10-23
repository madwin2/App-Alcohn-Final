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
--   5. Al terminar: avisa a la app, guarda el .crv3d y lo sube (preview + Aspire OK).
--      Si Aspire no encuentra la ruta del archivo, pide elegirlo una vez.
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

local GADGET_VERSION = "3.2.0"
local ACTIVE_PREPARATION_REVISION = nil
-- URL de la Edge Function programa-sync (editar si cambia el proyecto Supabase).
local SYNC_URL = "https://dgbyrejfcqearevvzdmf.supabase.co/functions/v1/programa-sync"
-- Flags base de curl. --ssl-no-revoke omite la consulta CRL/OCSP (Windows a veces
-- falla con CRYPT_E_NO_REVOCATION_CHECK); NO es -k/--insecure: el certificado
-- sigue validandose. Reusar en 3.E/3.F (bajar paquete, subir .txt).
local CURL_BASE_FLAGS = "-s -S --ssl-no-revoke --retry 3 --retry-delay 1 --retry-all-errors --max-time 60"
-- Subida del .crv3d puede ser grande: timeout mas holgado.
local CURL_UPLOAD_FLAGS = "-s -S --ssl-no-revoke --retry 2 --retry-delay 2 --retry-all-errors --max-time 300"
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

-- Illustrator deja objetos ocultos (display:none, visibility:hidden) que el
-- navegador y la app no dibujan, pero Aspire importa igual: agrandan la caja
-- del sello y lo sacan del ancho de la planchuela. Se quitan antes de importar.
local function stripHiddenSvg(text)
  if type(text) ~= "string" or not text:find("<svg", 1, true) then return text, 0 end
  local hidden = {}
  for css in text:gmatch("<style[^>]*>(.-)</style>") do
    for selectors, body in css:gmatch("([^{}]+){([^}]*)}") do
      local b = body:lower():gsub("%s", "")
      if b:find("display:none", 1, true) or b:find("visibility:hidden", 1, true) then
        for cls in selectors:gmatch("%.([%w_%-]+)") do hidden[cls] = true end
      end
    end
  end
  local function isHidden(attrs)
    local compact = attrs:lower():gsub("%s", "")
    if compact:find('display="none"', 1, true) or compact:find("display='none'", 1, true)
      or compact:find("display:none", 1, true) or compact:find('visibility="hidden"', 1, true)
      or compact:find("visibility:hidden", 1, true) then return true end
    local classes = attrs:match('class%s*=%s*"([^"]*)"') or attrs:match("class%s*=%s*'([^']*)'")
    if classes then for c in classes:gmatch("%S+") do if hidden[c] then return true end end end
    return false
  end
  local out, pos, removed = {}, 1, 0
  while true do
    local s, e, name, attrs = text:find("<([%a][%w:_%-]*)([^>]*)>", pos)
    if not s then break end
    local lname = name:lower()
    if lname ~= "svg" and lname ~= "style" and lname ~= "defs" and isHidden(attrs) then
      local stop = e
      if not attrs:match("/%s*$") then
        -- Busca el cierre del mismo elemento, contando los anidados.
        local depth, scan = 1, e + 1
        while depth > 0 do
          local ts, te, closing, tname, tattrs = text:find("<(/?)([%a][%w:_%-]*)([^>]*)>", scan)
          if not ts then stop = #text; break end
          if tname == name then
            if closing == "/" then depth = depth - 1
            elseif not tattrs:match("/%s*$") then depth = depth + 1 end
          end
          stop, scan = te, te + 1
        end
      end
      out[#out + 1] = text:sub(pos, s - 1)
      pos, removed = stop + 1, removed + 1
    else
      out[#out + 1] = text:sub(pos, e)
      pos = e + 1
    end
  end
  out[#out + 1] = text:sub(pos)
  return table.concat(out), removed
end

local function stripHiddenSvgFile(path)
  if not tostring(path):lower():match("%.svg$") then return 0 end
  local f = io.open(path, "rb"); if not f then return 0 end
  local text = f:read("*a"); f:close()
  local clean, removed = stripHiddenSvg(text)
  if removed > 0 then
    local w = io.open(path, "wb")
    if w then w:write(clean); w:close() end
  end
  return removed
end

-- El servidor contesto con un motivo (4xx): se muestra en castellano y no se
-- abre el selector de carpeta, que solo sirve cuando no hay conexion.
local function packageRefusal(code, body)
  local reason = extractJsonString(body or "", "error") or ""
  if reason == "" then reason = string.sub(body or "", 1, 200) end
  local hint = ""
  if reason:find("ya no pertenece a este programa", 1, true) or reason:find("falta en la preparaci", 1, true) then
    hint = "\n\nEl programa cambio en la app (se sacaron o sumaron sellos) despues de la ultima revision guardada.\n" ..
      "En la mesa de Programas toca \"Guardar y chequear\" y volve a correr el gadget."
  elseif reason:find("bloqueado o en fabricaci", 1, true) then
    hint = "\n\nEl programa ya esta en fabricacion o bloqueado: no se puede volver a armar."
  end
  return "La app no entrego el programa (HTTP " .. tostring(code) .. "):\n" .. reason .. hint
end

local function downloadProgramPackage(installKey, programaId)
  local tempDir = os.getenv("TEMP") or "C:\\Windows\\Temp"
  local stamp = tostring(os.time())
  local folder = tempDir .. "\\alcohn_prog_" .. tostring(programaId):sub(1, 8) .. "_" .. stamp
  os.execute('cmd /c mkdir "' .. folder .. '" 2>nul')
  os.execute('cmd /c mkdir "' .. folder .. '\\vectores" 2>nul')

  local tmp_body = folder .. "\\_paquete.json"
  local tmp_code = folder .. "\\_paquete.code"
  local url = SYNC_URL .. "?accion=paquete&gadget_protocol=4&programa_id=" .. tostring(programaId)
  local code, body = curlGetToFile(
    url,
    { "X-Programa-Sync-Key: " .. installKey },
    tmp_body,
    tmp_code
  )
  pcall(function() os.remove(tmp_code) end)

  if string.sub(code, 1, 1) == "4" then
    return nil, packageRefusal(code, body), true
  end
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
    stripHiddenSvgFile(dest)
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

  local folder, dl_err, refused = downloadProgramPackage(installKey, chosen.id)
  if not folder and refused then
    DisplayMessage(tostring(dl_err))
    return nil
  end
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
local function layerHasObjects(layer)
  if not layer then return false end
  local ok, pos = pcall(function() return layer:GetHeadPosition() end)
  if not ok or not pos then return false end
  local obj = layer:GetNext(pos)
  return obj ~= nil
end

local function sellosPresentes(job)
  -- Modo Actualizar: si hay tags en Corte, esos son "ya esta".
  -- No exigir tambien capa UUID: despues del armado el vector vive en
  -- VECTOR / VECTOR 3MM sin el UUID en el nombre, y reimportaba TODO.
  -- Capas UUID solo como fallback en jobs viejos sin ningun tag.
  local tagged = {}
  local with_layer = {}

  local corte = job.LayerManager:GetLayerWithName("Corte")
  if corte then
    local pos = corte:GetHeadPosition()
    while pos do
      local obj, newPos = corte:GetNext(pos)
      pos = newPos
      if obj then
        local ok, id = pcall(function() return obj:GetString("ALCOHN_SELLO_ID", "", false) end)
        if ok and id and id ~= "" then
          tagged[string.lower(tostring(id))] = true
        end
      end
    end
  end

  local lm = job.LayerManager
  local lpos = lm:GetHeadPosition()
  while lpos do
    local layer, newPos = lm:GetNext(lpos)
    lpos = newPos
    if layer and layerHasObjects(layer) then
      local okn, name = pcall(function() return layer.Name end)
      if okn and name then
        local uuid = string.match(string.lower(name),
          "(%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x)")
        if uuid then with_layer[uuid] = true end
      end
    end
  end

  local any_tagged = false
  for _ in pairs(tagged) do any_tagged = true; break end

  if any_tagged then
    return tagged
  end
  return with_layer
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

-- Borra capas nuevas de un ImportSVG fallido (ej. escala mala).
local function removeNewLayers(job, before_names)
  local lm = job.LayerManager
  local to_remove = {}
  local pos = lm:GetHeadPosition()
  while pos do
    local layer, newPos = lm:GetNext(pos)
    pos = newPos
    if layer then
      local ok, name = pcall(function() return layer.Name end)
      if ok and name and not before_names[name] and not KNOWN_LAYERS[name] then
        table.insert(to_remove, name)
      end
    end
  end
  for _, name in ipairs(to_remove) do
    vaciarCapa(job, name)
    pcall(function()
      local layer = lm:GetLayerWithName(name) or lm:FindLayerWithName(name)
      if layer and lm.RemoveLayer then
        lm:RemoveLayer(layer)
      elseif layer and lm.DeleteLayer then
        lm:DeleteLayer(layer)
      end
    end)
  end
  pcall(function() job:Refresh2DView() end)
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

local function fileExists(path)
  if not path or path == "" then return false end
  local f = io.open(path, "rb")
  if not f then return false end
  f:close()
  return true
end

local function pickCrv3dFile(preferredName, startDir)
  local dlg = FileDialog()
  if startDir and startDir ~= "" then
    dlg.InitialDirectory = startDir
  end
  local defaultName = tostring(preferredName or "programa")
  if not defaultName:lower():match("%.crv3d$") then
    defaultName = defaultName .. ".crv3d"
  end
  local ok = dlg:FileOpen(
    "crv3d",
    defaultName,
    "Aspire (*.crv3d)|*.crv3d|Todos (*.*)|*.*||"
  )
  if not ok then return nil end
  local path = dlg.PathName
  if (not path or path == "") and dlg.Directory and dlg.FileName then
    path = tostring(dlg.Directory) .. "\\" .. tostring(dlg.FileName)
  end
  if path and path ~= "" and fileExists(path) then return path end
  return nil
end

-- Aspire no expone la ruta del job abierto. Guardamos, buscamos candidatos
-- y si hace falta pedimos el .crv3d una sola vez (queda en el registro).
local function resolveCrv3dPath(job, folder)
  local jobName = tostring(job.Name or "programa")
  local reg = openRegistry()
  local remembered = regGetString(reg, "last_crv3d_path", "")
  if remembered ~= "" and fileExists(remembered) then
    local base = remembered:match("([^\\/]+)$") or ""
    if base:lower() == (jobName:lower() .. ".crv3d")
      or base:lower() == "programa.crv3d"
      or remembered:lower():find(jobName:lower(), 1, true)
    then
      return remembered
    end
  end

  local candidates = {
    folder and (folder .. "\\" .. jobName .. ".crv3d") or nil,
    folder and (folder .. "\\programa.crv3d") or nil,
  }
  local lastDir = regGetString(reg, "last_manifest_dir", "")
  if lastDir ~= "" then
    table.insert(candidates, lastDir .. "\\" .. jobName .. ".crv3d")
    table.insert(candidates, lastDir .. "\\programa.crv3d")
  end
  for _, p in ipairs(candidates) do
    if p and fileExists(p) then
      regSetString(reg, "last_crv3d_path", p)
      return p
    end
  end

  -- Busqueda liviana: archivos .crv3d tocados hace poco con el nombre del job.
  local tempDir = os.getenv("TEMP") or "C:\\Windows\\Temp"
  local outFile = tempDir .. "\\alcohn_crv_path.txt"
  local psFile = tempDir .. "\\alcohn_find_crv.ps1"
  local roots = {}
  if folder and folder ~= "" then table.insert(roots, folder) end
  if lastDir ~= "" then table.insert(roots, lastDir) end
  table.insert(roots, (os.getenv("USERPROFILE") or "") .. "\\Downloads")
  table.insert(roots, (os.getenv("USERPROFILE") or "") .. "\\Desktop")
  table.insert(roots, (os.getenv("USERPROFILE") or "") .. "\\Documents")

  local pf = io.open(psFile, "w")
  if pf then
    pf:write("$ErrorActionPreference='SilentlyContinue'\n")
    pf:write("$cutoff=(Get-Date).AddMinutes(-15)\n")
    pf:write(string.format("$want=@('%s.crv3d','programa.crv3d')\n", jobName:gsub("'", "''")))
    pf:write("$hits=@()\n")
    for _, root in ipairs(roots) do
      if root and root ~= "" then
        pf:write(string.format(
          "if(Test-Path -LiteralPath '%s'){ Get-ChildItem -LiteralPath '%s' -Filter '*.crv3d' -File -Recurse -Depth 2 | Where-Object { $_.LastWriteTime -gt $cutoff -and ($want -contains $_.Name) } | ForEach-Object { $hits += $_ } }\n",
          root:gsub("'", "''"),
          root:gsub("'", "''")
        ))
      end
    end
    pf:write("$best=$hits | Sort-Object LastWriteTime -Descending | Select-Object -First 1\n")
    pf:write(string.format(
      "if($best){ Set-Content -Path '%s' -Value $best.FullName -Encoding ASCII } else { Set-Content -Path '%s' -Value '' -Encoding ASCII }\n",
      outFile:gsub("'", "''"),
      outFile:gsub("'", "''")
    ))
    pf:close()
    os.execute(string.format(
      'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%s" >nul 2>&1',
      psFile
    ))
    local of = io.open(outFile, "r")
    if of then
      local found = tostring(of:read("*l") or ""):gsub("%s+$", "")
      of:close()
      if found ~= "" and fileExists(found) then
        regSetString(reg, "last_crv3d_path", found)
        pcall(function() os.remove(psFile) end)
        pcall(function() os.remove(outFile) end)
        return found
      end
    end
    pcall(function() os.remove(psFile) end)
    pcall(function() os.remove(outFile) end)
  end

  local picked = pickCrv3dFile(jobName .. ".crv3d", folder or lastDir)
  if picked then
    regSetString(reg, "last_crv3d_path", picked)
    return picked
  end
  return nil
end

local function postJson(url, jsonPayload)
  if ACTIVE_PREPARATION_REVISION then
    jsonPayload = jsonPayload:gsub("^%s*{", '{"preparation_revision":' .. tostring(ACTIVE_PREPARATION_REVISION) .. ',', 1)
  end
  local tempDir = os.getenv("TEMP") or "C:\\Windows\\Temp"
  local stamp = tostring(os.time()) .. "_" .. tostring(math.random(1000, 9999))
  local tmp_json = tempDir .. "\\alcohn_up_" .. stamp .. ".json"
  local tmp_body = tempDir .. "\\alcohn_up_" .. stamp .. "_body.txt"
  local tmp_code = tempDir .. "\\alcohn_up_" .. stamp .. "_code.txt"

  local f = io.open(tmp_json, "w")
  if not f then return false, "", "no se pudo escribir temporal" end
  f:write(jsonPayload)
  f:close()

  local cmd = string.format(
    'curl.exe ' .. CURL_BASE_FLAGS .. ' -X POST -H "Content-Type: application/json" '
      .. '--data-binary "@%s" -o "%s" -w "%%{http_code}" "%s" > "%s" 2>&1',
    tmp_json, tmp_body, url, tmp_code
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

  return string.sub(code, 1, 1) == "2", body, code
end

local function uploadAspireFile(programaId, token, filepath, preparationEventId)
  local preparationEventField = ""
  if ACTIVE_PREPARATION_REVISION then
    if type(preparationEventId) ~= "string" or not preparationEventId:match("^[%w_-]+$") then
      return false, "Falta la identidad del resultado. Volve a sincronizar antes de subir."
    end
    preparationEventField = ',"preparation_event_id":' .. jsonString(preparationEventId)
  end
  if not filepath or not fileExists(filepath) then
    return false, "archivo no encontrado"
  end
  local filename = filepath:match("([^\\/]+)$") or "programa.crv3d"

  local tempDir = os.getenv("TEMP") or "C:\\Windows\\Temp"
  local stamp = tostring(os.time())
  -- Copiar: Aspire deja el .crv3d abierto/bloqueado.
  local copyPath = tempDir .. "\\alcohn_upload_" .. stamp .. ".crv3d"
  local zipPath = tempDir .. "\\alcohn_upload_" .. stamp .. ".zip"
  local copyBase = "alcohn_upload_" .. stamp .. ".crv3d"
  os.execute(string.format('cmd /c copy /Y "%s" "%s" >nul 2>&1', filepath, copyPath))
  if not fileExists(copyPath) then
    return false, "no se pudo copiar el .crv3d (cerralo o Ctrl+S)"
  end

  local function fileSize(path)
    local cf = io.open(path, "rb")
    if not cf then return 0 end
    local n = cf:seek("end") or 0
    cf:close()
    return n
  end

  local size = fileSize(copyPath)
  if size < 100 then
    pcall(function() os.remove(copyPath) end)
    return false, "copia del .crv3d vacia o muy chica (" .. tostring(size) .. " bytes)"
  end

  -- Storage Free: tope global ~50MB. Si el .crv3d es grande, lo zippeamos
  -- (OLE comprime bien) y la edge lo descomprime al confirmar.
  local STORAGE_SOFT_LIMIT = 45 * 1024 * 1024
  local uploadPath = copyPath
  local uploadFilename = filename
  local usedZip = false
  if size > STORAGE_SOFT_LIMIT then
    pcall(function() os.remove(zipPath) end)
    os.execute(string.format(
      'tar.exe -a -cf "%s" -C "%s" "%s" >nul 2>&1',
      zipPath, tempDir, copyBase
    ))
    local zsize = fileSize(zipPath)
    if zsize > 100 then
      uploadPath = zipPath
      uploadFilename = (filename:gsub("%.[^%.]+$", "") or "programa") .. ".zip"
      usedZip = true
      size = zsize
    end
  end

  if size > STORAGE_SOFT_LIMIT then
    local mb = string.format("%.1f", size / (1024 * 1024))
    pcall(function() os.remove(copyPath) end)
    pcall(function() os.remove(zipPath) end)
    return false, "archivo muy grande (" .. mb .. " MB). Subilo desde Programas o achicalo."
  end

  local bodyFile = tempDir .. "\\alcohn_upload_" .. stamp .. "_body.txt"
  local codeFile = tempDir .. "\\alcohn_upload_" .. stamp .. "_code.txt"
  local confFile = tempDir .. "\\alcohn_upload_" .. stamp .. "_curl.txt"
  local uploadPathCurl = uploadPath:gsub("\\", "/")
  local bodyFileCurl = bodyFile:gsub("\\", "/")

  -- 1) Pedir URL firmada (archivos grandes no entran por la edge → 413).
  local pedir = string.format(
    '{"accion":"pedir-upload","programa_id":"%s","token":"%s","filename":"%s"}',
    tostring(programaId):gsub('"', ""),
    tostring(token):gsub('"', ""),
    tostring(uploadFilename):gsub('"', "")
  )
  pedir = pedir:sub(1, -2) .. preparationEventField .. "}"
  local ok1, body1, code1 = postJson(SYNC_URL .. "?accion=pedir-upload", pedir)
  if not ok1 then
    pcall(function() os.remove(copyPath) end)
    pcall(function() os.remove(zipPath) end)
    return false, "pedir-upload HTTP " .. tostring(code1) .. " " .. string.sub(tostring(body1), 1, 80)
  end
  local signedUrl = extractJsonString(body1, "signedUrl")
  local storagePath = extractJsonString(body1, "path")
  if not signedUrl or signedUrl == "" or not storagePath or storagePath == "" then
    pcall(function() os.remove(copyPath) end)
    pcall(function() os.remove(zipPath) end)
    return false, "respuesta pedir-upload incompleta"
  end

  -- 2) curl -K: la URL va en archivo (cmd no la rompe con &/=).
  local cf = io.open(confFile, "wb")
  if not cf then
    pcall(function() os.remove(copyPath) end)
    pcall(function() os.remove(zipPath) end)
    return false, "no se pudo escribir config curl"
  end
  cf:write('url = "' .. signedUrl .. '"\n')
  cf:write('request = "PUT"\n')
  cf:write('upload-file = "' .. uploadPathCurl .. '"\n')
  cf:write('header = "Content-Type: application/octet-stream"\n')
  cf:write('output = "' .. bodyFileCurl .. '"\n')
  cf:write('write-out = "%{http_code}"\n')
  cf:write("silent\n")
  cf:write("show-error\n")
  cf:close()

  os.execute(string.format(
    'curl.exe ' .. CURL_UPLOAD_FLAGS .. ' -K "%s" > "%s" 2>&1',
    confFile, codeFile
  ))

  local putCode = ""
  local pc = io.open(codeFile, "r")
  if pc then putCode = tostring(pc:read("*a") or ""):gsub("%s", ""); pc:close() end
  local putBody = ""
  local pb = io.open(bodyFile, "r")
  if pb then putBody = tostring(pb:read("*a") or ""); pb:close() end

  pcall(function() os.remove(copyPath) end)
  pcall(function() os.remove(zipPath) end)
  pcall(function() os.remove(bodyFile) end)
  pcall(function() os.remove(codeFile) end)
  pcall(function() os.remove(confFile) end)

  if string.sub(putCode, 1, 1) ~= "2" then
    local mb = string.format("%.1f", size / (1024 * 1024))
    if string.find(tostring(putBody), "413") or putCode == "413" then
      return false, "archivo muy grande (" .. mb .. " MB" .. (usedZip and ", zip" or "") .. "). Subilo desde Programas."
    end
    return false, "subida storage HTTP " .. tostring(putCode) .. " " .. string.sub(putBody, 1, 100)
  end

  -- 3) Confirmar: marca Aspire OK en la app (preview solo si el archivo es chico).
  local confirmar = string.format(
    '{"accion":"confirmar-upload","programa_id":"%s","token":"%s","path":"%s","filename":"%s","size":%d}',
    tostring(programaId):gsub('"', ""),
    tostring(token):gsub('"', ""),
    tostring(storagePath):gsub('"', ""),
    tostring(uploadFilename):gsub('"', ""),
    tonumber(size) or 0
  )
  confirmar = confirmar:sub(1, -2) .. preparationEventField .. "}"
  local ok3, body3, code3 = postJson(SYNC_URL .. "?accion=confirmar-upload", confirmar)
  if not ok3 then
    return false, "confirmar-upload HTTP " .. tostring(code3) .. " " .. string.sub(tostring(body3), 1, 80)
  end
  return true, nil
end

local function saveAndUploadAspire(job, folder, programaId, token)
  local saveOk = false
  local saveErr = nil
  if type(SaveCurrentJob) == "function" then
    local ok, err = pcall(SaveCurrentJob)
    saveOk = ok
    if not ok then saveErr = tostring(err) end
  else
    saveErr = "SaveCurrentJob no disponible"
  end

  local path = resolveCrv3dPath(job, folder)
  if not path then
    return false, "No se encontro el .crv3d. Guardalo (Ctrl+S) y elegilo."
  end

  -- Si save fallo pero encontramos archivo viejo, igual intentamos subir
  -- (puede estar desactualizado). Preferimos avisar.
  local upOk, upErr = uploadAspireFile(programaId, token, path)
  if not upOk then
    return false, upErr or "fallo al subir"
  end
  if not saveOk then
    return true, "subido (aviso: " .. tostring(saveErr or "no se pudo SaveCurrentJob") .. ")"
  end
  return true, nil
end

-- =====================================================================
-- Deteccion de "que se acaba de importar" para SVG.
-- ImportSVG suele dejar la seleccion activa; NO hay que borrarla antes
-- de comprobarla (si el SVG cae en una capa ya existente, "capas nuevas"
-- falla y el vector queda tirado en el origen sin automatizar).
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

local function snapshotLayerObjectCounts(job)
  local counts = {}
  local lm = job.LayerManager
  local ok, pos = pcall(function() return lm:GetHeadPosition() end)
  if not ok then return counts end
  while pos do
    local layer, newPos = lm:GetNext(pos)
    pos = newPos
    if layer then
      local ok2, name = pcall(function() return layer.Name end)
      if ok2 and name then
        local n = 0
        local lpos = layer:GetHeadPosition()
        while lpos do
          local obj, newLpos = layer:GetNext(lpos)
          lpos = newLpos
          if obj then n = n + 1 end
        end
        counts[name] = n
      end
    end
  end
  return counts
end

local function selectionHasObjects(job)
  local ok, bbox = pcall(function() return job.Selection:GetBoundingBox() end)
  return ok and bbox ~= nil
end

local function selectAllOnLayer(job, layer)
  local added = 0
  if not layer then return 0 end
  local lpos = layer:GetHeadPosition()
  while lpos do
    local obj, newLpos = layer:GetNext(lpos)
    lpos = newLpos
    if obj then
      job.Selection:Add(obj, true, false)
      added = added + 1
    end
  end
  return added
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
        added = added + selectAllOnLayer(job, layer)
      end
    end
  end

  return added > 0
end

-- Capas que estaban vacias (o no existian) y ahora tienen objetos: todo
-- lo que hay ahi es del import. Seguro aunque el nombre ya existiera.
local function selectObjectsFromGrownEmptyLayers(job, before_counts)
  local lm = job.LayerManager
  job.Selection:Clear()
  local added = 0
  local pos = lm:GetHeadPosition()
  while pos do
    local layer, newPos = lm:GetNext(pos)
    pos = newPos
    if layer then
      local ok, name = pcall(function() return layer.Name end)
      if ok and name then
        local before_n = before_counts[name] or 0
        if before_n == 0 then
          added = added + selectAllOnLayer(job, layer)
        end
      end
    end
  end
  return added > 0
end

local function selectImportedSvg(job, before_names, before_counts)
  -- 1) Lo que ImportSVG dejo seleccionado (caso normal segun docs Vectric).
  if selectionHasObjects(job) then
    return true
  end
  -- 2) Capas con nombre nuevo.
  if selectObjectsFromNewLayers(job, before_names) then
    return true
  end
  -- 3) Capas que crecieron desde vacio (SVG cayo en capa existente vacia).
  if selectObjectsFromGrownEmptyLayers(job, before_counts) then
    return true
  end
  return false
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

-- Quita marcas huerfanas en Corte (rayita con ALCOHN_SELLO_ID) si se va a reimportar.
local function clearCorteTagsForSello(job, sello_id)
  local sid = string.lower(tostring(sello_id or ""))
  if sid == "" then return end
  local corte = job.LayerManager:GetLayerWithName("Corte")
  if not corte then return end
  local to_remove = {}
  local pos = corte:GetHeadPosition()
  while pos do
    local obj, newPos = corte:GetNext(pos)
    pos = newPos
    if obj then
      local ok, id = pcall(function() return obj:GetString("ALCOHN_SELLO_ID", "", false) end)
      if ok and id and string.lower(tostring(id)) == sid then
        table.insert(to_remove, obj)
      end
    end
  end
  for _, obj in ipairs(to_remove) do
    pcall(function() corte:RemoveObject(obj) end)
  end
end

local function processStamp(job, folder, s)
  local label = stampLabel(s)
  clearCorteTagsForSello(job, s.sello_id)
  local archivo = tostring(s.archivo or "")
  local vector_path = folder .. "\\" .. archivo
  local lower = string.lower(archivo)
  local warning = nil
  local otra_planchuela = nil

  if string.match(lower, "%.svg$") then
    local before = snapshotLayerNames(job)
    local before_counts = snapshotLayerObjectCounts(job)
    stripHiddenSvgFile(vector_path)
    if not job:ImportSVG(vector_path) then
      removeNewLayers(job, before)
      return false, "no se pudo importar el vector", nil, nil
    end
    if not selectImportedSvg(job, before, before_counts) then
      removeNewLayers(job, before)
      return false, "importo pero no se pudo seleccionar", nil, nil
    end
    local scale_ok, scale_msg = validateAndFixScale(job, s.ancho_mm, s.largo_mm)
    if not scale_ok then
      removeNewLayers(job, before)
      return false, tostring(scale_msg), nil, nil
    end
    if scale_msg then
      warning = label .. ": " .. scale_msg
    end
  elseif string.match(lower, "%.dxf$") or string.match(lower, "%.dwg$") then
    if not job:ImportDxfDwg(vector_path) then
      return false, "no se pudo importar el vector", nil, nil
    end
    local scale_ok, scale_msg = validateAndFixScale(job, s.ancho_mm, s.largo_mm)
    if not scale_ok then
      return false, tostring(scale_msg), nil, nil
    end
    if scale_msg then
      warning = label .. ": " .. scale_msg
    end
  else
    local ext = string.match(lower, "%.([%w]+)$") or "?"
    return false, "el vector esta en ." .. ext .. ", re-vectorizalo.", nil, nil
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

-- BEGIN ALCOHN PREPARATION GENERATED
local PreparationSync = (function()
local EXECUTION_RULES = {["version"]=1,["protocol"]=4,["fineAnalysisVersion"]=6,["coordinateToleranceMm"]=0.01,["mergeToleranceMm"]=0.02,["minimumGapMm"]=8,["offsetsMm"]={4,-3.5,1.5},["offsetToleranceMm"]=0.01,["cutExtraWidthMm"]=8,["cutBelowDesignMm"]=4,["drillRadiusMm"]=3,["rectangleBelowCutMm"]=3,["planeExtraWidthMm"]=6,["exteriorExtraWidthMm"]=14,["rectangleTopY"]=0,["foodToolEnvelopeMm"]=6.5,["recipes"]={["CLASICO"]={["vectorLayer"]="VECTOR",["offsetLayer"]="Offset exterior vector",["fineLayer"]="REPASO CLASICO",["fineInteriorLayer"]="REPASO INTERIOR CLASICO",["mainDepthMm"]=1.7},["3MM"]={["vectorLayer"]="VECTOR 3MM",["offsetLayer"]="Offset exterior vector 3mm",["fineLayer"]="REPASO 3MM",["fineInteriorLayer"]="REPASO INTERIOR 3MM",["mainDepthMm"]=3},["ALIMENTO"]={["vectorLayer"]="VECTOR ALIMENTO",["offsetLayer"]="Offset exterior vector alimento",["fineLayer"]="REPASO ALIMENTO",["fineInteriorLayer"]="REPASO INTERIOR ALIMENTO",["mainDepthMm"]=3}}}
local ExecutionPlan = (function()
-- Operaciones en mm, sin mutar Aspire. Contrato equivalente a executionPlan.ts.
local Plan={}
local function finite(n) return type(n)=="number" and n==n and n~=math.huge and n~=-math.huge end
function Plan.build(doc,actual,rules)
  local out={rulesVersion=rules.version,stamps={},columns={},issues={}}
  local function fail(code,message,id) out.issues[#out.issues+1]={code=code,message=message,instanceId=id,severity="error"} end
  local seen,rows={},{}
  local tolerance=rules.coordinateToleranceMm
  for _,pose in ipairs(actual) do
    local stamp=nil
    for _,s in ipairs(doc.stamps) do if s.instanceId==pose.instanceId and s.selloId==pose.selloId and not s.excluded then stamp=s end end
    if not stamp or seen[pose.instanceId] then fail("IDENTITY","Hay una pieza extra o duplicada.",pose.instanceId)
    else
      seen[pose.instanceId]=true
      local valid=finite(pose.centerX) and finite(pose.topY) and finite(pose.widthMm) and finite(pose.heightMm)
        and pose.widthMm>0 and pose.heightMm>0 and rules.recipes[pose.recipe]~=nil
      if not valid then fail("GEOMETRY",stamp.name .. ": medidas o mecanizado invalidos.",stamp.instanceId)
      else
        local col=nil; for _,c in ipairs(doc.columns) do if c.id==stamp.columnId then col=c end end
        if not col then fail("COLUMN",stamp.name .. ": planchuela inexistente.",stamp.instanceId)
        else
          if not col.available then fail("MATERIAL",stamp.name .. ": falta material.",stamp.instanceId) end
          if math.abs(pose.centerX-col.centerX)+pose.widthMm/2>col.usableMm/2+tolerance then fail("WIDTH",stamp.name .. ": fuera del ancho util.",stamp.instanceId) end
          local bottom=pose.topY-pose.heightMm
          if pose.topY>col.topY+tolerance or bottom<col.bottomY-tolerance then fail("LENGTH",stamp.name .. ": excede el largo util.",stamp.instanceId) end
          local cutY=bottom-rules.cutBelowDesignMm
          if cutY-rules.rectangleBelowCutMm<col.bottomY-tolerance then fail("MACHINING_LENGTH",stamp.name .. ": falta espacio para corte y acabado.",stamp.instanceId) end
          local envelope=pose.recipe=="ALIMENTO" and rules.foodToolEnvelopeMm or 0
          if math.abs(pose.centerX-col.centerX)+pose.widthMm/2+envelope>col.toolEnvelopeMm/2+tolerance then fail("TOOL_ENVELOPE",stamp.name .. ": excede la envolvente.",stamp.instanceId) end
          rows[#rows+1]={pose=pose,columnId=col.id}
          local recipe=rules.recipes[pose.recipe]
          out.stamps[#out.stamps+1]={instanceId=stamp.instanceId,columnId=col.id,recipe=pose.recipe,
            vectorLayer=recipe.vectorLayer,fineLayer=stamp.fine and stamp.fine.scope=='internal' and recipe.fineInteriorLayer or recipe.fineLayer,offsetLayer=recipe.offsetLayer,
            cut={x1=col.centerX-(col.nominalMm+rules.cutExtraWidthMm)/2,x2=col.centerX+(col.nominalMm+rules.cutExtraWidthMm)/2,y=cutY},
            drill={x=pose.centerX,y=pose.topY-pose.heightMm/2,radiusMm=rules.drillRadiusMm}}
        end
      end
    end
  end
  for _,s in ipairs(doc.stamps) do if not s.excluded and not seen[s.instanceId] then fail("MISSING",s.name .. ": falta en el armado.",s.instanceId) end end
  for i=1,#rows do for j=i+1,#rows do
    local a,b=rows[i],rows[j]
    local sameStrip=a.columnId==b.columnId
    local xOverlap=math.abs(a.pose.centerX-b.pose.centerX)<(a.pose.widthMm+b.pose.widthMm)/2
    local gap=math.max(a.pose.topY-a.pose.heightMm,b.pose.topY-b.pose.heightMm)-math.min(a.pose.topY,b.pose.topY)
    if (sameStrip or xOverlap) and gap<doc.gapMm-tolerance then fail("SEPARATION","Dos sellos no respetan la separacion de corte.",a.pose.instanceId) end
  end end
  for _,col in ipairs(doc.columns) do
    local cutY=nil
    for _,s in ipairs(out.stamps) do if s.columnId==col.id then cutY=math.min(cutY or s.cut.y,s.cut.y) end end
    if cutY then out.columns[#out.columns+1]={columnId=col.id,nominalMm=col.nominalMm,centerX=col.centerX,topY=rules.rectangleTopY,
      bottomY=cutY-rules.rectangleBelowCutMm,planeWidthMm=col.nominalMm+rules.planeExtraWidthMm,
      exteriorWidthMm=col.nominalMm+rules.exteriorExtraWidthMm,materialMm=math.floor((col.topY-cutY)*10+0.5)/10} end
  end
  return out
end
return Plan

end)()
-- Vectric SDK v10. Fuente del bloque incluido en los tres gadgets por build-preparation-gadgets.mjs.
-- No se carga desde la red ni se ejecutan parámetros del job como código Lua.
local PreparationSync = {}
local RULES = EXECUTION_RULES

local function fingerprint(text)
  local hash = 7
  for i = 1, #text do hash = (hash * 31 + text:byte(i)) % 2147483647 end
  return tostring(#text) .. ":" .. tostring(hash)
end
PreparationSync.fingerprint = fingerprint

local function str(object, key, default)
  local ok, value = pcall(function() return object:GetString(key, default or "", false) end)
  if not ok then ok,value=pcall(function() return object:GetString(key, default or "") end) end
  if not ok then error("No se pudo leer la identidad persistente: " .. key .. ": " .. tostring(value)) end
  return value
end
local function set(object, key, value) object:SetString(key, tostring(value)) end
local function number(object, key, default)
  local value = str(object, key, "")
  return tonumber(value) or default
end
local function fmt(n) return string.format("%.6f", n):gsub(",", ".") end
local function close(a, b) return math.abs(a - b) <= 0.02 end
-- Hasta aca una diferencia es redondeo, no un ajuste hecho en Aspire.
local SNAP_MM = 0.05
local function escape(text)
  return tostring(text):gsub("&", "&amp;"):gsub('"', "&quot;"):gsub("<", "&lt;"):gsub(">", "&gt;")
end
local function json(value)
  local kind = type(value)
  if kind == "nil" then return "null" end
  if kind == "number" then
    if value ~= value or value == math.huge or value == -math.huge then error("Numero invalido") end
    return tostring(value)
  end
  if kind == "boolean" then return value and "true" or "false" end
  if kind == "string" then return '"' .. value:gsub('[%z\1-\31\\"]', function(c)
    if c == '"' then return '\\"' end
    if c == '\\' then return '\\\\' end
    return string.format("\\u%04x", c:byte())
  end) .. '"' end
  if kind ~= "table" then error("Dato no serializable") end
  local out = {}
  if value[1] ~= nil or next(value) == nil then
    for _, item in ipairs(value) do out[#out + 1] = json(item) end
    return "[" .. table.concat(out, ",") .. "]"
  end
  for key, item in pairs(value) do out[#out + 1] = json(tostring(key)) .. ":" .. json(item) end
  table.sort(out)
  return "{" .. table.concat(out, ",") .. "}"
end
PreparationSync.json = json

local function choose(title, text, options)
  local html = '<html><body style="font:13px Arial;padding:12px"><p>' .. escape(text) .. '</p>'
  for _, option in ipairs(options) do html = html .. '<p><input type="radio" name="choice"> ' .. escape(option) .. '</p>' end
  html = html .. '<button id="ButtonOK" type="button">Aceptar</button> <button id="ButtonCancel" type="button">Cancelar</button></body></html>'
  local dialog = HTML_Dialog(true, html, 570, 340, title)
  dialog:AddRadioGroup("choice", 1)
  if not dialog:ShowDialog() then return nil end
  return dialog:GetRadioIndex("choice")
end

local function children(object)
  if object.ClassName ~= "vcCadObjectGroup" then return nil end
  return CastCadObjectToCadObjectGroup(object)
end
local function walk(object, visit)
  visit(object)
  local group = children(object)
  if group then
    local pos = group:GetHeadPosition()
    while pos do local item; item, pos = group:GetNext(pos); if item then walk(item, visit) end end
  end
end
local function objectId(object)
  -- CadObject.Id ya es luaUUID; Toolpath.Id es UUID nativo en Aspire 10.5.
  local ok,value=pcall(function() return object.Id:AsString() end)
  if ok then return value end
  local rawOk,raw=pcall(function() return object.RawId end)
  local id = luaUUID(); id:SetId(rawOk and raw or object.Id); return id:AsString()
end
local function tag(object, instance, sello, role)
  walk(object, function(item)
    set(item, "ALCOHN_INSTANCE_ID", instance); set(item, "ALCOHN_SELLO_ID", sello); set(item, "ALCOHN_ROLE", role)
    set(item, "ALCOHN_OBJECT_ID", objectId(item))
  end)
end
local function layer(job, name)
  return job.LayerManager:GetLayerWithName(name)
end
local DESIGN_LAYERS = { ["VECTOR"] = true, ["VECTOR 3MM"] = true, ["VECTOR ALIMENTO"] = true }
local TRACKED_LAYERS = { ["Corte"]=true,["Taladrado"]=true,["Offset 1 vector"]=true,["Offset exterior vector"]=true,
  ["Offset exterior vector 3mm"]=true,["Offset exterior vector alimento"]=true,["Corte Alimento"]=true,
  ["REPASO CLASICO"]=true,["REPASO 3MM"]=true,["REPASO ALIMENTO"]=true,
  ["REPASO INTERIOR CLASICO"]=true,["REPASO INTERIOR 3MM"]=true,["REPASO INTERIOR ALIMENTO"]=true }
local function scan(job)
  local result, unknown = {}, {}
  local pos = job.LayerManager:GetHeadPosition()
  while pos do
    local current; current, pos = job.LayerManager:GetNext(pos)
    local op = current:GetHeadPosition()
    while op do
      local object; object, op = current:GetNext(op)
      local instance = str(object, "ALCOHN_INSTANCE_ID")
      if instance == "" and children(object) then
        local ids, count, sello, role = {}, 0, "", ""
        walk(object, function(item) local id = str(item, "ALCOHN_INSTANCE_ID"); if id ~= "" then
          if not ids[id] then ids[id] = true; count = count + 1 end
          sello = str(item,"ALCOHN_SELLO_ID"); local childRole = str(item,"ALCOHN_ROLE")
          if role == "" then role = childRole elseif role ~= childRole then role = "mixed" end
        end end)
        if count == 1 then
          for id in pairs(ids) do instance = id end
          if role == "mixed" then unknown[#unknown+1]="Grupo que mezcla dibujo y auxiliares; desagrupalo."; instance=""
          else tag(object, instance, sello, role) end
        elseif count > 1 then unknown[#unknown + 1] = "Grupo con piezas de varias instancias; desagrupalo antes de sincronizar." end
      end
      if instance ~= "" then
        result[instance] = result[instance] or {}
        result[instance][#result[instance] + 1] = { object = object, layer = current, role = str(object, "ALCOHN_ROLE") }
      elseif DESIGN_LAYERS[current.Name] or TRACKED_LAYERS[current.Name] then unknown[#unknown + 1] = "Vector sin identidad en " .. current.Name end
    end
  end
  return result, unknown
end
-- Un aviso por tipo, con la cantidad: un archivo con sellos del gadget anterior
-- tiene cientos de vectores sin identidad y el informe no puede llevar uno por vector.
local function unidentifiedIssues(unknown)
  local counts, order = {}, {}
  for _, text in ipairs(unknown) do
    if not counts[text] then counts[text] = 0; order[#order+1] = text end
    counts[text] = counts[text] + 1
  end
  local out = {}
  for _, text in ipairs(order) do
    out[#out+1] = counts[text] > 1 and (text .. " (" .. counts[text] .. ")") or text
  end
  if #order > 0 then
    out[#out+1] = "El archivo tiene dibujos que no armo este gadget (por ejemplo, sellos del gadget anterior). Usa un archivo base sin sellos, o Preparar base y Vincular cada sello."
  end
  return out
end
PreparationSync.unidentifiedIssues = unidentifiedIssues

local function bbox(entries)
  local box = nil
  for _, entry in ipairs(entries or {}) do if entry.role == "design" then
    local b = entry.object:GetBoundingBox()
    if not box then box = { minX = b.MinX, maxX = b.MaxX, minY = b.MinY, maxY = b.MaxY }
    else box.minX = math.min(box.minX, b.MinX); box.maxX = math.max(box.maxX, b.MaxX); box.minY = math.min(box.minY, b.MinY); box.maxY = math.max(box.maxY, b.MaxY) end
  end end
  return box
end

-- Exporta lineas, curvas cubicas y arcos conservando la topologia por evenodd.
-- Las coordenadas son locales a la pieza; traslaciones no cambian la huella.
local function svg(entries, normalized)
  local box = bbox(entries); if not box then error("Falta geometria del sello") end
  local w, h = box.maxX - box.minX, box.maxY - box.minY
  if w <= 0 or h <= 0 then error("Geometria sin superficie") end
  local kx, ky = normalized and 1 / w or 1, normalized and 1 / h or 1
  local function point(p) return fmt((p.X - box.minX) * kx) .. " " .. fmt((box.maxY - p.Y) * ky) end
  local paths = {}
  for _, entry in ipairs(entries) do if entry.role == "design" then
    walk(entry.object, function(object)
      if children(object) then return end
      local contour = object:GetContour()
      if not contour or contour.IsEmpty then error("Objeto sin contorno exportable; converti el texto a curvas") end
      if contour.IsOpen then error("Contorno de diseno abierto; revisar antes de mecanizar") end
      local path = "M" .. point(contour.StartPoint2D)
      local pos = contour:GetHeadPosition()
      while pos do
        local span; span, pos = contour:GetNext(pos)
        if span.IsBezierType then path = path .. "C" .. point(span:GetControlPointPosition(0)) .. " " .. point(span:GetControlPointPosition(1)) .. " " .. point(span.EndPoint2D)
        elseif span.IsLineType then path = path .. "L" .. point(span.EndPoint2D)
        elseif span.IsArcType then
          -- El SDK admite arcos de hasta 180 grados. Circunferencia por tres puntos.
          local a, m, b = span.StartPoint2D, span:GetControlPointPosition(0), span.EndPoint2D
          local d = 2 * (a.X * (m.Y - b.Y) + m.X * (b.Y - a.Y) + b.X * (a.Y - m.Y))
          if math.abs(d) < 1e-12 then path = path .. "L" .. point(b)
          else
            local aa, mm, bb = a.X*a.X+a.Y*a.Y, m.X*m.X+m.Y*m.Y, b.X*b.X+b.Y*b.Y
            local cx = (aa*(m.Y-b.Y)+mm*(b.Y-a.Y)+bb*(a.Y-m.Y))/d
            local cy = (aa*(b.X-m.X)+mm*(a.X-b.X)+bb*(m.X-a.X))/d
            local radius = math.sqrt((a.X-cx)^2+(a.Y-cy)^2)
            local ccw = (m.X-a.X)*(b.Y-m.Y)-(m.Y-a.Y)*(b.X-m.X) > 0
            path = path .. "A" .. fmt(radius*kx) .. " " .. fmt(radius*ky) .. " 0 0 " .. (ccw and "0" or "1") .. " " .. point(b)
          end
        else error("Tipo de tramo no soportado en el SVG observado") end
      end
      path = path .. "Z"; paths[#paths + 1] = path
    end)
  end end
  table.sort(paths)
  local text = '<svg xmlns="http://www.w3.org/2000/svg" width="' .. fmt(w) .. 'mm" height="' .. fmt(h) .. 'mm" viewBox="0 0 ' .. fmt(w) .. ' ' .. fmt(h) .. '"><path fill="black" fill-rule="evenodd" d="' .. table.concat(paths, " ") .. '"/></svg>'
  -- El hash normalizado excluye dimensiones declaradas del contenedor.
  return text, fingerprint(table.concat(paths, " "))
end
PreparationSync.svg = svg

local function readFile(path)
  local file = io.open(path, "rb"); if not file then error("No se pudo leer " .. path) end
  local text = file:read("*a"); file:close(); return text
end
local function writeFile(path, text)
  local file = io.open(path, "wb"); if not file then error("No se pudo escribir el vector temporal") end
  file:write(text); file:close()
end
local function checkpoint(ctx, suffix)
  local nonce = "ALCOHN_CHECK_" .. luaUUID():AsString()
  set(ctx.job.JobParameters, "ALCOHN_PREP_CHECKPOINT", nonce)
  if type(SaveCurrentJob) ~= "function" then error("SaveCurrentJob no disponible") end
  SaveCurrentJob()
  local path = ctx.resolvePath(ctx.job, ctx.folder)
  if not path then error("Guarda el archivo de Aspire antes de continuar") end
  local bytes = readFile(path)
  local wide = nonce:gsub(".", function(c) return c .. string.char(0) end)
  if not bytes:find(nonce, 1, true) and not bytes:find(wide, 1, true) then error("El archivo elegido no contiene la ultima revision guardada; no se subio una copia vieja") end
  if suffix then writeFile(path .. ".alcohn-" .. suffix .. "-" .. tostring(os.time()) .. ".bak", bytes) end
  return path
end

local function transform(entries, matrix, designOnly)
  for _, entry in ipairs(entries) do if not designOnly or entry.role == "design" then entry.object:Transform(matrix) end end
end
local function selectDesign(job, entries)
  job.Selection:Clear()
  for _, entry in ipairs(entries) do if entry.role == "design" then job.Selection:Add(entry.object, true, false) end end
end
local function remove(entries, role)
  for _, entry in ipairs(entries or {}) do if not role or entry.role ~= role then entry.layer:RemoveObject(entry.object) end end
end
local function vectorLayer(recipe) return recipe == "3MM" and "VECTOR 3MM" or recipe == "ALIMENTO" and "VECTOR ALIMENTO" or "VECTOR" end
local function ensureLayer(job, name)
  local l = layer(job, name); if not l then error("No se pudo crear/encontrar capa " .. name) end; return l
end
local function addTagged(job, name, object, s, role)
  tag(object, s.instanceId, s.selloId, role); ensureLayer(job, name):AddObject(object, true)
end
local function rectObject(x, top, width, bottom)
  local contour = Contour(0.0); contour:AppendPoint(Point2D(x-width/2, top)); contour:LineTo(Point2D(x+width/2, top))
  contour:LineTo(Point2D(x+width/2, bottom)); contour:LineTo(Point2D(x-width/2, bottom)); contour:LineTo(Point2D(x-width/2, top))
  return CreateCadContour(contour)
end
local function auxiliaries(ctx, s, entries, operation)
  for _,entry in ipairs(entries) do if entry.role~="design" and entry.role~="fine" then entry.layer:RemoveObject(entry.object) end end
  selectDesign(ctx.job, entries)
  local group = CreateCopyOfSelectedContours(false, false, RULES.offsetToleranceMm)
  if not group then error("No se pudo copiar el contorno para offsets") end
  local expanded = group:Offset(RULES.offsetsMm[1], math.abs(RULES.offsetsMm[1]), 1, true)
  if not expanded then error("Fallo el offset exterior") end
  local boundary = expanded:Offset(RULES.offsetsMm[2], math.abs(RULES.offsetsMm[2]), 1, true)
  if not boundary then error("Fallo el offset de limite") end
  addTagged(ctx.job, "Offset 1 vector", CreateCadGroup(boundary), s, "offset")
  local exterior = boundary:Offset(RULES.offsetsMm[3], math.abs(RULES.offsetsMm[3]), 1, true)
  if not exterior then error("Fallo el offset exterior final") end
  addTagged(ctx.job, operation.offsetLayer, CreateCadGroup(exterior), s, "offset")
  if s.recipe == "ALIMENTO" then addTagged(ctx.job, "Corte Alimento", CreateCadGroup(boundary), s, "perimeter") end
  local line = Contour(0.0); line:AppendPoint(Point2D(operation.cut.x1, operation.cut.y)); line:LineTo(Point2D(operation.cut.x2, operation.cut.y))
  addTagged(ctx.job, "Corte", CreateCadContour(line), s, "cut")
  local circle = Contour(0.0); local x, y, r = operation.drill.x,operation.drill.y,operation.drill.radiusMm
  circle:AppendPoint(Point2D(x+r,y)); circle:ArcTo(Point2D(x,y+r),Point2D(x,y),true)
  circle:ArcTo(Point2D(x-r,y),Point2D(x,y),true); circle:ArcTo(Point2D(x,y-r),Point2D(x,y),true); circle:ArcTo(Point2D(x+r,y),Point2D(x,y),true)
  addTagged(ctx.job, "Taladrado", CreateCadContour(circle), s, "drill")
end

-- Contornos sueltos del diseno (sin grupos), con su caja normalizada a la caja
-- del sello ubicado: 0 a 1, origen arriba a la izquierda (igual que la app).
local function designLeaves(entries)
  local box=bbox(entries); if not box then return {} end
  local w,h=box.maxX-box.minX,box.maxY-box.minY
  local out={}
  if w<=0 or h<=0 then return out end
  for _,entry in ipairs(entries) do if entry.role=="design" then
    walk(entry.object,function(object)
      if children(object) then return end
      local b=object:GetBoundingBox()
      out[#out+1]={object=object,x0=(b.MinX-box.minX)/w,x1=(b.MaxX-box.minX)/w,y0=(box.maxY-b.MaxY)/h,y1=(box.maxY-b.MinY)/h,w=w,h=h}
    end)
  end end
  return out
end

-- Repaso solo por las piezas que eligio la app. Cada pieza tiene que coincidir
-- con sus contornos (el de afuera y sus agujeros) dentro de 0,3 mm; si alguna no
-- coincide en ninguna de las dos orientaciones posibles, devuelve nil y se
-- repasa el sello completo. Nunca repasa menos de lo pedido.
local function partialFine(entries,pieces)
  local leaves=designLeaves(entries)
  if #leaves==0 then return nil end
  local tx,ty=0.3/leaves[1].w,0.3/leaves[1].h
  local function try(turn)
    local chosen={}
    for _,p in ipairs(pieces) do
      local x0,x1,y0,y1=p.x0,p.x1,p.y0,p.y1
      if turn then x0,x1,y0,y1=1-p.x1,1-p.x0,1-p.y1,1-p.y0 end
      local u={x0=math.huge,x1=-math.huge,y0=math.huge,y1=-math.huge}
      local inside={}
      for i,leaf in ipairs(leaves) do
        if leaf.x0>=x0-tx and leaf.x1<=x1+tx and leaf.y0>=y0-ty and leaf.y1<=y1+ty then
          inside[#inside+1]=i
          u.x0=math.min(u.x0,leaf.x0); u.x1=math.max(u.x1,leaf.x1); u.y0=math.min(u.y0,leaf.y0); u.y1=math.max(u.y1,leaf.y1)
        end
      end
      if #inside==0 or math.abs(u.x0-x0)>tx or math.abs(u.x1-x1)>tx or math.abs(u.y0-y0)>ty or math.abs(u.y1-y1)>ty then return nil end
      for _,i in ipairs(inside) do chosen[i]=true end
    end
    return chosen
  end
  local a,b=try(false),try(true)
  if not a and not b then return nil end
  local out={}
  for i,leaf in ipairs(leaves) do if (a and a[i]) or (b and b[i]) then out[#out+1]=leaf.object end end
  return out
end

local function fineSelection(ctx,s,entries,sourceHash)
  local fine=s.fine or {mode="auto",needsFine=true,inputHash=""}
  local existing=0
  for _,entry in ipairs(entries) do if entry.role=="fine" then existing=existing+1 end end
  if fine.mode=="aspire" then
    if existing==0 then error("Falta la seleccion parcial. Sincroniza primero con sello completo; luego ajusta sus contornos REPASO en Aspire y elegi conservar seleccion.") end
    local target=fine.scope=='internal' and RULES.recipes[s.recipe].fineInteriorLayer or RULES.recipes[s.recipe].fineLayer
    for _,entry in ipairs(entries) do if entry.role=='fine' and entry.layer and entry.layer.Name~=target then
      addTagged(ctx.job,target,entry.object:Clone(),s,'fine'); entry.layer:RemoveObject(entry.object)
    end end
    return nil
  end
  for _,entry in ipairs(entries) do if entry.role=="fine" then entry.layer:RemoveObject(entry.object) end end
  if fine.mode=="none" then return nil end
  local b=bbox(entries); local _,hash=svg(entries,true)
  local fresh=fine.analysisVersion==RULES.fineAnalysisVersion and close(fine.widthMm or 0,b.maxX-b.minX) and close(fine.heightMm or 0,b.maxY-b.minY) and fine.recipe==s.recipe
    and ((fine.geometryHash and fine.geometryHash==hash) or (fine.inputHash~="" and fine.inputHash==sourceHash
      and str(ctx.job.JobParameters,"SOURCE_IS_OBSERVED:" .. s.instanceId)~="1" and str(ctx.job.JobParameters,"SOURCE_GEOMETRY:" .. s.instanceId)==hash))
  if fine.mode=="auto" and fresh and not fine.needsFine then return nil end
  local warning=nil
  if fine.mode=="auto" and fresh and type(fine.pieces)=="table" and #fine.pieces>0 then
    local partial=partialFine(entries,fine.pieces)
    if partial then
      for _,object in ipairs(partial) do addTagged(ctx.job,"REPASO " .. s.recipe,object:Clone(),s,"fine") end
      return nil
    end
    warning="No se pudo ubicar la seleccion del repaso en el dibujo: se incluyo el sello completo."
  end
  for _,entry in ipairs(entries) do if entry.role=="design" then addTagged(ctx.job,"REPASO " .. s.recipe,entry.object:Clone(),s,"fine") end end
  if warning then return warning end
  if fine.mode=="auto" and not fresh then return "Analisis de repaso pendiente o desactualizado: se incluyo el sello completo. Actualiza el informe y guarda la preparacion para re-chequear." end
  return nil
end

local function importStamp(ctx, s)
  local source
  for _, row in ipairs(ctx.manifest.sellos) do if row.sello_id == s.selloId then source = row end end
  if not source then error("Falta el vector del sello") end
  local path = ctx.folder .. "\\" .. source.archivo:gsub("/", "\\")
  local originalHash = fingerprint(readFile(path))
  local seed = s.vectorSvg or source.seed_svg
  local reference=not s.vectorSvg and source.seed_reference or nil
  local alreadyMachined=s.vectorSvg and s.vectorAlreadyMachined or not s.vectorSvg and source.seed_svg~=nil
  if not s.vectorSvg and source.seed_svg and source.seed_source_hash~=originalHash then
    local decision=choose("Fuente y geometria guardada",s.name .. ": la fuente cambio desde el ultimo Aspire. Elegi que geometria importar en este archivo.",{"Usar el vector fuente nuevo","Conservar la geometria observada en Aspire"})
    if not decision then error("Conflicto de fuente pendiente") end
    if decision==1 then seed=nil; alreadyMachined=false; reference=nil end
  end
  if seed then
    path = ctx.folder .. "\\vectores\\prepared_" .. s.selloId .. ".svg"; writeFile(path, seed)
  end
  ctx.importSelected(path)
  ctx.job:GroupSelection()
  -- Procesar toda la seleccion evita asumir que GroupSelection siempre
  -- agrupa o que la capa de importacion tiene un nombre diferente al destino.
  local imported,entries={},{}
  local pos=ctx.job.Selection:GetHeadPosition()
  while pos do local object; object,pos=ctx.job.Selection:GetNext(pos); imported[#imported+1]=object end
  if #imported==0 then error("Importacion sin geometria") end
  local effectiveRecipe=s.recipe
  if reference and s.recipe==reference.planRecipe then effectiveRecipe=reference.recipe end
  local target=ensureLayer(ctx.job,vectorLayer(effectiveRecipe))
  for _,object in ipairs(imported) do
    local clone=object:Clone(); if not clone then error("No se pudo conservar el dibujo importado") end
    tag(clone,s.instanceId,s.selloId,"design"); target:AddObject(clone,true)
    entries[#entries+1]={object=clone,layer=target,role="design"}
    ctx.job.LayerManager:GetLayerWithId(object.RawLayerId):RemoveObject(object)
  end
  local b = bbox(entries)
  if not alreadyMachined then
    local center = Point2D((b.minX+b.maxX)/2, (b.minY+b.maxY)/2)
    transform(entries, ReflectionMatrix2D(Point2D(center.X,0),Point2D(center.X,1)), true)
    if b.maxX-b.minX > b.maxY-b.minY then transform(entries, RotationMatrix2D(center,90), true) end
  end
  b = bbox(entries)
  local factor = s.heightMm / (b.maxY-b.minY)
  if reference and close(s.widthMm,reference.planW) and close(s.heightMm,reference.planH) then factor=1 end
  transform(entries, ScalingMatrix2D(Point2D((b.minX+b.maxX)/2,(b.minY+b.maxY)/2),Vector2D(factor,factor)),true)
  local x,y=s.centerX,s.topY
  if reference and close(s.centerX,reference.planX) and close(s.topY,reference.planY) then x,y=reference.centerX,reference.topY end
  b = bbox(entries); transform(entries,TranslationMatrix2D(Vector2D(x-(b.minX+b.maxX)/2,y-b.maxY)),true)
  local _, originalGeometry = svg(entries, true)
  set(ctx.job.JobParameters, "SOURCE_GEOMETRY:" .. s.instanceId, originalGeometry)
  set(ctx.job.JobParameters, "SOURCE_IS_OBSERVED:" .. s.instanceId,not s.vectorSvg and seed and "1" or "0")
  return entries, seed and s.vectorSvg and fingerprint(s.vectorSvg) or originalHash,effectiveRecipe
end

local function baseKey(s, key) return "PREP:" .. s.instanceId .. ":" .. key end

-- Q-PROG-024: un sello que falla queda afuera y el resto sigue. Su dibujo pasa
-- a una capa que ninguna plantilla selecciona (asi no se mecaniza) y pierde
-- sus auxiliares. En la corrida siguiente vuelve a su capa de receta, o se
-- borra si se saco del programa en la app.
local PARKING_LAYER = "FUERA DEL PROGRAMA"
PreparationSync.PARKING_LAYER = PARKING_LAYER
local function park(ctx, s, entries)
  for _, entry in ipairs(entries or {}) do
    if entry.role == "design" then
      if entry.layer.Name ~= PARKING_LAYER then
        addTagged(ctx.job, PARKING_LAYER, entry.object:Clone(), s, "design"); entry.layer:RemoveObject(entry.object)
      end
    else entry.layer:RemoveObject(entry.object) end
  end
end
local function unpark(ctx, s, entries)
  local moved = false
  local recipe = str(ctx.job.JobParameters, baseKey(s, "recipe"))
  if recipe == "" then recipe = s.recipe end
  for _, entry in ipairs(entries) do if entry.role == "design" and entry.layer.Name == PARKING_LAYER then
    addTagged(ctx.job, vectorLayer(recipe), entry.object:Clone(), s, "design"); entry.layer:RemoveObject(entry.object); moved = true
  end end
  if not moved then return entries end
  local all = scan(ctx.job); return all[s.instanceId]
end
local function remember(ctx, s, entries, sourceHash, actualRecipe)
  local b = bbox(entries); local _, hash = svg(entries, true); local params = ctx.job.JobParameters
  set(params,baseKey(s,"planX"),s.centerX); set(params,baseKey(s,"planY"),s.topY)
  set(params,baseKey(s,"planW"),s.widthMm); set(params,baseKey(s,"planH"),s.heightMm)
  set(params,baseKey(s,"actualX"),(b.minX+b.maxX)/2); set(params,baseKey(s,"actualY"),b.maxY)
  set(params,baseKey(s,"actualW"),b.maxX-b.minX); set(params,baseKey(s,"actualH"),b.maxY-b.minY)
  set(params,baseKey(s,"planRecipe"),s.recipe); set(params,baseKey(s,"recipe"),actualRecipe or s.recipe)
  set(params,baseKey(s,"hash"),hash); set(params,baseKey(s,"source"),sourceHash)
end

local function conflict(text)
  return choose("Cambio en ambos lados",text,{"Usar el cambio de la app","Conservar el ajuste de Aspire"})
end
PreparationSync.close = close

local function updateStamp(ctx, s, entries)
  local params = ctx.job.JobParameters; local b = bbox(entries)
  if not b then error("La identidad existe pero falta el dibujo") end
  local _, hash = svg(entries, true)
  local priorHash = str(params,baseKey(s,"hash"))
  if priorHash == "" then error("Instancia sin referencia comun; vincula la seleccion antes de actualizar") end
  local source
  for _, row in ipairs(ctx.manifest.sellos) do if row.sello_id == s.selloId then source = row end end
  local sourceHash = s.vectorSvg and fingerprint(s.vectorSvg) or fingerprint(readFile(ctx.folder .. "\\" .. source.archivo:gsub("/","\\")))
  if sourceHash ~= str(params,baseKey(s,"source")) then
    local sourceGeometry = str(params,"SOURCE_GEOMETRY:" .. s.instanceId)
    local decision = sourceGeometry ~= hash and conflict(s.name .. ": cambio el vector fuente y el dibujo tiene correcciones. Elegi cual conservar.") or 1
    if not decision then error("Conflicto de geometria pendiente") end
    if decision == 1 then local imported,newHash,recipe=importStamp(ctx,s); remove(entries); return imported,newHash,recipe end
  end
  local geometryChanged = hash ~= priorHash
  local oldW, oldH = number(params,baseKey(s,"actualW"),0),number(params,baseKey(s,"actualH"),0)
  local planW, planH = number(params,baseKey(s,"planW"),0),number(params,baseKey(s,"planH"),0)
  local appSize = not close(s.widthMm,planW) or not close(s.heightMm,planH)
  local actualSize = not close(b.maxX-b.minX,oldW) or not close(b.maxY-b.minY,oldH)
  if appSize and actualSize and not geometryChanged and (not close(s.widthMm,b.maxX-b.minX) or not close(s.heightMm,b.maxY-b.minY)) then
    local decision = conflict(s.name .. ": el tamano cambio en la app y en Aspire.")
    if not decision then error("Conflicto de medida pendiente") end
    appSize = decision == 1
  end
  local x, y = (b.minX+b.maxX)/2,b.maxY
  local px, py = number(params,baseKey(s,"planX"),x),number(params,baseKey(s,"planY"),y)
  local appPosition = not close(s.centerX,px) or not close(s.topY,py)
  local actualPosition = not close(x,number(params,baseKey(s,"actualX"),x)) or not close(y,number(params,baseKey(s,"actualY"),y))
  if appPosition and actualPosition and not geometryChanged and (not close(s.centerX,x) or not close(s.topY,y)) then
    local decision = conflict(s.name .. ": la posicion cambio en ambos lados.")
    if not decision then error("Conflicto de posicion pendiente") end
    appPosition = decision == 1
  end
  local actualRecipe=nil
  for _,entry in ipairs(entries) do if entry.role=="design" then
    local r=entry.layer.Name=="VECTOR" and "CLASICO" or entry.layer.Name=="VECTOR 3MM" and "3MM" or entry.layer.Name=="VECTOR ALIMENTO" and "ALIMENTO" or nil
    if not r then error("Diseno fuera de una capa de mecanizado reconocida") end
    if actualRecipe and actualRecipe~=r then error("El mismo sello tiene dibujos en varias recetas") end
    actualRecipe=r
  end end
  local priorRecipe=str(params,baseKey(s,"recipe"))
  local appRecipe=s.recipe~=str(params,baseKey(s,"planRecipe"),priorRecipe)
  if appRecipe and actualRecipe~=priorRecipe and actualRecipe~=s.recipe then
    local decision=conflict(s.name .. ": el mecanizado cambio en ambos lados.")
    if not decision then error("Conflicto de mecanizado pendiente") end
    appRecipe=decision==1
  end
  local effectiveRecipe=appRecipe and s.recipe or actualRecipe
  local recipeChanged=effectiveRecipe~=actualRecipe
  if geometryChanged and s.fine and s.fine.mode=="aspire" then error("Cambio el diseno: revisa el repaso parcial o elegi sello completo antes de recalcular") end
  -- Solo escala el dibujo. Taladros y offsets se reconstruyen en mm, no se escalan.
  if appSize then
    local factor = s.heightMm / (b.maxY-b.minY)
    transform(entries,ScalingMatrix2D(Point2D(x,b.maxY),Vector2D(factor,factor)),true)
    for _,entry in ipairs(entries) do if entry.role=="fine" then entry.object:Transform(ScalingMatrix2D(Point2D(x,b.maxY),Vector2D(factor,factor))) end end
  end
  if appPosition then
    -- Una correccion interna puede cambiar la caja: aplicar el desplazamiento
    -- de la app sobre el marco anterior conserva esos ajustes locales.
    local now = bbox(entries)
    local dx, dy = s.centerX-(now.minX+now.maxX)/2,s.topY-now.maxY
    if geometryChanged and not appSize then dx,dy = s.centerX-px,s.topY-py end
    transform(entries,TranslationMatrix2D(Vector2D(dx,dy)),false)
  end
  if recipeChanged then
    for _, entry in ipairs(entries) do if entry.role == "design" then
      local clone = entry.object:Clone(); addTagged(ctx.job,vectorLayer(effectiveRecipe),clone,s,"design"); entry.layer:RemoveObject(entry.object)
    end end
    local all = scan(ctx.job); entries = all[s.instanceId]
  end
  -- Diferencias de redondeo (hasta 0,05 mm) entre corridas no son ajustes de
  -- Aspire: se lleva el sello a la medida y posicion exactas de la app. Si no,
  -- 0,02 mm de deriva dejan 7,98 mm entre sellos y la separacion de 8 falla.
  local now = bbox(entries)
  local h = now.maxY - now.minY
  if math.abs(h - s.heightMm) <= SNAP_MM and h > 0 and h ~= s.heightMm then
    local factor = s.heightMm / h
    transform(entries,ScalingMatrix2D(Point2D((now.minX+now.maxX)/2,now.maxY),Vector2D(factor,factor)),false)
    now = bbox(entries)
  end
  local sx, sy = s.centerX-(now.minX+now.maxX)/2, s.topY-now.maxY
  if math.abs(sx) <= SNAP_MM and math.abs(sy) <= SNAP_MM and (sx ~= 0 or sy ~= 0) then
    transform(entries,TranslationMatrix2D(Vector2D(sx,sy)),false)
  end
  -- Todos los auxiliares se derivan juntos DESPUES de validar las poses finales.
  return entries,sourceHash,effectiveRecipe
end

local function bindSelector(path,names)
  local selector=GeometrySelector(); selector:LoadSelectorData(path)
  selector:RemoveAllLayerNames(); selector.OnlyOnLayers=true
  for _,name in ipairs(names) do
    local ok=pcall(function() selector:AddLayerName(name) end)
    if not ok then selector:AddLayerhName(name) end -- Nombre documentado por SDK v10.
  end
  selector:SaveSelectorData(path)
  local check=GeometrySelector(); check:LoadSelectorData(path)
  if not check.OnlyOnLayers or check.LayerNameCount~=#names then error('No se pudo adaptar la seleccion de Alimento') end
  for _,name in ipairs(names) do if not check:FindLayerWithName(name) then error('Falta una capa en el selector adaptado') end end
end

local function managedToolpaths(job, templates, folder, proofs)
  local tm = ToolpathManager(); local old = str(job.JobParameters,"ALCOHN_MANAGED_TOOLPATHS")
  local expectedIds,expectedCount={},0
  for id in old:gmatch('[^|]+') do if not expectedIds[id] then expectedIds[id]=true; expectedCount=expectedCount+1 end end
  local paths, untracked = {}, 0; local pos = tm:GetHeadPosition()
  while pos do local path; path,pos = tm:GetNext(pos); paths[#paths+1] = path; if not old:find("|" .. objectId(path) .. "|",1,true) then untracked=untracked+1 end end
  if untracked > 0 then error("Hay trayectorias previas sin identidad. Usa Preparar base con respaldo antes de sincronizar.") end
  local signatures,files,seen,covered = {},{},{},{}
  for _, recipe in ipairs({"CLASICO","3MM","ALIMENTO"}) do for _, file in ipairs(templates[recipe] or {}) do
    local hash=fingerprint(readFile(folder .. "\\" .. file:gsub("/","\\")))
    if not proofs or not proofs[file] or proofs[file].fingerprint~=hash then error("La plantilla no coincide con la comprobada por la app. Descarga un paquete nuevo.") end
    local proof=proofs[file]; local active=0; local selectedIds={}
    if type(proof.stage)~='number' or proof.stage<0 or proof.stage>99 then error('Falta el orden comprobado de ' .. file) end
    if not proof.selectors or #proof.selectors~=proof.toolpathCount then error("Falta la seleccion comprobada de " .. file) end
    for _,selector in ipairs(proof.selectors) do
      local present=false
      local targets=proof.selectionLayers or proof.selectorLayers or selector.layers or {}
      for _,name in ipairs(targets) do
        local current=layer(job,name)
        if current and current:GetHeadPosition() then
          present=true
          if proof.selectionLayers then
            local p=current:GetHeadPosition()
            while p do local object; object,p=current:GetNext(p); selectedIds[#selectedIds+1]=objectId(object) end
          end
        end
      end
      if present then active=active+1; for _,name in ipairs(targets) do covered[name]=true end end
    end
    if active>0 and active~=proof.toolpathCount then error("La plantilla mezcla operaciones con y sin vectores. Exportalas por separado: " .. file) end
    local binding=proof.selectionLayers or proof.selectorLayers
    local key=hash .. (binding and ':' .. recipe .. ':' .. table.concat(binding,',') or '')
    if active>0 and not seen[key] then files[#files+1]=file; seen[key]=true end
    table.sort(selectedIds)
    signatures[#signatures+1] = recipe .. ":" .. hash .. ":" .. tostring(active) .. ':' .. tostring(proof.stage) .. ':' .. tostring(proof.subOrder or 0) .. ':' .. table.concat(selectedIds,',') .. ':' .. table.concat(binding or {},',')
  end end
  for name in pairs(DESIGN_LAYERS) do local current=layer(job,name)
    if current and current:GetHeadPosition() and not covered[name] then error("Falta una trayectoria para la capa " .. name) end
  end
  local required={"Corte","Taladrado","Offset 1 vector","Offset exterior vector","Offset exterior vector 3mm","Offset exterior vector alimento","Corte Alimento","REPASO CLASICO","REPASO 3MM","REPASO ALIMENTO","REPASO INTERIOR CLASICO","REPASO INTERIOR 3MM","REPASO INTERIOR ALIMENTO","Planeado","Rectangulo exterior"}
  for _,name in ipairs(required) do local current=layer(job,name)
    if current and current:GetHeadPosition() and not covered[name] then error("Falta una trayectoria para la capa " .. name) end
  end
  table.sort(signatures); local signature = table.concat(signatures,"|")
  local originalOrder={}; for i,file in ipairs(files) do originalOrder[file]=i end
  table.sort(files,function(a,b)
    local pa,pb=proofs[a],proofs[b]
    if pa.stage~=pb.stage then return pa.stage<pb.stage end
    if (pa.subOrder or 0)~=(pb.subOrder or 0) then return (pa.subOrder or 0)<(pb.subOrder or 0) end
    return originalOrder[a]<originalOrder[b]
  end)
  if signature == str(job.JobParameters,"ALCOHN_TEMPLATE_FINGERPRINT") and #paths > 0 and #paths==expectedCount then return end
  for _, path in ipairs(paths) do tm:DeleteToolpath(path) end
  local loaded,loadError=pcall(function()
    for _, file in ipairs(files) do
      local before=tm.Count
      local priorIds={}; local position=tm:GetHeadPosition()
      while position do local path; path,position=tm:GetNext(position); priorIds[objectId(path)]=true end
      local expected=proofs[file].toolpathCount
      if type(expected)~="number" or expected<1 or expected>100 then error("Falta la cantidad comprobada de trayectorias de " .. file) end
      if proofs[file].selectionLayers then
        job.Selection:Clear()
        for _,name in ipairs(proofs[file].selectionLayers) do
          local current=layer(job,name); local p=current and current:GetHeadPosition()
          while p do local object; object,p=current:GetNext(p); job.Selection:Add(object,true,false) end
        end
      end
      -- Aspire 10.514 devuelve false aun al cargar correctamente. Comprobar
      -- la cantidad real y exigir despues el recalculo, sin aprobar por el bool.
      tm:LoadToolpathTemplate(folder .. "\\" .. file:gsub("/","\\"))
      if tm.Count-before~=expected then error("Carga incompleta de la plantilla " .. file) end
      if proofs[file].selectionLayers or proofs[file].selectorLayers then
        position=tm:GetHeadPosition()
        while position do local path; path,position=tm:GetNext(position); local id=objectId(path)
          if not priorIds[id] then
            if proofs[file].selectionLayers then set(job.JobParameters,'ALCOHN_MANUAL_SELECTION:' .. id,table.concat(proofs[file].selectionLayers,'|')) end
            if proofs[file].selectorLayers then
              bindSelector(path,proofs[file].selectorLayers)
              set(job.JobParameters,'ALCOHN_LAYER_SELECTION:' .. id,table.concat(proofs[file].selectorLayers,'|'))
            end
          end
        end
      end
    end
  end)
  local ids,seenIds,duplicateId = {},{},false; pos=tm:GetHeadPosition()
  while pos do local path; path,pos=tm:GetNext(pos); local id=objectId(path)
    if seenIds[id] then duplicateId=true end; seenIds[id]=true; ids[#ids+1]="|" .. id .. "|"
  end
  if #ids == 0 then error("Las plantillas no generaron trayectorias") end
  set(job.JobParameters,"ALCOHN_MANAGED_TOOLPATHS",table.concat(ids))
  set(job.JobParameters,"ALCOHN_TEMPLATE_FINGERPRINT",loaded and not duplicateId and signature or "")
  if duplicateId then error('Las plantillas generaron trayectorias con identidad duplicada; no se aprobo el mecanizado') end
  if not loaded then error(loadError) end
end

local function recalculateManaged(job)
  local tm=ToolpathManager(); local ids={}; local pos=tm:GetHeadPosition()
  while pos do local path; path,pos=tm:GetNext(pos); ids[#ids+1]=objectId(path) end
  if #ids==0 then error('No hay trayectorias para recalcular') end
  for _,id in ipairs(ids) do
    local uuid=luaUUID(); uuid:Set(id)
    local at=tm:Find(uuid.RawId); if not at then error('Desaparecio una trayectoria') end
    local path=tm:GetAt(at)
    local layers=str(job.JobParameters,'ALCOHN_LAYER_SELECTION:' .. id)
    if layers~='' then local names={}; for name in layers:gmatch('[^|]+') do names[#names+1]=name end; bindSelector(path,names) end
    local selection=str(job.JobParameters,'ALCOHN_MANUAL_SELECTION:' .. id)
    if selection~='' then
      job.Selection:Clear()
      for name in selection:gmatch('[^|]+') do
        local current=layer(job,name); local p=current and current:GetHeadPosition()
        while p do local object; object,p=current:GetNext(p); job.Selection:Add(object,true,false) end
      end
    end
    if not tm:RecalculateToolpath(path) then error('Fallo el recalculo de una trayectoria') end
    -- El SDK destruye/recrea el objeto: obtenerlo nuevamente por UUID.
    at=tm:Find(uuid.RawId); if not at then error('Falta el resultado recalculado') end
    path=tm:GetAt(at); local stats=path:Statistics()
    if not stats.IsValid or stats.FeedLength+stats.PlungeLength<=0 then error('Trayectoria sin mecanizado valido: ' .. path.Name .. '. Revisar la seleccion o la plantilla.') end
  end
end

-- Comprobar los auxiliares reales, no solo el plan del que se generaron.
local function verifyExecution(job, execution)
  local inventory,unknown=scan(job)
  if #unknown>0 then error("Quedaron vectores sin identidad") end
  local function bounds(object,x1,x2,y1,y2)
    local b=object:GetBoundingBox()
    if not close(b.MinX,x1) or not close(b.MaxX,x2) or not close(b.MinY,y1) or not close(b.MaxY,y2) then
      error("Los auxiliares generados no coinciden con el armado final")
    end
  end
  for _,operation in ipairs(execution.stamps) do
    local counts={design=0,cut=0,drill=0,offset=0,perimeter=0,fine=0}
    for _,entry in ipairs(inventory[operation.instanceId] or {}) do
      if counts[entry.role]==nil then error("Auxiliar con rol desconocido") end
      counts[entry.role]=counts[entry.role]+1
      if entry.role=="cut" then
        if entry.layer.Name~="Corte" then error("Corte fuera de su capa") end
        bounds(entry.object,operation.cut.x1,operation.cut.x2,operation.cut.y,operation.cut.y)
      elseif entry.role=="drill" then
        if entry.layer.Name~="Taladrado" then error("Taladro fuera de su capa") end
        local d=operation.drill; bounds(entry.object,d.x-d.radiusMm,d.x+d.radiusMm,d.y-d.radiusMm,d.y+d.radiusMm)
      elseif entry.role=="offset" and entry.layer.Name~="Offset 1 vector" and entry.layer.Name~=operation.offsetLayer then error("Offset fuera de su receta")
      elseif entry.role=="perimeter" and entry.layer.Name~="Corte Alimento" then error("Perimetro fuera de su capa")
      elseif entry.role=="design" and entry.layer.Name~=operation.vectorLayer then error("Dibujo fuera de su receta")
      elseif entry.role=="fine" and entry.layer.Name~=operation.fineLayer then error("Repaso fuera de su receta") end
    end
    if counts.design==0 or counts.cut~=1 or counts.drill~=1 or counts.offset~=2
      or counts.perimeter~=(operation.recipe=="ALIMENTO" and 1 or 0) then error("Faltan o sobran auxiliares del sello") end
  end
  for _,name in ipairs({"Planeado","Rectangulo exterior"}) do
    local objects={}; local current=ensureLayer(job,name); local pos=current:GetHeadPosition()
    while pos do local object; object,pos=current:GetNext(pos); objects[#objects+1]=object end
    if #objects~=#execution.columns then error("Cantidad incorrecta de rectangulos de material") end
    local matched={}
    for _,col in ipairs(execution.columns) do
      local width=name=="Planeado" and col.planeWidthMm or col.exteriorWidthMm
      local found=false
      for i,object in ipairs(objects) do if not matched[i] then
        local b=object:GetBoundingBox()
        if close((b.MinX+b.MaxX)/2,col.centerX) then bounds(object,col.centerX-width/2,col.centerX+width/2,col.bottomY,col.topY); matched[i]=true; found=true; break end
      end end
      if not found then error("Falta un rectangulo de material") end
    end
  end
end

-- Deja el archivo como base para otro programa: sin trayectorias, sin los
-- sellos ni sus auxiliares. Conserva el resto del dibujo (soporte, reglas).
local function cleanForProgram(ctx, programId)
  local job = ctx.job
  local tm = ToolpathManager(); local list = {}; local pos = tm:GetHeadPosition()
  while pos do local path; path, pos = tm:GetNext(pos); list[#list+1] = path end
  for _, path in ipairs(list) do tm:DeleteToolpath(path) end
  local names = {"Planeado", "Rectangulo exterior"}
  for name in pairs(DESIGN_LAYERS) do names[#names+1] = name end
  for name in pairs(TRACKED_LAYERS) do names[#names+1] = name end
  for _, name in ipairs(names) do if layer(job, name) then ctx.clearLayer(job, name) end end
  set(job.JobParameters, "ALCOHN_MANAGED_TOOLPATHS", ""); set(job.JobParameters, "ALCOHN_TEMPLATE_FINGERPRINT", "")
  set(job.JobParameters, "ALCOHN_PROGRAMA_V1", ""); set(job.JobParameters, "ALCOHN_PREPARATION_PROGRAM_ID", programId)
end
PreparationSync.cleanForProgram = cleanForProgram

function PreparationSync.run(ctx)
  local prep, job = ctx.manifest.preparation,ctx.job
  local doc = prep.document
  if job.InMM ~= true then error("El archivo base debe trabajar en milimetros. No se modifico el armado.") end
  if prep.rules_version ~= RULES.version then error("El paquete y el gadget usan reglas diferentes. Actualiza el gadget.") end
  local priorProgram = str(job.JobParameters,"ALCOHN_PREPARATION_PROGRAM_ID")
  if priorProgram=="" then priorProgram=str(job.JobParameters,"ALCOHN_PROGRAMA_V1"):match('"programa_id"%s*:%s*"([^"]+)"') or "" end
  -- Una base reutilizada (de otro programa, o con sellos y trayectorias que no
  -- armo este gadget, como los del gadget anterior): se ofrece limpiarla con copia.
  local foreign = priorProgram ~= "" and priorProgram ~= doc.programId
  local _, leftovers = scan(job)
  local managed, untracked = str(job.JobParameters, "ALCOHN_MANAGED_TOOLPATHS"), 0
  do local tm = ToolpathManager(); local p = tm:GetHeadPosition()
    while p do local path; path, p = tm:GetNext(p); if not managed:find("|" .. objectId(path) .. "|", 1, true) then untracked = untracked + 1 end end end
  if foreign or #leftovers > 0 or untracked > 0 then
    local what = " se guarda una copia y se borran las trayectorias, los sellos y sus auxiliares (corte, taladro, offsets, repaso, planeado). El soporte y el resto del dibujo quedan."
    local options = foreign and {"Limpiar y usar para este programa", "Cancelar sin tocar nada"}
      or {"Limpiar y usar para este programa", "Seguir sin limpiar (vincular a mano)", "Cancelar sin tocar nada"}
    local decision = choose(foreign and "Archivo de otro programa" or "Archivo con sellos anteriores",
      (foreign and "Este archivo de Aspire ya se uso para otro programa. Para usarlo con " or "Este archivo tiene sellos o trayectorias que no armo este gadget (por ejemplo, del gadget anterior). Para usarlo con ")
        .. ctx.manifest.programa_nombre .. what, options)
    if decision == 1 then
      checkpoint(ctx, "antes-limpiar")
      cleanForProgram(ctx, doc.programId)
      checkpoint(ctx)
    elseif foreign or decision ~= 2 then
      ctx.message(foreign and "Cancelado: el archivo pertenece a otro programa y no se modifico." or "Cancelado: no se modifico el archivo."); return true
    end
  end
  local action = choose("Preparacion visual", "Programa " .. ctx.manifest.programa_nombre .. ". Los cambios se aplican sobre los vectores existentes.", {
    "Sincronizar y recalcular", "Vincular el diseno seleccionado a un sello (archivo anterior)",
    "Preparar base: respaldar y retirar trayectorias/auxiliares anteriores, conservar dibujos" })
  if not action then return true end
  if action == 2 then
    if job.Selection.IsEmpty then error("Selecciona antes TODOS los contornos del sello que queres vincular") end
    local names, items = {}, {}
    for _, s in ipairs(doc.stamps) do if not s.excluded then names[#names+1]=s.name; items[#items+1]=s end end
    local selected = choose("Vincular seleccion", "La seleccion debe contener solo el dibujo completo de un sello. No se reimportara.", names)
    if not selected then return true end
    checkpoint(ctx,"antes-vincular")
    local s,entries = items[selected],{}
    local pos=job.Selection:GetHeadPosition()
    while pos do local object; object,pos=job.Selection:GetNext(pos)
      walk(object,function(item) local prior=str(item,"ALCOHN_INSTANCE_ID"); if prior~="" and prior~=s.instanceId then error("La seleccion incluye otro sello; no se cambio su identidad") end end)
      entries[#entries+1]={object=object,layer=job.LayerManager:GetLayerWithId(object.RawLayerId),role="design"}
    end
    for _,entry in ipairs(entries) do tag(entry.object,s.instanceId,s.selloId,"design") end
    local _,hash=svg(entries,true); set(job.JobParameters,"SOURCE_GEOMETRY:" .. s.instanceId,"ADOPTADO_CON_EDICIONES")
    local sourceHash=""
    for _, row in ipairs(ctx.manifest.sellos) do if row.sello_id==s.selloId then sourceHash=fingerprint(readFile(ctx.folder .. "\\" .. row.archivo:gsub("/","\\"))) end end
    remember(ctx,s,entries,sourceHash); set(job.JobParameters,baseKey(s,"hash"),hash)
    -- La referencia de adopcion es la posicion real; el siguiente sync puede
    -- aplicar el montaje de la app sin reimportar el diseno.
    local b=bbox(entries)
    set(job.JobParameters,baseKey(s,"planX"),(b.minX+b.maxX)/2); set(job.JobParameters,baseKey(s,"planY"),b.maxY)
    set(job.JobParameters,baseKey(s,"planW"),b.maxX-b.minX); set(job.JobParameters,baseKey(s,"planH"),b.maxY-b.minY)
    set(job.JobParameters,"ALCOHN_PREPARATION_PROGRAM_ID",doc.programId); checkpoint(ctx)
    ctx.message("Diseno vinculado. Repeti con los sellos que falten; despues sincroniza.")
    return true
  end
  checkpoint(ctx,"antes-r" .. tostring(prep.revision))
  if action == 3 then
    local tm=ToolpathManager(); local list={}; local pos=tm:GetHeadPosition()
    while pos do local path; path,pos=tm:GetNext(pos); list[#list+1]=path end
    for _, path in ipairs(list) do tm:DeleteToolpath(path) end
    for _, name in ipairs({"Corte","Taladrado","Offset 1 vector","Offset exterior vector","Offset exterior vector 3mm","Offset exterior vector alimento","Corte Alimento","Planeado","Rectangulo exterior"}) do ctx.clearLayer(job,name) end
    set(job.JobParameters,"ALCOHN_MANAGED_TOOLPATHS",""); set(job.JobParameters,"ALCOHN_TEMPLATE_FINGERPRINT","")
    checkpoint(ctx); ctx.message("Base preparada con respaldo. Se conservaron los dibujos; vincula los que no tengan identidad y sincroniza."); return true
  end
  local issues, observed, present, material = {}, {}, {}, {}
  local function issue(code,message,id) issues[#issues+1]={code=code,message=message,instanceId=id,severity="error"} end
  local function hasErrors() for _,item in ipairs(issues) do if item.severity=="error" then return true end end; return false end
  local inventory, unknown = scan(job)
  for _, text in ipairs(unidentifiedIssues(unknown)) do issue("UNIDENTIFIED",text) end
  local wanted={}; for _,s in ipairs(doc.stamps) do if not s.excluded then wanted[s.instanceId]=s end end
  if #unknown == 0 then
    for id, entries in pairs(inventory) do if not wanted[id] then
      local oldHash=str(job.JobParameters,"PREP:" .. id .. ":hash")
      local ok,_,currentHash=pcall(svg,entries,true)
      local decision=1
      if not ok or currentHash~=oldHash then decision=conflict("Se quito una pieza de la app y su geometria cambio en Aspire. Retirar (app) o conservar (Aspire).") end
      if decision==1 then remove(entries) else issue("REMOVAL_CONFLICT","La pieza quitada sigue en Aspire; resolvelo antes de aprobar.",id) end
    end end
    for _, s in ipairs(doc.stamps) do if not s.excluded then
      local ok, entries, sourceHash, actualRecipe = pcall(function()
        local existing=inventory[s.instanceId]
        if existing then return updateStamp(ctx,s,unpark(ctx,s,existing)) end
        if str(job.JobParameters,baseKey(s,"hash"))~="" then
          local decision=choose("Pieza ausente",s.name .. ": estaba en el ultimo armado y falta. No se reinsertara sin decision.",{"Reinsertar desde el vector fuente","Dejar pendiente y revisar en la app"})
          if decision~=1 then error("Pieza ausente pendiente de decision") end
        end
        local created,hash,recipe=importStamp(ctx,s)
        return created,hash,recipe
      end)
      if ok then ok,entries=pcall(function()
        local all=scan(job); entries=all[s.instanceId]; local b=bbox(entries)
        local effective={}; for key,value in pairs(s) do effective[key]=value end; effective.recipe=actualRecipe or s.recipe
        if not prep.template_files[effective.recipe] then issue("RECIPE_TEMPLATE","Falta la plantilla de la receta elegida en Aspire; adoptala en la app y sincroniza",s.instanceId) end
        local svgText=svg(entries,false); local _,hash=svg(entries,true)
        if #svgText>500000 then issue("SVG_SIZE","El SVG observado supera el limite; revisar el vector.",s.instanceId); svgText=nil end
        observed[#observed+1]={instanceId=s.instanceId,selloId=s.selloId,centerX=(b.minX+b.maxX)/2,topY=b.maxY,widthMm=b.maxX-b.minX,heightMm=b.maxY-b.minY,recipe=effective.recipe,geometryHash=hash,sourceHash=sourceHash,sourceUrl=s.sourceUrl,svg=svgText}
        present[#present+1]=s.selloId; remember(ctx,s,entries,sourceHash,effective.recipe)
      end) end
      if not ok then issue("STAMP",s.name .. ": " .. tostring(entries),s.instanceId) end
    end end
  end
  set(job.JobParameters,"ALCOHN_PREPARATION_PROGRAM_ID",doc.programId)
  local _,afterUnknown=scan(job)
  for _,text in ipairs(unidentifiedIssues(afterUnknown)) do issue("UNIDENTIFIED",text) end
  -- Los errores de un sello lo dejan afuera; los generales frenan todo.
  local parked={}
  local function parkFrom(list)
    local more=false
    for _,item in ipairs(list) do
      if item.severity=="error" and item.instanceId and wanted[item.instanceId] and not parked[item.instanceId] then parked[item.instanceId]=true; more=true end
    end
    return more
  end
  parkFrom(issues)
  local execution
  while true do
    local planStamps={}
    for _,st in ipairs(doc.stamps) do
      if parked[st.instanceId] then local copy={}; for k,v in pairs(st) do copy[k]=v end; copy.excluded=true; planStamps[#planStamps+1]=copy
      else planStamps[#planStamps+1]=st end
    end
    local planDoc={}; for k,v in pairs(doc) do planDoc[k]=v end; planDoc.stamps=planStamps
    local planObserved={}; for _,row in ipairs(observed) do if not parked[row.instanceId] then planObserved[#planObserved+1]=row end end
    execution=ExecutionPlan.build(planDoc,planObserved,RULES)
    for _,item in ipairs(execution.issues) do
      local dup=false
      for _,prev in ipairs(issues) do if prev.code==item.code and prev.instanceId==item.instanceId and prev.message==item.message then dup=true end end
      if not dup then issues[#issues+1]=item end
    end
    if not parkFrom(execution.issues) then break end
  end
  local function hasGlobalErrors()
    for _,item in ipairs(issues) do if item.severity=="error" and not (item.instanceId and parked[item.instanceId]) then return true end end
    return false
  end
  local parkedNames={}
  for _,st in ipairs(doc.stamps) do if parked[st.instanceId] then parkedNames[#parkedNames+1]=st.name end end
  local recalculated=false
  local executionVerified=false
  if not hasGlobalErrors() and #execution.stamps>0 then
    if #parkedNames>0 then
      local all=scan(job)
      for id in pairs(parked) do park(ctx,wanted[id],all[id]) end
    end
    local ok,err=pcall(function()
      -- Los rectangulos globales se derivan del montaje, no de rayitas huerfanas.
      ctx.clearLayer(job,"Planeado"); ctx.clearLayer(job,"Rectangulo exterior")
      local all=scan(job)
      for _,operation in ipairs(execution.stamps) do
        local s={}; for key,value in pairs(wanted[operation.instanceId]) do s[key]=value end; s.recipe=operation.recipe
        local entries=all[s.instanceId]
        auxiliaries(ctx,s,entries,operation)
        local refreshed=scan(job); entries=refreshed[s.instanceId]
        local actual=nil; for _,row in ipairs(observed) do if row.instanceId==s.instanceId then actual=row end end
        local warning=fineSelection(ctx,s,entries,actual.sourceHash)
        if warning then issues[#issues+1]={code="FINE_FALLBACK",message=s.name .. ": " .. warning,instanceId=s.instanceId,severity="warning"} end
      end
      for _,col in ipairs(execution.columns) do
        ensureLayer(job,"Planeado"):AddObject(rectObject(col.centerX,col.topY,col.planeWidthMm,col.bottomY),true)
        ensureLayer(job,"Rectangulo exterior"):AddObject(rectObject(col.centerX,col.topY,col.exteriorWidthMm,col.bottomY),true)
        material[tostring(col.nominalMm)]=col.materialMm
      end
      verifyExecution(job,execution); executionVerified=true
      managedToolpaths(job,prep.template_files,ctx.folder,prep.template_proofs)
      recalculateManaged(job)
      recalculated=true
    end)
    if not ok then issue("TOOLPATHS",tostring(err)) end
  end
  job:Refresh2DView()
  local eventId=luaUUID():AsString()
  local report=ctx.buildReport({evento_id=eventId,programa_id=doc.programId,token=ctx.manifest.token,modo="PREPARACION_V2",sellos_presentes=present,sellos_importados_ahora={},sellos_no_importados={},sellos_borrados_en_maquina={},sellos_en_otra_planchuela={},material_por_planchuela=material,maquinado_segundos=ctx.machiningSeconds(),objetos_en_corte=#present,sellos_tageados=#present})
  report=report:sub(1,-2) .. ',"preparation":' .. json({revision=prep.revision,stamps=observed,issues=issues,recalculated=recalculated,
    execution={rulesVersion=RULES.version,verified=executionVerified,stampCount=#execution.stamps,columnCount=#execution.columns}}) .. "}"
  if not ctx.writeReport(job,report) then error("No se pudo guardar el informe en el job") end
  local path=checkpoint(ctx)
  local posted,postError=ctx.postReport(report)
  if not posted then error("El archivo quedo guardado; fallo el informe: " .. tostring(postError)) end
  if not hasErrors() then
    local uploaded,uploadError=ctx.upload(doc.programId,ctx.manifest.token,path,eventId)
    if not uploaded then error("Informe enviado; falta subir Aspire: " .. tostring(uploadError)) end
  end
  local lines={"Revision " .. tostring(prep.revision) .. ": " .. tostring(#observed) .. " sellos observados."}
  if recalculated and #parkedNames>0 then
    lines[#lines+1]="QUEDARON AFUERA (sin trayectorias, en la capa " .. PARKING_LAYER .. "): " .. table.concat(parkedNames,", ") .. "."
    lines[#lines+1]="Se recalcularon las trayectorias de los otros " .. tostring(#execution.stamps) .. " sellos."
    lines[#lines+1]=""
  end
  for _,item in ipairs(issues) do lines[#lines+1]=item.message end
  if not hasErrors() then lines[#lines+1]="Sincronizado. Revisa las trayectorias y guarda los TXT."
  elseif recalculated then
    lines[#lines+1]=""
    lines[#lines+1]="Para habilitar la fabricacion en la app: saca de la mesa los sellos que quedaron afuera (vuelven a la cola), toca Guardar y chequear y corre el gadget de nuevo."
  else lines[#lines+1]="No se generaron ni recalcularon trayectorias: corregi lo de arriba (en la app o en Aspire) y volve a correr el gadget." end
  ctx.message(table.concat(lines,"\n")); return true
end

PreparationSync.mergeStamp = updateStamp
PreparationSync.remember = remember
PreparationSync.fineSelection = fineSelection
PreparationSync.partialFine = partialFine
return PreparationSync

end)()
-- END ALCOHN PREPARATION GENERATED

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

  if manifest.preparation then
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

  local upload_ok, upload_err = false, nil
  if blob_ok and post_ok then
    upload_ok, upload_err = saveAndUploadAspire(
      job,
      folder,
      tostring(manifest.programa_id or ""),
      tostring(manifest.token or "")
    )
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
    if upload_ok then
      table.insert(summary_parts, "Archivo Aspire subido (preview OK).")
      if upload_err then
        table.insert(summary_parts, clipLine(tostring(upload_err), 60))
      end
    else
      table.insert(summary_parts, "No se pudo subir el .crv3d.")
      table.insert(summary_parts, clipLine(tostring(upload_err or "error"), 60))
      table.insert(summary_parts, "Subilo desde Programas si hace falta.")
    end
  end

  DisplayMessage(table.concat(summary_parts, "\n"))
  return true
end
