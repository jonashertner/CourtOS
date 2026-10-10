#!/usr/bin/env python3
"""Build the reviewed content.json as three print booklets and an offline web guide."""
from pathlib import Path
import json, re, html, hashlib, os
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, TextStringObject

BASE=Path(__file__).resolve().parent
FONT_FILES={'Sans':'Sans.ttf','SansBold':'SansBold.ttf',
            'Serif':'Serif.ttf','SerifBold':'SerifBold.ttf','Mono':'Mono.ttf'}

def resolve_fonts():
 root=Path(os.environ.get('COURTOS_GUIDE_FONT_DIR',str(BASE/'.font-cache'))).expanduser()
 resolved={name:root/file for name,file in FONT_FILES.items()}
 missing=[str(path) for path in resolved.values() if not path.is_file()]
 if missing:raise SystemExit('Run prepare_fonts.py before the guide build. Missing: '+', '.join(missing))
 return resolved
FONTS=resolve_fonts()
OUT=BASE/'output'; QA=BASE/'qa'
OUT.mkdir(exist_ok=True); (OUT/'pdf').mkdir(exist_ok=True); QA.mkdir(exist_ok=True)
BOOKS=json.loads((BASE/'manuscript/content.json').read_text())
# Human-readable manuscripts are derived from the same reviewed source.
for lang,book in BOOKS.items():
 lines=[f"# {book['title']}",f"{book['label']} | {book['date']}",'']
 for number,section in enumerate(book['pages'],1):
  lines += [f"## {number}. {section['title'].replace(chr(10),' ')}",section['lead'],'']
  for block in section['blocks']:
   if block.get('heading'): lines += [f"### {block['heading']}"]
   if block['type'] in ('text','note'): lines += [block['body'],'']
   elif block['type'] in ('items','flow'): lines += ['- '+value for value in block['items']]+['']
   else: lines += [f"- [{label}]({url})" for label,url in block['items']]+['']
 draft='\n'.join(lines)+'\n'; assert '\u00df' not in draft
 (BASE/'manuscript'/f'{lang}.md').write_text(draft)
for name,font_path in FONTS.items():
 pdfmetrics.registerFont(TTFont(name,str(font_path)))
pdfmetrics.registerFontFamily('Sans',normal='Sans',bold='SansBold',italic='Sans',boldItalic='SansBold')
W,H=180/25.4*72,270/25.4*72
M=36; CW=W-2*M; INK=colors.HexColor('#20211f'); MUTED=colors.HexColor('#63655f'); PALE=colors.white; RULE=colors.HexColor('#dedfd9')
STYLES={
 'body':ParagraphStyle('body',fontName='Serif',fontSize=11,leading=14.5,textColor=INK,spaceAfter=0),
 'small':ParagraphStyle('small',fontName='Sans',fontSize=10.1,leading=14,textColor=INK),
 'heading':ParagraphStyle('heading',fontName='SansBold',fontSize=10.5,leading=14,textColor=INK),
 'lead':ParagraphStyle('lead',fontName='Serif',fontSize=12.3,leading=16,textColor=MUTED),
 'title':ParagraphStyle('title',fontName='Serif',fontSize=32,leading=34,textColor=INK),
 'cover':ParagraphStyle('cover',fontName='Serif',fontSize=49,leading=51,textColor=INK),
 'flow':ParagraphStyle('flow',fontName='SansBold',fontSize=9.7,leading=12.7,textColor=INK,alignment=1),
 'link':ParagraphStyle('link',fontName='Sans',fontSize=10,leading=15,textColor=INK),
}

def autolink(value, *, pdf):
 # Sentence punctuation follows the link; it is not part of the destination.
 url=value.rstrip('.,;:!?')
 suffix=value[len(url):]
 return (f'<link href="{url}"><u>{url}</u></link>' if pdf else f'<a href="{url}">{url}</a>')+suffix

def rich(s):
 escaped=html.escape(s).replace('\n','<br/>')
 escaped=re.sub(r'\[(\d+(?:, \d+)*)\]',lambda m:'<super>'+', '.join(f'<link href="#source-{n}">{n}</link>' for n in m.group(1).split(', '))+'</super>',escaped)
 return re.sub(r'(https://[^\s<]+)',lambda m:autolink(m.group(1), pdf=True),escaped)
def para(s,kind='body',width=CW):
 p=Paragraph(rich(s),STYLES[kind]); _,h=p.wrap(width,1000);return p,h

def draw_para(c,s,y,kind='body',x=M,width=CW):
 p,h=para(s,kind,width);p.drawOn(c,x,y-h);return y-h

def draw_block(c,b,y):
 typ=b['type'];heading=b.get('heading','')
 if typ=='flow':
  gap=12;cell=(CW-2*gap)/3
  ps=[para(label,'flow',cell-16) for label in b['items']]
  height=max(h for _,h in ps)+22
  for i,(p,h) in enumerate(ps):
   x=M+i*(cell+gap);c.setStrokeColor(RULE);c.setLineWidth(.6);c.rect(x,y-height,cell,height,stroke=1,fill=0);p.drawOn(c,x+8,y-(height+h)/2)
   if i<2:
    c.setStrokeColor(MUTED);ax=x+cell+3;ay=y-height/2;c.line(ax,ay,ax+6,ay);c.line(ax+4,ay+2,ax+6,ay);c.line(ax+4,ay-2,ax+6,ay)
  return y-height-16
 if typ=='note':
  hp,hh=para(heading,'heading',CW-24);bp,bh=para(b['body'],'small',CW-24);height=hh+bh+29
  c.setStrokeColor(RULE);c.setLineWidth(.6);c.line(M,y-height,W-M,y-height);c.line(M,y,W-M,y)
  hp.drawOn(c,M+12,y-11-hh);bp.drawOn(c,M+12,y-17-hh-bh)
  return y-height-11
 if heading:
  y=draw_para(c,heading,y,'heading');y-=4
 if typ=='text':return draw_para(c,b['body'],y)-8
 if typ=='items':
  for i,item in enumerate(b['items'],1):
   p,h=para(item,'body',CW-19)
   c.setFillColor(MUTED);c.setFont('Mono',8);c.drawString(M,y-11,str(i).zfill(2));p.drawOn(c,M+19,y-h);y-=h+5
  return y-5
 if typ=='links':
  for label,url in b['items']:
   source=re.match(r'([1-5])\. ',label)
   if source:c.bookmarkHorizontalAbsolute('source-'+source.group(1),y)
   p=Paragraph(f'<link href="{html.escape(url,quote=True)}"><u>{html.escape(label)}</u></link>',STYLES['link']);_,h=p.wrap(CW,1000);p.drawOn(c,M,y-h);y-=h+4
  return y-5
 raise ValueError(typ)

report={'format':'180 x 270 mm','languages':{},'metadata_policy':'No PDF Info dictionary or XMP; HTML title and author metadata blank.','typography':'Timeless Serif / Timeless Sans / Paper Mono; fonts embedded under their respective licences'}
for lang,book in BOOKS.items():
 raw=QA/f'courtos-{lang}-unprocessed.pdf';final=OUT/'pdf'/f'courtos-{lang}.pdf'
 c=canvas.Canvas(str(raw),pagesize=(W,H),pageCompression=1,invariant=1)
 c.setTitle('');c.setAuthor('');c.setSubject('');c.setKeywords('')
 lower=[]
 for i,p in enumerate(book['pages'],1):
  c.bookmarkPage(p['id']);c.addOutlineEntry(p['title'].replace('\n',' '),p['id'],0)
  c.setFillColor(PALE);c.rect(0,0,W,H,stroke=0,fill=1)
  c.setFillColor(INK);c.setFont('Serif',13);c.drawString(M,H-32,'CourtOS')
  c.setFillColor(MUTED);c.setFont('Mono',7);c.drawRightString(W-M,H-31,book['language'].upper()+'  /  01')
  c.setStrokeColor(RULE);c.setLineWidth(.5);c.line(M,H-44,W-M,H-44)
  if p.get('kind')=='cover':
   y=H-85
   c.setFillColor(MUTED);c.setFont('Mono',8);c.drawString(M,y,book['label'].upper());y-=40
   y=draw_para(c,p['title'],y,'cover')-23
   y=draw_para(c,p['lead'],y,'lead',width=CW-50)-22
   c.setFillColor(INK);c.setFont('Sans',10);c.drawString(M,y,'Jonas Hertner');y-=45
   y=draw_para(c,p['statement'],y,'lead',width=CW-25)-25
   c.setStrokeColor(RULE);c.line(M,125,W-M,125)
   c.setFillColor(MUTED);c.setFont('Mono',8);c.drawString(M,109,book['date'])
   c.drawString(M,94,p['edition'])
   c.setFillColor(INK);c.setFont('Serif',12);c.drawRightString(W-M,97,'CourtOS')
   y=min(y,85)
  else:
   c.setFillColor(MUTED);c.setFont('Mono',7.5);c.drawString(M,H-64,str(i-1).zfill(2)+'  /  '+p.get('part',book['label']).upper())
   y=H-78
   y=draw_para(c,p['title'],y,'title')-13
   y=draw_para(c,p['lead'],y,'lead')-15
   for b in p['blocks']:y=draw_block(c,b,y)
  lower.append(round(y,2))
  if y<46:raise RuntimeError(f'Overflow {lang} page {i}: bottom {y:.2f}')
  c.setStrokeColor(RULE);c.line(M,34,W-M,34)
  c.setFillColor(MUTED);c.setFont('Mono',7);c.drawString(M,21,'CourtOS  /  Jonas Hertner');c.drawRightString(W-M,21,f"{i} / {len(book['pages'])}")
  c.showPage()
 c.save()
 reader=PdfReader(raw);writer=PdfWriter();writer.clone_document_from_reader(reader);writer._info=None;writer.root_object.pop(NameObject('/Metadata'),None);writer.root_object[NameObject('/Lang')]=TextStringObject(lang+'-CH')
 with final.open('wb') as f:writer.write(f)
 verified=PdfReader(final);assert len(verified.pages)==len(book['pages']);assert not verified.metadata;assert '/Metadata' not in verified.trailer['/Root']
 extracted='\n'.join(p.extract_text() for p in verified.pages)
 assert '\ufffd' not in extracted and '\u00df' not in extracted
 assert 'CourtOS' in extracted and 'Cloudflare' in extracted and 'Unsloth' in extracted and 'Gemma' in extracted and '124' not in extracted
 report['languages'][lang]={'pages':len(book['pages']),'lowest_content_y':lower,'sha256':hashlib.sha256(final.read_bytes()).hexdigest(),'bytes':final.stat().st_size,'metadata':None,'xmp_present':False}
 raw.unlink()

from build_web_reader import build as build_web_reader
report['web_reader'] = build_web_reader(BOOKS)

# Verify local navigation without fetching remote links or loading any app.
from html.parser import HTMLParser
class Links(HTMLParser):
 def __init__(self):super().__init__();self.links=[];self.ids=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if 'id' in a:self.ids.append(a['id'])
  if tag=='a':self.links.append(a.get('href',''))
for file in OUT.glob('*.html'):
 parser=Links();parser.feed(file.read_text());assert len(parser.ids)==len(set(parser.ids))
 for link in parser.links:
  if link.startswith('https://'):continue
  target,_,anchor=link.partition('#');path=file.parent/target if target else file
  assert path.exists(),(file,link)
  if anchor:
   other=Links();other.feed(path.read_text());assert anchor in other.ids,(file,link)
report['html_checks']={'languages':3,'links':'all internal targets and anchors verified','remote_assets':False,'scripts':'local adapted Rule & Reason reader; no network requests; optional reading-mode localStorage only'}
(QA/'build-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(report,indent=2,ensure_ascii=False))
