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
  w.scrollTo = ({top}) => { Object.defineProperty(w, 'scrollY', {value:top, configurable:true}); };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.localStorage.setItem('courtos-guide-reading-mode','text');
  w.eval(script);
  return { dom, w, d: w.document };
}
for (const lang of ['de','fr','it','en']) {
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
    assert.ok(references.length >= 5);
    for (const ref of references) {
      const source = d.querySelector(ref.getAttribute('href'));
      assert.ok(source?.classList.contains('source-entry'));
      assert.ok(source.querySelector('a[href^="https://"]'));
      assert.ok(source.querySelector('.text-block').textContent.length > 30);
    }
    assert.equal(d.querySelectorAll('.source-entry[id]').length, 5);
    assert.equal(new Set([...d.querySelectorAll('[id]')].map(x=>x.id)).size, d.querySelectorAll('[id]').length);
    assert.equal(d.querySelectorAll('details.chapter[open]').length,9);
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
  assert.equal(d.querySelector('option[value="purpose"]').textContent,'01 · Bei der Aufgabe beginnen');
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

for (const [old, current] of Object.entries({quality:'later',test:'later',local:'first-steps',public:'first-steps'})) {
  test('old shared chapter link '+old+' still opens '+current+' in all editions', () => {
    for (const lang of ['de','fr','it','en']) {
      const {dom,w,d}=reader(lang,'#'+old);
      assert.ok(d.getElementById(old)?.closest('#'+current));
      assert.equal(d.querySelector('#reader-chapter').value,current);
      for(const link of d.querySelectorAll('.language a')) assert.ok(link.getAttribute('href').endsWith('#'+current));
      assert.equal(w.location.hash,'#'+old);
      dom.window.close();
    }
  });
}


const nextFrame = w => new Promise(resolve => w.requestAnimationFrame(resolve));
async function settledFrames(w) { for (let index=0; index<4; index++) await nextFrame(w); }
// Deterministic geometry is a unit regression for manuscript identity/offset
// and event ordering; it does not stand in for browser layout acceptance.
function movingTextGeometry(w,d,id) {
  const target=d.querySelector(`#${id} .text-block p`);
  const groups=[d.querySelector('.opening'),d.querySelector('#chapter-directory'),...d.querySelectorAll('details.chapter')];
  const selected=groups.findIndex(group=>group.id===id);
  const state={width:375,paragraphTop:2000,anchoringShift:0};
  Object.defineProperty(w,'innerWidth',{get:()=>state.width,configurable:true});
  const rect=(top,height)=>({top,bottom:top+height,left:0,right:state.width,width:state.width,height});
  d.querySelector('#reader-controls').getBoundingClientRect=()=>rect(0,60);
  d.querySelector('#reading-source').getBoundingClientRect=()=>rect(-w.scrollY,9000);
  groups.forEach((group,index)=>{
    group.getBoundingClientRect=()=>rect(state.paragraphTop-100+(index-selected)*1000-w.scrollY,900);
  });
  target.getBoundingClientRect=()=>rect(state.paragraphTop+state.anchoringShift-w.scrollY,500);
  w.Range.prototype.getClientRects=function(){
    if(!target.contains(this.startContainer))return[];
    const line=Math.floor(this.startOffset/(state.width<600?25:50));
    return[rect(state.paragraphTop+state.anchoringShift+line*22-w.scrollY,22)];
  };
  return {state,target};
}
test('continuous resize preserves the last visible word despite a scroll event arriving after reflow', async()=>{
  const {dom,w,d}=reader('de','#work');
  const {state,target}=movingTextGeometry(w,d,'work');
  w.scrollTo({top:state.paragraphTop+88-76});
  w.dispatchEvent(new w.Event('scroll'));await nextFrame(w);
  assert.equal(d.querySelector('#reader-chapter').value,'work');
  const words=[...target.textContent.matchAll(/\S+/g)].map(match=>match.index);
  const offset=words.find(start=>Math.floor(start/25)*22+22>88);
  assert.ok(offset>0);
  const url=w.location.href,history=w.history.length;
  state.width=768;state.paragraphTop=950;
  // The stale pixel distance now exposes a later chapter. A scroll callback
  // must not replace the saved pre-resize paragraph before resize restoration.
  w.dispatchEvent(new w.Event('scroll'));w.dispatchEvent(new w.Event('resize'));
  await settledFrames(w);
  assert.equal(w.scrollY,950+Math.floor(offset/50)*22-76);
  assert.equal(d.querySelector('#reader-chapter').value,'work');
  assert.equal(d.querySelector('.language a[lang="fr"]').getAttribute('href'),'fr.html#work');
  assert.equal(w.location.href,url);assert.equal(w.history.length,history);
  state.width=320;state.paragraphTop=2400;
  w.dispatchEvent(new w.Event('resize'));await settledFrames(w);
  assert.equal(w.scrollY,2400+Math.floor(offset/25)*22-76);
  assert.equal(w.location.href,url);assert.equal(w.history.length,history);
  dom.window.close();
});
test('book to continuous restores the original block under the toolbar after a delayed layout shift', async()=>{
  const {dom,w,d}=reader('de','#work');
  const target=positionContinuousChapter(d,'work');
  w.Range.prototype.getClientRects=()=>[];
  d.querySelector('#reader-book-mode').click();
  assert.equal(d.querySelector('#reader-chapter').value,'work');
  const page=target.closest('.folio');
  // Book opening is its first original token, not the enclosing chapter's
  // pre-restore pixel position; identify that original node in the fixture.
  const first=page.querySelector('.folio-body .chapter-number');
  assert.ok(first);
  let absoluteTop=2200;
  const rect=(top,height)=>({top,bottom:top+height,left:0,right:320,width:320,height});
  first.getBoundingClientRect=()=>rect(absoluteTop-w.scrollY,30);
  const url=w.location.href,history=w.history.length;
  d.querySelector('#reader-text-mode').click();
  assert.equal(d.querySelector('#reader-chapter').value,'work');
  assert.equal(w.scrollY,2200-76);
  absoluteTop+=45; // e.g. details/source reinsertion and scroll anchoring
  w.dispatchEvent(new w.Event('scroll'));
  await settledFrames(w);
  assert.equal(w.scrollY,2245-76);
  assert.ok(d.querySelector('#reading-source').contains(first));
  assert.equal(d.querySelector('#reader-chapter').value,'work');
  assert.equal(w.location.href,url);assert.equal(w.history.length,history);
  dom.window.close();
});

// Test pagination decisions with deterministic heights. Actual type metrics,
// 320px phone, 768px tablet and desktop composition remain browser QA.
function openingGeometry(w,d,capacity) {
  const state={capacity};
  const canvas=d.querySelector('.reader-canvas');
  canvas.style.padding='0px';
  Object.defineProperty(canvas,'clientWidth',{get:()=>1000});
  Object.defineProperty(canvas,'clientHeight',{get:()=>state.capacity+200});
  d.head.insertAdjacentHTML('beforeend','<style>.folio-body,p{font-size:16px;line-height:20px}</style>');
  const openingHeight=body=>{
    const opening=body.querySelector('.opening');
    if(!opening)return 0;
    let height=opening.querySelector('h1')?(body.closest('.folio-opening-compact')?15:60):0;
    for(const node of opening.querySelectorAll('h1,p')) {
      height+=node.matches('h1')?100:node.matches('.subtitle')?120:
        node.matches('.premise')?Math.ceil(node.textContent.length/25)*20:
        node.matches('.opening-note p:last-child')?40:20;
    }
    return height;
  };
  Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get(){return this.matches('.folio-body')?state.capacity:0;},configurable:true});
  Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get(){return this.matches('.folio-body')?600:0;},configurable:true});
  Object.defineProperty(w.HTMLElement.prototype,'scrollHeight',{get(){return this.matches('.folio-body')?openingHeight(this):0;},configurable:true});
  w.HTMLElement.prototype.getBoundingClientRect=function(){
    const height=this.matches('.folio-body')?state.capacity:this.matches('.opening')?openingHeight(this.parentElement):0;
    return{top:0,bottom:height,left:0,right:600,width:600,height};
  };
  w.HTMLElement.prototype.getClientRects=function(){return[this.getBoundingClientRect()];};
  w.Range.prototype.getClientRects=function(){return Array.from({length:Math.ceil(this.toString().length/25)},(_,i)=>({top:i*20,bottom:(i+1)*20,left:0,right:200,width:200,height:20}));};
  return state;
}
for(const lang of ['de','fr','it','en']) {
  test(lang+': a cramped opening uses whitespace and keeps its premise intact through resize and text mode',async()=>{
    const {dom,w,d}=reader(lang,'#book-title');
    const premise=d.querySelector('.premise'),original=premise.textContent;
    const baseline=340+Math.ceil(original.length/25)*20;
    const state=openingGeometry(w,d,baseline-20);
    d.querySelector('#reader-book-mode').click();
    assert.equal(d.querySelectorAll('.folio .premise').length,1);
    assert.equal(d.querySelector('.folio .premise'),premise);
    assert.equal(premise.closest('.folio'),d.querySelector('.folio #book-title').closest('.folio'));
    assert.ok(premise.closest('.folio-opening-compact'));
    state.capacity=baseline+100;
    w.dispatchEvent(new w.Event('resize'));await settledFrames(w);
    assert.equal(d.querySelectorAll('.folio-opening-compact').length,0,'ample leaves regain their original spacing');
    assert.equal(d.querySelector('.folio .premise'),premise);
    assert.equal(premise.textContent,original);
    d.querySelector('#reader-text-mode').click();
    assert.equal(d.querySelector('#reading-source .premise'),premise);
    assert.equal(premise.textContent,original);
    dom.window.close();
  });
  test(lang+': when the whole opening cannot fit, the complete premise moves to a fresh leaf',()=>{
    const {dom,w,d}=reader(lang,'#book-title');
    const premise=d.querySelector('.premise'),original=premise.textContent;
    openingGeometry(w,d,300);
    d.querySelector('#reader-book-mode').click();
    assert.equal(d.querySelectorAll('.folio .premise').length,1);
    assert.equal(d.querySelector('.folio .premise'),premise);
    assert.notEqual(premise.closest('.folio'),d.querySelector('.folio #book-title').closest('.folio'));
    assert.equal(premise.textContent,original);
    assert.ok(premise.closest('.folio-body').scrollHeight<=300);
    dom.window.close();
  });
}
