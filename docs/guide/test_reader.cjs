// Run after build: node --test docs/guide/test_reader.cjs (uses frontend dev dependencies).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../frontend/node_modules/jsdom');
const base = __dirname;
const script = fs.readFileSync(path.join(base, 'reader.js'), 'utf8');
function reader(lang = 'de', hash = '#purpose') {
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'output', lang + '.html'), 'utf8'), {
    url: 'https://guide.example/' + lang + '.html' + hash, runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window: w } = dom;
  w.matchMedia = () => ({ matches: false });
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.eval(script);
  return { dom, w, d: w.document };
}
for (const lang of ['de','fr','it']) {
  test(lang + ': each reference opens its exact source, retains reviewed scope, and leaves reading position intact', () => {
    const { dom, w, d } = reader(lang);
    const link = d.querySelector('#purpose [data-source="1"]');
    const original = d.querySelector('#source-1');
    const before = w.location.href;
    link.click();
    assert.equal(d.querySelector('#source-dialog').open, true);
    assert.equal(w.location.href, before);
    assert.equal(d.querySelector('#source-dialog-content').textContent, original.textContent);
    assert.equal(d.querySelector('#source-dialog-content a').href, 'https://academic.oup.com/oxford-law-pro/book/41081');
    assert.equal(d.querySelector('#source-dialog-content a').target, '_blank');
    assert.equal(d.querySelector('#source-dialog-content [id]'), null, 'dialog does not duplicate source anchor IDs');
    d.querySelector('#source-dialog [data-close-dialog]').click();
    assert.equal(d.querySelector('#source-dialog').open, false);
    assert.equal(w.location.href, before);
    dom.window.close();
  });
  test(lang + ': no-JavaScript references resolve to individual sources with locator text', () => {
    const d = new JSDOM(fs.readFileSync(path.join(base, 'output', lang + '.html'), 'utf8')).window.document;
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
  });
}
test('chapter navigation carries only the corresponding chapter into language links', () => {
  const { dom, w, d } = reader();
  const select = d.querySelector('#chapter');
  select.value = 'check';
  select.dispatchEvent(new w.Event('change'));
  assert.equal(w.location.hash, '#check');
  assert.equal(d.querySelector('header a[lang="fr"]').getAttribute('href'), 'fr.html#check');
  assert.equal(d.activeElement.id, 'heading-check');
  dom.window.close();
});
test('a page that cannot fit falls back to the complete reading text, without clipped partial pages', () => {
  const { dom, w, d } = reader();
  d.querySelector('#book-spread').getBoundingClientRect = () => ({ width: 1200 });
  Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get() { return 100; } });
  Object.defineProperty(w.HTMLElement.prototype, 'scrollHeight', { get() { return 200; } });
  d.querySelector('[data-mode="book"]').click();
  assert.equal(d.body.classList.contains('book-mode'), false);
  assert.equal(d.querySelector('#book-reader').hidden, true);
  assert.equal(d.querySelectorAll('main .section').length, 14);
  assert.equal(d.querySelector('[data-mode="read"]').getAttribute('aria-pressed'), 'true');
  assert.match(d.querySelector('#reader-status').textContent, /fortlaufende/);
  dom.window.close();
});
