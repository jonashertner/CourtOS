// Source and navigation contracts. Browser QA covers real measured pagination.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../frontend/node_modules/jsdom');
const base = __dirname;
const script = fs.readFileSync(path.join(base, 'folio-reader.js'), 'utf8');
function reader(lang = 'de', hash = '#purpose') {
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'output', lang + '.html'), 'utf8'), {
    url: 'https://guide.example/' + lang + '.html' + hash, runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window: w } = dom;
  w.matchMedia = () => ({ matches: true, addEventListener(){} });
  w.ResizeObserver = class { observe(){} disconnect(){} };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.localStorage.setItem('courtos-guide-reading-mode','text');
  w.eval(script);
  return { dom, w, d: w.document };
}
for (const lang of ['de','fr','it']) {
  test(lang + ': an exact source note preserves chapter, content and focus', () => {
    const { dom, w, d } = reader(lang);
    const link = d.querySelector('#purpose [data-source="1"]');
    const original = d.querySelector('#source-1');
    const before = w.location.href;
    link.focus(); link.click();
    assert.equal(d.querySelector('#source-dialog').open, true);
    assert.equal(w.location.href, before);
    assert.equal(d.querySelector('#source-dialog-content').textContent, original.textContent);
    assert.equal(d.querySelector('#source-dialog-content a').href, 'https://academic.oup.com/oxford-law-pro/book/41081');
    assert.equal(d.querySelector('#source-dialog-content a').target, '_blank');
    assert.equal(d.querySelector('#source-dialog-content [id]'), null);
    d.querySelector('#source-dialog [data-close-dialog]').click();
    assert.equal(d.querySelector('#source-dialog').open, false);
    assert.equal(d.activeElement,link);
    assert.equal(w.location.href, before);
    dom.window.close();
  });
  test(lang + ': without JavaScript every reference resolves to source and reviewed locator', () => {
    const dom = new JSDOM(fs.readFileSync(path.join(base, 'output', lang + '.html'), 'utf8'));
    const d=dom.window.document;
    const references = [...d.querySelectorAll('[data-source]')];
    assert.ok(references.length >= 6);
    for (const ref of references) {
      const source = d.querySelector(ref.getAttribute('href'));
      assert.ok(source?.classList.contains('source-entry'));
      assert.ok(source.querySelector('a[href^="https://"]'));
      assert.ok(source.querySelector('.text-block').textContent.length > 30);
    }
    assert.equal(d.querySelectorAll('.source-entry[id]').length, 5);
    assert.equal(new Set([...d.querySelectorAll('[id]')].map(x=>x.id)).size, d.querySelectorAll('[id]').length);
    assert.equal(d.querySelectorAll('details.chapter[open]').length,13);
    dom.window.close();
  });
}
test('chapter navigation preserves corresponding chapter in all language links, including mobile contents', () => {
  const { dom, w, d } = reader();
  const select = d.querySelector('#reader-chapter');
  select.value = 'check'; select.dispatchEvent(new w.Event('change'));
  assert.equal(w.location.hash, '#check');
  for (const link of d.querySelectorAll('.language a[lang="fr"]')) assert.equal(link.getAttribute('href'), 'fr.html#check');
  assert.ok(d.querySelector('#contents-dialog .language a[lang="fr"]'));
  assert.equal(d.querySelector('#check').open,true);
  dom.window.close();
});
test('chapter names preserve spaces at typographic line breaks and controls do not expose unavailable editions', () => {
  const { dom, d } = reader();
  assert.equal(d.querySelector('option[value="purpose"]').textContent,'01 · Vom Zweck her denken');
  const editions=Object.keys(JSON.parse(fs.readFileSync(path.join(base,'manuscript/content.json'),'utf8')));
  assert.deepEqual([...d.querySelectorAll('.site-header .language a')].map(link=>link.lang),editions);
  assert.equal(d.querySelector('#reader-text-mode').getAttribute('aria-pressed'),'true');
  dom.window.close();
});

function positionContinuousChapter(d, id) {
  const rect=(top,bottom)=>({top,bottom,left:0,right:500,width:500,height:bottom-top,x:0,y:top,toJSON(){return this;}});
  d.querySelector('#reader-controls').getBoundingClientRect=()=>rect(0,60);
  const groups=[d.querySelector('.opening'),d.querySelector('#chapter-directory'),...d.querySelectorAll('details.chapter')];
  const selected=groups.findIndex(group=>group.id===id);
  groups.forEach((group,index)=>{
    group.getBoundingClientRect=()=>index<selected?rect(-800,-100):index===selected?rect(-80,800):rect(900+(index-selected)*800,1700+(index-selected)*800);
  });
  const target=d.querySelector(`#${id} .text-block p`);
  target.getBoundingClientRect=()=>rect(90,250);
  return target;
}
test('passive continuous scrolling updates language and chapter controls without changing history', async () => {
  const {dom,w,d}=reader('fr','#purpose');
  positionContinuousChapter(d,'check');
  const before=w.location.href, entries=w.history.length;
  w.dispatchEvent(new w.Event('scroll'));
  await new Promise(resolve=>w.requestAnimationFrame(resolve));
  assert.equal(d.querySelector('#reader-chapter').value,'check');
  for(const link of d.querySelectorAll('.language a[lang="it"]'))assert.equal(link.getAttribute('href'),'it.html#check');
  assert.equal(w.location.href,before);
  assert.equal(w.history.length,entries);
  dom.window.close();
});
test('a language or contents click resolves the visible chapter before a pending scroll frame', () => {
  const {dom,w,d}=reader('de','#purpose');
  positionContinuousChapter(d,'check');
  d.querySelector('[data-contents]').click();
  assert.equal(d.querySelector('#contents-dialog').open,true);
  const link=d.querySelector('#contents-dialog .language a[lang="fr"]');
  assert.equal(link.getAttribute('href'),'fr.html#check');
  d.querySelector('#contents-dialog [data-close-dialog]').click();
  positionContinuousChapter(d,'sources');
  const headerLink=d.querySelector('.site-header .language a[lang="fr"]');
  headerLink.addEventListener('click',event=>event.preventDefault());
  headerLink.click();
  assert.equal(headerLink.getAttribute('href'),'fr.html#sources');
  assert.equal(w.location.hash,'#purpose');
  dom.window.close();
});
test('scrolling to the header preserves the last chapter for language links; explicit opening still resets it', async () => {
  const {dom,w,d}=reader('de','#role');
  positionContinuousChapter(d,'role');
  w.dispatchEvent(new w.Event('scroll'));
  await new Promise(resolve=>w.requestAnimationFrame(resolve));
  const before=w.location.href;
  const headerLink=d.querySelector('.site-header .language a[lang="fr"]');
  headerLink.addEventListener('click',event=>event.preventDefault());
  const groups=[d.querySelector('.opening'),d.querySelector('#chapter-directory'),...d.querySelectorAll('details.chapter')];
  const rect=(top,bottom)=>({top,bottom,height:bottom-top,width:500,left:0,right:500});
  for(const front of [0,1]) {
    groups.forEach((group,index)=>{group.getBoundingClientRect=()=>index<front?rect(-500,-20):rect(90+(index-front)*700,750+(index-front)*700);});
    w.dispatchEvent(new w.Event('scroll'));
    await new Promise(resolve=>w.requestAnimationFrame(resolve));
    headerLink.click();
    assert.equal(headerLink.getAttribute('href'),'fr.html#role');
    assert.equal(d.querySelector('#reader-chapter').value,'role');
    assert.equal(w.location.href,before);
  }
  const select=d.querySelector('#reader-chapter');
  for(const target of ['chapter-directory','book-title']) {
    select.value=target;select.dispatchEvent(new w.Event('change'));
    assert.equal(headerLink.getAttribute('href'),'fr.html#'+target);
    assert.equal(w.location.hash,'#'+target);
  }
  dom.window.close();
});
test('switching to book after scrolling uses the visible original block, not the old fragment', () => {
  const {dom,w,d}=reader('de','#purpose');
  const target=positionContinuousChapter(d,'check');
  // No physical layout is claimed here; browser QA validates measured reflow.
  w.Range.prototype.getClientRects=()=>[];
  d.querySelector('#reader-book-mode').click();
  assert.equal(d.documentElement.dataset.reader,'book');
  assert.equal(d.querySelector('#reader-chapter').value,'check');
  assert.equal(w.location.hash,'#check');
  assert.ok(target.closest('.folio'));
  assert.equal(target.closest('.folio').getAttribute('aria-hidden'),'false');
  d.querySelector('#reader-text-mode').click();
  assert.ok(d.querySelector('#reading-source').contains(target));
  assert.ok(d.querySelector('#check').contains(target));
  dom.window.close();
});
test('resize preserves an explicitly selected chapter on the right-hand leaf of a spread', async () => {
  const {dom,w,d}=reader('fr','#purpose');
  let width=1000;
  const canvas=d.querySelector('.reader-canvas');
  canvas.style.padding='0px';
  Object.defineProperty(canvas,'clientWidth',{get:()=>width});
  Object.defineProperty(canvas,'clientHeight',{get:()=>700});
  w.Range.prototype.getClientRects=()=>[];
  d.querySelector('#reader-book-mode').click();
  assert.equal(d.querySelector('#book-reader').dataset.orientation,'landscape');
  const selected=d.getElementById('role');
  assert.equal(Number(selected.closest('.folio').dataset.pageIndex)%2,1,'fixture chapter begins on the right-hand leaf');
  const id=selected.id;
  const select=d.querySelector('#reader-chapter');
  select.value=id;select.dispatchEvent(new w.Event('change'));
  assert.equal(select.value,id);
  width=375;w.dispatchEvent(new w.Event('resize'));
  await new Promise(resolve=>w.requestAnimationFrame(resolve));
  assert.equal(d.querySelector('#book-reader').dataset.orientation,'portrait');
  assert.equal(select.value,id);
  assert.equal(w.location.hash,'#'+id);
  assert.equal(d.getElementById(id).closest('.folio').getAttribute('aria-hidden'),'false');
  dom.window.close();
});
