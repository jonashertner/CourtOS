const test = require('node:test');
const assert = require('node:assert/strict');
const { validateWorkflowResult } = require('./index');
function fixture(wording = 'Die Beklagte sei zur Zahlung von CHF 1250 zu verpflichten.') {
  const sections = [
    { id:'S1',kind:'source',source:{document:'D1',version:'V1',role:'claim',party:'P1'},text:wording },
    { id:'S2',kind:'source',source:{document:'D2',version:'V1',role:'response',party:'P2'},text:'Die Klage sei abzuweisen.' },
    { id:'S3',kind:'source',source:{document:'D3',version:'V1',role:'exhibit',party:'P1'},text:'Zahlungsauftrag CHF 1250.' },
  ];
  const result = {version:1,task:'party_comparison',claims:[{id:'C1',text:wording,citations:[{section_id:'S1',exact_quote:wording}]}],rows:[{id:'R1',category:'relief',positions:[{party:'P1',posture:'unresolved',claim:'C1'}],analysis:'C1'}],coverage:{scope:'selected_sources_only',all_claims_extracted:false,more_claims_reported:false,source_inventory:sections.map((s,i)=>({section_id:s.id,claim_ids:i?[]:['C1'],review:i?'unresolved':'reviewed'}))}};
  return {sections,result};
}
function run(f){return validateWorkflowResult(f.result,{task:'party_comparison',sections:f.sections});}
for(const text of ['Die Klage sei abzuweisen.','Condamner la défenderesse à payer CHF 1250.','La convenuta sia condannata al pagamento di CHF 1250.','The respondent shall pay CHF 1250.']) test(`literal relief remains in its original language: ${text}`,()=>{
 const f=fixture(text);assert.equal(run(f).claims[0].text,text);assert.equal(run(f).rows[0].positions.length,1);
});
test('express opposing prayers retained separately, without entitlement or disposition label',()=>{
 const f=fixture();f.result.claims.push({id:'C2',text:f.sections[1].text,citations:[{section_id:'S2',exact_quote:f.sections[1].text}]});f.result.rows[0].positions.push({party:'P2',posture:'unresolved',claim:'C2'});f.result.coverage.source_inventory[1].claim_ids=['C2'];assert.equal(run(f).rows[0].category,'relief');
});
test('relief refuses paraphrase, mixed/exhibit source, wrong party, notes and null opponent',()=>{
 for(const mode of ['paraphrase','mixed','exhibit','party','note','null']){
  const f=fixture();const c=f.result.claims[0];
  if(mode==='paraphrase')c.text='CourtOS should award CHF 1250.';
  if(mode==='mixed')c.citations.push({section_id:'S3',exact_quote:f.sections[2].text});
  if(mode==='exhibit'){c.text=f.sections[2].text;c.citations=[{section_id:'S3',exact_quote:c.text}];}
  if(mode==='party')f.result.rows[0].positions[0].party='P2';
  if(mode==='note'){f.sections.push({id:'S4',kind:'working_note',attribution:{author:'user'},text:'Draft instruction'});c.context_references=[{section_id:'S4',exact_quote:'Draft instruction'}];}
  if(mode==='null')f.result.rows[0].positions[0].party=null;
  assert.throws(()=>run(f),undefined,mode);
 }
});
test('unilateral fact/legal positions retain their source and never invent an opponent',()=>{
 for(const category of ['fact','legal']){const f=fixture();f.result.rows[0].category=category;assert.deepEqual(run(f),f.result);f.result.rows[0].positions[0].party=null;assert.throws(()=>run(f),{code:'party_attribution'});}
});
