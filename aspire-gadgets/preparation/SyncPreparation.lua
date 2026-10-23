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
