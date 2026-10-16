-- SOLO calificación local: usa las plantillas exportadas; no guarda TXT ni accede a la CNC/app.
function PreparationSync.qualifyCam()
  local prior=VectricJob()
  if not prior.Exists then error('Abrir la copia de calificacion C.') end
  local inventory,unknown=scan(prior)
  local resumed=inventory['qualification:cam']~=nil and #unknown==0
  for instance in pairs(inventory) do if instance~='qualification:cam' then resumed=false end end
  if not (prior.Name:match('^Base C %- prueba funcional') or resumed) then error('Abrir la copia de calificacion C. Actual: ' .. tostring(prior.Name)) end
  local folder=os.getenv('TEMP') .. '\\alcohn-aspire-c-qualification'
  local log=assert(io.open(folder .. '\\cam-qualification.txt','wb'))
  local function note(text) log:write(text,'\n'); log:flush() end
  local ok,err=pcall(function()
    local fresh=not resumed
    local material=MaterialBlock(); local thickness=material.Thickness
    if fresh then
      local box=Box2D(Point2D(prior.MinX,prior.MinY),Point2D(prior.MinX+prior.Width,prior.MinY+prior.Height))
      CloseCurrentJob()
      assert(CreateNewJob('Calificacion CAM C - muestra ficticia',box,thickness,true,true),'No se pudo crear el archivo aislado')
    end
    local job=VectricJob(); note('Archivo aislado; espesor=' .. tostring(thickness))
    local recipe=QUALIFICATION_RECIPE or 'CLASICO'
    local s={instanceId='qualification:cam',selloId='cam',name='Muestra ficticia CAM',columnId='p25',centerX=50.176,topY=-8.958,widthMm=12,heightMm=30,recipe=recipe}
    local doc={gapMm=8,stamps={s},columns={{id='p25',nominalMm=25,usableMm=24,centerX=50.176,topY=-8.958,bottomY=-400,toolEnvelopeMm=39,available=true}}}
    if fresh then addTagged(job,'VECTOR',rectObject(s.centerX,s.topY,s.widthMm,s.topY-s.heightMm),s,'design') end
    local all=scan(job); local designs=0
    for _,entry in ipairs(all[s.instanceId]) do if entry.role=='design' then designs=designs+1 end end
    if designs==1 then addTagged(job,'VECTOR',rectObject(s.centerX,s.topY-10,4,s.topY-18),s,'design') end
    all=scan(job)
    for _,entry in ipairs(all[s.instanceId]) do
      if entry.role=='design' and entry.layer.Name~=vectorLayer(recipe) then
        addTagged(job,vectorLayer(recipe),entry.object:Clone(),s,'design'); entry.layer:RemoveObject(entry.object)
      end
    end
    all=scan(job); local ctx={job=job}; local plan=ExecutionPlan.build(doc,{s},RULES)
    assert(#plan.issues==0,'Pose invalida')
    auxiliaries(ctx,s,all[s.instanceId],plan.stamps[1])
    for _,col in ipairs(fresh and plan.columns or {}) do
      ensureLayer(job,'Planeado'):AddObject(rectObject(col.centerX,col.topY,col.planeWidthMm,col.bottomY),true)
      ensureLayer(job,'Rectangulo exterior'):AddObject(rectObject(col.centerX,col.topY,col.exteriorWidthMm,col.bottomY),true)
    end
    local actual=scan(job); s.fine={mode='whole'}
    fineSelection(ctx,s,actual[s.instanceId],'qualification')
    verifyExecution(job,plan); note('Geometria y auxiliares comprobados')
    -- Solo se reconoce esta muestra ficticia. Identificar sus trayectorias
    -- permite repetir el ensayo con el mismo administrador que producción.
    local tm=ToolpathManager(); local p=tm:GetHeadPosition(); local ids={}
    while p do local path; path,p=tm:GetNext(p); ids[#ids+1]='|' .. objectId(path) .. '|' end
    set(job.JobParameters,'ALCOHN_MANAGED_TOOLPATHS',table.concat(ids))
    set(job.JobParameters,'ALCOHN_TEMPLATE_FINGERPRINT','')
    local files={}
    -- Entrada deliberadamente desordenada: la implementación debe ordenar
    -- taladrado/roscado, desbastes, principal, fino y finalmente corte.
    for _,index in ipairs({11,9,recipe~='CLASICO' and 8 or 7,recipe~='CLASICO' and 6 or 5,4,3,2,1}) do files[#files+1]=string.format('Native-%03d.ToolpathTemplate',index) end
    if recipe=='ALIMENTO' then files[#files+1]='Native-012.ToolpathTemplate' end
    QUALIFICATION_PROOFS['Native-009.ToolpathTemplate'].selectionLayers={RULES.recipes[recipe].fineLayer}
    managedToolpaths(job,{[recipe]=files},folder,QUALIFICATION_PROOFS)
    recalculateManaged(job)
    note('Carga administrada, orden y recalculo individual comprobados')
    p=tm:GetHeadPosition(); local lastStage=-1; local count=0
    while p do local path; path,p=tm:GetNext(p)
      local stage=path.Name=='Corte Forma' and 5 or tonumber(path.Name:match('^(%d+)'))
      assert(stage and stage>=lastStage,'Orden de mecanizado incorrecto: ' .. path.Name)
      if count==0 then assert(path.Name=='0 Taladrado','El roscado precede al taladrado') end
      if count==2 then assert(path.Name=='1 Planeado 6MM','El cajeado precede al planeado') end
      lastStage=stage; count=count+1
      local stats=path:Statistics()
      note('ESTADISTICA ' .. path.Name .. ': valida=' .. tostring(stats.IsValid) .. ', avance=' .. tostring(stats.FeedLength) .. ', bajada=' .. tostring(stats.PlungeLength) .. ', Zmin=' .. tostring(stats.MinimumZ))
      if path.Name=='4 Perfilado 0.1MM' then
        local point=path.FirstPoint
        note('INICIO REPASO: X=' .. tostring(point.X) .. ', Y=' .. tostring(point.Y))
        assert(math.abs(point.X-s.centerX)<s.widthMm/2+2 and point.Y<s.topY+2 and point.Y>s.topY-s.heightMm-2,'El repaso no corresponde a la pieza seleccionada')
      end
    end
    assert(count==(recipe=='ALIMENTO' and 9 or 8),'Cantidad inesperada de trayectorias')
    job:Refresh2DView(); note('PASS: ' .. recipe .. ', ' .. tostring(count) .. ' trayectorias ordenadas y validas. No certifica contactos ni material fisico.')
  end)
  if not ok then note('FAIL: ' .. tostring(err)) end
  log:close()
  DisplayMessageBox(ok and 'Recalculo nativo de muestra completado. No se generaron TXT ni se ejecuto CNC.' or tostring(err))
  return ok
end
