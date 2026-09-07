-- VECTRIC LUA SCRIPT
-- Armar Programa - Maquina XL -- TODO EN UN SOLO ARCHIVO
--
-- Instalacion (una sola vez por PC, un solo paso):
--   Copiar UNICAMENTE este archivo a la carpeta de Gadgets de Aspire de esa
--   PC (Toolpaths > Gadgets te muestra cual es). No hace falta ninguna otra
--   carpeta ni archivo adicional -- toda la automatizacion por tipo (Clasico
--   y 3mm) ya esta adentro de este mismo archivo.
--
-- Uso normal:
--   1. Abrir programa.crv3d (el .crv3d base que vino en el ZIP descargado).
--   2. Correr este gadget (Toolpaths > Gadgets > Armar Programa XL).
--   3. Elegir manifest.lua dentro de la carpeta del ZIP ya descomprimida.
--   4. Al terminar muestra un resumen: cuantos sellos se importaron bien,
--      a cuales se les corrigio la escala automaticamente, y cuales quedaron
--      con error para revisar a mano.
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

local MACHINE_LABEL = "XL"
local MACHINE_CODE = "XL"
local REGISTRY_SECTION = "ArmarPrograma_" .. MACHINE_LABEL

local KNOWN_LAYERS = {
  ["VECTOR"] = true,
  ["VECTOR 3MM"] = true,
  ["Corte"] = true,
  ["Taladrado"] = true,
  ["Offset 1 vector"] = true,
  ["Offset exterior vector"] = true,
  ["Offset exterior vector 3mm"] = true,
  ["Dispositivo"] = true,
}

-- Configuracion de columna unica (identica a AUTOMATIZACION_SIMPLIFICADA
-- XL.lua / AUTOMATIZACION_SIMPLIFICADA_3MM XL.lua originales).
local XL_COLUMN_X = 31.5
local XL_COLUMN_WIDTH = 63
local XL_START_Y = -1
local XL_SEPARATION = 4

local SCALE_TOLERANCE = 0.02
local SCALE_MIN_SANE = 0.2
local SCALE_MAX_SANE = 5.0

local CreateCopyOfSelectedContours = CreateCopyOfSelectedContours
local GetDefaultContourTolerance = GetDefaultContourTolerance
local CreateCadGroup = CreateCadGroup

function DisplayMessage(message)
  local safe = tostring(message):gsub("[^\x20-\x7E]", "")
  DisplayMessageBox(safe)
  print(safe)
end

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
      "escala muy distinta a la esperada (importado ~%.1fmm, esperado %.1fmm) -- no se corrige solo, revisar a mano",
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
    return false, "no se pudo corregir la escala automaticamente: " .. tostring(err)
  end
  job:Refresh2DView()

  return true, string.format(
    "escala corregida automaticamente x%.3f (importado ~%.1fmm, ajustado a %.1fmm)",
    ratio, actual_major, expected_major
  )
end

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

-- Version XL: columna unica, sin seleccion de columna ni rotacion (igual a
-- CreateAdditionalElementsXL del script original).
local function createAdditionalElementsXL(bbox)
  if not bbox then return end
  local job = VectricJob()
  local layer_manager = job.LayerManager
  local corteLayer = layer_manager:GetLayerWithName("Corte")
  local taladradoLayer = layer_manager:GetLayerWithName("Taladrado")

  if not bbox.MinX or not bbox.MaxX or not bbox.MinY or not bbox.MaxY then return end

  local lineLength = XL_COLUMN_WIDTH
  local halfLine = lineLength / 2
  local lineX1 = XL_COLUMN_X - halfLine
  local lineX2 = XL_COLUMN_X + halfLine
  local lineY = bbox.MinY - 4

  pcall(function()
    local newLineContour = Contour(0.0)
    newLineContour:AppendPoint(Point2D(lineX1, lineY))
    newLineContour:LineTo(Point2D(lineX2, lineY))
    local cad_line = CreateCadContour(newLineContour)
    if cad_line then corteLayer:AddObject(cad_line, true) end
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

-- Version XL: sin seleccion de columna ni rotacion, siempre centrado en
-- XL_COLUMN_X, apilado hacia abajo en Y (igual al script original).
local function processSingleObject(obj)
  local job = VectricJob()
  local selection = job.Selection

  selection:Clear()
  selection:Add(obj, true, false)
  if selection.IsEmpty then
    DisplayMessage("Error: no se pudo seleccionar objeto")
    return false
  end

  if not job:GroupSelection() then
    -- puede que ya este agrupado, no es un error fatal
  end

  local bbox = selection:GetBoundingBox()
  if not bbox then return false end

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
  if not bbox then return false end

  local groupWidth = bbox.MaxX - bbox.MinX
  if groupWidth > XL_COLUMN_WIDTH then
    DisplayMessage("Advertencia: el vector es mas ancho que la columna (" ..
      groupWidth .. "mm > " .. XL_COLUMN_WIDTH .. "mm). Se posiciona igual, revisar.")
  end

  local targetTopY = XL_START_Y
  local corteLayer = job.LayerManager:GetLayerWithName("Corte")
  if corteLayer then
    local pos2 = corteLayer:GetHeadPosition()
    while pos2 do
      local obj2, newPos2 = corteLayer:GetNext(pos2)
      pos2 = newPos2
      if obj2 then
        local objBBox = obj2:GetBoundingBox()
        if objBBox then
          if objBBox.MinY < targetTopY then
            targetTopY = objBBox.MinY - XL_SEPARATION
          end
        end
      end
    end
  end

  local groupCenterX = (bbox.MinX + bbox.MaxX) / 2
  local dx = XL_COLUMN_X - groupCenterX
  local dy = targetTopY - bbox.MaxY
  local translationMatrix = TranslationMatrix2D(Vector2D(dx, dy))
  selection:Transform(translationMatrix)
  job:Refresh2DView()

  local updated_bbox = selection:GetBoundingBox()
  if updated_bbox then
    createAdditionalElementsXL(updated_bbox)
  end

  return true
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

local function runTypeAutomation(tipo)
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
  if not processSingleObject(latest_obj) then
    return false, "error procesando el objeto"
  end

  if not offsetOperations(vector_layer_name, offset_ext_layer_name) then
    return false, "error en las operaciones de offset"
  end

  ungroupLayers(ungroup_layers)
  return true, nil
end

local function processStamp(job, folder, s)
  local archivo = tostring(s.archivo or "")
  local vector_path = folder .. "\\" .. archivo
  local lower = string.lower(archivo)
  local warning = nil

  if string.match(lower, "%.svg$") then
    local before = snapshotLayerNames(job)
    if not job:ImportSVG(vector_path) then
      return false, (s.sello_id or "?") .. ": no se pudo importar " .. vector_path, nil
    end
    if not selectObjectsFromNewLayers(job, before) then
      return false, (s.sello_id or "?") ..
        ": se importo " .. vector_path .. " pero no se pudo identificar que quedo seleccionado", nil
    end
  elseif string.match(lower, "%.dxf$") or string.match(lower, "%.dwg$") then
    if not job:ImportDxfDwg(vector_path) then
      return false, (s.sello_id or "?") .. ": no se pudo importar " .. vector_path, nil
    end
  else
    return false, (s.sello_id or "?") .. ": formato no soportado (" .. archivo ..
      "). Se necesita .svg o .dxf.", nil
  end

  local scale_ok, scale_msg = validateAndFixScale(job, s.ancho_mm, s.largo_mm)
  if not scale_ok then
    return false, (s.sello_id or "?") .. ": " .. tostring(scale_msg), nil
  end
  if scale_msg then
    warning = (s.sello_id or "?") .. ": " .. scale_msg
  end

  local step_ok, step_err = runTypeAutomation(s.tipo)
  if not step_ok then
    return false, (s.sello_id or "?") .. ": " .. tostring(step_err), warning
  end

  return true, nil, warning
end

-- Paso 3: por cada columna con al menos un sello posicionado (busca en la
-- capa "Corte" las lineas que ya dejo createAdditionalElements por sello),
-- crea los 2 rectangulos de planchuela (Planeado / Rectangulo exterior) y
-- al final recalcula todas las trayectorias del job.
local PASO3_COLUMNS = { { nom = XL_COLUMN_WIDTH, xpos = XL_COLUMN_X } }

local function runPaso3AndRecalculate(job)
  local layer_manager = job.LayerManager
  local vectorLayer = layer_manager:GetLayerWithName("Corte")
  local planeadoLayer = layer_manager:GetLayerWithName("Planeado")
  local rectExtLayer = layer_manager:GetLayerWithName("Rectangulo exterior")

  if not vectorLayer or not planeadoLayer or not rectExtLayer then
    return "Paso 3 NO ejecutado: faltan capas en el .crv3d base (Corte / Planeado / Rectangulo exterior)."
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
    return "Paso 3: no se encontro ninguna columna con sellos, no se crearon rectangulos."
  end

  local tm = ToolpathManager()
  local ok, calc_result = pcall(function() return tm:RecalculateAllToolpaths() end)
  if ok and calc_result then
    return string.format(
      "Paso 3: %d columna(s) con rectangulos creados. Trayectorias recalculadas OK.",
      columnas_procesadas
    )
  else
    return string.format(
      "Paso 3: %d columna(s) con rectangulos creados. ATENCION: fallo el recalculo de trayectorias, revisar a mano.",
      columnas_procesadas
    )
  end
end

function main()
  local job = VectricJob()
  if not job.Exists then
    DisplayMessage("Abri primero el programa.crv3d de la maquina " .. MACHINE_LABEL .. " antes de correr este gadget.")
    return true
  end

  local folder = pickManifestFolder()
  if not folder then
    DisplayMessage("Cancelado: no se eligio la carpeta del programa (manifest.lua).")
    return true
  end

  local manifest, load_err = loadManifest(folder)
  if not manifest then
    DisplayMessage(load_err)
    return true
  end

  if manifest.maquina and manifest.maquina ~= MACHINE_CODE then
    DisplayMessage(
      "Atencion: este gadget es para maquina " .. MACHINE_LABEL ..
      " y el programa elegido es de maquina " .. tostring(manifest.maquina) .. ". Cancelado."
    )
    return true
  end

  local ok_count, fail_count = 0, 0
  local errors = {}
  local warnings = {}

  for _, s in ipairs(manifest.sellos or {}) do
    local ok, err, warn = processStamp(job, folder, s)
    if ok then
      ok_count = ok_count + 1
      if warn then table.insert(warnings, warn) end
    else
      fail_count = fail_count + 1
      table.insert(errors, err)
    end
  end

  local paso3_msg = runPaso3AndRecalculate(job)

  local summary = string.format(
    "Programa '%s': %d sello(s) OK, %d con error.",
    tostring(manifest.programa_nombre or manifest.programa_id or "?"),
    ok_count, fail_count
  )
  if paso3_msg then
    summary = summary .. "\n\n" .. paso3_msg
  end
  if #warnings > 0 then
    summary = summary .. "\n\nAvisos (revisar, se corrigieron solos):\n" .. table.concat(warnings, "\n")
  end
  if #errors > 0 then
    summary = summary .. "\n\nErrores (revisar a mano):\n" .. table.concat(errors, "\n")
  end
  DisplayMessage(summary)
  return true
end
