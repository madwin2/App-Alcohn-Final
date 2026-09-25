-- VECTRIC LUA SCRIPT
-- Test Alcohn Sync -- SONDA, no toca el dibujo.
--
-- Para que sirve: antes de construir el gadget de cierre + webhook, hay que
-- confirmar en Aspire real cuatro cosas que la documentacion no deja 100%
-- cerradas. Esta sonda las prueba todas y muestra un informe. No importa
-- vectores, no crea geometria, no recalcula nada.
--
-- Instalacion: copiar este archivo a la carpeta de Gadgets de Aspire
--   (Toolpaths > Gadgets te muestra cual es).
--
-- Uso:
--   1. Abrir un .crv3d cualquiera (mejor uno de un programa ya fabricado).
--   2. Toolpaths > Gadgets > Test Alcohn Sync.
--   3. Leer el informe que aparece.
--   4. GUARDAR EL ARCHIVO (Ctrl+S, o Guardar como copia) -- este paso es el
--      que importa: sin guardar no se puede verificar que el dato persista.
--   5. Pasar ese .crv3d guardado por scripts/crv3d_inspect.py.
--
-- Si el informe da OK en los 4 puntos y el inspector encuentra el dato
-- despues de guardar, el diseno completo (blob en archivo + webhook) es
-- viable tal como esta planteado.

local PARAM_NAME = "ALCOHN_TEST_V1"
local MARKER = "ALCOHN|probe|v1"

local function say(message)
  local safe = tostring(message):gsub("[^\x20-\x7E\n]", "")
  DisplayMessageBox(safe)
  print(safe)
end

-- Envuelve cualquier llamada dudosa: devuelve OK o FALLO con el motivo.
local function probe(label, fn)
  local ok, res = pcall(fn)
  if ok then
    return true, label .. ": OK" .. (res and (" -- " .. tostring(res)) or "")
  end
  return false, label .. ": FALLO -- " .. tostring(res)
end

-- ---------------------------------------------------------------------
-- 1. JobParameters: escribir un string que tiene que sobrevivir al guardado
-- ---------------------------------------------------------------------
local function testJobParameters(job, lines)
  local params = nil
  local ok, msg = probe("1a. job.JobParameters accesible", function()
    params = job.JobParameters
    if not params then error("devolvio nil") end
    return "ok"
  end)
  table.insert(lines, msg)
  if not ok or not params then
    table.insert(lines, "   -> sin JobParameters no se puede seguir con este bloque.")
    return nil
  end

  local payload = MARKER .. ";job=" .. tostring(job.Name or "?")
  local _, msg2 = probe("1b. SetString(nombre, valor)", function()
    params:SetString(PARAM_NAME, payload)
    return "escrito"
  end)
  table.insert(lines, msg2)

  -- CONFIRMADO en Aspire 10.514: el getter toma DOS argumentos
  -- (nombre, default). La variante de tres que sugiere la documentacion
  -- no existe: "No matching overload found".
  local read_back = nil
  local _, msg3 = probe("1c. GetString(nombre, default)", function()
    read_back = params:GetString(PARAM_NAME, "")
    return tostring(read_back)
  end)
  table.insert(lines, msg3)

  if read_back == payload then
    table.insert(lines, "1e. Round-trip en memoria: OK (coincide lo escrito)")
  else
    table.insert(lines, "1e. Round-trip en memoria: revisar -- leido=" .. tostring(read_back))
  end

  return payload
end

-- ---------------------------------------------------------------------
-- 2. Tiempo de mecanizado real por toolpath
-- ---------------------------------------------------------------------
local function testMachiningTime(lines)
  local tm = nil
  local ok, msg = probe("2a. ToolpathManager()", function()
    tm = ToolpathManager()
    return "ok"
  end)
  table.insert(lines, msg)
  if not ok or not tm then return end

  -- En la primera corrida MachiningTime() sumo 0.0 sobre 12 toolpaths, asi
  -- que aca no asumimos que devuelva un numero: reportamos el tipo y el valor
  -- crudo del primero para saber que esta devolviendo realmente.
  local count, total, numericos = 0, 0, 0
  local muestra = "(sin toolpaths)"
  local ok2, err = pcall(function()
    local pos = tm:GetHeadPosition()
    while pos do
      local toolpath, newPos = tm:GetNext(pos)
      pos = newPos
      if toolpath then
        count = count + 1
        -- CONFIRMADO en Aspire 10.514: la firma real es
        -- int MachiningTime(Toolpath const&, bool) -- lleva un bool
        -- (la documentacion lo lista sin argumentos).
        local okt, t = pcall(function() return toolpath:MachiningTime(true) end)
        if count == 1 then
          local nombre = "?"
          local okn, n = pcall(function() return toolpath.Name end)
          if okn and n then nombre = n end
          if okt then
            muestra = string.format("1er toolpath '%s' -> tipo=%s valor=%s",
              nombre, type(t), tostring(t))
          else
            muestra = string.format("1er toolpath '%s' -> MachiningTime() fallo: %s",
              nombre, tostring(t))
          end
        end
        if okt and type(t) == "number" then
          numericos = numericos + 1
          total = total + t
        end
      end
    end
  end)

  if ok2 then
    table.insert(lines, string.format(
      "2b. Toolpaths: %d (devolvieron numero: %d) -- suma: %.2f",
      count, numericos, total))
    table.insert(lines, "   " .. muestra)
    if numericos > 0 and total == 0 then
      table.insert(lines, "   -> devuelve 0: probar con Toolpath:Statistics() (FeedLength)")
      table.insert(lines, "      o recalcular trayectorias antes de leer el tiempo.")
    end
  else
    table.insert(lines, "2b. Recorrido de toolpaths: FALLO -- " .. tostring(err))
  end
end

-- ---------------------------------------------------------------------
-- 3. Inventario de capas (para contrastar con el parser del lado de la app)
-- ---------------------------------------------------------------------
local function testLayerInventory(job, lines)
  local lm = job.LayerManager
  if not lm then
    table.insert(lines, "3. LayerManager: FALLO -- no accesible")
    return
  end

  local total_layers, total_objects, import_layers = 0, 0, 0
  local detalle = {}
  local ok, err = pcall(function()
    local pos = lm:GetHeadPosition()
    while pos do
      local layer, newPos = lm:GetNext(pos)
      pos = newPos
      if layer then
        total_layers = total_layers + 1
        local name = ""
        local okn, n = pcall(function() return layer.Name end)
        if okn and n then name = n end
        if string.sub(name, 1, 11) == "Importar - " then
          import_layers = import_layers + 1
        end

        local n_obj = 0
        local lpos = layer:GetHeadPosition()
        while lpos do
          local obj, newLpos = layer:GetNext(lpos)
          lpos = newLpos
          if obj then n_obj = n_obj + 1 end
        end
        total_objects = total_objects + n_obj

        -- Las capas que el gadget de cierre va a usar como fuente de verdad
        if name == "Corte" or name == "Taladrado" or name == "VECTOR"
          or name == "VECTOR 3MM" or name == "Planeado" then
          table.insert(detalle, string.format("   %s = %d objetos", name, n_obj))
        end
      end
    end
  end)

  if ok then
    table.insert(lines, string.format(
      "3. Capas: %d (de import: %d) -- objetos totales: %d",
      total_layers, import_layers, total_objects))
    for _, d in ipairs(detalle) do table.insert(lines, d) end
  else
    table.insert(lines, "3. Inventario de capas: FALLO -- " .. tostring(err))
  end
end

-- ---------------------------------------------------------------------
-- 4. Salida a internet: os.execute + curl (el camino del webhook)
-- ---------------------------------------------------------------------
local function testNetwork(lines)
  if type(os) ~= "table" then
    table.insert(lines, "4a. Libreria 'os': NO disponible -- el webhook tendria que ir por HTML_Dialog")
    return
  end
  table.insert(lines, "4a. Libreria 'os': disponible")

  if type(io) ~= "table" then
    table.insert(lines, "4b. Libreria 'io': NO disponible")
  else
    table.insert(lines, "4b. Libreria 'io': disponible")
  end

  local tmp = nil
  if type(os.tmpname) == "function" then
    local okt, t = pcall(os.tmpname)
    if okt then tmp = t end
  end
  tmp = tmp or "C:\\Windows\\Temp\\alcohn_probe.txt"

  local _, msg = probe("4c. os.execute + curl --version", function()
    local cmd = 'curl --version > "' .. tmp .. '" 2>&1'
    local rc = os.execute(cmd)
    if type(io) ~= "table" then return "ejecutado, rc=" .. tostring(rc) end
    local f = io.open(tmp, "r")
    if not f then return "ejecutado pero no se pudo leer la salida, rc=" .. tostring(rc) end
    local first = f:read("*l")
    f:close()
    pcall(function() os.remove(tmp) end)
    return tostring(first)
  end)
  table.insert(lines, msg)
end

-- ---------------------------------------------------------------------
-- 5. Tag por objeto: la base del modo actualizar del gadget v2.
--    El gadget necesita marcar la linea de "Corte" de cada sello con su id y
--    volver a leerla despues. SetString esta documentado; la firma del getter
--    no, asi que se prueban las variantes.
--    ATENCION: esto SI modifica el archivo (escribe un dato en un objeto).
--    Guardar como copia, no pisar el original.
-- ---------------------------------------------------------------------
local function testObjectTag(job, lines)
  local corte = job.LayerManager:FindLayerWithName("Corte")
  if not corte then
    table.insert(lines, "5. Capa 'Corte' no encontrada -- abri un programa ya armado")
    return
  end

  local primero = nil
  local pos = corte:GetHeadPosition()
  while pos and not primero do
    local obj, newPos = corte:GetNext(pos)
    pos = newPos
    if obj then primero = obj end
  end

  if not primero then
    table.insert(lines, "5. La capa 'Corte' esta vacia -- abri un programa con sellos")
    return
  end

  local valor = "sello-de-prueba-0001"
  local _, msg1 = probe("5a. CadObject:SetString(nombre, valor)", function()
    primero:SetString("ALCOHN_SELLO_ID", valor)
    return "escrito"
  end)
  table.insert(lines, msg1)

  -- CONFIRMADO: el store de un CadObject es ParameterList (NO utParameterList,
  -- que es la del job y toma 2 argumentos). Su getter toma TRES:
  --   std::string GetString(ParameterList const&, char const*, char const*, bool)
  -- es decir obj:GetString(nombre, default, crear_si_no_existe).
  local leido = nil
  local okA, msgA = probe("5b. GetString(nombre, default, crear)", function()
    leido = primero:GetString("ALCOHN_SELLO_ID", "", false)
    return tostring(leido)
  end)
  table.insert(lines, msgA)

  -- Variante de respaldo, por si alguna version difiere
  if not okA or not leido or leido == "" then
    local _, msgB = probe("5c. GetString(nombre, default)", function()
      leido = primero:GetString("ALCOHN_SELLO_ID", "")
      return tostring(leido)
    end)
    table.insert(lines, msgB)
  end

  if leido == valor then
    table.insert(lines, "5d. Round-trip del tag: OK -- el modo actualizar es viable")
  else
    table.insert(lines, "5d. Round-trip del tag: NO coincide -- leido=" .. tostring(leido))
    table.insert(lines, "    -> si ninguna variante anda, el gadget tendra que")
    table.insert(lines, "       identificar por nombre de capa (menos robusto).")
  end
end

-- ---------------------------------------------------------------------

function main()
  local job = VectricJob()
  if not job.Exists then
    say("Abri primero un archivo .crv3d antes de correr esta sonda.")
    return true
  end

  local lines = {}
  table.insert(lines, "SONDA ALCOHN -- resultados")
  table.insert(lines, "Archivo: " .. tostring(job.Name or "?"))
  table.insert(lines, "")

  local payload = testJobParameters(job, lines)
  table.insert(lines, "")
  testMachiningTime(lines)
  table.insert(lines, "")
  testLayerInventory(job, lines)
  table.insert(lines, "")
  testNetwork(lines)
  table.insert(lines, "")
  testObjectTag(job, lines)
  table.insert(lines, "")
  table.insert(lines, "AHORA GUARDA EL ARCHIVO (Guardar como COPIA -- el punto 5 escribio")
  table.insert(lines, "un dato de prueba en un objeto).")
  if payload then
    table.insert(lines, "Despues busca en el .crv3d guardado el texto:")
    table.insert(lines, "  " .. PARAM_NAME)
  end

  say(table.concat(lines, "\n"))
  return true
end
