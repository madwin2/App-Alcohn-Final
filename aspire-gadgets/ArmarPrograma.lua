/**
 * Gadget Aspire — Armar Programa
 *
 * Instalación (una sola vez):
 *   Copiar este archivo a la carpeta de Gadgets de Aspire
 *   (Documentos\\Vectric Files\\Gadgets\\Aspire VX.X o GetGadgetsLocation()).
 *
 * Uso:
 *   1. Abrir el programa.crv3d del ZIP descargado.
 *   2. Toolpaths → Gadgets → Armar Programa
 *   3. El gadget lee manifest.lua al lado del .crv3d e importa cada vector.
 *
 * Notas:
 *   - Preferir DXF (ImportDxfDwg). Si el ZIP aún trae EPS, importar a mano.
 *   - Validar escala contra ancho_mm / largo_mm del manifest (tolerancia ~5%).
 *   - Plantillas .ToolpathTemplate deben estar instaladas junto al gadget.
 */

function main()
  local job = VectricJob()
  if not job.Exists then
    DisplayMessageBox("Abri primero el .crv3d del programa antes de correr el gadget")
    return "OK"
  end

  -- La API exacta para obtener la carpeta del job puede variar por version de Aspire.
  -- Ajustar job_dir segun documentacion / pruebas reales.
  local job_dir = ""
  if job.PathName then
    job_dir = string.gsub(job.PathName, "[^\\/]+$", "")
  end

  if job_dir == "" then
    DisplayMessageBox("No se pudo determinar la carpeta del trabajo abierto")
    return "OK"
  end

  local manifest_path = job_dir .. "manifest.lua"
  local ok, manifest = pcall(dofile, manifest_path)
  if not ok or type(manifest) ~= "table" then
    DisplayMessageBox("No se pudo leer manifest.lua junto al .crv3d")
    return "OK"
  end

  local templates_dir = job_dir -- o carpeta fija de Gadgets con plantillas
  local ok_count, warn_count = 0, 0

  for _, s in ipairs(manifest.sellos or {}) do
    local path = job_dir .. (s.archivo or "")
    local imported = false

    if string.match(string.lower(path), "%.dxf$") or string.match(string.lower(path), "%.dwg$") then
      imported = job:ImportDxfDwg(path)
    elseif string.match(string.lower(path), "%.svg$") then
      imported = job:ImportSVG(path)
    else
      DisplayMessageBox("Formato no importable por API (usar DXF/SVG): " .. tostring(s.archivo))
      warn_count = warn_count + 1
    end

    if not imported then
      DisplayMessageBox("No se pudo importar: " .. tostring(s.archivo))
      warn_count = warn_count + 1
    else
      if s.layer then
        local layer = job:GetLayerWithName(s.layer)
        if layer then
          job:SetLayer(layer)
        end
      end

      -- TODO: validar bounding box de la seleccion vs s.ancho_mm / s.largo_mm
      local bounds_ok = true
      if not bounds_ok then
        DisplayMessageBox("Posible error de escala en " .. tostring(s.sello_id))
        warn_count = warn_count + 1
      else
        local tm = ToolpathManager()
        for _, tpl in ipairs(s.toolpath_templates or {}) do
          tm:LoadToolpathTemplate(templates_dir .. tpl)
        end
        ok_count = ok_count + 1
      end
    end
  end

  DisplayMessageBox(string.format("Programa importado: %d ok, %d a revisar", ok_count, warn_count))
  return "OK"
end
