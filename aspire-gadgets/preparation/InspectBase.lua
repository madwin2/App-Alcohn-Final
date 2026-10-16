-- VECTRIC LUA SCRIPT
-- Diagnóstico local: no modifica el job, no recalcula, no se conecta a la app.
-- La carpeta de salida debe existir. Se exportan las plantillas nativas originales.
local function read(object,key)
  local ok,value=pcall(function() return object[key] end)
  return ok and tostring(value) or 'no disponible'
end
local function message(text) DisplayMessageBox(text) end
function main()
  local job=VectricJob()
  if not job.Exists then message('Abri primero una COPIA de la base.'); return false end
  local folder=os.getenv('TEMP') .. '\\alcohn-aspire-c-qualification'
  local file=io.open(folder .. '\\base-diagnostic.txt','wb')
  if not file then message('No existe la carpeta local de calificacion.'); return false end
  file:write('Aspire=',tostring(job:GetAppVersion()),'\nInMM=',tostring(job.InMM),'\n')
  local pos=job.LayerManager:GetHeadPosition()
  while pos do
    local layer; layer,pos=job.LayerManager:GetNext(pos)
    local count=0; local p=layer:GetHeadPosition()
    while p do local object; object,p=layer:GetNext(p); count=count+1 end
    file:write('LAYER\t',layer.Name,'\t',tostring(count),'\n')
  end
  local manager=ToolpathManager(); pos=manager:GetHeadPosition(); local count=0
  while pos do
    local path; path,pos=manager:GetNext(pos); count=count+1
    local name=string.format('Native-%03d.ToolpathTemplate',count)
    local ok,result=pcall(function() return manager:SaveToolpathAsTemplate(path,folder .. '\\' .. name) end)
    file:write('TOOLPATH\t',tostring(count),'\t',path.Name,'\t',name,'\t',tostring(ok and result),'\n')
    local tool=path.Tool
    for _,key in ipairs({'Name','InMM','ToolTypeText','ToolDia','VBit_Angle','FeedRate','PlungeRate','RateUnitsText','SpindleSpeed','Stepdown'}) do
      file:write('TOOL\t',key,'\t',read(tool,key),'\n')
    end
    local radiusOk,radius=pcall(function() return tool:FlatRadius(true) end)
    if radiusOk then file:write('TOOL\tFlatRadiusMm\t',tostring(radius),'\n') end
  end
  file:close()
  message('Diagnostico local exportado: ' .. tostring(count) .. ' trayectorias.\n' .. folder .. '\nNo se modifico ni recalculo el archivo.')
  return true
end
