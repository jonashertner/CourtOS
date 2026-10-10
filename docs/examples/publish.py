"""Copy verified examples into the ordinary authenticated application assets.

Run build.py first. This only writes generated example files and their fixed
frontend catalog; it never uploads to a user library or starts an analysis.
"""
from pathlib import Path
import hashlib,json,shutil

ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[1]
PUBLIC=REPO/'frontend/public/examples'
PUBLIC.mkdir(parents=True,exist_ok=True)
data=json.loads((ROOT/'content.json').read_text())
report=json.loads((ROOT/'qa/build-report.json').read_text())
cases=[]
for case,result in zip(data['cases'],report['cases'],strict=True):
 assert case['id']==result['id'] and result['total_extracted_utf8_bytes']<=10000
 folder=PUBLIC/case['id'];folder.mkdir(exist_ok=True)
 output={'id':case['id'],'language':case['language'],'title':case['title'],'judgment':case['judgment'],'documents':[]}
 for document,receipt in zip(case['documents'],result['documents'],strict=True):
  source=ROOT/receipt['file'];assert hashlib.sha256(source.read_bytes()).hexdigest()==receipt['sha256']
  filename=f"CourtOS_{case['id']}_{document['id']}.pdf"
  shutil.copy2(source,folder/filename)
  output['documents'].append({'id':document['id'],'title':document['title'],'role':document['role'],'party':document['party_label'] or '', 'filename':filename,'path':f"/examples/{case['id']}/{filename}",'sha256':receipt['sha256'],'bytes':receipt['bytes']})
 output['textBytes']=result['total_extracted_utf8_bytes'];cases.append(output)
for name in ('sourcekey.json','expected-findings.json'):shutil.copy2(ROOT/name,PUBLIC/name)
types='''import type { CaseReviewRole } from "@mike/contracts";
import type { CourtOSLocale } from "./courtosLocale";

export type ExampleMatter = { id: string; language: CourtOSLocale; title: string; judgment: {court:string;number:string;date:string;url:string;original_language:string;locators:readonly string[]}; documents: readonly {id:string;title:string;role:CaseReviewRole;party:string;filename:string;path:string;sha256:string;bytes:number}[];textBytes:number};

// Generated from the reviewed docs/examples sources. No answer key enters this catalog.
'''
(REPO/'frontend/src/app/lib/exampleMatters.ts').write_text(types+'export const EXAMPLE_MATTERS: readonly ExampleMatter[] = '+json.dumps(cases,ensure_ascii=False,indent=2)+';\n')
print('Published sixteen generated PDFs and fixed catalog; no account data changed.')
