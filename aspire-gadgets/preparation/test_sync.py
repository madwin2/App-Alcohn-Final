"""Pruebas sin Aspire, red ni DB. Requiere lupa (Lua 5.1) en el entorno de tests."""
from pathlib import Path
import json
import unittest
from lupa.lua51 import LuaRuntime

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).with_name('SyncPreparation.lua').read_text(encoding='utf-8')

MOCK = r'''
function Point2D(x,y) return {X=x,Y=y} end
function Vector2D(x,y) return {X=x,Y=y} end
function TranslationMatrix2D(v) return {dx=v.X,dy=v.Y} end
function ScalingMatrix2D(p,v) return {p=p,sx=v.X,sy=v.Y} end
function params()
  return {values={},GetString=function(self,k,d) return self.values[k] or d end,
    SetString=function(self,k,v) self.values[k]=v end}
end
function rectangle(x,y,w,h)
  local o=params(); o.ClassName='vcCadContour'; o.x=x; o.y=y; o.w=w; o.h=h
  function o:GetBoundingBox() return {MinX=self.x,MaxX=self.x+self.w,MinY=self.y,MaxY=self.y+self.h} end
  function o:Transform(m)
    if m.dx then self.x=self.x+m.dx; self.y=self.y+m.dy
    else self.x=m.p.X+(self.x-m.p.X)*m.sx; self.y=m.p.Y+(self.y-m.p.Y)*m.sy; self.w=self.w*m.sx; self.h=self.h*m.sy end
  end
  function o:GetContour()
    local p={Point2D(self.x,self.y),Point2D(self.x+self.w,self.y),Point2D(self.x+self.w,self.y+self.h),Point2D(self.x,self.y+self.h)}
    local c={StartPoint2D=p[1],IsOpen=false,IsEmpty=false}
    function c:GetHeadPosition() return 1 end
    function c:GetNext(i) return {IsLineType=true,StartPoint2D=p[i],EndPoint2D=p[i%4+1]}, i<4 and i+1 or nil end
    return c
  end
  function o:Clone() return rectangle(self.x,self.y,self.w,self.h) end
  return o
end
function luaUUID() return {SetId=function(self,id) self.id=id end,AsString=function(self) return tostring(self.id) end} end
function setup()
  local shape=rectangle(44,-40,12,30); local drill=rectangle(48,-27,4,4)
  local entries={{object=shape,role='design',layer={Name='VECTOR'}},{object=drill,role='drill'}}
  local stamp={instanceId='p:s',selloId='s',name='Sello',centerX=50,topY=-10,widthMm=12,heightMm=30,recipe='CLASICO'}
  local ctx={job={JobParameters=params()},folder='.',manifest={sellos={{sello_id='s',archivo='source.svg'}}}}
  return ctx,stamp,entries,shape,drill
end
choices=0
function HTML_Dialog()
  choices=choices+1
  return {AddRadioGroup=function() end,ShowDialog=function() return true end,GetRadioIndex=function() return choice or 1 end}
end
'''


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.lua = LuaRuntime(unpack_returned_tuples=True)
        self.lua.globals().ExecutionPlan = self.lua.execute(Path(__file__).with_name('ExecutionPlan.lua').read_text(encoding='utf-8'))
        self.lua.execute('function fromJson(x) return x end')
        def table(value):
            if isinstance(value,dict): return self.lua.table_from({k:table(v) for k,v in value.items()})
            if isinstance(value,list): return self.lua.table_from([table(v) for v in value])
            return value
        self.lua.globals().EXECUTION_RULES=table(json.loads((ROOT/'supabase/functions/_shared/preparationRules.json').read_text()))
        self.module = self.lua.execute(SOURCE)
        self.lua.globals().sync = self.module
        self.lua.execute(MOCK)
        # La fuente se simula en memoria: no abrir rutas del usuario.
        self.lua.execute("io.open=function() return {read=function() return 'source' end,close=function() end} end")

    def run_lua(self, script):
        self.lua.execute(script)

    def test_lua51_all_gadgets_compile(self):
        for name in ('Chica', 'Grande', 'XL'):
            self.lua.compile((ROOT / f'aspire-gadgets/ArmarPrograma_{name}.lua').read_text(encoding='utf-8'))

    def test_generated_upload_json_carries_result_in_all_three_gadgets(self):
        for machine in ('Chica', 'Grande', 'XL'):
            for revision in (None, 3):
                with self.subTest(machine=machine, revision=revision):
                    source = (ROOT / f'aspire-gadgets/ArmarPrograma_{machine}.lua').read_text(encoding='utf-8')
                    transport = source[source.index('local function postJson('):source.index('local function saveAndUploadAspire(')]
                    runtime = LuaRuntime(unpack_returned_tuples=True)
                    runtime.globals().revision = revision
                    upload, requests = runtime.execute(r'''
                      local ACTIVE_PREPARATION_REVISION=revision
                      local CURL_BASE_FLAGS,CURL_UPLOAD_FLAGS,SYNC_URL='','','http://local.invalid'
                      local files,requests={},{}
                      local function key(path) return path:gsub('\\','/') end
                      local function jsonString(text) return '"' .. text .. '"' end
                      local function fileExists() return true end
                      local function extractJsonString(text,name) return text:match('"' .. name .. '":"([^"]+)"') end
                      local os={getenv=function() return 'fixture' end,time=function() return 1 end,remove=function() end}
                      local io={open=function(path,mode)
                        path=key(path); if mode=='w' or mode=='wb' then files[path]='' end
                        return {write=function(_,text) files[path]=(files[path] or '') .. text end,
                          read=function() return files[path] or '' end,seek=function() return 1024 end,close=function() end}
                      end}
                      os.execute=function(command)
                        local code=command:match(' > "([^"]+)"')
                        if code then files[key(code)]='200' end
                        local input=command:match('%-%-data%-binary "@([^"]+)"')
                        if input then
                          local payload=files[key(input)]; requests[#requests+1]=payload
                          local output=command:match(' %-o "([^"]+)"')
                          files[key(output)]='{"signedUrl":"http://local.invalid/upload","path":"p/r3/e/file.crv3d"}'
                        end
                      end
                    ''' + transport + '\nreturn uploadAspireFile, requests')
                    result = upload('p', 'ficticio', 'fixture/file.crv3d', 'resultado-1' if revision else None)
                    self.assertTrue(result[0], result)
                    self.assertEqual(len(requests), 2)
                    for payload in requests.values():
                        body = json.loads(payload)
                        if revision:
                            self.assertEqual(body['preparation_revision'], 3)
                            self.assertEqual(body['preparation_event_id'], 'resultado-1')
                        else:
                            self.assertNotIn('preparation_revision', body)
                            self.assertNotIn('preparation_event_id', body)
                    if revision:
                        self.assertFalse(upload('p', 'ficticio', 'fixture/file.crv3d', None)[0])

    def test_utf8_hash_matches_browser(self):
        self.assertEqual(self.module.fingerprint('á'), '2:12933')

    def test_report_json_escapes_and_keeps_arrays(self):
        result = self.module.json(self.lua.table_from({'issues': self.lua.table_from([]), 'name': 'a"\n\\á'}))
        self.assertEqual(json.loads(result), {'issues': [], 'name': 'a"\n\\á'})

    def test_translation_keeps_geometry_identity(self):
        self.run_lua('''
          local ctx,s,entries,shape,drill=setup()
          local before,hash=sync.svg(entries,true)
          sync.remember(ctx,s,entries,sync.fingerprint('source'))
          s.topY=-60
          local out=sync.mergeStamp(ctx,s,entries)
          local after,newHash=sync.svg(out,true)
          assert(hash==newHash); assert(shape.y==-90); assert(drill.y==-77); assert(choices==0)
          assert(out[1].object==shape)
        ''')

    def test_separated_letters_and_app_position_combine(self):
        self.run_lua('''
          local ctx,s,entries,shape,drill=setup()
          sync.remember(ctx,s,entries,sync.fingerprint('source'))
          -- Agregar otro contorno crea una corrección interna con caja distinta.
          entries[3]={object=rectangle(57,-40,1,30),role='design',layer={Name='VECTOR'}}
          -- Evita reconstruir auxiliares; se prueba la combinación de transformaciones.
          local replacements=0
          ctx.job.LayerManager={GetLayerWithName=function() replacements=replacements+1; error('aux mock') end}
          s.topY=-60
          pcall(sync.mergeStamp,ctx,s,entries)
          assert(shape.y==-90); assert(entries[3].object.y==-90); assert(choices==0)
        ''')

    def test_same_property_conflict_once_and_aspire_choice(self):
        self.run_lua('''
          local ctx,s,entries,shape=setup()
          sync.remember(ctx,s,entries,sync.fingerprint('source'))
          shape:Transform(TranslationMatrix2D(Vector2D(0,-5)))
          s.topY=-60; choice=2
          sync.mergeStamp(ctx,s,entries)
          assert(choices==1); assert(shape.y==-45)
          sync.remember(ctx,s,entries,sync.fingerprint('source'))
          sync.mergeStamp(ctx,s,entries)
          assert(choices==1); assert(shape.y==-45)
        ''')

    def test_size_changed_only_in_aspire_is_preserved(self):
        self.run_lua('''
          local ctx,s,entries,shape=setup()
          sync.remember(ctx,s,entries,sync.fingerprint('source'))
          shape:Transform(ScalingMatrix2D(Point2D(50,-25),Vector2D(1.1,1.1)))
          sync.mergeStamp(ctx,s,entries)
          assert(math.abs(shape.h-33)<0.001); assert(choices==0)
        ''')

    def test_fine_omitted_only_for_current_geometry_analysis(self):
        self.run_lua('''
          local ctx,s,entries=setup(); local _,hash=sync.svg(entries,true)
          ctx.job.JobParameters:SetString('SOURCE_GEOMETRY:p:s',hash)
          s.fine={mode='auto',needsFine=false,inputHash='source-hash',widthMm=12,heightMm=30,recipe='CLASICO',analysisVersion=EXECUTION_RULES.fineAnalysisVersion}
          assert(sync.fineSelection(ctx,s,entries,'source-hash')==nil)
          local count=0
          ctx.job.LayerManager={GetLayerWithName=function() return {AddObject=function() count=count+1 end} end}
          ctx.job.JobParameters:SetString('SOURCE_IS_OBSERVED:p:s','1')
          assert(sync.fineSelection(ctx,s,entries,'source-hash')~=nil); assert(count==1)
          s.fine.geometryHash=hash
          assert(sync.fineSelection(ctx,s,entries,'source-hash')==nil); assert(count==1)
          s.fine.analysisVersion=EXECUTION_RULES.fineAnalysisVersion-1
          assert(sync.fineSelection(ctx,s,entries,'source-hash')~=nil); assert(count==2)
        ''')

    def test_partial_selection_is_never_silently_created(self):
        self.run_lua('''
          local ctx,s,entries=setup(); s.fine={mode='aspire'}
          assert(not pcall(sync.fineSelection,ctx,s,entries,'source'))
          entries[3]={role='fine'}
          assert(sync.fineSelection(ctx,s,entries,'source')==nil)
        ''')


class FullFlowTests(unittest.TestCase):
    def setUp(self):
        SyncTests.setUp(self)
        self.lua.globals().sdk = self.lua.execute(Path(__file__).with_name('mock_sdk.lua').read_text(encoding='utf-8'))
        self.run_lua('''
          doc={programId='program',gapMm=8,columns={
            {id='p25',nominalMm=25,usableMm=24,centerX=50,topY=-9,bottomY=-400,toolEnvelopeMm=39,available=true},
            {id='p38',nominalMm=38,usableMm=36.5,centerX=235,topY=-9,bottomY=-400,toolEnvelopeMm=52,available=true}},
            stamps={{instanceId='program:s',selloId='s',name='Sello',columnId='p25',centerX=50,topY=-9,widthMm=12,heightMm=30,recipe='CLASICO',fine={mode='whole'}}}}
          ctx,state,entries,tm=sdk.setup(sync,doc,EXECUTION_RULES)
        ''')

    def run_lua(self, script):
        self.lua.execute(script)

    def test_report_and_upload_share_the_exact_native_result(self):
        self.run_lua('''
          local uploadedEvent
          ctx.upload=function(_,_,_,eventId) uploadedEvent=eventId; return true end
          sync.run(ctx)
          assert(uploadedEvent and uploadedEvent~='')
          assert(state.reports[1]:find('"evento_id":"' .. uploadedEvent .. '"',1,true))
        ''')

    def test_repeated_sync_moves_existing_design_and_rebuilds_cut_for_new_strip(self):
        self.run_lua('''
          sync.run(ctx); assert(state.uploads==1, state.message)
          assert(state.reports[1]:find('"verified":true',1,true))
          local shape=entries('program:s','design')[1]
          assert(#entries('program:s','design')==1); assert(state.imports==1)
          doc.stamps[1].columnId='p38'; doc.stamps[1].centerX=235
          sync.run(ctx); assert(state.uploads==2,state.message)
          assert(entries('program:s','design')[1]==shape); assert(state.imports==1)
          local cut=entries('program:s','cut')[1]:GetBoundingBox()
          assert(cut.MaxX-cut.MinX==46); assert(cut.MinY==-43)
          assert(#entries('program:s','cut')==1); assert(#entries('program:s','drill')==1)
          assert(#tm.items==3)
        ''')

    def test_scaling_keeps_drill_diameter_and_recalculates_cut(self):
        self.run_lua('''
          sync.run(ctx)
          doc.stamps[1].widthMm=18; doc.stamps[1].heightMm=45
          sync.run(ctx); assert(state.uploads==2,state.message)
          local drill=entries('program:s','drill')[1]:GetBoundingBox()
          assert(drill.MaxX-drill.MinX==6); assert(drill.MaxY-drill.MinY==6)
          assert(entries('program:s','cut')[1]:GetBoundingBox().MinY==-58)
        ''')

    def test_invalid_actual_geometry_blocks_cam_and_upload(self):
        self.run_lua('''
          sync.run(ctx)
          entries('program:s','design')[1]:Transform(TranslationMatrix2D(Vector2D(50,0)))
          sync.run(ctx)
          assert(state.recalculations==3); assert(state.uploads==1)
          assert(state.reports[2]:find('WIDTH',1,true)); assert(state.reports[2]:find('"recalculated":false',1,true))
        ''')

    def test_failed_cam_keeps_saved_report_and_does_not_upload(self):
        self.run_lua('''
          state.failRecalculation=true
          sync.run(ctx)
          assert(state.uploads==0); assert(#state.reports==1)
          assert(state.files['program.crv3d']~=nil)
          state.failRecalculation=false
          sync.run(ctx); assert(state.uploads==1,state.message); assert(state.imports==1)
        ''')

    def test_corrupted_auxiliary_is_detected_before_cam(self):
        self.run_lua('''
          local original=CreateCadContour
          CreateCadContour=function(c)
            local object=original(c)
            if c.center then object:Transform(TranslationMatrix2D(Vector2D(1,0))) end
            return object
          end
          sync.run(ctx)
          assert(state.recalculations==0); assert(state.uploads==0)
          assert(state.reports[1]:find('"verified":false',1,true))
        ''')

    def test_template_modified_after_server_check_is_rejected(self):
        self.run_lua('''
          state.files['fixture\\\\clasico.ToolpathTemplate']='modified'
          sync.run(ctx)
          assert(state.recalculations==0); assert(state.uploads==0)
          assert(state.reports[1]:find('plantilla',1,true))
        ''')

    def test_aspire105_false_return_requires_actual_loaded_paths_and_recalculation(self):
        self.run_lua('''
          state.falseLoadReturn=true
          sync.run(ctx); assert(state.uploads==1,state.message); assert(tm.Count==3)
        ''')

    def test_empty_template_load_never_approves_even_if_return_is_true(self):
        self.run_lua('''
          state.failLoad=true
          sync.run(ctx); assert(state.uploads==0); assert(state.recalculations==0)
        ''')

    def test_recalculation_text_does_not_approve_empty_toolpath(self):
        self.run_lua('''
          state.emptyToolpath=true
          sync.run(ctx); assert(state.uploads==0); assert(state.recalculations==1)
          assert(state.reports[1]:find('sin mecanizado valido',1,true))
        ''')

    def test_fine_geometry_without_matching_cam_is_blocked(self):
        self.run_lua('''
          for _,proof in pairs(ctx.manifest.preparation.template_proofs) do
            proof.selectors={{layers={'VECTOR','Offset 1 vector','Offset exterior vector','Corte','Taladrado','Planeado','Rectangulo exterior'}}}
          end
          sync.run(ctx); assert(state.uploads==0); assert(state.recalculations==0)
          assert(state.reports[1]:find('REPASO CLASICO',1,true))
        ''')

    def test_manual_fine_template_binds_current_fine_objects_and_reloads_after_rebuild(self):
        self.run_lua('''
          ctx.manifest.preparation.template_files.CLASICO={'clasico.ToolpathTemplate','fine.ToolpathTemplate'}
          state.files['fixture\\\\fine.ToolpathTemplate']='fine'
          ctx.manifest.preparation.template_proofs['fine.ToolpathTemplate']={fingerprint=sync.fingerprint('fine'),toolpathCount=1,stage=4,
            selectionLayers={'REPASO CLASICO'},selectors={{layers={}}}}
          sync.run(ctx); assert(state.uploads==1,state.message)
          local found=0
          for _,load in ipairs(state.loads) do if load.file:find('fine.ToolpathTemplate',1,true) then
            found=found+1; assert(#load.roles==1); assert(load.roles[1]=='fine')
          end end
          assert(found==1)
          local calculated=0
          for _,pass in ipairs(state.recalculatedSelections) do if pass.file:find('fine.ToolpathTemplate',1,true) then
            calculated=calculated+1; assert(#pass.roles==1 and pass.roles[1]=='fine','Se recalculo el repaso con otra seleccion')
          end end
          assert(calculated==1)
          local initial=#state.loads
          sync.run(ctx); assert(state.uploads==2,state.message); assert(#state.loads>initial)
          assert(tm.Count==4)
        ''')

    def test_preserved_internal_detail_uses_separate_template_selection(self):
        self.run_lua('''
          sync.run(ctx); assert(state.uploads==1,state.message)
          doc.stamps[1].fine={mode='aspire',scope='internal'}
          ctx.manifest.preparation.template_files.CLASICO={'clasico.ToolpathTemplate','internal.ToolpathTemplate'}
          state.files['fixture\\\\internal.ToolpathTemplate']='internal'
          ctx.manifest.preparation.template_proofs['internal.ToolpathTemplate']={fingerprint=sync.fingerprint('internal'),toolpathCount=1,stage=4,
            selectionLayers={'REPASO INTERIOR CLASICO'},selectors={{layers={}}}}
          sync.run(ctx); assert(state.uploads==2,state.message)
          local target=ctx.job.LayerManager:GetLayerWithName('REPASO INTERIOR CLASICO')
          assert(#target.items==1)
          assert(#ctx.job.LayerManager:GetLayerWithName('REPASO CLASICO').items==0)
          assert(state.loads[#state.loads].roles[1]=='fine')
        ''')

    def test_shared_identical_templates_are_loaded_once(self):
        self.run_lua('''
          state.files['fixture\\\\3mm.ToolpathTemplate']='clasico.ToolpathTemplate'
          ctx.manifest.preparation.template_proofs['3mm.ToolpathTemplate'].fingerprint=sync.fingerprint('clasico.ToolpathTemplate')
          sync.run(ctx); assert(state.uploads==1,state.message); assert(#tm.items==2)
        ''')

    def test_deleted_managed_toolpath_is_restored_even_when_templates_did_not_change(self):
        self.run_lua('''
          doc.stamps[1].fine={mode='none'}
          sync.run(ctx); assert(state.uploads==1,state.message); assert(tm.Count==3)
          local initial=#state.loads; tm:DeleteToolpath(tm.items[2]); assert(tm.Count==2)
          sync.run(ctx); assert(state.uploads==2,state.message); assert(tm.Count==3)
          assert(#state.loads>initial); assert(state.imports==1)
        ''')

    def test_duplicate_toolpath_identity_never_approves_recalculation(self):
        self.run_lua('''
          state.duplicateToolpathId=true
          sync.run(ctx); assert(state.uploads==0); assert(state.recalculations==0)
          assert(state.reports[1]:find('identidad duplicada',1,true))
          state.duplicateToolpathId=false
          sync.run(ctx); assert(state.uploads==1,state.message)
        ''')

    def test_food_rebinds_3mm_layers_and_recalculates_perimeter_after_fine(self):
        self.run_lua('''
          doc.stamps[1].recipe='ALIMENTO'
          ctx.manifest.preparation.template_files={ALIMENTO={'perimeter.ToolpathTemplate','fine.ToolpathTemplate','main.ToolpathTemplate'}}
          for _,name in ipairs({'perimeter','fine','main'}) do state.files['fixture\\\\' .. name .. '.ToolpathTemplate']=name end
          local proofs=ctx.manifest.preparation.template_proofs
          proofs['main.ToolpathTemplate']={fingerprint=sync.fingerprint('main'),toolpathCount=1,stage=2,selectors={{layers={'VECTOR 3MM'}}},
            selectorLayers={'VECTOR ALIMENTO','Offset 1 vector','Offset exterior vector alimento','Corte','Taladrado','Planeado','Rectangulo exterior'}}
          proofs['fine.ToolpathTemplate']={fingerprint=sync.fingerprint('fine'),toolpathCount=1,stage=4,selectors={{layers={}}},selectionLayers={'REPASO ALIMENTO'}}
          proofs['perimeter.ToolpathTemplate']={fingerprint=sync.fingerprint('perimeter'),toolpathCount=1,stage=5,subOrder=1,selectors={{layers={}}},selectionLayers={'Corte Alimento'}}
          sync.run(ctx); assert(state.uploads==1,state.message); assert(tm.Count==3)
          local passes=state.recalculatedSelections
          assert(passes[1].file:find('main.ToolpathTemplate',1,true)); assert(passes[1].layers[1]=='VECTOR ALIMENTO')
          assert(passes[2].file:find('fine.ToolpathTemplate',1,true)); assert(#passes[2].roles==1 and passes[2].roles[1]=='fine')
          assert(passes[3].file:find('perimeter.ToolpathTemplate',1,true)); assert(#passes[3].roles==1 and passes[3].roles[1]=='perimeter')
        ''')

    def test_native_stage_order_is_independent_of_uploaded_file_order(self):
        self.run_lua('''
          local sequence={{'cut',5,0},{'fine',4,0},{'pocket',1,1},{'plane',1,0},{'thread',0,1},{'drill',0,0}}
          local files={}
          local sample=ctx.manifest.preparation.template_proofs['clasico.ToolpathTemplate'].selectors
          for _,v in ipairs(sequence) do
            local file=v[1] .. '.ToolpathTemplate'; files[#files+1]=file; state.files['fixture\\\\' .. file]=file
            ctx.manifest.preparation.template_proofs[file]={fingerprint=sync.fingerprint(file),toolpathCount=1,stage=v[2],subOrder=v[3],selectors=sample}
          end
          ctx.manifest.preparation.template_files={CLASICO=files}
          sync.run(ctx); assert(state.uploads==1,state.message)
          for i,name in ipairs({'drill','thread','plane','pocket','fine','cut'}) do assert(state.loads[i].file=='fixture\\\\' .. name .. '.ToolpathTemplate') end
        ''')


if __name__ == '__main__':
    unittest.main()
