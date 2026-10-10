(() => {
  'use strict';
  const sections = [...document.querySelectorAll('main .section')];
  if (!sections.length) return;
  const chapter = document.querySelector('#chapter');
  const modes = [...document.querySelectorAll('[data-mode]')];
  const previous = document.querySelector('#previous-spread');
  const next = document.querySelector('#next-spread');
  const progress = document.querySelector('#reading-progress');
  const bookReader = document.querySelector('#book-reader');
  const spread = document.querySelector('#book-spread');
  const sourceDialog = document.querySelector('#source-dialog');
  const contentsDialog = document.querySelector('#contents-dialog');
  const compact = window.matchMedia('(max-width:600px)');
  const single = window.matchMedia('(max-width:1100px)');
  let book = false;
  let current = 0;
  let leaves = [];
  let leafIndex = 0;
  let resizeTimer;
  let resizing = false;
  let readingTarget;
  let navigating = false;
  let navigationVersion = 0;
  const size = () => single.matches ? 1 : 2;
  const sourceSection = hash => {
    let id;
    try { id = decodeURIComponent(hash.slice(1)); } catch { return -1; }
    const target = document.getElementById(id);
    return sections.indexOf(target?.closest('.section'));
  };
  const initial = sourceSection(location.hash);
  if (initial >= 0) current = initial;
  readingTarget = sections[current];

  function position() {
    chapter.value = sections[current].id;
    document.querySelectorAll('.toc a[href^="#"]').forEach(link => {
      if (link.hash === '#' + sections[current].id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('header .language a').forEach(link => {
      link.href = link.getAttribute('href').split('#')[0] + '#' + sections[current].id;
    });
  }
  function closeDialogs() {
    for (const dialog of [sourceDialog, contentsDialog]) if (dialog.open) dialog.close();
  }
  function navigate(hash, { focus = true, historyMode = 'push' } = {}) {
    const index = sourceSection(hash);
    if (index < 0) return;
    current = index;
    readingTarget = sections[current];
    navigating = true;
    const version = ++navigationVersion;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (version === navigationVersion) navigating = false; }));
    closeDialogs();
    if (location.hash !== hash) history[historyMode + 'State'](null, '', hash);
    position();
    if (book) {
      const id = decodeURIComponent(hash.slice(1));
      let target = leaves.findIndex(leaf => leaf.anchors.includes(id));
      if (target < 0) target = leaves.findIndex(leaf => leaf.chapter === current);
      leafIndex = Math.max(0, target);
      showSpread();
      bookReader.scrollIntoView({ block: 'start' });
      if (focus) bookReader.focus({ preventScroll: true });
    } else {
      const target = document.getElementById(decodeURIComponent(hash.slice(1))) || sections[current];
      target.scrollIntoView({ block: 'start' });
      if (focus) (target.matches('.section') ? target.querySelector('h1,h2') : target).focus({ preventScroll: true });
    }
  }
  function cleanClone(node) {
    const copy = node.cloneNode(true);
    [copy, ...copy.querySelectorAll('[id],[aria-labelledby],[tabindex]')].forEach(el => {
      el.removeAttribute('id');
      el.removeAttribute('aria-labelledby');
      el.removeAttribute('tabindex');
    });
    return copy;
  }
  function paginate() {
    leaves = [];
    const width = spread.getBoundingClientRect().width;
    if (width < 100) return false;
    document.documentElement.style.setProperty('--leaf-height', Math.max(440, Math.min(900, innerHeight - 224)) + 'px');
    const measure = document.createElement('div');
    measure.className = 'book-measuring';
    measure.setAttribute('aria-hidden', 'true');
    measure.inert = true;
    measure.style.width = width / size() + 'px';
    bookReader.append(measure);
    let failure = false;
    sections.forEach((section, chapterIndex) => {
      if (failure) return;
      let leaf, content, count;
      const newLeaf = continued => {
        leaf = document.createElement('article');
        leaf.className = 'book-leaf';
        content = document.createElement('div');
        content.className = 'leaf-content prose';
        leaf.append(content);
        measure.replaceChildren(leaf);
        count = 0;
        const record = { element: leaf, chapter: chapterIndex, anchors: continued ? [] : [section.id] };
        leaves.push(record);
        if (continued) {
          const label = document.createElement('div');
          label.className = 'leaf-continuation';
          label.textContent = [...section.querySelector('h1,h2').childNodes].map(node => node.nodeName === 'BR' ? ' ' : node.textContent).join('');
          content.append(label);
        }
        return record;
      };
      let record = newLeaf(false);
      const units = [...section.children].flatMap(node => {
        if (node.classList.contains('section-footer')) return [];
        return node.classList.contains('prose') ? [...node.children].flatMap(block => {
          const list = block.querySelector(':scope > ol.checklist');
          if (!list) return [block];
          return [...list.children].map((item, i) => {
            const part = document.createElement('div');
            part.className = 'list-block';
            if (i === 0 && block.querySelector('h3')) part.append(block.querySelector('h3').cloneNode(true));
            const partial = list.cloneNode(false);
            partial.style.counterReset = `step ${i}`;
            partial.start = i + 1;
            partial.append(item.cloneNode(true));
            part.append(partial);
            return part;
          });
        }) : [node];
      });
      units.forEach(unit => {
        if (failure) return;
        const copy = cleanClone(unit);
        content.append(copy);
        if (content.scrollHeight > content.clientHeight + 1 && count > 0) {
          copy.remove();
          record = newLeaf(true);
          content.append(copy);
        }
        if (content.scrollHeight > content.clientHeight + 1) { failure = true; return; }
        if (unit.id) record.anchors.push(unit.id);
        count++;
      });
    });
    measure.remove();
    if (failure) { leaves = []; return false; }
    leaves.forEach((leaf, index) => {
      const folio = document.createElement('div');
      folio.className = 'leaf-folio';
      const title = document.createElement('span');
      title.textContent = 'CourtOS';
      const number = document.createElement('span');
      number.textContent = String(index + 1).padStart(2, '0');
      folio.append(title, number);
      leaf.element.append(folio);
      leaf.element.setAttribute('aria-label', `${document.body.dataset.pageLabel} ${index + 1}`);
    });
    return true;
  }
  function showSpread() {
    if (!leaves.length) return;
    const start = Math.floor(leafIndex / size()) * size();
    const visible = leaves.slice(start, start + size());
    spread.replaceChildren(...visible.map(leaf => leaf.element));
    current = leaves[leafIndex].chapter;
    position();
    previous.disabled = start === 0;
    next.disabled = start + size() >= leaves.length;
    progress.textContent = `${document.body.dataset.pageLabel} ${start + 1}${visible.length > 1 ? '–' + (start + visible.length) : ''} / ${leaves.length}`;
  }
  function setMode(wanted) {
    const destination = sections[current].id;
    book = wanted && !compact.matches && innerHeight >= 640;
    document.body.classList.toggle('book-mode', book);
    bookReader.hidden = !book;
    if (book && !paginate()) {
      book = false;
      document.body.classList.remove('book-mode');
      bookReader.hidden = true;
      document.querySelector('#reader-status').textContent = document.body.dataset.bookUnavailable;
    }
    modes.forEach(button => button.setAttribute('aria-pressed', String((button.dataset.mode === 'book') === book)));
    navigate('#' + destination, { historyMode: 'replace' });
  }
  modes.forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode === 'book')));
  chapter.addEventListener('change', () => navigate('#' + chapter.value));
  previous.addEventListener('click', () => {
    leafIndex = Math.max(0, Math.floor(leafIndex / size()) * size() - size());
    showSpread();
    history.replaceState(null, '', '#' + sections[current].id);
  });
  next.addEventListener('click', () => {
    leafIndex = Math.min(leaves.length - 1, Math.floor(leafIndex / size()) * size() + size());
    showSpread();
    history.replaceState(null, '', '#' + sections[current].id);
  });
  document.querySelector('.contents-toggle').addEventListener('click', () => {
    if (typeof contentsDialog.showModal === 'function') contentsDialog.showModal();
  });
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  for (const dialog of [sourceDialog, contentsDialog]) {
    // Native Escape/focus restoration also works without custom keyboard trapping.
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.hash === '#content' && book) {
      event.preventDefault();
      bookReader.focus({ preventScroll: true });
      return;
    }
    if (link.dataset.source && typeof sourceDialog.showModal === 'function') {
      const source = document.getElementById('source-' + link.dataset.source);
      if (!source) return;
      event.preventDefault();
      document.querySelector('#source-dialog-title').textContent = link.getAttribute('aria-label');
      document.querySelector('#source-dialog-content').replaceChildren(cleanClone(source));
      sourceDialog.showModal();
      // The location and the page stay unchanged, so closing returns to this citation.
    } else if (sourceSection(link.hash) >= 0) {
      event.preventDefault();
      navigate(link.hash);
    }
  });
  window.addEventListener('hashchange', () => navigate(location.hash, { historyMode: 'replace' }));
  window.addEventListener('resize', () => {
    resizing = true;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (book) setMode(true);
      else readingTarget?.scrollIntoView({ block: 'start' });
      requestAnimationFrame(() => { resizing = false; });
    }, 180);
  });
  document.addEventListener('keydown', event => {
    if (!book || sourceDialog.open || contentsDialog.open || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest('input,textarea,select,button,a,[contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft' && !previous.disabled) { previous.click(); event.preventDefault(); }
    if (event.key === 'ArrowRight' && !next.disabled) { next.click(); event.preventDefault(); }
  });
  // Update only reading location; scrolling never creates browser-history entries.
  let scrollTimer;
  window.addEventListener('scroll', () => {
    if (book || resizing || navigating) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (book || resizing || navigating) return;
      const threshold = document.querySelector('.reader-tools').getBoundingClientRect().bottom + 90;
      let visible = 0;
      sections.forEach((section, i) => { if (section.getBoundingClientRect().top <= threshold) visible = i; });
      current = visible;
      readingTarget = sections[current];
      sections[current].querySelectorAll('.chapter-heading,.lead,.text-block,.note,.list-block,.source-entry,.cover-statement').forEach(block => {
        if (block.getBoundingClientRect().top <= threshold) readingTarget = block;
      });
      position();
    }, 140);
  }, { passive: true });
  position();
  (document.fonts?.ready || Promise.resolve()).then(() => {
    document.documentElement.classList.remove('no-js');
    if (initial >= 0) navigate(location.hash, { focus: false, historyMode: 'replace' });
  });
})();
