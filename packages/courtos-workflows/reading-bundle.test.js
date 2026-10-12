"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {workflowReadingDependencies,sourceQuoteContext}=require("./index");
const retained=require("./fixtures/reading-bundle-regressions.json");
const claims=ids=>ids.map(id=>({id,text:id,citations:[],context_references:[]}));
test("retained C17/C19 retain precise declared party dependencies; their own quotes stay unchanged",()=>{
 const before=JSON.stringify(retained);
 for(const [id,row,origin] of [["C17","R7","C16"],["C19","R8","C18"]]){
  assert.deepEqual(workflowReadingDependencies(retained.result,id),[{row_id:row,claim_id:origin,role:"party_position",party:"P1"}]);
  const target=retained.result.claims.find(c=>c.id===id),linked=retained.result.claims.find(c=>c.id===origin);
  assert.ok(target.citations.every(c=>c.section_id!=="S1"));
  assert.ok(linked.citations.some(c=>c.section_id==="S1"));
 }
 assert.equal(JSON.stringify(retained),before);
});
test("retained cropped negation and date remain raw quotes; their same-source reading ranges contain the missing wording",()=>{
 for(const [id,section,expected] of [["C14","S1","nicht erhalten"],["C18","S1","22. September 2026"],["C22","S1","15. September 2026"],["C29","S2","nicht"]]){
  const claim=retained.result.claims.find(c=>c.id===id),ref=claim.citations.find(c=>c.section_id===section),source=retained.sections.find(s=>s.id===section);
  const start=Array.from(source.text.slice(0,source.text.indexOf(ref.exact_quote))).length;
  const context=sourceQuoteContext({id:section,text:source.text,start:0},{source_id:section,start,end:start+Array.from(ref.exact_quote).length,quote:ref.exact_quote});
  assert.ok(context.text.includes(expected),id);assert.equal(context.semantic_support,"not_checked");
  assert.equal(Array.from(source.text).slice(context.quote_start,context.quote_end).join(""),ref.exact_quote);
 }
});
test("only direct analysis links; no recursion, reverse propagation, category neighbours or context promotion",()=>{
 const result={task:"party_comparison",claims:claims(["A","B","C","D"]),rows:[
  {id:"R1",analysis:"A",category:"fact",positions:[{claim:"B",party:"P1"}]},
  {id:"R2",analysis:"B",category:"fact",positions:[{claim:"C",party:"P2"}]},
  {id:"R3",analysis:"D",category:"fact",positions:[{claim:"C",party:"P2"}]}]};
 result.claims[1].context_references=[{section_id:"PRIVATE_NOTE",exact_quote:"A working assumption"}];
 assert.deepEqual(workflowReadingDependencies(result,"A"),[{row_id:"R1",claim_id:"B",role:"party_position",party:"P1"}]);
 assert.deepEqual(workflowReadingDependencies(result,"C"),[]);
});
test("two analysis rows retain separate row labels; same-claim self links are omitted",()=>{
 const result={task:"party_comparison",claims:claims(["A","B"]),rows:[{id:"R1",analysis:"A",positions:[{claim:"B",party:"P1"},{claim:"A",party:"P2"}]},{id:"R2",analysis:"A",positions:[{claim:"B",party:"P2"}]}]};
 assert.deepEqual(workflowReadingDependencies(result,"A").map(d=>[d.row_id,d.claim_id,d.party]),[["R1","B","P1"],["R2","B","P2"]]);
});
test("evidence, opponents, authorities and manual pointers keep their declared roles",()=>{
 const base={claims:claims(["A","B","C","D"])};
 assert.deepEqual(workflowReadingDependencies({...base,task:"facts_evidence",rows:[{id:"R1",reasoning:"A",statement:"B",party:"P1",evidence:["C"],opposing:["D"]}]},"A").map(d=>d.role),["statement","evidence","opposing_position"]);
 assert.deepEqual(workflowReadingDependencies({...base,task:"legal_claims",rows:[{id:"R1",reasoning:"A",statement:"B",party:"P1",authorities:["C"],manual_source:"D"}]},"A").map(d=>d.role),["statement","authority","manual_pointer"]);
 assert.deepEqual(workflowReadingDependencies({...base,task:"hypothetical_impact",rows:[{id:"R1",analysis:"A",baseline:"B",limitations:["C"],assumption_id:"S99"}]},"A").map(d=>d.claim_id),["B","C"]);
});
test("unknown/duplicate claims, missing referenced claims and duplicate rows fail closed",()=>{
 const good={task:"party_comparison",claims:claims(["A","B"]),rows:[{id:"R1",analysis:"A",positions:[{claim:"B",party:"P1"}]}]};
 assert.throws(()=>workflowReadingDependencies(good,"X"));
 for(const mutate of [r=>r.claims.push(r.claims[0]),r=>r.claims.pop(),r=>r.rows.push(r.rows[0])]){const bad=structuredClone(good);mutate(bad);assert.throws(()=>workflowReadingDependencies(bad,"A"));}
});
