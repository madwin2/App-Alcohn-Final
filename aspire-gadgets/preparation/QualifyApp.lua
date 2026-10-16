-- Instrumento local: consume el plan descargado de la app; nunca usa red ni CNC.
-- La segunda ejecución mantiene el archivo y sincroniza una revisión nueva.
function PreparationSync.qualifyApp()
  local folder=os.getenv('TEMP') .. '\\alcohn-aspire-c-qualification'
  local log=assert(io.open(folder .. '\\app-qualification.txt','ab'))
  local function note(text) log:write(text,'\n'); log:flush() end
  local savedChoose=choose
  local ok,err=pcall(function()
    local record=assert(QUALIFICATION_APP_RECORD,'Falta el plan exportado por la app')
    local doc=record.document
    assert(doc.machine=='C' and doc.programId:match('^simulation%-C%-%d+$'),'Solo muestra ficticia C')
    local job=VectricJob(); assert(job.Exists,'Abrir primero la copia de calificacion')
    local path=folder .. '\\App C - prueba real.crv3d'
    if job.Name~='App C - prueba real' then
      assert(job.Name=='Flujo C - prueba funcional' or job.Name=='Base C - prueba funcional','Archivo ajeno a la prueba: ' .. job.Name)
      -- Abrir otra copia; no se sobrescribe ni la muestra anterior ni la base original.
      writeFile(path,readFile(folder .. '\\Base C - prueba funcional.crv3d'))
      CloseCurrentJob(); assert(OpenExistingJob(path),'No se pudo abrir la copia')
      job=VectricJob(); local inventory,unknown=scan(job)
      assert(#unknown==0,'La base de prueba contiene vectores sin identidad')
      for id,entries in pairs(inventory) do assert(id=='qualification:sample','La base contiene dibujos de trabajo'); remove(entries) end
      local tm=ToolpathManager(); local paths={}; local pos=tm:GetHeadPosition()
      while pos do local v; v,pos=tm:GetNext(pos); paths[#paths+1]=v end
      for _,v in ipairs(paths) do tm:DeleteToolpath(v) end
      for _,key in ipairs({'ALCOHN_PREPARATION_PROGRAM_ID','ALCOHN_PROGRAMA_V1','ALCOHN_MANAGED_TOOLPATHS','ALCOHN_TEMPLATE_FINGERPRINT'}) do set(job.JobParameters,key,'') end
    else
      assert(str(job.JobParameters,'ALCOHN_PREPARATION_PROGRAM_ID')==doc.programId,'La muestra abierta pertenece a otra sesion')
    end
    local function clearLayer(_,name)
      local current=ensureLayer(job,name); local objects={}; local p=current:GetHeadPosition()
      while p do local object; object,p=current:GetNext(p); objects[#objects+1]=object end
      for _,object in ipairs(objects) do current:RemoveObject(object) end
    end
    local rows={}; for _,s in ipairs(doc.stamps) do rows[#rows+1]={sello_id=s.selloId,archivo='app-' .. s.selloId .. '.svg'} end
    local manifest={programa_nombre='Prueba REAL desde la app - C',token='FICTICIO_SIN_RED',sellos=rows,
      preparation={revision=record.revision,rules_version=RULES.version,document=doc,template_files=QUALIFICATION_TEMPLATE_FILES,template_proofs=QUALIFICATION_PROOFS}}
    local imports=0
    local ctx={job=job,folder=folder,manifest=manifest,clearLayer=clearLayer,resolvePath=function() return path end,
      machiningSeconds=function() return 0 end,message=note,buildReport=json,
      writeReport=function(_,report) set(job.JobParameters,'ALCOHN_PROGRAMA_V1',report); return true end,
      postReport=function(report) writeFile(folder .. '\\app-report-r' .. tostring(record.revision) .. '.json',report); return true end,
      upload=function() return true end}
    ctx.importSelected=function(source)
      local before={}; local p=job.LayerManager:GetHeadPosition()
      while p do local current; current,p=job.LayerManager:GetNext(p); local q=current:GetHeadPosition()
        while q do local object; object,q=current:GetNext(q); before[objectId(object)]=true end
      end
      job.Selection:Clear(); assert(job:ImportSVG(source),'Fallo ImportSVG real'); imports=imports+1
      p=job.LayerManager:GetHeadPosition()
      while p do local current; current,p=job.LayerManager:GetNext(p); local q=current:GetHeadPosition()
        while q do local object; object,q=current:GetNext(q); if not before[objectId(object)] then job.Selection:Add(object,true,false) end end
      end
    end
    -- Solo se evita el selector inicial del instrumento. Un conflicto real NO se decide aquí.
    choose=function(title,text,options) if title=='Preparacion visual' then return 1 end; return savedChoose(title,text,options) end
    local before=scan(job); local ids={}
    for id,entries in pairs(before) do for _,entry in ipairs(entries) do if entry.role=='design' then ids[id]=objectId(entry.object) end end end
    PreparationSync.run(ctx)
    local after=scan(job); local summary={revision=record.revision,imports=imports,stamps={},toolpaths={}}
    for _,s in ipairs(doc.stamps) do
      for _,entry in ipairs(after[s.instanceId] or {}) do if entry.role=='design' then
        local id=objectId(entry.object); assert(not ids[s.instanceId] or ids[s.instanceId]==id,'Se reimporto el sello existente')
        summary.stamps[#summary.stamps+1]={instanceId=s.instanceId,objectId=id,preserved=ids[s.instanceId]==id}
      end end
    end
    local tm=ToolpathManager(); local p=tm:GetHeadPosition()
    while p do local tp; tp,p=tm:GetNext(p); local stats=tp:Statistics()
      summary.toolpaths[#summary.toolpaths+1]={name=tp.Name,valid=stats.IsValid,feedLength=stats.FeedLength,plungeLength=stats.PlungeLength}
    end
    writeFile(folder .. '\\app-summary-r' .. tostring(record.revision) .. '.json',json(summary))
    job.Selection:Clear(); job:Refresh2DView()
    note('Revision ' .. tostring(record.revision) .. ': ' .. tostring(imports) .. ' importaciones; ' .. tostring(#summary.stamps) .. ' dibujos; ' .. tostring(#summary.toolpaths) .. ' trayectorias. CAM real; informe/subida solo locales.')
  end)
  choose=savedChoose
  if not ok then note('FAIL: ' .. tostring(err)) end
  log:close()
  DisplayMessageBox(ok and 'Prueba desde la app ejecutada en Aspire. Revisar app-report y vista previa. Sin red, TXT ni CNC.' or tostring(err))
  return ok
end

-- Corrección geométrica ejecutada por el SDK dentro de Aspire, fuera del plan de la app.
function PreparationSync.qualifyAppEdit()
  local ok,err=pcall(function()
    local job=VectricJob(); assert(job.Exists and job.Name=='App C - prueba real','Abrir solo la copia de prueba real')
    local doc=QUALIFICATION_APP_RECORD.document
    assert(str(job.JobParameters,'ALCOHN_PREPARATION_PROGRAM_ID')==doc.programId,'Sesion ajena')
    local all=scan(job); local s=doc.stamps[1]; assert(s.selloId=='sim-0','Marca A debe ser la primera muestra')
    local entries=assert(all[s.instanceId],'Falta Marca A'); local originalSvg,originalHash=svg(entries,true)
    local detail,rootId
    for _,entry in ipairs(entries) do if entry.role=='design' then
      rootId=objectId(entry.object)
      walk(entry.object,function(object) if not children(object) then local b=object:GetBoundingBox()
        if close(b.MaxX-b.MinX,s.widthMm/2) and close(b.MaxY-b.MinY,s.heightMm*13/30) then detail=object end
      end end)
    end end
    assert(detail,'No se encontro el detalle A; no se modifico nada')
    detail:Transform(TranslationMatrix2D(Vector2D(0.5,0)))
    local changedSvg,changedHash=svg(entries,true); assert(originalHash~=changedHash,'No cambio la geometria')
    local folder=os.getenv('TEMP') .. '\\alcohn-aspire-c-qualification'
    writeFile(folder .. '\\app-native-edit.json',json({instanceId=s.instanceId,objectId=rootId,before=originalHash,after=changedHash,svgBefore=originalSvg,svgAfter=changedSvg,deltaX=0.5}))
    checkpoint({job=job,folder=folder,resolvePath=function() return folder .. '\\App C - prueba real.crv3d' end},'detalle-editado')
    selectDesign(job,entries); job:Refresh2DView()
  end)
  DisplayMessageBox(ok and 'Detalle A desplazado 0.5 mm en Aspire. Ahora mover/agrandar desde la app y volver a sincronizar.' or tostring(err))
  return ok
end
