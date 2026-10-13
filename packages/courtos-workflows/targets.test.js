const test=require('node:test'),assert=require('node:assert/strict');
const {validateWorkflowResult,validateAssessmentTargets,workflowRequestMessages}=require('./index');
const sections=[{id:'S1',kind:'source',source:{document:'D1',version:'V1',party:'P1',role:'claim'},text:'Payment is alleged. The claimant relies on this rule.'},{id:'S2',kind:'working_note',attribution:{author:'user',status:'proposed'},text:'Assume no bank confirmation.'}];
const target=()=>({id:'T1',category:'fact',party:'P1',text:'Payment is alleged.',citations:[{section_id:'S1',exact_quote:'Payment is alleged.'}],context_references:[]});
function fixture(task='facts_evidence'){
 const t={...target(),category:task==='facts_evidence'?'fact':'legal'},claims=[{id:'C1',text:t.text,citations:t.citations,context_references:t.context_references},{id:'C2',text:'No exhibit or authority is included.',citations:t.citations}];
 const row={id:'R1',target_id:'T1',party:'P1',statement:'C1',reasoning:'C2',...(task==='facts_evidence'?{posture:'allegation',evidence:[],opposing:[],assessment:'not_found'}:{authorities:[],assessment:'not_found_in_selected_sources',manual_source:null})};
 return {t,value:{version:1,task,claims,rows:[row],coverage:{source_inventory:[{section_id:'S1',claim_ids:['C1','C2'],review:'unresolved'}],all_claims_extracted:false,more_claims_reported:false,scope:'selected_sources_only'}}};
}
const run=(f)=>validateWorkflowResult(f.value,{task:f.value.task,sections,assessment_targets:[f.t]});
for(const task of ['facts_evidence','legal_claims'])test(task+' preserves selected target exactly, without claiming semantic proof',()=>{const f=fixture(task);assert.deepEqual(run(f),f.value);delete f.value.rows[0].target_id;assert.throws(()=>run(f),{code:'assessment_target_binding'});assert.deepEqual(validateWorkflowResult(f.value,{task,sections}),f.value);});
for(const kind of ['text','quote','party','context','unknown','duplicate','omitted'])test('rejects target '+kind,()=>{
 const f=fixture();if(kind==='text')f.value.claims[0].text='Payment occurred.';
 if(kind==='quote')f.value.claims[0].citations=[{section_id:'S1',exact_quote:'Payment'}];
 if(kind==='party')f.value.rows[0].party='P2';
 if(kind==='context')f.value.claims[0].context_references=[{section_id:'S2',exact_quote:sections[1].text}];
 if(kind==='unknown')f.value.rows[0].target_id='T2';
 if(kind==='duplicate')f.value.rows.push({...f.value.rows[0],id:'R2'});
 if(kind==='omitted'){f.value.rows=[];f.value.claims=[];f.value.coverage.source_inventory[0].claim_ids=[];}
 assert.throws(()=>run(f),{code:'assessment_target_binding'});
});
test('refuses unsolicited target IDs in standalone extraction',()=>{const f=fixture();assert.throws(()=>validateWorkflowResult(f.value,{task:f.value.task,sections}),{code:'assessment_target_binding'});});
test('citation order is not identity but context cannot disappear',()=>{const f=fixture();f.t.citations.push({section_id:'S1',exact_quote:'The claimant relies on this rule.'});f.t.context_references=[{section_id:'S2',exact_quote:sections[1].text}];f.value.claims[0]={...f.value.claims[0],citations:[...f.t.citations].reverse(),context_references:f.t.context_references};assert.deepEqual(run(f),f.value);});
for(const mutate of [t=>t.id='private-uuid',t=>t.category='legal',t=>t.party='P2',t=>t.text=' ',t=>t.text='a'.repeat(4001),t=>t.citations=[],t=>t.private_id='secret',t=>t.citations.push(t.citations[0]),t=>t.context_references=[{section_id:'S1',exact_quote:'Payment'}]])test('invalid target never enters request '+String(mutate),()=>{const t=target();mutate(t);assert.throws(()=>validateAssessmentTargets([t],{task:'facts_evidence',sections}));});
test('refuses exhibit as selected party proposition and enforces caps/UTF8',()=>{const t=target();assert.throws(()=>validateAssessmentTargets([t],{task:'facts_evidence',sections:[{...sections[0],source:{...sections[0].source,role:'exhibit'}}]}));assert.throws(()=>validateAssessmentTargets(Array.from({length:41},(_,i)=>({...t,id:`T${i+1}`})),{task:'facts_evidence',sections}));assert.throws(()=>validateAssessmentTargets(Array.from({length:40},(_,i)=>({...t,id:`T${i+1}`,text:'é'.repeat(4000)})),{task:'facts_evidence',sections}));});
test('canonical second user message carries only declared neutral target data, legacy first message unchanged',()=>{const t=target();assert.deepEqual(workflowRequestMessages('packet'),[{role:'user',content:'packet'}]);const messages=workflowRequestMessages('packet',[t]);assert.equal(messages.length,2);assert.deepEqual(JSON.parse(messages[1].content),{assessment_targets:[t]});assert.equal(messages[0].content,'packet');});
