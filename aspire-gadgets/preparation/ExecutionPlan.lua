-- Operaciones en mm, sin mutar Aspire. Contrato equivalente a executionPlan.ts.
local Plan={}
local function finite(n) return type(n)=="number" and n==n and n~=math.huge and n~=-math.huge end
function Plan.build(doc,actual,rules)
  local out={rulesVersion=rules.version,stamps={},columns={},issues={}}
  local function fail(code,message,id) out.issues[#out.issues+1]={code=code,message=message,instanceId=id,severity="error"} end
  local seen,rows={},{}
  local tolerance=rules.coordinateToleranceMm
  for _,pose in ipairs(actual) do
    local stamp=nil
    for _,s in ipairs(doc.stamps) do if s.instanceId==pose.instanceId and s.selloId==pose.selloId and not s.excluded then stamp=s end end
    if not stamp or seen[pose.instanceId] then fail("IDENTITY","Hay una pieza extra o duplicada.",pose.instanceId)
    else
      seen[pose.instanceId]=true
      local valid=finite(pose.centerX) and finite(pose.topY) and finite(pose.widthMm) and finite(pose.heightMm)
        and pose.widthMm>0 and pose.heightMm>0 and rules.recipes[pose.recipe]~=nil
      if not valid then fail("GEOMETRY",stamp.name .. ": medidas o mecanizado invalidos.",stamp.instanceId)
      else
        local col=nil; for _,c in ipairs(doc.columns) do if c.id==stamp.columnId then col=c end end
        if not col then fail("COLUMN",stamp.name .. ": planchuela inexistente.",stamp.instanceId)
        else
          if not col.available then fail("MATERIAL",stamp.name .. ": falta material.",stamp.instanceId) end
          if math.abs(pose.centerX-col.centerX)+pose.widthMm/2>col.usableMm/2+tolerance then fail("WIDTH",stamp.name .. ": fuera del ancho util.",stamp.instanceId) end
          local bottom=pose.topY-pose.heightMm
          if pose.topY>col.topY+tolerance or bottom<col.bottomY-tolerance then fail("LENGTH",stamp.name .. ": excede el largo util.",stamp.instanceId) end
          local cutY=bottom-rules.cutBelowDesignMm
          if cutY-rules.rectangleBelowCutMm<col.bottomY-tolerance then fail("MACHINING_LENGTH",stamp.name .. ": falta espacio para corte y acabado.",stamp.instanceId) end
          local envelope=pose.recipe=="ALIMENTO" and rules.foodToolEnvelopeMm or 0
          if math.abs(pose.centerX-col.centerX)+pose.widthMm/2+envelope>col.toolEnvelopeMm/2+tolerance then fail("TOOL_ENVELOPE",stamp.name .. ": excede la envolvente.",stamp.instanceId) end
          rows[#rows+1]={pose=pose,columnId=col.id}
          local recipe=rules.recipes[pose.recipe]
          out.stamps[#out.stamps+1]={instanceId=stamp.instanceId,columnId=col.id,recipe=pose.recipe,
            vectorLayer=recipe.vectorLayer,fineLayer=stamp.fine and stamp.fine.scope=='internal' and recipe.fineInteriorLayer or recipe.fineLayer,offsetLayer=recipe.offsetLayer,
            cut={x1=col.centerX-(col.nominalMm+rules.cutExtraWidthMm)/2,x2=col.centerX+(col.nominalMm+rules.cutExtraWidthMm)/2,y=cutY},
            drill={x=pose.centerX,y=pose.topY-pose.heightMm/2,radiusMm=rules.drillRadiusMm}}
        end
      end
    end
  end
  for _,s in ipairs(doc.stamps) do if not s.excluded and not seen[s.instanceId] then fail("MISSING",s.name .. ": falta en el armado.",s.instanceId) end end
  for i=1,#rows do for j=i+1,#rows do
    local a,b=rows[i],rows[j]
    local sameStrip=a.columnId==b.columnId
    local xOverlap=math.abs(a.pose.centerX-b.pose.centerX)<(a.pose.widthMm+b.pose.widthMm)/2
    local gap=math.max(a.pose.topY-a.pose.heightMm,b.pose.topY-b.pose.heightMm)-math.min(a.pose.topY,b.pose.topY)
    if (sameStrip or xOverlap) and gap<doc.gapMm-tolerance then fail("SEPARATION","Dos sellos no respetan la separacion de corte.",a.pose.instanceId) end
  end end
  for _,col in ipairs(doc.columns) do
    local cutY=nil
    for _,s in ipairs(out.stamps) do if s.columnId==col.id then cutY=math.min(cutY or s.cut.y,s.cut.y) end end
    if cutY then out.columns[#out.columns+1]={columnId=col.id,nominalMm=col.nominalMm,centerX=col.centerX,topY=rules.rectangleTopY,
      bottomY=cutY-rules.rectangleBelowCutMm,planeWidthMm=col.nominalMm+rules.planeExtraWidthMm,
      exteriorWidthMm=col.nominalMm+rules.exteriorExtraWidthMm,materialMm=math.floor((col.topY-cutY)*10+0.5)/10} end
  end
  return out
end
return Plan
