"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {sourceQuoteContext, MAX_SOURCE_CONTEXT_CHARACTERS} = require("./index");
const retained = require("./fixtures/citation-context-regressions.json");

function citation(text, quote, start = 0, id = "S3") {
  const offset = Array.from(text.slice(0, text.indexOf(quote))).length;
  return {source_id:id, start:start + offset, end:start + offset + Array.from(quote).length, quote};
}
for (const example of retained) test(`retained ${example.task} ${example.claim.id}: restores same-source reading context without altering incomplete citations`, () => {
  const before = JSON.stringify(example);
  const quoted = example.claim.citations.filter(c => c.section_id === "S3");
  assert.ok(quoted.length > 0);
  assert.ok(quoted.every(c => !c.exact_quote.includes("CHF 1250")));
  for (const ref of quoted) {
    const c = citation(example.source.text, ref.exact_quote);
    const context = sourceQuoteContext({id:"S3",text:example.source.text,start:0},c);
    assert.equal(context.text,example.source.text);
    assert.ok(context.text.includes("Betrag: CHF 1250."));
    assert.ok(context.text.includes("Status: erfasst; Ausführung nicht bestätigt."));
    assert.equal(context.semantic_support,"not_checked");
    assert.equal(context.quote_start,c.start);
    assert.equal(context.quote_end,c.end);
  }
  assert.equal(JSON.stringify(example),before);
});
test("paragraph boundaries and absolute Unicode offsets remain exact", () => {
  const text = "Other paragraph.\r\n \r\n🙂 Amount 1250. Status recorded.\n\nLater paragraph.";
  const context = sourceQuoteContext({id:"S3",text,start:120},citation(text,"Status recorded.",120));
  assert.equal(context.text,"🙂 Amount 1250. Status recorded.");
  assert.equal(Array.from(text).slice(context.start-120,context.end-120).join(""),context.text);
  assert.equal(context.clipped_before,false);assert.equal(context.clipped_after,false);
});
test("a quote spanning paragraphs retains its entire original range", () => {
  const text = "First paragraph.\n\nSecond paragraph.\n\nThird.";
  const quote = "paragraph.\n\nSecond";
  const context = sourceQuoteContext({id:"S3",text,start:0},citation(text,quote));
  assert.equal(context.text,"First paragraph.\n\nSecond paragraph.");
});
test("repeated words use the already bound offset, never the first other paragraph", () => {
  const text = "Amount 1. Status recorded.\n\nAmount 2. Status recorded.",quote="Status recorded.";
  const start = text.lastIndexOf(quote);
  const context = sourceQuoteContext({id:"S3",text,start:0},{source_id:"S3",start,end:start+quote.length,quote});
  assert.equal(context.text,"Amount 2. Status recorded.");
});
test("long paragraphs are bounded around the unchanged quote, with clipping disclosed", () => {
  const quote="🙂 exact original quote",text="L".repeat(2500)+quote+"R".repeat(2500);
  const c=citation(text,quote),context=sourceQuoteContext({id:"S3",text,start:0},c);
  assert.equal(Array.from(context.text).length,MAX_SOURCE_CONTEXT_CHARACTERS);
  assert.equal(context.clipped_before,true);assert.equal(context.clipped_after,true);
  assert.equal(Array.from(context.text).slice(c.start-context.start,c.end-context.start).join(""),quote);
});
test("a quote larger than the window is never shortened", () => {
  const quote="a".repeat(2001),c=citation(quote,quote);
  assert.equal(sourceQuoteContext({id:"S3",text:quote,start:0},c),null);
  assert.equal(c.quote.length,2001);
});
test("wrong source, offsets, malformed Unicode and overflow fail closed", () => {
  const source={id:"S3",text:"Exact quote",start:10},valid={source_id:"S3",start:10,end:21,quote:"Exact quote"};
  for (const change of [{source_id:"S4"},{start:11},{end:22},{quote:"exact quote"},{start:10.5},{quote:""}])
    assert.throws(()=>sourceQuoteContext(source,{...valid,...change}),/source_context_invalid/);
  assert.throws(()=>sourceQuoteContext({...source,text:"Exact \ud800quote"},valid),/source_context_invalid/);
  assert.throws(()=>sourceQuoteContext({...source,start:Number.MAX_SAFE_INTEGER-1},{...valid,start:Number.MAX_SAFE_INTEGER-1,end:Number.MAX_SAFE_INTEGER}),/source_context_invalid/);
});
