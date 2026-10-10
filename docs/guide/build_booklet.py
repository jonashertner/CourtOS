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
M=36; CW=W-2*M; INK=colors.HexColor('#203037'); MUTED=colors.HexColor('#626762'); PALE=colors.HexColor('#f8f6ef'); RULE=colors.HexColor('#cfcec5')
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
 escaped=re.sub(r'\[(\d+(?:, \d+)*)\]',r'<super><link href="#sources">\1</link></super>',escaped)
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

(OUT/'style.css').write_text((BASE/'reader.css').read_text())
(OUT/'reader.js').write_text((BASE/'reader.js').read_text())

def language_links(current,anchor='start'):
 return '<nav class="language" aria-label="Language">'+''.join(f'<a href="{k}.html#{anchor}" lang="{k}"'+(' aria-current="page"' if k==current else '')+f'>{v["language"]}</a>' for k,v in BOOKS.items())+'</nav>'
def htext(s):
 escaped=html.escape(s).replace('\n','<br>')
 escaped=re.sub(r'\[(\d+(?:, \d+)*)\]',r'<a class="noteref" href="#sources"><sup>\1</sup></a>',escaped)
 return re.sub(r'(https://[^\s<]+)',lambda m:autolink(m.group(1), pdf=False),escaped)
def block_html(b):
 heading=f'<h3>{html.escape(b["heading"])}</h3>' if b.get('heading') else ''
 if b['type'] in ('text','note'):
  body=heading+f'<p>{htext(b["body"])}</p>'
  return f'<div class="note">{body}</div>' if b['type']=='note' else body
 if b['type'] in ('items','flow'):
  cls='flow' if b['type']=='flow' else 'checklist';return heading+f'<ol class="{cls}">'+''.join(f'<li>{htext(x)}</li>' for x in b['items'])+'</ol>'
 return heading+'<ul class="links">'+''.join(f'<li><a href="{html.escape(url,quote=True)}">{html.escape(label)}</a></li>' for label,url in b['items'])+'</ul>'
ASSET_TAG=hashlib.sha256((BASE/'reader.css').read_bytes()+(BASE/'reader.js').read_bytes()).hexdigest()[:12]
head=lambda lang:f'<!doctype html><html class="no-js" lang="{lang}-CH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title><link rel="stylesheet" href="style.css?v={ASSET_TAG}"><script src="reader.js?v={ASSET_TAG}" defer></script></head>'
LABELS={
 'de':{'book':'Buch','read':'Lesen','chapter':'Kapitel','previous':'Zurück','next':'Weiter','work':'Arbeitsbuch','edition':'Arbeitsausgabe 01','source':'Quellen und Gestaltung'},
 'fr':{'book':'Livre','read':'Lecture','chapter':'Chapitre','previous':'Précédent','next':'Suivant','work':'Guide pratique','edition':'Édition de travail 01','source':'Sources et composition'},
 'it':{'book':'Libro','read':'Lettura','chapter':'Capitolo','previous':'Indietro','next':'Avanti','work':'Guida pratica','edition':'Edizione di lavoro 01','source':'Fonti e composizione'},
}
for lang,book in BOOKS.items():
 labels=LABELS[lang]
 body=head(lang)+f'<body><a class="skip" href="#content">{book["contents"]}</a><header><a class="brand" href="index.html">CourtOS <small>{labels["work"].upper()}</small></a>{language_links(lang)}</header>'
 body+=f'<div class="reader-tools"><div class="reader-location"><label for="chapter">{labels["chapter"]}</label><select id="chapter" aria-label="{labels["chapter"]}">'
 for section in book['pages']:body+=f'<option value="{section["id"]}">{html.escape(section["title"].replace(chr(10)," "))}</option>'
 body+=f'</select></div><div class="modes" aria-label="{labels["read"]}"><button type="button" data-mode="book" aria-pressed="false">{labels["book"]}</button><button type="button" data-mode="read" aria-pressed="true">{labels["read"]}</button></div></div>'
 body+=f'<div class="layout"><aside aria-label="{book["contents"]}"><div class="nav-heading">{book["contents"]}</div><ol>'
 for section in book['pages']:body+=f'<li><a href="#{section["id"]}">{html.escape(section["title"].replace(chr(10)," "))}</a></li>'
 body+=f'</ol><a class="pdf" href="pdf/courtos-{lang}.pdf">{book["pdf_label"]} ↗</a><p class="muted">{book["date"]}<br>{labels["edition"]}</p></aside><main id="content">'
 for i,p in enumerate(book['pages']):
  cover=p.get('kind')=='cover';tag='h1' if cover else 'h2'
  body+=f'<section class="section'+(' cover' if cover else '')+f'" id="{p["id"]}" aria-labelledby="heading-{p["id"]}"><div class="eyebrow"><span>{html.escape(p.get("part",book["label"]))}</span><span class="mark">{i:02}</span></div><{tag} id="heading-{p["id"]}">{htext(p["title"])}</{tag}><p class="lead">{htext(p["lead"])}</p>'
  if cover:body+=f'<p class="author">Jonas Hertner</p><p class="cover-statement">{html.escape(p["statement"])}</p><div class="cover-bottom"><span>{book["date"]}<br>{p["edition"]}</span><span class="cover-sign">CourtOS</span></div>'
  else:
   body+='<div class="prose">'+''.join(block_html(b) for b in p['blocks'])+'</div>'
   body+=f'<div class="section-footer"><span>CourtOS · {i+1:02}</span><span class="section-prevnext">'
   if i:body+=f'<a href="#{book["pages"][i-1]["id"]}">{book["previous"]}</a> · '
   if i<len(book['pages'])-1:body+=f'<a href="#{book["pages"][i+1]["id"]}">{book["next"]}</a>'
   else:body+=f'<a href="#start">{book["back"]}</a>'
   body+='</span></div>'
  body+='</section>'
 body+=f'</main></div><nav class="spread-controls" aria-label="{labels["book"]}"><button type="button" id="previous-spread">← {labels["previous"]}</button><span id="reading-progress" aria-live="polite"></span><button type="button" id="next-spread">{labels["next"]} →</button></nav>'
 body+='<footer class="colophon">Timeless Serif · Timeless Sans · Paper Mono. <a href="https://www.timeless.co/type/license">Timeless</a> / <a href="https://github.com/paper-design/paper-mono">Paper Mono</a>. <a href="https://github.com/jonashertner/CourtOS">CourtOS · AGPL-3.0</a>.</footer></body></html>'
 (OUT/f'{lang}.html').write_text(body)
index=head('de')+'<body><header><a class="brand" href="index.html">CourtOS <small>ARBEITSBUCH</small></a><span class="smallprint">DE / FR / IT</span></header><main class="home"><div class="eyebrow">Jonas Hertner · Arbeitsausgabe 01</div><h1>Das Gericht<br>im Zeitalter der KI.</h1><p class="lead">Zweck, Urteilskraft und ein prüfbarer Arbeitsalltag.<br>Ein Arbeitsbuch in drei Sprachen.</p><div class="cards">'
for lang,book in BOOKS.items():
 index+=f'<article class="card" lang="{lang}-CH"><div class="eyebrow">{book["language"]}</div><h2>{html.escape(book["title"])}</h2><div class="cover-links"><a href="{lang}.html">{LABELS[lang]["read"]} →</a><a href="pdf/courtos-{lang}.pdf">PDF ↗</a></div></article>'
index+='</div><p class="smallprint"><a href="https://sandbox.swisslaw.io/research">CourtOS Recherche</a> · <a href="https://sandbox.swisslaw.io/library">Meine Bibliothek</a> · <a href="https://github.com/jonashertner/CourtOS">Code</a></p></main></body></html>'
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
report['html_checks']={'languages':3,'links':'all internal targets and anchors verified','remote_assets':False,'scripts':'local reader.js; no network requests or persistent storage'}
(QA/'build-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(report,indent=2,ensure_ascii=False))
