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
FONT_FILES={'Sans':'NotoSans-Regular.ttf','SansBold':'NotoSans-Bold.ttf',
            'Serif':'Caladea-Regular.ttf','SerifBold':'Caladea-Bold.ttf'}

def resolve_fonts():
 """Use an explicit font tree, or installed system fonts; never substitute."""
 configured=os.environ.get('COURTOS_GUIDE_FONT_DIR')
 roots=[Path(configured).expanduser()] if configured else [
  Path('/usr/share/fonts'),Path('/usr/local/share/fonts'),
  Path.home()/'.local/share/fonts',Path.home()/'.fonts',
  Path('/Library/Fonts'),Path.home()/'Library/Fonts',
  Path(os.environ.get('WINDIR','C:/Windows'))/'Fonts',
 ]
 resolved={}
 for name,filename in FONT_FILES.items():
  for root in roots:
   if not root.is_dir():continue
   matches=sorted(root.rglob(filename))
   if matches:
    resolved[name]=matches[0];break
  if name not in resolved:
   raise SystemExit(f'Missing font: {filename}. Set COURTOS_GUIDE_FONT_DIR '
                    'to a directory containing the four static TTF files '
                    'listed in README.md (subdirectories are searched).')
 return resolved

# Resolve all fonts before writing outputs, so a missing font fails cleanly.
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
W,H=176/25.4*72,250/25.4*72
M=42; CW=W-2*M; INK=colors.HexColor('#151515'); MUTED=colors.HexColor('#5a5a5a'); PALE=colors.HexColor('#f1f0ed'); RULE=colors.HexColor('#cfceca')
STYLES={
 'body':ParagraphStyle('body',fontName='Sans',fontSize=10.6,leading=15,textColor=INK,spaceAfter=0),
 'small':ParagraphStyle('small',fontName='Sans',fontSize=10.1,leading=14,textColor=INK),
 'heading':ParagraphStyle('heading',fontName='SansBold',fontSize=10.8,leading=14.5,textColor=INK),
 'lead':ParagraphStyle('lead',fontName='Sans',fontSize=12,leading=17,textColor=MUTED),
 'title':ParagraphStyle('title',fontName='SerifBold',fontSize=29,leading=31,textColor=INK),
 'cover':ParagraphStyle('cover',fontName='SerifBold',fontSize=42,leading=43,textColor=INK),
 'flow':ParagraphStyle('flow',fontName='SansBold',fontSize=9.7,leading=12.7,textColor=INK,alignment=1),
 'link':ParagraphStyle('link',fontName='Sans',fontSize=10,leading=15,textColor=INK),
}

def rich(s):
 escaped=html.escape(s).replace('\n','<br/>')
 return re.sub(r'(https://[^\s<]+)',lambda m:f'<link href="{m.group(1)}"><u>{m.group(1)}</u></link>',escaped)
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
  c.setFillColor(PALE);c.rect(M,y-height,CW,height,stroke=0,fill=1)
  c.setStrokeColor(INK);c.setLineWidth(1.7);c.line(M,y-height,M,y)
  hp.drawOn(c,M+12,y-11-hh);bp.drawOn(c,M+12,y-17-hh-bh)
  return y-height-11
 if heading:
  y=draw_para(c,heading,y,'heading');y-=5
 if typ=='text':return draw_para(c,b['body'],y)-10
 if typ=='items':
  for i,item in enumerate(b['items'],1):
   p,h=para(item,'body',CW-19)
   c.setFillColor(MUTED);c.setFont('Sans',9);c.drawString(M,y-11,str(i).zfill(2));p.drawOn(c,M+19,y-h);y-=h+5
  return y-5
 if typ=='links':
  for label,url in b['items']:
   p=Paragraph(f'<link href="{html.escape(url,quote=True)}"><u>{html.escape(label)}</u></link>',STYLES['link']);_,h=p.wrap(CW,1000);p.drawOn(c,M,y-h);y-=h+4
  return y-5
 raise ValueError(typ)

report={'format':'B5 (176 x 250 mm)','languages':{},'metadata_policy':'No PDF Info dictionary or XMP; HTML title and author metadata blank.'}
for lang,book in BOOKS.items():
 raw=QA/f'courtos-{lang}-unprocessed.pdf';final=OUT/'pdf'/f'courtos-{lang}.pdf'
 c=canvas.Canvas(str(raw),pagesize=(W,H),pageCompression=1)
 c.setTitle('');c.setAuthor('');c.setSubject('');c.setKeywords('')
 lower=[]
 for i,p in enumerate(book['pages'],1):
  c.bookmarkPage(p['id']);c.addOutlineEntry(p['title'].replace('\n',' '),p['id'],0)
  c.setFillColor(INK);c.setFont('SansBold',11);c.drawString(M,H-29,'CourtOS')
  c.setFillColor(MUTED);c.setFont('Sans',8);c.drawRightString(W-M,H-29,book['language']+'  /  '+book['date'])
  c.setStrokeColor(RULE);c.setLineWidth(.6);c.line(M,H-40,W-M,H-40)
  c.setFillColor(MUTED);c.setFont('Sans',8.5);c.drawString(M,H-60,str(i).zfill(2)+'  /  '+book['label'])
  y=H-78
  y=draw_para(c,p['title'],y,'cover' if i==1 else 'title')-13
  y=draw_para(c,p['lead'],y,'lead')-15
  for b in p['blocks']:y=draw_block(c,b,y)
  lower.append(round(y,2))
  if y<46:raise RuntimeError(f'Overflow {lang} page {i}: bottom {y:.2f}')
  c.setStrokeColor(RULE);c.line(M,34,W-M,34)
  c.setFillColor(MUTED);c.setFont('Sans',8);c.drawString(M,21,book['pilot']);c.drawRightString(W-M,21,f'{i} / 7')
  c.showPage()
 c.save()
 reader=PdfReader(raw);writer=PdfWriter();writer.clone_document_from_reader(reader);writer._info=None;writer.root_object.pop(NameObject('/Metadata'),None);writer.root_object[NameObject('/Lang')]=TextStringObject(lang+'-CH')
 with final.open('wb') as f:writer.write(f)
 verified=PdfReader(final);assert len(verified.pages)==7;assert not verified.metadata;assert '/Metadata' not in verified.trailer['/Root']
 extracted='\n'.join(p.extract_text() for p in verified.pages)
 assert '\ufffd' not in extracted and '\u00df' not in extracted
 assert 'CourtOS' in extracted and 'Cloudflare' in extracted and 'Unsloth' in extracted and 'Gemma' in extracted and '124' not in extracted
 report['languages'][lang]={'pages':7,'lowest_content_y':lower,'sha256':hashlib.sha256(final.read_bytes()).hexdigest(),'bytes':final.stat().st_size,'metadata':None,'xmp_present':False}
 raw.unlink()

CSS='''*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f3f2ef;color:#171717;font:17px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:inherit;text-underline-offset:.2em}a:focus-visible{outline:3px solid #151515;outline-offset:5px}header{padding:1.2rem 2rem;border-bottom:1px solid #d2d0cb;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}.brand{font-size:1.4rem;font-weight:750;text-decoration:none}.language{display:flex;gap:1rem;flex-wrap:wrap}.language [aria-current]{font-weight:700}.layout{display:grid;grid-template-columns:16rem minmax(0,49rem);gap:2.5rem;max-width:74rem;margin:2.2rem auto;padding:0 1.5rem}aside{position:sticky;top:1.5rem;align-self:start;font-size:.9rem}aside ol{padding-left:1.4rem}aside li{padding:.25rem 0}aside .pdf{display:inline-block;margin:1rem 0;padding:.65rem .8rem;border:1px solid #777}.section{scroll-margin-top:1rem;background:#fff;margin:0 0 2rem;padding:3rem 3.6rem;border:1px solid #e0ded9}h1,h2{font-family:Georgia,"Times New Roman",serif;line-height:1.1;font-weight:600;margin:.8rem 0 1rem;letter-spacing:-.02em}h1{font-size:3rem}h2{font-size:2.25rem}h3{font-size:1rem;line-height:1.45;margin:1.4rem 0 .35rem}p{margin:.35rem 0 1rem}.eyebrow{font-size:.75rem;color:#62615e;text-transform:uppercase;letter-spacing:.11em}.lead{font-size:1.1rem;color:#565552;line-height:1.5;margin-bottom:1.8rem}.note{background:#f2f1ee;border-left:3px solid #171717;padding:1rem 1.2rem;margin:1.3rem 0;font-size:.95rem}.note h3{margin:0 0 .45rem}.note p{margin:0}.flow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.65rem;margin:1.5rem 0;padding:0;list-style:none}.flow li{border:1px solid #bbb9b3;padding:.8rem .5rem;text-align:center;font-size:.85rem;font-weight:650;line-height:1.45}.checklist{padding-left:1.5rem}.checklist li{margin:.65rem 0}.links{list-style:none;padding:0}.links li{margin:.5rem 0}.section-footer{border-top:1px solid #d2d0cb;padding-top:1.15rem;margin-top:2rem;display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;font-size:.8rem}.section-footer .language{gap:.8rem}.cover-links{display:flex;flex-wrap:wrap;gap:.8rem}.cover-links a{display:inline-block;border:1px solid #171717;padding:.65rem .9rem}.home{max-width:70rem;margin:4rem auto;padding:0 1.5rem}.home h1{max-width:48rem}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.2rem;margin:2rem 0}.card{background:#fff;border:1px solid #d2d0cb;padding:1.7rem}.card h2{font-size:1.9rem}.muted{color:#62615e;font-size:.9rem}.skip{position:absolute;left:-10000px;top:auto}.skip:focus{left:1rem;top:1rem;background:white;padding:1rem;z-index:5}@media(max-width:850px){.layout{display:block;margin-top:1.3rem}aside{position:static;margin-bottom:1.5rem}aside ol{columns:2;column-gap:2rem}aside li{break-inside:avoid}.section{padding:2rem 1.5rem}.cards{grid-template-columns:1fr}h1{font-size:2.5rem}h2{font-size:2rem}header{padding:1rem 1.5rem}}@media(max-width:430px){aside ol{columns:1}.flow{gap:.35rem}.flow li{font-size:.75rem;padding:.6rem .25rem}.section{padding:1.6rem 1.2rem}.layout{padding:0 .7rem}}@media print{body{background:white;font-size:11pt}header,aside,.section-footer,.skip{display:none}.layout{display:block;padding:0;margin:0;max-width:none}.section{break-after:page;border:0;margin:0;padding:12mm}.section:last-child{break-after:auto}.note,.flow li{break-inside:avoid}h1{font-size:32pt}h2{font-size:26pt}a{text-decoration:none}.home{margin:0}}'''
(OUT/'style.css').write_text(CSS)

def language_links(current,anchor='start'):
 return '<nav class="language" aria-label="Language">'+''.join(f'<a href="{k}.html#{anchor}" lang="{k}"'+(' aria-current="page"' if k==current else '')+f'>{v["language"]}</a>' for k,v in BOOKS.items())+'</nav>'
def htext(s):
 escaped=html.escape(s).replace('\n','<br>')
 return re.sub(r'(https://[^\s<]+)',lambda m:f'<a href="{m.group(1)}">{m.group(1)}</a>',escaped)
def block_html(b):
 heading=f'<h3>{html.escape(b["heading"])}</h3>' if b.get('heading') else ''
 if b['type'] in ('text','note'):
  body=heading+f'<p>{htext(b["body"])}</p>'
  return f'<div class="note">{body}</div>' if b['type']=='note' else body
 if b['type'] in ('items','flow'):
  cls='flow' if b['type']=='flow' else 'checklist';return heading+f'<ol class="{cls}">'+''.join(f'<li>{htext(x)}</li>' for x in b['items'])+'</ol>'
 return heading+'<ul class="links">'+''.join(f'<li><a href="{html.escape(url,quote=True)}">{html.escape(label)}</a></li>' for label,url in b['items'])+'</ul>'
head=lambda lang:f'<!doctype html><html lang="{lang}-CH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title><link rel="stylesheet" href="style.css"></head>'
for lang,book in BOOKS.items():
 body=head(lang)+f'<body><a class="skip" href="#content">{book["contents"]}</a><header><a class="brand" href="index.html">CourtOS</a>{language_links(lang)}</header><div class="layout"><aside><strong>{book["contents"]}</strong><ol>'
 for section in book['pages']:body+=f'<li><a href="#{section["id"]}">{html.escape(section["title"].replace(chr(10)," "))}</a></li>'
 body+=f'</ol><a class="pdf" href="pdf/courtos-{lang}.pdf">{book["pdf_label"]}</a><p class="muted">{book["date"]}<br>{book["pilot"]}</p></aside><main id="content">'
 for i,p in enumerate(book['pages']):
  tag='h1' if i==0 else 'h2';body+=f'<section class="section" id="{p["id"]}" aria-labelledby="heading-{p["id"]}"><div class="eyebrow">{i+1:02} / {book["label"]}</div><{tag} id="heading-{p["id"]}">{htext(p["title"])}</{tag}><p class="lead">{htext(p["lead"])}</p>'
  body+=''.join(block_html(b) for b in p['blocks'])
  body+='<div class="section-footer">'+language_links(lang,p['id'])+'<span>'
  if i:body+=f'<a href="#{book["pages"][i-1]["id"]}">{book["previous"]}</a> · '
  if i<6:body+=f'<a href="#{book["pages"][i+1]["id"]}">{book["next"]}</a>'
  else:body+=f'<a href="#start">{book["back"]}</a>'
  body+='</span></div></section>'
 body+='</main></div></body></html>'
 (OUT/f'{lang}.html').write_text(body)
index=head('de')+'<body><header><a class="brand" href="index.html">CourtOS</a><span class="muted">DE / FR / IT</span></header><main class="home"><div class="eyebrow">Pilot · 09.10.2026</div><h1>Am Dossier arbeiten.<br>Travailler sur un dossier.<br>Lavorare su un fascicolo.</h1><p class="lead">Drei kurze Leitfäden. Trois guides courts. Tre brevi guide.</p><div class="cards">'
for lang,book in BOOKS.items():
 index+=f'<article class="card" lang="{lang}-CH"><div class="eyebrow">{book["language"]}</div><h2>{html.escape(book["title"])}</h2><p>{html.escape(book["pilot"])}</p><div class="cover-links"><a href="{lang}.html">{book["contents"]}</a><a href="pdf/courtos-{lang}.pdf">PDF</a></div></article>'
index+='</div><p><a href="https://sandbox.swisslaw.io/pilot">CourtOS Pilot</a> · <a href="https://sandbox.swisslaw.io/hybrid/">Geführter Fall / Cas guidé / Caso guidato</a> · <a href="https://github.com/jonashertner/CourtOS">Code</a></p></main></body></html>'
(OUT/'index.html').write_text(index)
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
report['html_checks']={'languages':3,'links':'all internal targets and anchors verified','remote_assets':False,'scripts':False}
(QA/'build-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(report,indent=2,ensure_ascii=False))
