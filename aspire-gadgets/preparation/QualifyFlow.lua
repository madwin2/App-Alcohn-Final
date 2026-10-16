-- SOLO instrumento local: manifest ficticio, reportes/subidas simulados en disco.
-- Ejecuta el recorrido de producción con importación, objetos, CAM y guardado reales.
function PreparationSync.qualifyFlow()
  local folder=os.getenv('TEMP') .. '\\alcohn-aspire-c-qualification'
  local log=assert(io.open(folder .. '\\flow-qualification.txt','wb'))
  local function note(text) log:write(text,'\n'); log:flush() end
  local savedChoose=choose
  local ok,err=pcall(function()
    local prior=VectricJob(); assert(prior.Exists,'Abrir primero la muestra local de calificación')
    local inventory,unknown=scan(prior); assert(#unknown==0,'La muestra contiene vectores ajenos')
    for id in pairs(inventory) do assert(id=='qualification:cam' or id:match('^qualification:flow%-'),'Archivo ajeno a la calificación') end
    local path=folder .. '\\Flujo C - prueba funcional.crv3d'
    writeFile(path,readFile(folder .. '\\Base C - prueba funcional.crv3d'))
    CloseCurrentJob(); assert(OpenExistingJob(path),'No se pudo abrir la copia local para el flujo')
    local job=VectricJob(); inventory,unknown=scan(job); assert(#unknown==0,'La copia contiene vectores ajenos')
    for id,entries in pairs(inventory) do assert(id=='qualification:sample','La copia contiene dibujos de trabajo'); remove(entries) end
    local function clearLayer(_,name)
      local current=ensureLayer(job,name); local objects={}; local p=current:GetHeadPosition()
      while p do local object; object,p=current:GetNext(p); objects[#objects+1]=object end
      for _,object in ipairs(objects) do current:RemoveObject(object) end
    end
    clearLayer(job,'Planeado'); clearLayer(job,'Rectangulo exterior')
    local tm=ToolpathManager(); local paths={}; local p=tm:GetHeadPosition()
    while p do local v; v,p=tm:GetNext(p); paths[#paths+1]=v end
    for _,v in ipairs(paths) do tm:DeleteToolpath(v) end
    for _,key in ipairs({'ALCOHN_PREPARATION_PROGRAM_ID','ALCOHN_PROGRAMA_V1','ALCOHN_MANAGED_TOOLPATHS','ALCOHN_TEMPLATE_FINGERPRINT'}) do set(job.JobParameters,key,'') end
    local drawing='<svg xmlns="http://www.w3.org/2000/svg" width="12mm" height="30mm" viewBox="0 0 12 30"><path fill-rule="evenodd" d="M0 0H12V30H0Z M4 10V18H8V10Z"/></svg>'
    writeFile(folder .. '\\flow-source.svg',drawing)
    local a={instanceId='qualification:flow-a',selloId='flow-a',name='Muestra A',columnId='p25',centerX=50.176,topY=-8.958,widthMm=12,heightMm=30,recipe='CLASICO',fine={mode='whole'}}
    local b={instanceId='qualification:flow-b',selloId='flow-b',name='Muestra B',columnId='p25',centerX=50.176,topY=-65,widthMm=12,heightMm=30,recipe='3MM',fine={mode='whole'}}
    local doc={programId='qualification-flow',gapMm=8,stamps={a,b},columns={
      {id='p25',nominalMm=25,usableMm=24,centerX=50.176,topY=-8.958,bottomY=-400,toolEnvelopeMm=39,available=true},
      {id='p38',nominalMm=38,usableMm=36.5,centerX=235.351,topY=-8.958,bottomY=-400,toolEnvelopeMm=52,available=true}}}
    local manifest={programa_nombre='Muestra ficticia sin conexión',token='TOKEN_FICTICIO',sellos={
      {sello_id=a.selloId,archivo='flow-source.svg'},{sello_id=b.selloId,archivo='flow-source.svg'}},
      preparation={revision=1,rules_version=RULES.version,document=doc,template_files=QUALIFICATION_TEMPLATE_FILES,template_proofs=QUALIFICATION_PROOFS}}
    local imports,reports,uploads=0,0,0
    local ctx={job=job,folder=folder,manifest=manifest,clearLayer=clearLayer,
      resolvePath=function() return path end,machiningSeconds=function() return 0 end,
      message=function(text) note(text) end,buildReport=json,
      writeReport=function(_,report) set(job.JobParameters,'ALCOHN_PROGRAMA_V1',report); return true end,
      postReport=function(report)
        reports=reports+1; writeFile(folder .. '\\flow-report-' .. tostring(reports) .. '.json',report)
        assert(report:find('"recalculated":true',1,true),report)
        assert(report:find('"verified":true',1,true),'Falta comprobación de auxiliares')
        return true
      end,
      upload=function() uploads=uploads+1; return true end}
    ctx.importSelected=function(source)
      local before={}; local pos=job.LayerManager:GetHeadPosition()
      while pos do local current; current,pos=job.LayerManager:GetNext(pos); local q=current:GetHeadPosition()
        while q do local object; object,q=current:GetNext(q); before[objectId(object)]=true end
      end
      job.Selection:Clear(); assert(job:ImportSVG(source),'Falló la importación SVG nativa'); imports=imports+1
      pos=job.LayerManager:GetHeadPosition()
      while pos do local current; current,pos=job.LayerManager:GetNext(pos); local q=current:GetHeadPosition()
        while q do local object; object,q=current:GetNext(q); if not before[objectId(object)] then job.Selection:Add(object,true,false) end end
      end
    end
    -- Evitar diálogos repetidos en este instrumento; un conflicto inesperado
    -- hace fallar el ensayo, nunca se resuelve automáticamente por preferencia.
    choose=function(title) assert(title=='Preparacion visual','Conflicto inesperado: ' .. title); return 1 end
    local function syncStep(label)
      note('PASO: ' .. label); local expected=uploads+1
      PreparationSync.run(ctx); assert(uploads==expected,'No se confirmó la subida simulada')
      manifest.preparation.revision=manifest.preparation.revision+1
    end
    syncStep('importación real y recetas Clásico/3MM combinadas')
    local all=scan(job); local rootId; local hole
    for _,entry in ipairs(all[a.instanceId]) do if entry.role=='design' then
      rootId=objectId(entry.object)
      walk(entry.object,function(object) if not children(object) then local bounds=object:GetBoundingBox()
        if close(bounds.MaxX-bounds.MinX,4) and close(bounds.MaxY-bounds.MinY,8) then hole=object end
      end end)
    end end
    assert(hole,'No se encontró el detalle importado'); hole:Transform(TranslationMatrix2D(Vector2D(0.5,0)))
    a.columnId='p38'; a.centerX=235.351; a.topY=-60
    syncStep('corrección interna de Aspire + cambio de planchuela desde la app')
    all=scan(job); for _,entry in ipairs(all[a.instanceId]) do if entry.role=='design' then assert(objectId(entry.object)==rootId,'Se reinsertó el diseño') end end
    assert(imports==2,'El movimiento volvió a importar una pieza')
    a.widthMm=18; a.heightMm=45
    syncStep('escala proporcional sin reimportar ni escalar taladro')
    all=scan(job); for _,entry in ipairs(all[a.instanceId]) do if entry.role=='design' then assert(objectId(entry.object)==rootId,'Se reinsertó al escalar') end end
    assert(imports==2,'La escala volvió a importar una pieza')
    a.recipe='ALIMENTO'; syncStep('Alimento + 3MM y perímetro posterior al repaso')
    all=scan(job); local fineHole
    for _,entry in ipairs(all[a.instanceId]) do if entry.role=='fine' then
      walk(entry.object,function(object) if not children(object) then local bounds=object:GetBoundingBox()
        if close(bounds.MaxX-bounds.MinX,6) and close(bounds.MaxY-bounds.MinY,12) then fineHole=object:Clone() end
      end end)
      entry.layer:RemoveObject(entry.object)
    end end
    assert(fineHole,'No se encontró el detalle fino'); addTagged(job,'REPASO ALIMENTO',fineHole,a,'fine')
    a.fine={mode='aspire',scope='internal'}
    syncStep('selección de un solo detalle para el perfilado interior')
    assert(imports==2 and reports==5 and uploads==5,'Cantidad inesperada de operaciones')
    note('PASS: cinco sincronizaciones nativas; importación, mezcla, movimiento, escala, Alimento y detalle interior. Red/subida simuladas; sin TXT ni CNC.')
  end)
  choose=savedChoose
  if not ok then note('FAIL: ' .. tostring(err)) end
  log:close(); DisplayMessageBox(ok and 'Flujo nativo local completado. Informes y copia guardados. Sin conexión, TXT ni CNC.' or tostring(err))
  return ok
end
