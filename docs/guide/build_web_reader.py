#!/usr/bin/env python3
"""Build the CourtOS reader from the shared manuscript and adapted Rule & Reason engine."""
from pathlib import Path
import json,html,re,hashlib
BASE=Path(__file__).resolve().parent
L={
'de':dict(book='Buch',text='Fortlaufend',chapter='Kapitel',opening='Auftakt',cover='Umschlag',contents='Inhalt',previous='Zurück',next='Weiter',page='Seite',pages='Seiten',close='Zurück zum Text',source='Quelle',sources='Alle Quellen',pdf='PDF herunterladen',app='CourtOS öffnen',read='Lesen',keyboard='Buchseiten. Mit den Pfeiltasten oder am Seitenrand umblättern.',hint='Am Seitenrand ziehen oder mit den Pfeilen blättern.',fallback='Die vollständige fortlaufende Leseansicht ist verfügbar.',work='Arbeitsbuch',languages='Sprache',title='Das Gericht im Zeitalter der KI.',intro='Zweck, Urteilskraft und ein prüfbarer Arbeitsalltag.',lines=['Das Gericht','im Zeitalter','der KI.']),
'fr':dict(book='Livre',text='Texte continu',chapter='Chapitre',opening='Ouverture',cover='Couverture',contents='Sommaire',previous='Précédent',next='Suivant',page='Page',pages='Pages',close='Retour au texte',source='Source',sources='Toutes les sources',pdf='Télécharger le PDF',app='Ouvrir CourtOS',read='Lire',keyboard='Pages du livre. Utilisez les flèches ou le bord des pages.',hint='Faites glisser le bord d’une page ou utilisez les flèches.',fallback='Le texte intégral reste disponible en lecture continue.',work='Guide pratique',languages='Langue',title='Le tribunal à l’ère de l’IA.',intro='Finalité, discernement et travail vérifiable.',lines=['Le tribunal','à l’ère','de l’IA.']),
'it':dict(book='Libro',text='Testo continuo',chapter='Capitolo',opening='Apertura',cover='Copertina',contents='Indice',previous='Indietro',next='Avanti',page='Pagina',pages='Pagine',close='Torna al testo',source='Fonte',sources='Tutte le fonti',pdf='Scaricare il PDF',app='Aprire CourtOS',read='Leggere',keyboard='Pagine del libro. Usate le frecce o il bordo delle pagine.',hint='Trascinate il bordo di una pagina o usate le frecce.',fallback='Il testo integrale resta disponibile nella lettura continua.',work='Guida pratica',languages='Lingua',title='Il tribunale nell’era dell’IA.',intro='Finalità, giudizio e lavoro verificabile.',lines=['Il tribunale','nell’era','dell’IA.']),
'en':dict(book='Book',text='Continuous',chapter='Chapter',opening='Opening',cover='Cover',contents='Contents',previous='Previous',next='Next',page='Page',pages='Pages',close='Back to the text',source='Source',sources='All sources',pdf='Download PDF',app='Open CourtOS',read='Read',keyboard='Book pages. Use the arrow keys or drag a page edge.',hint='Drag a page edge or use the arrows.',fallback='The complete continuous text remains available.',work='Practical guide',languages='Language',title='The court in the age of AI.',intro='Purpose, judgment and work that can be checked.',lines=['The court','in the age','of AI.'])}
LEGACY_ANCHORS={'quality':'later','test':'later','local':'first-steps','public':'first-steps'}
def esc(s):return html.escape(str(s),quote=True)
def rich(s,lang):
 s=esc(s).replace('\n','<br>')
 s=re.sub(r'\[(\d+(?:, \d+)*)\]',lambda m:'<sup class="references">'+', '.join(f'<a class="noteref" data-source="{n}" href="#source-{n}" aria-label="{L[lang]["source"]} {n}">{n}</a>' for n in m.group(1).split(', '))+'</sup>',s)
 return re.sub(r'https://[^\s<]+',lambda m:'<a href="'+m[0].rstrip('.,;:!?')+'" target="_blank" rel="noopener noreferrer">'+m[0].rstrip('.,;:!?')+'</a>'+m[0][len(m[0].rstrip('.,;:!?')):],s)
def block(b,lang):
 heading=f'<h3>{esc(b["heading"])}</h3>' if b.get('heading') else ''
 if b['type'] in ['text','note']:return f'<div class="{("note" if b["type"]=="note" else "text-block")}">{heading}<p>{rich(b["body"],lang)}</p></div>'
 if b['type'] in ['items','flow']:return '<div class="list-block">'+heading+f'<ol class="{("flow" if b["type"]=="flow" else "checklist")}">'+''.join(f'<li>{rich(t,lang)}</li>' for t in b['items'])+'</ol></div>'
 return '<div class="link-block">'+heading+'<ul class="links">'+''.join(f'<li><a href="{esc(u)}" target="_blank" rel="noopener noreferrer">{esc(t)}</a></li>' for t,u in b['items'])+'</ul></div>'
def blocks(items,lang,sources=False):
 out=[];i=0
 while i<len(items):
  b=items[i];m=re.match(r'(\d+)\. ',b['items'][0][0]) if sources and b['type']=='links' and b['items'] else None
  if m:
   out.append(f'<div class="source-entry" id="source-{m[1]}" tabindex="-1">'+block(b,lang))
   if i+1<len(items) and items[i+1]['type']=='text':i+=1;out.append(block(items[i],lang))
   out.append('</div>')
  else:out.append(block(b,lang))
  i+=1
 return ''.join(out)
def build(books=None):
 books=books or json.loads((BASE/'manuscript/content.json').read_text());out=BASE/'output';out.mkdir(exist_ok=True)
 script=(BASE/'folio-reader.js').read_bytes();css=(BASE/'folio-reader.css').read_bytes();tag=hashlib.sha256(script+css).hexdigest()[:12]
 (out/'reader.js').write_bytes(script);(out/'style.css').write_bytes(css)
 def head(lang,scripted=True):return f'<!doctype html><html lang="{lang}-CH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title><link rel="stylesheet" href="style.css?v={tag}">'+(f'<script src="reader.js?v={tag}" defer></script>' if scripted else '')+'</head>'
 def languages(lang):return f'<nav class="language" aria-label="{L[lang]["languages"]}">'+''.join(f'<a href="{k}.html#book-title" lang="{k}" title="{esc(b["language"])}"'+(' aria-current="page"' if k==lang else '')+f'>{k.upper()}</a>' for k,b in books.items())+'</nav>'
 for lang,b in books.items():
  l=L[lang];cover=b['pages'][0];chapters=b['pages'][1:]
  toc='<ol class="toc">'+''.join(f'<li><a href="#{esc(p["id"])}"><span class="toc-number">{i:02}</span><span>{esc(p["title"].replace(chr(10)," "))}</span></a></li>' for i,p in enumerate(chapters,1))+'</ol>'
  links=f'<div class="toc-links"><a href="pdf/courtos-{lang}.pdf">{l["pdf"]} ↗</a><a href="https://sandbox.swisslaw.io/research">{l["app"]} ↗</a></div>'
  body=head(lang)+f'<body><a class="skip" href="#main">{l["read"]}</a><header class="site-header"><a class="wordmark" href="index.html">CourtOS</a>{languages(lang)}</header><div id="reader-controls" class="reader-toolbar" hidden><div class="reader-location"><button type="button" class="reader-contents" data-contents aria-haspopup="dialog" aria-controls="contents-dialog">{l["contents"]}</button><label class="visually-hidden" for="reader-chapter">{l["chapter"]}</label><select id="reader-chapter" aria-label="{l["chapter"]}"></select></div><div class="reader-mode" role="group" aria-label="{l["read"]}"><button type="button" id="reader-book-mode" aria-pressed="false">{l["book"]}</button><button type="button" id="reader-text-mode" aria-pressed="true">{l["text"]}</button></div></div>'
  body+=f'<main id="reading-source" data-cover-lines="{esc(json.dumps(l["lines"],ensure_ascii=False))}"><div id="main" tabindex="-1"></div><section class="opening" id="start"><h1 id="book-title">{rich(cover["title"],lang)}</h1><p class="subtitle">{rich(cover["lead"],lang)}</p><div class="opening-note"><p>Jonas Hertner</p><p>{esc(cover["edition"])}<br>{esc(b["date"])}</p></div><p class="premise">{esc(cover["statement"])}</p></section>'
  body+=f'<section class="chapter-directory" id="chapter-directory"><h2>{l["contents"]}</h2><ol>'+''.join(f'<li><a class="directory-link" href="#{esc(p["id"])}"><span class="directory-number">{i:02}</span><span class="directory-label">{esc(p["title"].replace(chr(10)," "))}</span><span class="directory-folio" aria-hidden="true"></span></a></li>' for i,p in enumerate(chapters,1))+'</ol>'+links+'</section><div class="part">'
  for i,p in enumerate(chapters,1):
   aliases=''.join(f'<span id="{old}" class="legacy-anchor" aria-hidden="true"></span>' for old,new in LEGACY_ANCHORS.items() if new==p['id'])
   body+=f'<details open class="chapter" id="{esc(p["id"])}"><summary><span class="chapter-number">{i:02}</span><span><span class="chapter-title">{rich(p["title"],lang)}</span><span class="chapter-question">{rich(p["lead"],lang)}</span></span></summary><div class="chapter-body">{aliases}{blocks(p["blocks"],lang,p["id"]=="sources")}</div></details>'
  body+='</div></main>'
  body+=f'<section class="book-reader" id="book-reader" aria-label="{l["book"]}" hidden><div class="reader-canvas"><div class="book-stage"><div class="page-book" id="page-book"></div></div></div><nav class="reader-navigation" aria-label="{l["book"]}"><button type="button" id="reader-prev">← {l["previous"]}</button><p id="reader-status" aria-live="polite"></p><button type="button" id="reader-next">{l["next"]} →</button></nav><p class="reader-hint">{l["hint"]}</p></section>'
  for name,title,content in [('contents',l['contents'],languages(lang)+toc+links),('source',l['source'],f'<div id="source-dialog-content"></div><a class="all-sources" href="#sources">{l["sources"]} →</a>')]:body+=f'<dialog id="{name}-dialog" aria-labelledby="{name}-dialog-title"><div class="dialog-bar"><h2 id="{name}-dialog-title">{title}</h2><button type="button" data-close-dialog>{l["close"]} ×</button></div>{content}</dialog>'
  body+='<script type="application/json" id="reader-labels">'+json.dumps(l,ensure_ascii=False).replace('<','\\u003c')+'</script><footer class="colophon"><span>Timeless · Paper Mono</span><a href="https://github.com/jonashertner/CourtOS">CourtOS · Code</a></footer></body></html>'
  (out/f'{lang}.html').write_text(body)
 index=head('de',False)+'<body><header class="site-header"><a class="wordmark" href="index.html">CourtOS</a><span class="eyebrow">'+ ' / '.join(k.upper() for k in books)+'</span></header><main class="home"><p class="eyebrow">Jonas Hertner · Arbeitsbuch</p><h1>Das Gericht<br>im Zeitalter der KI.</h1><p class="lead">Zweck, Urteilskraft und ein prüfbarer Arbeitsalltag.</p><div class="cards">'
 for lang,b in books.items():index+=f'<article class="card" lang="{lang}"><p class="eyebrow">{esc(b["language"])}</p><h2>{esc(b["title"])}</h2><div class="cover-links"><a href="{lang}.html">{L[lang]["read"]} →</a><a href="pdf/courtos-{lang}.pdf">PDF ↗</a></div></article>'
 index+='</div><p class="smallprint"><a href="https://sandbox.swisslaw.io/research">CourtOS öffnen ↗</a></p></main></body></html>';(out/'index.html').write_text(index)
 return {'languages':list(books),'reader_asset_tag':tag,'reference':'Rule & Reason measured page reader, adapted for CourtOS'}
if __name__=='__main__':print(json.dumps(build(),ensure_ascii=False))
