-- VECTRIC LUA SCRIPT
-- Versión simplificada: procesa vector seleccionado manualmente
-- VERSIÓN PARA MÁQUINA XL - Columna única con optimización de material
-- VERSION: 1.0 - Sin escalado, sin rectángulos, sin recalcular

-- CAPTURAR FUNCIONES GLOBALES ANTES DE STRICT (para PASO 2)
local CreateCopyOfSelectedContours = CreateCopyOfSelectedContours
local GetDefaultContourTolerance = GetDefaultContourTolerance
local CreateCadGroup = CreateCadGroup

-- CONFIGURACIÓN ESPECÍFICA PARA MÁQUINA XL
local XL_COLUMN_X = 31.5  -- Posición X de la columna única
local XL_COLUMN_WIDTH = 63 -- Ancho máximo de la columna en mm
local XL_START_Y = -1  -- Posición Y inicial
local XL_SEPARATION = 4    -- Separación entre vectores en mm

function DisplayMessage(message)
    -- Sanitizar caracteres no ASCII para evitar cuadros en algunos dialogs
    local safe = tostring(message):gsub("[^\x20-\x7E]", "")
    DisplayMessageBox(safe)
    print(safe)
end

function CopySelectionToVectorLayer()
    local job = VectricJob()
    local selection = job.Selection
    
    if selection.IsEmpty then
        DisplayMessage("Advertencia: No hay objetos seleccionados para copiar")
        return false
    end
    
    local layer_manager = job.LayerManager
    local vector_layer = layer_manager:GetLayerWithName("VECTOR")
    
    -- Recolectar objetos seleccionados
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
    
    -- MÉTODO 1: Intentar Clone()
    for i, obj in ipairs(objects_to_copy) do
        local status, cloned_obj = pcall(function()
            return obj:Clone()
        end)
        
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
    
    -- MÉTODO 2: Si Clone falla, intentar recrear desde contorno
    if copied_count == 0 then
        for i, obj in ipairs(objects_to_copy) do
            local status, contour = pcall(function()
                return obj:GetContour()
            end)
            
            if status and contour then
                local new_status, new_obj = pcall(function()
                    return CreateCadContour(contour)
                end)
                
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
        -- Eliminar originales desde sus capas de origen (excepto capas protegidas)
        for _, orig in ipairs(objects_to_copy) do
            local ok_id, raw_id = pcall(function() return orig.RawLayerId end)
            if ok_id and raw_id then
                local src_layer = layer_manager:GetLayerWithId(raw_id)
                if src_layer then
                    local lname = ""
                    local okn, n = pcall(function() return src_layer.Name end)
                    if okn then lname = n or "" end
                    local lname_lower = string.lower(lname)
                    if lname ~= "VECTOR" and lname_lower ~= "dispositivo" then
                        pcall(function() src_layer:RemoveObject(orig) end)
                    end
                end
            end
        end
        job:Refresh2DView()
        return true
    else
        DisplayMessage("✗ No se pudo copiar ningún objeto a capa VECTOR")
        return false
    end
end

function GetVectorObjectsFromLayer(layer_name)
    local job = VectricJob()
    if not job.Exists then
        return {}
    end
    
    local layer_manager = job.LayerManager
    local layer = layer_manager:FindLayerWithName(layer_name)
    if not layer then
        DisplayMessage("Advertencia: No se encontró la capa '" .. layer_name .. "'")
        return {}
    end
    
    local objects = {}
    local pos = layer:GetHeadPosition()
    while pos do
        local obj, newPos = layer:GetNext(pos)
        pos = newPos
        if obj then
            table.insert(objects, obj)
        end
    end
    
    return objects
end

function ProcessSingleObject(obj)
    local job = VectricJob()
    local selection = job.Selection
    
    -- Seleccionar solo este objeto
    selection:Clear()
    selection:Add(obj, true, false)
    
    if selection.IsEmpty then
        DisplayMessage("Error: No se pudo seleccionar objeto")
        return false
    end
    
    -- Agrupar la selección
    if not job:GroupSelection() then
        DisplayMessage("Advertencia: No se pudo agrupar (puede que ya esté agrupado)")
    end
    
    -- Espejar el objeto
    local bbox = selection:GetBoundingBox()
    if not bbox then
        DisplayMessage("Error: No se pudo obtener bounding box")
        return false
    end
    
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
    
    -- Posicionamiento en columna única para XL
    bbox = selection:GetBoundingBox()
    if not bbox then
        DisplayMessage("Error: No se pudo recalcular bounding box")
        return false
    end
    
    local groupWidth = bbox.MaxX - bbox.MinX
    local groupHeight = bbox.MaxY - bbox.MinY
    
    -- Verificar que el ancho no exceda el límite de la columna
    if groupWidth > XL_COLUMN_WIDTH then
        DisplayMessage("⚠ Advertencia: El vector es más ancho que la columna (" .. groupWidth .. "mm > " .. XL_COLUMN_WIDTH .. "mm)")
        DisplayMessage("→ Se posicionará de todas formas, pero puede causar problemas")
    end
    
    -- Determinar posición Y evitando superposiciones (secuencial en columna única)
    local targetTopY = XL_START_Y
    local layer_manager = job.LayerManager
    local corteLayer = layer_manager:GetLayerWithName("Corte")
    
    if corteLayer then
        local pos2 = corteLayer:GetHeadPosition()
        while pos2 do
            local obj, newPos2 = corteLayer:GetNext(pos2)
            pos2 = newPos2
            if obj then
                local objBBox = obj:GetBoundingBox()
                if objBBox then
                    -- En columna única, solo verificar posición Y
                    if objBBox.MinY < targetTopY then
                        targetTopY = objBBox.MinY - XL_SEPARATION
                    end
                end
            end
        end
    end
    
    -- Posicionar en la columna única (centrado en X = 31.5)
    local groupCenterX = (bbox.MinX + bbox.MaxX) / 2
    local dx = XL_COLUMN_X - groupCenterX
    local dy = targetTopY - bbox.MaxY
    
    local translationMatrix = TranslationMatrix2D(Vector2D(dx, dy))
    selection:Transform(translationMatrix)
    job:Refresh2DView()
    
    -- Obtener el bbox actualizado después del posicionamiento
    local updated_bbox = selection:GetBoundingBox()
    if updated_bbox then
        -- Crear elementos adicionales específicos para XL
        CreateAdditionalElementsXL(updated_bbox)
    else
        DisplayMessage("Error: No se pudo obtener bbox actualizado para elementos adicionales")
    end
    
    return true
end

function ProcessStep2OffsetOperations()
    local job = VectricJob()
    if not job.Exists then
        DisplayMessage("Error: No hay trabajo activo")
        return false
    end

    -- Seleccionar todos los vectores de la capa VECTOR
    local vector_layer = job.LayerManager:GetLayerWithName("VECTOR")
    if not vector_layer then
        DisplayMessage("Error: No se encontró la capa VECTOR")
        return false
    end

    job.Selection:Clear()
    local pos = vector_layer:GetHeadPosition()
    local selected_count = 0
    
    while pos ~= nil do
        local object
        object, pos = vector_layer:GetNext(pos)
        job.Selection:Add(object, true, false)
        selected_count = selected_count + 1
    end

    if job.Selection.IsEmpty then
        DisplayMessage("Error: No hay vectores seleccionados")
        return false
    end

    -- Finalizar selección
    if job.Selection.GroupSelectionFinished then
        pcall(function() job.Selection:GroupSelectionFinished() end)
    end

    -- Obtener tolerancia
    local tolerance = 0.01
    if GetDefaultContourTolerance then
        local tol_success = pcall(function()
            tolerance = GetDefaultContourTolerance()
        end)
    end

    -- Proceso principal de offset
    local success = pcall(function()
        -- 1. Crear copia de contornos seleccionados
        local group = CreateCopyOfSelectedContours(false, false, tolerance)
        
        if not group then
            error("CreateCopyOfSelectedContours devolvió nil")
        end

        -- 2. Crear offset exterior de 4mm
        local offset_4mm = group:Offset(4.0, 4.0, 1, true)
        
        if not offset_4mm then
            error("Offset de 4mm falló")
        end

        -- 3. Crear offset interior de 3.5mm sobre el resultado anterior
        local offset_3_5mm = offset_4mm:Offset(-3.5, 3.5, 1, true)
        
        if not offset_3_5mm then
            error("Offset interior de 3.5mm falló")
        end

        -- 4. Agregar offset de 3.5mm a capa "Offset 1 vector"
        local cad_group_1 = CreateCadGroup(offset_3_5mm)
        local offset1_layer = job.LayerManager:GetLayerWithName("Offset 1 vector")
        offset1_layer:AddObject(cad_group_1, true)

        -- 5. Crear offset exterior de 1.5mm sobre el resultado de 3.5mm
        local offset_1_5mm = offset_3_5mm:Offset(1.5, 1.5, 1, true)
        
        if not offset_1_5mm then
            error("Offset exterior de 1.5mm falló")
        end

        -- 6. Agregar offset de 1.5mm a capa "Offset exterior vector"
        local cad_group_2 = CreateCadGroup(offset_1_5mm)
        local offset_ext_layer = job.LayerManager:GetLayerWithName("Offset exterior vector")
        offset_ext_layer:AddObject(cad_group_2, true)

        -- 7. Actualizar vista
        job:Refresh2DView()
        
        return true
    end)

    if not success then
        DisplayMessage("ERROR: El proceso de offset falló")
        return false
    end

    return true
end

function UngroupAllVectors()
    local job = VectricJob()
    if not job.Exists then
        DisplayMessage("Error: No hay trabajo activo")
        return false
    end

    local layers_to_process = {
        "VECTOR",
        "Offset 1 vector", 
        "Offset exterior vector"
    }

    local total_ungrouped = 0

    for _, layer_name in ipairs(layers_to_process) do
        local layer = job.LayerManager:GetLayerWithName(layer_name)
        if layer then
            -- Seleccionar todos los objetos de esta capa
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
                -- Finalizar selección
                if job.Selection.GroupSelectionFinished then
                    pcall(function() job.Selection:GroupSelectionFinished() end)
                end
                
                -- Probar el nuevo método UnGroupSelection con parámetros
                local ungroup_success = pcall(function()
                    if job.UnGroupSelection then
                        local success, err = job:UnGroupSelection(true, false)
                        if success then
                            total_ungrouped = total_ungrouped + layer_selected
                            return true
                        else
                            error("UnGroupSelection devolvió false: " .. tostring(err))
                        end
                    else
                        error("UnGroupSelection no disponible")
                    end
                end)
                
                if not ungroup_success then
                    DisplayMessage("⚠ No se pudo desagrupar en " .. layer_name)
                end
            end
        end
    end

    job.Selection:Clear()
    job:Refresh2DView()
    
    if total_ungrouped > 0 then
        return true
    else
        DisplayMessage("⚠ No se pudieron desagrupar objetos automáticamente")
        DisplayMessage("→ Desagrupa manualmente con Ctrl+Shift+G si es necesario")
        return true -- No fallar por esto
    end
end

function CreateAdditionalElementsXL(bbox)
    -- Validar parámetros
    if not bbox then
        DisplayMessage("Error: CreateAdditionalElementsXL - parámetros inválidos")
        return
    end
    
    local job = VectricJob()
    local layer_manager = job.LayerManager
    
    -- Crear capas si no existen
    local corteLayer = layer_manager:GetLayerWithName("Corte")
    local taladradoLayer = layer_manager:GetLayerWithName("Taladrado")
    
    -- Validar que bbox tiene valores válidos
    if not bbox.MinX or not bbox.MaxX or not bbox.MinY or not bbox.MaxY then
        DisplayMessage("Error: CreateAdditionalElementsXL - bbox inválido")
        return
    end
    
    -- Línea horizontal para XL (ancho completo de la columna)
    local lineLength = XL_COLUMN_WIDTH
    local halfLine = lineLength / 2
    local lineX1 = XL_COLUMN_X - halfLine
    local lineX2 = XL_COLUMN_X + halfLine
    local lineY = bbox.MinY - 4
    
    -- Validar que los valores son números válidos
    if not lineX1 or not lineX2 or not lineY or 
       lineX1 ~= lineX1 or lineX2 ~= lineX2 or lineY ~= lineY then -- NaN check
        DisplayMessage("Error: CreateAdditionalElementsXL - valores de línea inválidos")
        return
    end
    
    local success, err = pcall(function()
        local newLineContour = Contour(0.0)
        newLineContour:AppendPoint(Point2D(lineX1, lineY))
        newLineContour:LineTo(Point2D(lineX2, lineY))
        
        local cad_line = CreateCadContour(newLineContour)
        if cad_line then
            corteLayer:AddObject(cad_line, true)
        end
    end)
    
    if not success then
        DisplayMessage("Error creando línea: " .. tostring(err))
        return
    end
    
    -- Círculo de taladrado
    local radius = 3
    local circleCenterX = (bbox.MinX + bbox.MaxX) / 2
    local circleCenterY = (bbox.MinY + bbox.MaxY) / 2
    
    -- Validar que los valores del círculo son válidos
    if not circleCenterX or not circleCenterY or 
       circleCenterX ~= circleCenterX or circleCenterY ~= circleCenterY then -- NaN check
        DisplayMessage("Error: CreateAdditionalElementsXL - valores de círculo inválidos")
        return
    end
    
    local circle_success, circle_err = pcall(function()
        local circleContour = Contour(0.0)
        circleContour:AppendPoint(Point2D(circleCenterX + radius, circleCenterY))
        circleContour:ArcTo(Point2D(circleCenterX, circleCenterY + radius), Point2D(circleCenterX, circleCenterY), true)
        circleContour:ArcTo(Point2D(circleCenterX - radius, circleCenterY), Point2D(circleCenterX, circleCenterY), true)
        circleContour:ArcTo(Point2D(circleCenterX, circleCenterY - radius), Point2D(circleCenterX, circleCenterY), true)
        circleContour:ArcTo(Point2D(circleCenterX + radius, circleCenterY), Point2D(circleCenterX, circleCenterY), true)
        
        local cad_circle = CreateCadContour(circleContour)
        if cad_circle then
            taladradoLayer:AddObject(cad_circle, true)
        end
    end)
    
    if not circle_success then
        DisplayMessage("Error creando círculo: " .. tostring(circle_err))
        return
    end
    
    job:Refresh2DView()
end

function main()
    DisplayMessage("=== AUTOMATIZACION SIMPLIFICADA V1.0 - MAQUINA XL ===")
    
    local job = VectricJob()
    if not job.Exists then
        DisplayMessage("Error: No hay trabajo activo")
        return false
    end
    
    local selection = job.Selection
    if selection.IsEmpty then
        DisplayMessage("Error: No hay objetos seleccionados")
        DisplayMessage("Por favor, selecciona el vector que deseas procesar")
        return false
    end
    
    -- Agrupar la selección
    if not job:GroupSelection() then
        DisplayMessage("Advertencia: No se pudo agrupar (puede que ya esté agrupado)")
    end
    
    -- Copiar a capa VECTOR
    if not CopySelectionToVectorLayer() then
        DisplayMessage("Error: No se pudo copiar a capa VECTOR")
        return false
    end
    
    -- Procesar desde la capa VECTOR
    local vector_objects = GetVectorObjectsFromLayer("VECTOR")
    if #vector_objects > 0 then
        -- Encontrar el último objeto agregado (el grupo recién copiado)
        local latest_obj = vector_objects[#vector_objects]
        if latest_obj then
            if ProcessSingleObject(latest_obj) then
                -- Ejecutar Paso 2: Operaciones de Offset
                if ProcessStep2OffsetOperations() then
                    -- Desagrupar todos los vectores
                    if UngroupAllVectors() then
                        DisplayMessage("🎉 ¡Procesamiento completo exitoso!")
                        DisplayMessage("✅ Todos los pasos completados correctamente")
                        DisplayMessage("🏭 MÁQUINA XL - Columna única optimizada")
                        return true
                    else
                        DisplayMessage("⚠ Advertencia: No se pudieron desagrupar todos los objetos")
                        DisplayMessage("✓ Pasos 1 y 2 completados")
                        return true
                    end
                else
                    DisplayMessage("❌ Error en Paso 2 (Operaciones de Offset)")
                    return false
                end
            else
                DisplayMessage("❌ Error procesando el objeto")
                return false
            end
        else
            DisplayMessage("❌ Error: No se encontró el objeto en capa VECTOR")
            return false
        end
    else
        DisplayMessage("❌ Error: No se encontraron objetos en capa VECTOR")
        return false
    end
end

