-- SDK en memoria para probar el recorrido completo. No calcula CAM real.
local SDK={}
local serial=0
local function id() serial=serial+1; return tostring(serial) end
function luaUUID()
  local o={RawId=id()}
  function o:SetId(x) assert(type(x)=='string'); self.RawId=x end
  function o:Set(x) self.RawId=x end
  function o:AsString() return self.RawId end
  return o
end
local function params(o)
  o=o or {}; o.values={}; o.Id=luaUUID()
  function o:GetString(k,d) return self.values[k] or d end
  function o:SetString(k,v) self.values[k]=v end
  return o
end
local function list(o)
  o.items={}
  function o:GetHeadPosition() return #self.items>0 and 1 or nil end
  function o:GetNext(p) return self.items[p], p<#self.items and p+1 or nil end
  return o
end
function Point2D(x,y) return {X=x,Y=y} end
function Vector2D(x,y) return {X=x,Y=y} end
function TranslationMatrix2D(v) return function(p) return Point2D(p.X+v.X,p.Y+v.Y) end end
function ScalingMatrix2D(p,v) return function(q) return Point2D(p.X+(q.X-p.X)*v.X,p.Y+(q.Y-p.Y)*v.Y) end end
function ReflectionMatrix2D(p) return function(q) return Point2D(2*p.X-q.X,q.Y) end end
function RotationMatrix2D(p,deg) return function(q) local a=deg*math.pi/180; local x,y=q.X-p.X,q.Y-p.Y; return Point2D(p.X+x*math.cos(a)-y*math.sin(a),p.Y+x*math.sin(a)+y*math.cos(a)) end end
function Contour()
  local c={points={},closed=false}
  function c:AppendPoint(p) self.points[#self.points+1]=p end
  function c:LineTo(p) self:AppendPoint(p); local a=self.points[1]; self.closed=#self.points>2 and math.abs(a.X-p.X)<1e-8 and math.abs(a.Y-p.Y)<1e-8 end
  function c:ArcTo(p,center) self:AppendPoint(p); self.center=center; self.radius=math.abs(p.X-center.X)+math.abs(p.Y-center.Y); local a=self.points[1]; self.closed=math.abs(a.X-p.X)<1e-8 and math.abs(a.Y-p.Y)<1e-8 end
  return c
end
local function object(contour)
  local o=params({ClassName='vcCadContour',contour=contour})
  function o:GetBoundingBox()
    if self.contour.center then local c=self.contour; return {MinX=c.center.X-c.radius,MaxX=c.center.X+c.radius,MinY=c.center.Y-c.radius,MaxY=c.center.Y+c.radius} end
    local b={MinX=math.huge,MaxX=-math.huge,MinY=math.huge,MaxY=-math.huge}
    for _,p in ipairs(self.contour.points) do b.MinX=math.min(b.MinX,p.X); b.MaxX=math.max(b.MaxX,p.X); b.MinY=math.min(b.MinY,p.Y); b.MaxY=math.max(b.MaxY,p.Y) end
    return b
  end
  function o:GetContour()
    local c=list({StartPoint2D=self.contour.points[1],IsOpen=not self.contour.closed,IsEmpty=false})
    for i=2,#self.contour.points do c.items[#c.items+1]={IsLineType=true,StartPoint2D=self.contour.points[i-1],EndPoint2D=self.contour.points[i]} end
    return c
  end
  function o:Transform(m) for i,p in ipairs(self.contour.points) do self.contour.points[i]=m(p) end; if self.contour.center then self.contour.center=m(self.contour.center) end end
  function o:Clone()
    local c=Contour(); for _,p in ipairs(self.contour.points) do c:AppendPoint(Point2D(p.X,p.Y)) end; c.closed=self.contour.closed
    if self.contour.center then c.center=Point2D(self.contour.center.X,self.contour.center.Y); c.radius=self.contour.radius end
    return object(c)
  end
  return o
end
function CreateCadContour(c) return object(c) end
local function rectangle(x,y,w,h)
  local c=Contour(); c:AppendPoint(Point2D(x,y)); c:LineTo(Point2D(x+w,y)); c:LineTo(Point2D(x+w,y+h)); c:LineTo(Point2D(x,y+h)); c:LineTo(Point2D(x,y)); return object(c)
end
local function group(items)
  local g=list(params({ClassName='vcCadObjectGroup'})); g.items=items
  function g:GetBoundingBox()
    local b={MinX=math.huge,MaxX=-math.huge,MinY=math.huge,MaxY=-math.huge}
    for _,v in ipairs(self.items) do local a=v:GetBoundingBox(); b.MinX=math.min(b.MinX,a.MinX); b.MaxX=math.max(b.MaxX,a.MaxX); b.MinY=math.min(b.MinY,a.MinY); b.MaxY=math.max(b.MaxY,a.MaxY) end
    return b
  end
  function g:Transform(m) for _,v in ipairs(self.items) do v:Transform(m) end end
  function g:Clone() local values={}; for _,v in ipairs(self.items) do values[#values+1]=v:Clone() end; return group(values) end
  return g
end
function CastCadObjectToCadObjectGroup(g) return g end
function CreateCadGroup(g) local values={}; for _,v in ipairs(g.items) do values[#values+1]=v:Clone() end; return group(values) end
local activeJob=nil
function CreateCopyOfSelectedContours()
  local function offsetGroup(items)
    local g={items=items}
    function g:Offset(delta)
      local values={}; for _,v in ipairs(self.items) do local b=v:GetBoundingBox(); values[#values+1]=rectangle(b.MinX-delta,b.MinY-delta,b.MaxX-b.MinX+2*delta,b.MaxY-b.MinY+2*delta) end
      return offsetGroup(values)
    end
    return g
  end
  return offsetGroup(activeJob.Selection.items)
end
local function layers()
  local lm=list({})
  function lm:GetLayerWithName(name)
    for _,l in ipairs(self.items) do if l.Name==name then return l end end
    local l=list({Name=name,Id=id()})
    function l:AddObject(o) o.RawLayerId=self.Id; self.items[#self.items+1]=o end
    function l:RemoveObject(o) for i=#self.items,1,-1 do if self.items[i]==o then table.remove(self.items,i); break end end end
    self.items[#self.items+1]=l; return l
  end
  function lm:GetLayerWithId(uuid) for _,l in ipairs(self.items) do if l.Id==uuid then return l end end end
  return lm
end
function SDK.setup(sync,doc,rules)
  local job={InMM=true,JobParameters=params(),LayerManager=layers(),Selection=list({})}
  local getJobString=job.JobParameters.GetString
  function job.JobParameters:GetString(k,d,...)
    assert(select('#',...)==0,'utParameterList de Aspire 10.5 requiere dos argumentos')
    return getJobString(self,k,d)
  end
  function job.Selection:Clear() self.items={} end
  function job.Selection:Add(o) self.items[#self.items+1]=o end
  function job:GroupSelection() return false end -- También cubre importaciones sin agrupar.
  function job:Refresh2DView() end
  activeJob=job
  local state={imports=0,recalculations=0,uploads=0,dialogs={},reports={},files={},loads={},recalculatedSelections={}}
  local tm=list({Count=0})
  function tm:LoadToolpathTemplate(file)
    local ids={}; for _,object in ipairs(job.Selection.items) do ids[#ids+1]=object:GetString('ALCOHN_ROLE','') end
    state.loads[#state.loads+1]={file=file,roles=ids}
    if not state.failLoad then
      local path={Id=id(),Name='Trayectoria ficticia',source=file}
      if state.duplicateToolpathId and self.items[1] then path.Id=self.items[1].Id end
      function path:Statistics() return {IsValid=not state.emptyToolpath,FeedLength=state.emptyToolpath and 0 or 1,PlungeLength=0} end
      self.items[#self.items+1]=path; self.Count=#self.items
    end
    return not state.falseLoadReturn
  end
  function tm:DeleteToolpath(path) for i=#self.items,1,-1 do if self.items[i]==path then table.remove(self.items,i) end end; self.Count=#self.items end
  function tm:RecalculateAllToolpaths() state.recalculations=state.recalculations+1; if state.failRecalculation then return nil end; return 'OK' end
  function tm:RecalculateToolpath(path)
    state.recalculations=state.recalculations+1
    local roles={}; for _,object in ipairs(job.Selection.items) do roles[#roles+1]=object:GetString('ALCOHN_ROLE','') end
    state.recalculatedSelections[#state.recalculatedSelections+1]={file=path.source,roles=roles,layers=path.selectorLayers}
    -- El recálculo automático altera la selección actual, como Aspire real.
    -- El siguiente perfilado manual debe volver a seleccionar su geometría.
    if job.JobParameters:GetString('ALCOHN_MANUAL_SELECTION:' .. tostring(path.Id),'')=='' then
      job.Selection:Clear()
      for _,l in ipairs(job.LayerManager.items) do for _,o in ipairs(l.items) do
        if o:GetString('ALCOHN_ROLE','')=='cut' then job.Selection:Add(o) end
      end end
    end
    return not state.failRecalculation
  end
  function GeometrySelector()
    local selector={names={},OnlyOnLayers=true,LayerNameCount=0}
    function selector:LoadSelectorData(path) self.names=path.selectorLayers or {}; self.LayerNameCount=#self.names end
    function selector:RemoveAllLayerNames() self.names={}; self.LayerNameCount=0 end
    function selector:AddLayerName(name) self.names[#self.names+1]=name; self.LayerNameCount=#self.names end
    function selector:SaveSelectorData(path) path.selectorLayers=self.names end
    function selector:FindLayerWithName(name) for i,v in ipairs(self.names) do if v==name then return i end end end
    return selector
  end
  function tm:Find(uuid) for i,path in ipairs(self.items) do if path.Id==uuid then return i end end end
  function tm:GetAt(at) return self.items[at] end
  function ToolpathManager() return tm end
  function HTML_Dialog(_,_,_,_,title)
    state.dialogs[#state.dialogs+1]=title
    return {AddRadioGroup=function() end,ShowDialog=function() return true end,GetRadioIndex=function() return state.choice or 1 end}
  end
  function SaveCurrentJob() state.files['program.crv3d']=job.JobParameters:GetString('ALCOHN_PREP_CHECKPOINT','') end
  io.open=function(path,mode)
    if mode=='wb' then return {write=function(_,value) state.files[path]=value end,close=function() end} end
    return {read=function() return state.files[path] or 'source-svg' end,close=function() end}
  end
  local manifest={programa_nombre='Programa de prueba',token='TOKEN_FICTICIO',preparation={revision=1,rules_version=rules.version,document=doc,
    template_files={CLASICO={'clasico.ToolpathTemplate'},['3MM']={'3mm.ToolpathTemplate'},ALIMENTO={'alimento.ToolpathTemplate'}},template_proofs={}},sellos={}}
  for _,name in ipairs({'clasico.ToolpathTemplate','3mm.ToolpathTemplate','alimento.ToolpathTemplate'}) do
    state.files['fixture\\' .. name]=name
    manifest.preparation.template_proofs[name]={fingerprint=sync.fingerprint(name),toolpathCount=1,stage=1,
      selectors={{layers={'VECTOR','VECTOR 3MM','VECTOR ALIMENTO','REPASO CLASICO','REPASO 3MM','REPASO ALIMENTO','Offset 1 vector','Offset exterior vector','Offset exterior vector 3mm','Offset exterior vector alimento','Corte Alimento','Corte','Taladrado','Planeado','Rectangulo exterior'}}}}
  end
  for _,s in ipairs(doc.stamps) do manifest.sellos[#manifest.sellos+1]={sello_id=s.selloId,archivo=s.selloId .. '.svg'} end
  local ctx={job=job,manifest=manifest,folder='fixture',message=function(message) state.message=message end,
    resolvePath=function() return 'program.crv3d' end,machiningSeconds=function() return 10 end,
    clearLayer=function(_,name) job.LayerManager:GetLayerWithName(name).items={} end,
    buildReport=function(report) return sync.json(report) end,
    writeReport=function(_,report) job.JobParameters:SetString('ALCOHN_PROGRAMA_V1',report); return true end,
    postReport=function(report) state.reports[#state.reports+1]=report; return true end,
    upload=function() state.uploads=state.uploads+1; return true end,
    importSelected=function()
      state.imports=state.imports+1; job.Selection:Clear()
      local o=rectangle(0,0,12,30); job.LayerManager:GetLayerWithName('VECTOR'):AddObject(o,true); job.Selection:Add(o)
    end}
  local function entries(instance,role)
    local result={}
    for _,l in ipairs(job.LayerManager.items) do for _,o in ipairs(l.items) do if o:GetString('ALCOHN_INSTANCE_ID','')==instance and (not role or o:GetString('ALCOHN_ROLE','')==role) then result[#result+1]=o end end end
    return result
  end
  return ctx,state,entries,tm
end
return SDK
