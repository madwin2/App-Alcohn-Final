-- VECTRIC LUA SCRIPT
-- Armar Programa - Maquina Chica (C)
--
-- Que hace: abre cada vector del programa descargado (uno por uno, en DXF),
-- y para cada uno corre la automatizacion de tipo que ya usabas a mano
-- (AUTOMATIZACION_SIMPLIFICADA.lua para Clasico, o la variante _3MM para 3mm).
--
-- Instalacion (una sola vez):
--   Copiar este archivo a la carpeta de Gadgets de Aspire (Toolpaths > Gadgets),
--   o simplemente correrlo abriendo el .lua desde Aspire. La primera vez que lo
--   corras te va a pedir la carpeta donde estan instalados los dos .lua de
--   automatizacion de esta maquina (los que estan en "lua/MAQUINA CHICA/") y la
--   recuerda para la proxima (no lo vuelve a preguntar).
--
-- Uso normal:
--   1. Abrir programa.crv3d (el .crv3d base que vino en el ZIP descargado).
--   2. Correr este gadget (Toolpaths > Gadgets > Armar Programa Chica).
--   3. Elegir manifest.lua dentro de la carpeta del ZIP ya descomprimida.
--   4. Al terminar muestra un resumen: cuantos sellos se importaron bien y
--      cuales quedaron con error para revisar a mano.
--
-- IMPORTANTE - limitacion actual: los vectores del manifest tienen que ser
-- .dxf. La API de Lua de Aspire no puede importar EPS/AI/PDF por script (solo
-- SVG y DXF/DWG), asi que si el ZIP todavia trae .eps (los que se generan hoy)
-- este gadget va a marcar esos sellos como error y hay que importarlos a mano.
-- Hace falta actualizar la generacion del paquete (packageZip.ts) para que
-- exporte DXF antes de que esto ande de punta a punta sin intervencion.

local MACHINE_LABEL = "Chica"
local MACHINE_CODE = "C"
local REGISTRY_SECTION = "ArmarPrograma_" .. MACHINE_LABEL
local CLASICO_FILE = "AUTOMATIZACION_SIMPLIFICADA.lua"
local TIPO3MM_FILE = "AUTOMATIZACION_SIMPLIFICADA_3MM CHICA.lua"

function DisplayMessage(message)
  local safe = tostring(message):gsub("[^\x20-\x7E]", "")
  DisplayMessageBox(safe)
  print(safe)
end

-- --- Registro de Windows: recordar carpetas entre corridas (best-effort) ---
-- Si el nombre de la clase no fuera exactamente este en tu version de Aspire,
-- el pcall evita que el gadget se rompa: simplemente vuelve a preguntar.
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

-- --- Carpeta con los .lua de automatizacion por tipo (se pregunta 1 sola vez) ---
local function getAutomationFolder()
  local reg = openRegistry()
  local saved = regGetString(reg, "automation_dir", "")
  if saved ~= "" then
    return saved
  end

  DisplayMessage(
    "Primera vez: elegi cualquier archivo dentro de la carpeta '" .. MACHINE_LABEL ..
    "' que tiene los .lua de automatizacion (" .. CLASICO_FILE .. " / " .. TIPO3MM_FILE ..
    "). Solo se pregunta una vez."
  )

  local dlg = FileDialog()
  local ok = dlg:FileOpen("lua", "*.lua", "Automatizacion (*.lua) | *.lua||")
  if not ok then
    return nil
  end

  regSetString(reg, "automation_dir", dlg.Directory)
  return dlg.Directory
end

-- --- Carpeta del programa descargado (manifest.lua + vectores/) ---
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

local function loadManifest(folder)
  local path = folder .. "\\manifest.lua"
  local ok, manifest = pcall(dofile, path)
  if not ok or type(manifest) ~= "table" then
    return nil, "No se pudo leer manifest.lua en " .. path .. " (" .. tostring(manifest) .. ")"
  end
  return manifest, nil
end

-- Corre la automatizacion de tipo (Clasico / 3mm) sobre la seleccion actual
-- (el vector recien importado). Se hace dofile justo antes de cada llamado
-- porque los dos scripts de tipo definen las mismas funciones globales
-- (CopySelectionToVectorLayer, ProcessSingleObject, main, etc.) con distinto
-- comportamiento cada uno -- recargar antes de cada uso evita mezclarlos.
local function runTypeAutomation(tipo, automation_folder)
  local upper = string.upper(tostring(tipo or ""))
  local file
  if upper == "3MM" then
    file = automation_folder .. "\\" .. TIPO3MM_FILE
  else
    file = automation_folder .. "\\" .. CLASICO_FILE
  end

  local ok, err = pcall(dofile, file)
  if not ok then
    return false, "no se pudo cargar " .. file .. ": " .. tostring(err)
  end

  local ok2, result = pcall(main)
  if not ok2 then
    return false, "fallo la automatizacion de tipo " .. tostring(tipo) .. ": " .. tostring(result)
  end
  return result ~= false, nil
end

local function processStamp(job, folder, automation_folder, s)
  local archivo = tostring(s.archivo or "")
  local vector_path = folder .. "\\" .. archivo

  if not string.match(string.lower(archivo), "%.dxf$") then
    return false, (s.sello_id or "?") .. ": formato no soportado (" .. archivo ..
      "). Se necesita .dxf -- importalo a mano y corre la automatizacion de tipo manualmente."
  end

  if not job:ImportDxfDwg(vector_path) then
    return false, (s.sello_id or "?") .. ": no se pudo importar " .. vector_path
  end

  local step_ok, step_err = runTypeAutomation(s.tipo, automation_folder)
  if not step_ok then
    return false, (s.sello_id or "?") .. ": " .. tostring(step_err)
  end

  return true, nil
end

function main()
  local job = VectricJob()
  if not job.Exists then
    DisplayMessage("Abri primero el programa.crv3d de la maquina " .. MACHINE_LABEL .. " antes de correr este gadget.")
    return "OK"
  end

  local automation_folder = getAutomationFolder()
  if not automation_folder then
    DisplayMessage("Cancelado: hace falta indicar la carpeta con las automatizaciones de tipo.")
    return "OK"
  end

  local folder = pickManifestFolder()
  if not folder then
    DisplayMessage("Cancelado: no se eligio la carpeta del programa (manifest.lua).")
    return "OK"
  end

  local manifest, load_err = loadManifest(folder)
  if not manifest then
    DisplayMessage(load_err)
    return "OK"
  end

  if manifest.maquina and manifest.maquina ~= MACHINE_CODE then
    DisplayMessage(
      "Atencion: este gadget es para maquina " .. MACHINE_LABEL .. " (" .. MACHINE_CODE ..
      ") y el programa elegido es de maquina " .. tostring(manifest.maquina) .. ". Cancelado."
    )
    return "OK"
  end

  local ok_count, fail_count = 0, 0
  local errors = {}

  for _, s in ipairs(manifest.sellos or {}) do
    local ok, err = processStamp(job, folder, automation_folder, s)
    if ok then
      ok_count = ok_count + 1
    else
      fail_count = fail_count + 1
      table.insert(errors, err)
    end
  end

  local summary = string.format(
    "Programa '%s': %d sello(s) OK, %d con error.",
    tostring(manifest.programa_nombre or manifest.programa_id or "?"),
    ok_count, fail_count
  )
  if #errors > 0 then
    summary = summary .. "\n\n" .. table.concat(errors, "\n")
  end
  DisplayMessage(summary)
  return "OK"
end
