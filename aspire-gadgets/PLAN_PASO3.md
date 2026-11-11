# Plan — agregar "Paso 3" (rectángulos de planchuela + recalcular trayectorias) a los gadgets de Armar Programa

> Para que Cursor lo implemente sobre `aspire-gadgets/ArmarPrograma_Chica.lua`, `ArmarPrograma_Grande.lua` y `ArmarPrograma_XL.lua` (los 3 gadgets ya funcionando: importan SVG, corrigen escala, y corren el Paso 1 (espejar+posicionar) y Paso 2 (offsets) de la automatización por sello). Falta el Paso 3, que hoy el usuario corre a mano con un script aparte (`PASO 3.lua`, contenido íntegro más abajo) y después aprieta a mano el botón "Recalcular todas las trayectorias de herramientas". Este plan agrega ambas cosas al final de `main()` en los 3 gadgets, para que quede 100% automático.

---

## 1. Qué hace el Paso 3 (ya probado, no inventar nada nuevo)

Es un script aparte que el usuario ya usa manualmente hoy: **`C:\Users\Julian\Downloads\PASO 3.lua`**. Por cada columna de planchuela definida para la máquina:

1. Recorre la capa **`Corte`** buscando objetos cuyo centro X (bounding box) esté a menos de 1mm del `xpos` de esa columna — esos son las líneas que el Paso 1 (`createAdditionalElements`) ya dejó ahí, una por cada sello posicionado en esa columna.
2. Si encontró al menos uno, calcula `minY` = el `MinY` más bajo de todos esos objetos (el fondo de la fila completa de sellos apilados en esa columna).
3. Si no encontró ninguno, esa columna no se usó en este programa — no crea nada ahí y sigue con la próxima.
4. Con `topY = 0` y `bottomY = minY - 3` (3mm de margen por debajo del último sello), crea **dos rectángulos** centrados en `col.xpos`:
   - **Rectángulo 1**: ancho = `col.nom + 6` mm → se agrega a la capa **`Planeado`**.
   - **Rectángulo 2**: ancho = `col.nom + 14` mm → se agrega a la capa **`Rectangulo exterior`**.
5. Al terminar todas las columnas, refresca la vista.

Código completo de referencia (adaptar, no reinventar la lógica):

```lua
-- VECTRIC LUA SCRIPT

function main(script_path)
    local job = VectricJob()
    if not job.Exists then
      DisplayMessageBox("No hay un trabajo cargado.")
      return false
    end

    local layer_manager = job.LayerManager
    local vectorLayer = layer_manager:GetLayerWithName("Corte")
    if not vectorLayer then
      DisplayMessageBox("La capa Corte no existe.")
      return false
    end

    local planeadoLayer = layer_manager:GetLayerWithName("Planeado")
    if not planeadoLayer then
      DisplayMessageBox("La capa 'Planeado' no existe.")
      return false
    end

    local rectExtLayer = layer_manager:GetLayerWithName("Rectangulo exterior")
    if not rectExtLayer then
      DisplayMessageBox("La capa 'Rectangulo exterior' no existe.")
      return false
    end

    local tol = 1.0

    local columns = {
      { nom = 25,   xpos = 50.176 },
      { nom = 12.7, xpos = 87.776 },
      { nom = 19,   xpos = 187.776 },
      { nom = 38,   xpos = 235.351 }
    }

    for i, col in ipairs(columns) do
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

        local width1 = col.nom + 6
        local halfWidth1 = width1 / 2
        local leftX1 = col.xpos - halfWidth1
        local rightX1 = col.xpos + halfWidth1
        local rectContour1 = Contour(0.0)
        rectContour1:AppendPoint(Point2D(leftX1, topY))
        rectContour1:LineTo(Point2D(rightX1, topY))
        rectContour1:LineTo(Point2D(rightX1, bottomY))
        rectContour1:LineTo(Point2D(leftX1, bottomY))
        rectContour1:LineTo(Point2D(leftX1, topY))
        local cadRect1 = CreateCadContour(rectContour1)
        planeadoLayer:AddObject(cadRect1, true)

        local width2 = col.nom + 14
        local halfWidth2 = width2 / 2
        local leftX2 = col.xpos - halfWidth2
        local rightX2 = col.xpos + halfWidth2
        local rectContour2 = Contour(0.0)
        rectContour2:AppendPoint(Point2D(leftX2, topY))
        rectContour2:LineTo(Point2D(rightX2, topY))
        rectContour2:LineTo(Point2D(rightX2, bottomY))
        rectContour2:LineTo(Point2D(leftX2, bottomY))
        rectContour2:LineTo(Point2D(leftX2, topY))
        local cadRect2 = CreateCadContour(rectContour2)
        rectExtLayer:AddObject(cadRect2, true)
      end
    end

    job:Refresh2DView()
    return true
end
```

## 2. "Recalcular las trayectorias" = un botón puntual de Aspire

La captura que mandó el usuario es el ícono **"Recalcular todas las trayectorias de herramientas"** del panel de Trayectorias. Confirmado en `Vectric Lua Interface Documentation.md`:

```
ToolpathManager():RecalculateAllToolpaths()
```

> Recalcula todos los toolpaths del job. Devuelve un **string** con la lista de trayectorias recalculadas si funcionó, o **nil** si falló. **ADVERTENCIA de la doc**: recalcular destruye las trayectorias originales y crea nuevas con el mismo ID — no hay que reusar ninguna variable de toolpath vieja después de llamarlo (acá no aplica, no guardamos ninguna).

---

## 3. Dónde enganchar esto en cada gadget (los 3 archivos)

En los 3 archivos (`ArmarPrograma_Chica.lua`, `ArmarPrograma_Grande.lua`, `ArmarPrograma_XL.lua`) la función `main()` termina así hoy:

```lua
  for _, s in ipairs(manifest.sellos or {}) do
    local ok, err, warn = processStamp(job, folder, s)
    ...
  end

  local summary = string.format(...)
  ...
  DisplayMessage(summary)
  return true
end
```

Agregar, **entre el `for` y el armado de `summary`**, una llamada a la función nueva `runPaso3AndRecalculate(job)` (una por archivo, con la lista de columnas de esa máquina — ver sección 4), y sumar su resultado al mensaje final:

```lua
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
    ...
```

## 4. Función nueva `runPaso3AndRecalculate` — una por archivo, con las columnas de esa máquina

Reusar el mismo mecanismo de columnas que ya está en cada gadget (la constante `COLUMNS` para Chica/Grande, y para XL armar una lista de un solo elemento con `XL_COLUMN_X`/`XL_COLUMN_WIDTH`, que ya existen como constantes en ese archivo). No hace falta duplicar `nom`/`xpos` a mano otra vez si ya están definidos arriba en el archivo — reusar `COLUMNS` (Chica/Grande) o armar `{ { nom = XL_COLUMN_WIDTH, xpos = XL_COLUMN_X } }` (XL).

```lua
-- Paso 3: por cada columna con al menos un sello posicionado (busca en la
-- capa "Corte" las lineas que ya dejo createAdditionalElements por sello),
-- crea los 2 rectangulos de planchuela (Planeado / Rectangulo exterior) y
-- al final recalcula todas las trayectorias del job.
local PASO3_COLUMNS = COLUMNS -- Chica y Grande ya tienen esta tabla (nom/xpos)
-- En XL, reemplazar la linea de arriba por:
-- local PASO3_COLUMNS = { { nom = XL_COLUMN_WIDTH, xpos = XL_COLUMN_X } }

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
```

Notas de implementación:
- `addRect` es una función local *dentro* de `runPaso3AndRecalculate` (closure sobre `topY`/`bottomY`/`col`) — ahorra duplicar el bloque de construcción de rectángulo dos veces, sin cambiar la geometría resultante (es exactamente la misma lógica que `PASO 3.lua`, solo factorizada).
- No usar `return false` como hacía `PASO 3.lua` ante una capa faltante: acá Paso 3 corre al final de un programa que ya importó y posicionó todos los sellos con éxito — abortar todo el gadget en este punto tiraría ese trabajo. Por eso se devuelve un mensaje de error como string (se sigue mostrando en el resumen final) en vez de cortar la ejecución.
- `RecalculateAllToolpaths()` puede devolver `nil` si falla (según la doc) — el `pcall` es por las dudas de que la función ni siquiera exista en la versión de Aspire del usuario; si eso pasara, avisar en vez de romper el gadget entero.

## 5. Prerrequisito a verificar antes de probar (una sola vez por máquina)

Los `.crv3d` base de **Chica**, **Grande** y **XL** (los que están en `programa_archivos_base`, uno por máquina) tienen que tener ya creadas las capas **`Planeado`** y **`Rectangulo exterior`** (además de las que ya usan Paso 1/Paso 2: `VECTOR`, `VECTOR 3MM`, `Corte`, `Taladrado`, `Offset 1 vector`, `Offset exterior vector`, `Offset exterior vector 3mm`). El de **Chica** ya las tiene (por eso `PASO 3.lua` le funciona hoy al usuario corriéndolo a mano ahí). Falta confirmar que el `.crv3d` base de **Grande** y **XL** también las tengan — si no, agregarlas ahí (una vez, a mano, en Aspire) antes de probar el gadget actualizado en esas máquinas.

## 6. Resumen de cambios por archivo

| Archivo | Cambio |
|---|---|
| `ArmarPrograma_Chica.lua` | Agregar `runPaso3AndRecalculate` usando `PASO3_COLUMNS = COLUMNS` (ya existe, 4 columnas). Llamarla en `main()` antes de armar `summary`. |
| `ArmarPrograma_Grande.lua` | Igual, `PASO3_COLUMNS = COLUMNS` (ya existe, 2 columnas). |
| `ArmarPrograma_XL.lua` | Igual, pero `PASO3_COLUMNS = { { nom = XL_COLUMN_WIDTH, xpos = XL_COLUMN_X } }` (una sola columna, no existe `COLUMNS` en este archivo). |

Con esto, correr cualquiera de los 3 gadgets queda completo de punta a punta: importar → validar/corregir escala → Paso 1 (posicionar) → Paso 2 (offsets) → Paso 3 (rectángulos de planchuela) → recalcular trayectorias → resumen final.
