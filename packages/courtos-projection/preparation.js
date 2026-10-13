"use strict";
/** V3 extends the one shared kernel with reviewed occurrences, never a copied matcher. */
module.exports = function preparationKernel(u) {
  const fail = code => { throw new u.ExportProjectionError(code); };
  const roles = new Set(["claimant", "respondent", "appellant", "appeal_respondent", "applicant", "authority", "intervenor", "other"]);
  const limits = { documents: 5, pages: 200, text_bytes: 1048576, packet_bytes: 2500000, occurrences: 10000 };
  function inspect(input) {
    if (!u.record(input) || typeof input.question !== "string" || !input.question.trim() || u.byteLength(input.question) > 8000
      || !Array.isArray(input.documents) || input.documents.length > limits.documents
      || (input.public_sources!==undefined&&!Array.isArray(input.public_sources)) || (input.public_sources??[]).length>40
      || (!input.documents.length&&!(input.public_sources??[]).length)
      || !Array.isArray(input.terms) || input.terms.length > 500 || !Array.isArray(input.parties) || input.parties.length > 40
      || !Array.isArray(input.extras) || input.extras.length > 40) fail("export_invalid_selection");
    // Each identity is validated separately: shared names can be disambiguated per occurrence.
    const terms = input.terms.flatMap(term => u.validateTerms([term])).sort((a,b) => a.entity_id.localeCompare(b.entity_id,"en"));
    if (new Set(terms.map(t => t.entity_id)).size !== terms.length || new Set(terms.map(t => u.key(t.replacement))).size !== terms.length
      || terms.reduce((n,t) => n+t.aliases.length,0)>1000) fail("export_invalid_selection");
    const parties = new Map(); const handles = new Set();
    for (const p of input.parties) {
      if (!u.record(p)) fail("export_invalid_selection");
      const term = terms.find(t => t.entity_id === p.entity_id && t.revision === p.entity_revision);
      if (!u.record(p) || !u.privateKey(p.id) || parties.has(p.id) || !/^P[1-9][0-9]{0,3}$/.test(p.handle)
        || handles.has(p.handle) || !term || p.reviewed !== true || !roles.has(p.procedural_role)) fail("export_invalid_selection");
      parties.set(p.id,p); handles.add(p.handle);
    }
    let totalBytes=u.byteLength(input.question), totalPages=0, sectionId=0;
    const sections=[{key:"Q",kind:"question",text:input.question}], coverage=[], docs=new Set();
    for (const [index,d] of input.documents.entries()) {
      if (!u.record(d) || !u.privateKey(d.document_key) || docs.has(d.document_key) || !u.privateKey(d.version_key)
        || !u.hashes.test(d.file_sha256) || !["browser-pdfjs-text-v1","server-readPdfPages-v1","browser-pdfjs-tesseract-v1"].includes(d.extractor)
        || !u.sourceRoles.has(d.role) || (d.party_id!==null&&!parties.has(d.party_id)) || !Array.isArray(d.pages) || !d.pages.length) fail("export_invalid_selection");
      docs.add(d.document_key); totalPages+=d.pages.length; if(totalPages>limits.pages)fail("export_too_large");
      const selected=[], excluded=[],ocrPages=[];let hasOcr=false;
      for (const [pageIndex,p] of d.pages.entries()) {
        if (!u.record(p)||p.page!==pageIndex+1||typeof p.text!=="string"||!u.hashes.test(p.page_sha256)||typeof p.selected!=="boolean") fail("export_invalid_selection");
        if(p.ocr!==undefined){
          if(d.extractor!=="browser-pdfjs-tesseract-v1"||!u.record(p.ocr)||Object.keys(p.ocr).sort().join(",")!=="confidence,engine,reviewed"
            ||p.ocr.engine!=="tesseract-7.0.0"||typeof p.ocr.confidence!=="number"||!Number.isFinite(p.ocr.confidence)||p.ocr.confidence<0||p.ocr.confidence>100||typeof p.ocr.reviewed!=="boolean")fail("export_invalid_selection");
          hasOcr=true;
          if(p.selected){if(!p.ocr.reviewed)fail("export_unreviewed_occurrence");ocrPages.push(p.page);}
        }
        totalBytes+=u.byteLength(p.text); if(totalBytes>limits.text_bytes)fail("export_too_large");
        if (!p.selected) {excluded.push(p.page);continue;}
        if(!p.text.trim())fail("export_unreadable_page");
        selected.push(p.page);
        const key=`S${++sectionId}`;
        const source={format:"pdf",document_key:d.document_key,version_key:d.version_key,file_sha256:d.file_sha256,party_key:d.party_id,role:d.role,page:p.page,page_sha256:p.page_sha256,start:0,end:u.count(p.text),extractor:d.extractor};
        sections.push({key,kind:"source",text:p.text,source,neutral:{format:"pdf",document:`D${index+1}`,version:"V1",party:d.party_id===null?null:parties.get(d.party_id).handle,role:d.role,page:p.page}});
      }
      if(!selected.length)fail("export_invalid_selection");
      if((d.extractor==="browser-pdfjs-tesseract-v1")!==hasOcr)fail("export_invalid_selection");
      coverage.push({document:`D${index+1}`,total_pages:d.pages.length,selected_pages:selected,excluded_pages:excluded,
        ...(ocrPages.length?{extraction:"pdf_text_with_ocr",ocr_performed:true,ocr_pages:ocrPages}:{extraction:"pdf_text_only",ocr_performed:false})});
    }
    const publicKeys=new Set(),safeUrl=value=>value===null||(typeof value==="string"&&value.length<=4000&&/^https?:\/\/[^\s]+$/u.test(value));
    for(const [index,p] of (input.public_sources??[]).entries()) {
      if(!u.record(p)||!u.privateKey(p.key)||publicKeys.has(p.key)||!u.privateKey(p.decision_id)
        ||(p.content_hash!==null&&!u.hashes.test(p.content_hash))||typeof p.text!=="string"||!p.text.trim()
        ||!Number.isSafeInteger(p.start)||!Number.isSafeInteger(p.end)||p.start<0||p.end-p.start!==u.count(p.text)
        ||!safeUrl(p.source_url)||!safeUrl(p.pdf_url))fail("export_invalid_selection");
      publicKeys.add(p.key);totalBytes+=u.byteLength(p.text);if(totalBytes>limits.text_bytes)fail("export_too_large");
      const authority={kind:"opencaselaw",decision_id:p.decision_id,content_hash:p.content_hash,start:p.start,end:p.end,source_url:p.source_url,pdf_url:p.pdf_url};
      sections.push({key:`S${++sectionId}`,kind:"source",text:p.text,source:{format:"public_decision",document_key:p.key,version_key:p.content_hash??`captured:${p.start}:${p.end}`,
        role:"authority",party_key:null,start:p.start,end:p.end,original_authority:authority},neutral:{format:"public_decision",document:`D${input.documents.length+index+1}`,version:"V1",party:null,role:"authority",start:p.start,end:p.end,complete_document:false}});
    }
    const extraKeys=new Set();
    for(const extra of input.extras) {
      if(!u.record(extra)||!u.privateKey(extra.original_key)||extraKeys.has(extra.original_key)||typeof extra.text!=="string"||!extra.text.trim())fail("export_invalid_selection");
      const a=extra.attribution;
      if(!u.record(a)||!(extra.kind==="working_note"&&["party","user","model"].includes(a.author)&&["open","proposed","adopted","disputed","superseded"].includes(a.status)
        ||extra.kind==="conversation_excerpt"&&["user","assistant"].includes(a.speaker)&&["question","source_bound","unverified"].includes(a.status)))fail("export_invalid_selection");
      extraKeys.add(extra.original_key); totalBytes+=u.byteLength(extra.text);if(totalBytes>limits.text_bytes)fail("export_too_large");
      const attribution=extra.kind==="working_note"?{author:a.author,status:a.status}:{speaker:a.speaker,status:a.status};
      sections.push({key:`S${++sectionId}`,kind:extra.kind,text:extra.text,original_key:extra.original_key,attribution});
    }
    const occurrences=[];
    const patterns=terms.flatMap(term=>term.aliases.map(alias=>({term,pattern:u.expression(alias)})));
    const replacements=terms.map(term=>u.expression(term.replacement));
    for(const section of sections) {
      if(u.forbidden.test(section.text)||u.invalidUnicode.test(section.text))fail("export_unsafe_text");
      const view=u.matchView(section.text), found=[];
      for(const pattern of replacements) {pattern.lastIndex=0;if(pattern.test(view.normalized))fail("export_replacement_collision");pattern.lastIndex=0;}
      for(const {term,pattern} of patterns) {
        pattern.lastIndex=0;
        for(const match of view.normalized.matchAll(pattern)) {
          const start=view.boundaries.get(match.index),end=view.boundaries.get(match.index+match[0].length);
          if(start===undefined||end===undefined)fail("export_unsafe_text");
          found.push({section_key:section.key,entity_id:term.entity_id,term_revision:term.revision,start:view.codepoints[start],end:view.codepoints[end],original:section.text.slice(start,end),replacement:term.replacement});
        }
      }
      found.sort((a,b)=>a.start-b.start||b.end-a.end||a.entity_id.localeCompare(b.entity_id));
      const distinct=[],lastByEntity=new Map();
      for(const next of found) {
        const previous=lastByEntity.get(next.entity_id);
        if(previous&&previous.start<=next.start&&previous.end>=next.end)continue;
        distinct.push(next);lastByEntity.set(next.entity_id,next);if(occurrences.length+distinct.length>limits.occurrences)fail("export_too_large");
      }
      for(const occurrence of distinct)occurrences.push({id:`O${occurrences.length+1}`,...occurrence});
    }
    return {terms,sections,coverage,occurrences,parties:[...parties.values()],map_json:JSON.stringify({terms,parties:[...parties.values()]})};
  }
  function transform(section, decisions, occurrences, map_json) {
    const approved=occurrences.filter(o=>o.section_key===section.key&&decisions.get(o.id)==="approve").sort((a,b)=>a.start-b.start||a.end-b.end);
    const chars=Array.from(section.text),spans=[];let cursor=0,text="",points=0;
    for(const o of approved) {
      if(o.start<cursor)fail("export_ambiguous_occurrence");
      const prefix=chars.slice(cursor,o.start).join("");text+=prefix;points+=o.start-cursor;
      const start=points;text+=o.replacement;points+=u.count(o.replacement);
      spans.push({entity_id:o.entity_id,original_start:o.start,original_end:o.end,derivative_start:start,derivative_end:points,original:o.original,replacement:o.replacement});cursor=o.end;
    }
    text+=chars.slice(cursor).join("");
    return {text,original_text:section.text,map_json,spans,requires_human_review:true,external_eligible:false};
  }
  function build(input, decisions) {
    const inspected=inspect(input),decisionMap=new Map(),occurrenceIds=new Set(inspected.occurrences.map(o=>o.id));
    if(!Array.isArray(decisions)||decisions.length!==inspected.occurrences.length)fail("export_unreviewed_occurrence");
    for(const d of decisions) {
      if(!u.record(d)||!occurrenceIds.has(d.id)||decisionMap.has(d.id)||!["approve","exclude"].includes(d.decision))fail("export_unreviewed_occurrence");
      decisionMap.set(d.id,d.decision);
    }
    const private_question=transform(inspected.sections[0],decisionMap,inspected.occurrences,inspected.map_json);
    const private_sections=inspected.sections.slice(1).map(section=>({id:section.key,kind:section.kind,
      original_key:section.kind==="source"?`${section.source.document_key}:${section.source.version_key}:${section.source.format==="pdf"?section.source.page:section.source.start}`:section.original_key,
      ...(section.kind==="source"?{source:section.source}:{attribution:section.attribution}),transformation:transform(section,decisionMap,inspected.occurrences,inspected.map_json)}));
    const sections=inspected.sections.slice(1).map((section,index)=>({id:section.key,kind:section.kind,
      ...(section.kind==="source"?{source:section.neutral}:{attribution:section.attribution}),text:private_sections[index].transformation.text}));
    const parties=inspected.parties.map(p=>({id:p.handle,persona:inspected.terms.find(t=>t.entity_id===p.entity_id).replacement,procedural_role:p.procedural_role}));
    const outbound={version:3,question:private_question.text,parties,coverage:inspected.coverage,sections};const outbound_json=JSON.stringify(outbound);
    if(u.byteLength(outbound_json)>limits.packet_bytes)fail("export_too_large");
    return {...outbound,outbound_json,map_json:inspected.map_json,private_question,private_sections,private_occurrences:inspected.occurrences.map(o=>({...o,decision:decisionMap.get(o.id)})),requires_human_review:true};
  }
  return {PROJECTION_V3_LIMITS:limits,inspectProjectionV3:inspect,buildProjectionV3Core:build};
};
