from pathlib import Path
import json, hashlib, html, re, zipfile
from urllib.request import urlopen
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, TextStringObject

ROOT=Path(__file__).resolve().parent
FONTS=ROOT.parent/'guide/.font-cache'
# The cached guide fonts are the already licensed technical PDF instances.
(ROOT/'qa').mkdir(exist_ok=True)
(ROOT/'output/pdf').mkdir(parents=True,exist_ok=True)
for name,filename in [('Serif','Serif.ttf'),('Sans','Sans.ttf'),('SansBold','SansBold.ttf'),('Mono','Mono.ttf')]:
 pdfmetrics.registerFont(TTFont(name,str(FONTS/filename)))
W,H=595.276,841.89; M=52; CW=W-2*M
INK=HexColor('#20211f');MUTED=HexColor('#646761');RULE=HexColor('#d7d9d3')
styles={
 'title':ParagraphStyle('title',fontName='Serif',fontSize=29,leading=32,textColor=INK),
 'case':ParagraphStyle('case',fontName='Sans',fontSize=11,leading=15,textColor=MUTED),
 'body':ParagraphStyle('body',fontName='Serif',fontSize=12,leading=16.4,textColor=INK),
 'notice':ParagraphStyle('notice',fontName='SansBold',fontSize=9.5,leading=13,textColor=INK),
 'small':ParagraphStyle('small',fontName='Sans',fontSize=9,leading=12,textColor=MUTED),
}
def para(c,text,y,kind='body'):
 p=Paragraph(html.escape(text),styles[kind]);_,h=p.wrap(CW,1000);p.drawOn(c,M,y-h);return y-h
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
data=json.loads((ROOT/'content.json').read_text())
filing=json.loads((ROOT/'filing.json').read_text())
report={'checked_date':'2026-10-10','pdf_metadata':'Info dictionary and XMP removed','font_family':'Timeless Serif / Timeless Sans / Paper Mono','cases':[]}
sourcekey={'version':1,'policy':data['source_policy'],'cases':[]}
for case in data['cases']:
 arrangement=next(value for value in filing['cases'] if value['id']==case['id'])
 loc=data['labels'][case['language']];target=ROOT/'output/pdf'/case['id'];target.mkdir(parents=True,exist_ok=True)
 case_report={'id':case['id'],'case_number':arrangement['caseNumber'],'documents':[]}; source={'id':case['id'],'fictitious_case_number':arrangement['caseNumber'],'parties':arrangement['parties'],'party_note':arrangement['partyNote'],'judgment':case['judgment'],'documents':[]}
 # Current primary full texts were read before authoring. Rendering never requires
 # network access. A later archive request encountered the court's anti-bot page;
 # do not hash that as if it were the judgment or claim an immutable HTML capture.
 source.update({'checked_date':'2026-10-10','verification':'Official full text read through primary-source browser results and HTTP before authoring. A subsequent HTML archival attempt was blocked; no full-source archive hash is claimed.'})
 for n,doc in enumerate(case['documents'],1):
  filename=f"{doc['id']}_{case['language']}.pdf";raw=ROOT/'qa'/f"{case['id']}-{doc['id']}-raw.pdf";out=target/filename
  c=canvas.Canvas(str(raw),pagesize=(W,H),pageCompression=1,invariant=1)
  c.setTitle('');c.setAuthor('');c.setSubject('');c.setKeywords('')
  c.setFillColor(INK);c.setFont('Serif',16);c.drawString(M,H-43,'CourtOS')
  c.setFillColor(MUTED);c.setFont('Mono',8);c.drawRightString(W-M,H-41,f"{case['id']} / {n:02d} / 04")
  c.setStrokeColor(RULE);c.setLineWidth(.55);c.line(M,H-58,W-M,H-58)
  y=H-80;y=para(c,arrangement['caseNumberLabel']+': '+arrangement['caseNumber'],y,'small')-10
  y=para(c,doc['title'],y,'title')-10;y=para(c,case['title'],y,'case')-10
  party=arrangement['parties'][n-1]['label'] if n<=2 else arrangement['sharedFolder']
  y=para(c,party,y,'small')-12
  if case['id']=='FR-01' and n==2:y=para(c,arrangement['partyNote'],y,'small')-8
  y=para(c,loc['notice'],y,'notice')-4;y=para(c,loc['sub'],y,'small')-27
  for p in doc['paragraphs']:
   c.setFillColor(MUTED);c.setFont('Mono',8);c.drawString(M,y,p['id']);y-=8
   y=para(c,p['text'],y)-18
  assert y>118,(case['id'],doc['id'],y)
  c.setStrokeColor(RULE);c.line(M,99,W-M,99)
  link=f"{loc['source']}: Bundesgericht {case['judgment']['number']}, {case['judgment']['date']}"
  p=Paragraph(f'<link href="{html.escape(case["judgment"]["url"],quote=True)}"><u>{html.escape(link)}</u></link>',styles['small']);_,ph=p.wrap(CW,100);p.drawOn(c,M,83-ph)
  para(c,loc['footer'],58,'small')
  c.setFillColor(MUTED);c.setFont('Mono',8);c.drawRightString(W-M,46,'1 / 1')
  c.showPage();c.save()
  r=PdfReader(raw);w=PdfWriter();w.clone_document_from_reader(r);w._info=None;w.root_object.pop(NameObject('/Metadata'),None);w.root_object[NameObject('/Lang')]=TextStringObject(case['language']+'-CH')
  with out.open('wb') as f:w.write(f)
  r=PdfReader(out);text='\n'.join(page.extract_text() or '' for page in r.pages)
  assert len(r.pages)==1 and not r.metadata and '/Metadata' not in r.trailer['/Root']
  assert '\ufffd' not in text and '\u00df' not in text
  normalize=lambda s:re.sub(r'\s+','',s)
  for p in doc['paragraphs']:
   assert p['id'] in text and normalize(p['text']) in normalize(text),(doc['id'],p['id'])
  case_report['documents'].append({'id':doc['id'],'file':str(out.relative_to(ROOT)),'pages':1,'bytes':out.stat().st_size,'sha256':sha(out),'extracted_utf8_bytes':len(text.encode()),'extracted_characters':len(text),'body_bottom_y':round(y,2)})
  source['documents'].append({'id':doc['id'],'role':doc['role'],'party_label':doc['party_label'],'classification':'reconstructed_exercise_document','paragraphs':[{'id':p['id'],'locator':p['judgment_locator']} for p in doc['paragraphs']]})
  raw.unlink()
 case_report['total_extracted_utf8_bytes']=sum(x['extracted_utf8_bytes'] for x in case_report['documents'])
 case_report['total_extracted_characters']=sum(x['extracted_characters'] for x in case_report['documents'])
 assert case_report['total_extracted_utf8_bytes']<=10000,case_report
 with zipfile.ZipFile(ROOT/'output'/f"{case['id']}-input-pdfs.zip",'w',zipfile.ZIP_DEFLATED) as z:
  for p in sorted(target.glob('*.pdf')):z.write(p,p.name)
 report['cases'].append(case_report);sourcekey['cases'].append(source)
sourcekey['editorial_changes']=[
 'New concise party-position texts, document titles, paragraph IDs and ordering are didactic reconstructions, not original pleadings.',
 'Fictitious CourtOS filing numbers and anonymised party names from the official judgments appear in headers and the filing manifest. The historical factual paragraphs are unchanged. No addresses, signatures, logos, personal birth dates or medical details were added.',
 'Party subfolders organise submissions; common reconstructed exhibits are not assigned to a party. FR distinguishes the original recipient Z.________ from her procedural successor A.Z.________.',
 'Exhibits are narrative extracts of the judgment account, not fabricated bank records, signed contracts or email screenshots.',
 'The EN case is an unofficial English reconstruction of a German judgment. Only the two marked short phrases in D03-P02 reproduce original English wording quoted by the judgment.',
 'Scope is deliberately narrower than the full cases: DE rent reduction; FR villa funding; IT first repayment instalment; EN authority. Procedural side disputes are omitted and the omission is not a claim that they did not occur.',
 'FR: facts B.a and consideration5/5.4.2 give total transfers of2,222,000FF; consideration5.4.1 once says2,000,000FF. The input follows B.a and separately identifies purchase price; no silent correction of the official source.'
]
(ROOT/'sourcekey.json').write_text(json.dumps(sourcekey,ensure_ascii=False,indent=2)+'\n')
(ROOT/'qa/build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
