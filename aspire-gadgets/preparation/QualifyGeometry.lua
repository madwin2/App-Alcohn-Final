-- Incluido SOLO en el gadget de calificación local; nunca en el gadget operativo.
function PreparationSync.qualify()
  local job=VectricJob()
  if not job.Exists or not job.Name:match('^Base C %- prueba funcional') then error('Abrir la copia Base C - prueba funcional; no se modifico el original.') end
  local folder=os.getenv('TEMP') .. '\\alcohn-aspire-c-qualification'
  local log=assert(io.open(folder .. '\\geometry-qualification.txt','wb'))
  local function note(text) log:write(text,'\n'); log:flush() end
  local ok,err=pcall(function()
    local inventory,unknown=scan(job)
    if #unknown>0 then error('La copia contiene dibujos sin identidad; abrir una copia limpia para repetir.') end
    -- Reanudar exclusivamente la muestra ficticia de una prueba previa fallida.
    for instance in pairs(inventory) do if instance~='qualification:sample' then error('La copia contiene dibujos de trabajo; abrir una copia limpia.') end end
    note('Inicio geometria nativa; mm=' .. tostring(job.InMM))
    local s={instanceId='qualification:sample',selloId='sample',name='Muestra ficticia',columnId='p25',centerX=50.176,topY=-8.958,widthMm=12,heightMm=30,recipe='CLASICO'}
    local doc={programId='qualification',gapMm=8,stamps={s},columns={
      {id='p25',nominalMm=25,usableMm=24,centerX=50.176,topY=-8.958,bottomY=-400,toolEnvelopeMm=39,available=true},
      {id='p38',nominalMm=38,usableMm=36.5,centerX=235.351,topY=-8.958,bottomY=-400,toolEnvelopeMm=52,available=true}}}
    local shape=nil
    for _,entry in ipairs(inventory[s.instanceId] or {}) do if entry.role=='design' then shape=entry.object end end
    shape=shape or rectObject(s.centerX,s.topY,s.widthMm,s.topY-s.heightMm)
    local idOk,idText=pcall(function() return shape.Id:AsString() end)
    note('CadObject.Id: ' .. tostring(idOk) .. ' ' .. tostring(idText))
    if not inventory[s.instanceId] then addTagged(job,'VECTOR',shape,s,'design') end; local initialId=objectId(shape)
    local ctx={job=job,folder=folder,manifest={sellos={{sello_id='sample',archivo='qualification.svg'}}},resolvePath=function() return folder .. '\\' .. job.Name .. '.crv3d' end}
    writeFile(folder .. '\\qualification.svg','<svg xmlns="http://www.w3.org/2000/svg" width="12mm" height="30mm"><path d="M0 0H12V30H0Z"/></svg>')
    local all=scan(job); local entries=all[s.instanceId]; local hash=fingerprint(readFile(folder .. '\\qualification.svg'))
    remember(ctx,s,entries,hash); note('Identidad y referencia guardadas')
    local generated={}
    for _,name in ipairs({'Planeado','Rectangulo exterior'}) do local l=ensureLayer(job,name); local p=l:GetHeadPosition()
      while p do local object; object,p=l:GetNext(p); generated[#generated+1]={layer=l,object=object} end
    end
    local function derive()
      all=scan(job); entries=all[s.instanceId]; local b=bbox(entries)
      local actual={{instanceId=s.instanceId,selloId=s.selloId,centerX=(b.minX+b.maxX)/2,topY=b.maxY,widthMm=b.maxX-b.minX,heightMm=b.maxY-b.minY,recipe=s.recipe}}
      local plan=ExecutionPlan.build(doc,actual,RULES); assert(#plan.issues==0,'Pose final invalida')
      auxiliaries(ctx,s,entries,plan.stamps[1]); note('Corte, taladro y offsets generados')
      for _,old in ipairs(generated) do old.layer:RemoveObject(old.object) end; generated={}
      for _,col in ipairs(plan.columns) do for _,name in ipairs({'Planeado','Rectangulo exterior'}) do
        local l=ensureLayer(job,name); local object=rectObject(col.centerX,col.topY,name=='Planeado' and col.planeWidthMm or col.exteriorWidthMm,col.bottomY)
        l:AddObject(object,true); generated[#generated+1]={layer=l,object=object}
      end end
      verifyExecution(job,plan); note('Auxiliares comprobados')
      return plan
    end
    derive()
    s.columnId='p38'; s.centerX=235.351; s.topY=-60; s.widthMm=18; s.heightMm=45
    all=scan(job); entries=all[s.instanceId]; updateStamp(ctx,s,entries)
    local plan=derive(); all=scan(job); entries=all[s.instanceId]
    for _,entry in ipairs(entries) do if entry.role=='design' then assert(objectId(entry.object)==initialId,'Se reemplazo el dibujo'); end end
    assert(close(plan.stamps[1].cut.x2-plan.stamps[1].cut.x1,46),'Corte de destino incorrecto')
    note('Movimiento y escala conservan identidad; corte destino 46 mm y taladro 6 mm')
    local path=checkpoint(ctx,'calificacion'); note('Marcador y respaldo comprobados: ' .. path)
    job:Refresh2DView(); note('PASS: geometria y guardado nativos. No prueba CAM, repaso ni CNC.')
  end)
  if not ok then note('FAIL: ' .. tostring(err)) end
  log:close()
  DisplayMessageBox(ok and 'Prueba geometrica completa. Ver geometry-qualification.txt. No se recalcularon trayectorias.' or tostring(err))
  return ok
end
