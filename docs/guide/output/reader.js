/* Adapted for CourtOS at Jonas Hertner's request from his published Rule & Reason reader.
 * Source: rule-and-reason f03d3d4941bb03d0bb114a04c8d1f46d0c900c52 / public/book-1/reader.js.
 * See reference-reader-provenance.json. */
(() => {
  'use strict';
  const source = document.getElementById('reading-source');
  const reader = document.getElementById('book-reader');
  const book = document.getElementById('page-book');
  const canvas = reader?.querySelector('.reader-canvas');
  const stage = reader?.querySelector('.book-stage');
  const controls = document.getElementById('reader-controls');
  const location = document.getElementById('reader-chapter');
  const bookMode = document.getElementById('reader-book-mode');
  const textMode = document.getElementById('reader-text-mode');
  const previous = document.getElementById('reader-prev');
  const next = document.getElementById('reader-next');
  const status = document.getElementById('reader-status');
  if (![source, reader, book, canvas, stage, controls, location, bookMode, textMode, previous, next, status].every(Boolean)) return;

  const labels = JSON.parse(document.getElementById('reader-labels').textContent);
  const storageKey = 'courtos-guide-reading-mode';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const chapters = Array.from(source.querySelectorAll('details.chapter'));
  const coverTitle = source.querySelector('#book-title').cloneNode(true);
  coverTitle.removeAttribute('id');
  const coverAuthor = source.querySelector('.opening-note > p')?.textContent || '';
  const coverSubtitle = Array.from(source.querySelector('.subtitle')?.childNodes || [])
    .filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim()).filter(Boolean);
  let queuedCurlTurn = null;
  const roots = [];
  const groups = [];
  const homes = [];
  const holder = document.createDocumentFragment();
  const shellOrigins = new WeakMap();
  const nodeHomes = new WeakMap();
  let pages = [];
  let anchors = new Map();
  let current = 0;
  let mode = 'text';
  let orientation = 'landscape';
  let width = 500;
  let height = 680;
  let ready = false;
  let rebuilding = false;
  let frame;
  let resizeFrame;
  let curl;
  let drag;
  let printState;
  let geometryKey = '';
  let pendingExample = false;
  let pendingExampleAnchor = '';
  let exampleFrame;
  let queuedTurn = null;
  let suppressClick = false;

  const legacyAnchors = { quality: 'later', test: 'later', local: 'first-steps', public: 'first-steps' };
  const canonicalAnchor = anchor => Object.hasOwn(legacyAnchors, anchor) ? legacyAnchors[anchor] : anchor;
  function fragment() {
    try { return canonicalAnchor(decodeURIComponent(window.location.hash.slice(1))); }
    catch { return ''; }
  }
  function hash(anchor, method = 'replaceState') {
    if (!anchor || fragment() === anchor) return;
    const url = new URL(window.location.href);
    url.hash = anchor;
    history[method](history.state, '', url);
  }
  function persist(value) {
    try { localStorage.setItem(storageKey, value); } catch { /* Storage is optional. */ }
  }
  function preferredMode() {
    try { return localStorage.getItem(storageKey) === 'text' ? 'text' : 'book'; }
    catch { return 'book'; }
  }
  function rememberRoot(node) {
    const marker = document.createComment('Book source position');
    node.before(marker);
    roots.push({ node, marker });
    return node;
  }
  function group(label, anchor, nodes, extra = {}) {
    const existing = nodes.filter(Boolean);
    if (!existing.length) return null;
    const entry = { label, anchor, nodes: existing.map(rememberRoot), ...extra };
    groups.push(entry);
    return entry;
  }
  function option(value, label) {
    const item = document.createElement('option');
    item.value = value;
    item.textContent = label;
    location.append(item);
  }

  // Preserve the canonical manuscript; the measured leaves return these nodes
  // to their original positions for continuous reading and printing.
  group(labels.opening, 'book-title', [source.querySelector('.opening')], { cover: true, aliases: ['start'] });
  const directory = source.querySelector('#chapter-directory');
  const headingText = node => Array.from(node.childNodes).map(child => child.nodeName === 'BR' ? ' ' : child.textContent).join('').replace(/\s+/g, ' ').trim();
  const directoryLinks = [];
  if (directory) {
    for (const chapter of chapters) {
      const link = directory.querySelector(`a[href="#${chapter.id}"]`);
      if (!link) continue;
      directoryLinks.push({ link, anchor: chapter.id, number: chapter.querySelector('.chapter-number').textContent, title: headingText(chapter.querySelector('.chapter-title')), folio: link.querySelector('.directory-folio'), aria: link.getAttribute('aria-label') });
    }
    group(labels.contents, 'chapter-directory', [directory], { directory: true });
  }
  for (const chapter of chapters) {
    group(headingText(chapter.querySelector('.chapter-title')), chapter.id, [chapter], {
      chapterNumber: chapter.querySelector('.chapter-number').textContent,
      runningTitle: headingText(chapter.querySelector('.chapter-title')),
    });
  }
  location.replaceChildren();
  option('front-cover', labels.cover);
  option('book-title', labels.opening);
  if (directory) option('chapter-directory', labels.contents);
  chapters.forEach(chapter => option(chapter.id, `${chapter.querySelector('.chapter-number').textContent} · ${headingText(chapter.querySelector('.chapter-title'))}`));

  const sourceEntries = new Map([...source.querySelectorAll('.source-entry')].map(node => [node.id, node.cloneNode(true)]));
  const sourceDialog = document.getElementById('source-dialog');
  const contentsDialog = document.getElementById('contents-dialog');
  let dialogReturn = null;
  function openDialog(dialog, trigger) { dialogReturn = trigger; dialog.showModal(); }
  for (const dialog of [sourceDialog, contentsDialog]) {
    dialog.addEventListener('close', () => {
      if (dialogReturn?.isConnected && !dialogReturn.closest('[aria-hidden="true"]')) dialogReturn.focus({ preventScroll: true });
      else if (mode === 'book') book.focus({ preventScroll: true });
    });
    dialog.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => dialog.close()));
  }
  document.querySelector('[data-contents]').addEventListener('click', event => { syncTextLocation(); openDialog(contentsDialog, event.currentTarget); });
  // Register before the generic internal-link listener so source notes open
  // without changing chapter, URL, page or reading position.
  document.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('a') : null;
    if (!link || event.button || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (link.classList.contains('noteref')) {
      const entry = sourceEntries.get(`source-${link.dataset.source}`);
      if (!entry) return;
      event.preventDefault();
      const copy = entry.cloneNode(true);
      copy.removeAttribute('id');
      copy.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      sourceDialog.querySelector('#source-dialog-content').replaceChildren(copy);
      openDialog(sourceDialog, link);
    } else if (link.closest('dialog') && link.getAttribute('href')?.startsWith('#')) {
      link.closest('dialog').close();
    }
  });

  const corners = ['prev', 'next'].map(direction => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'folio-turn';
    button.dataset.direction = direction;
    button.setAttribute('aria-label', direction === 'prev' ? labels.previous : labels.next);
    button.textContent = direction === 'prev' ? '↶' : '↷';
    stage.append(button);
    return button;
  });
  book.tabIndex = 0;
  book.setAttribute('aria-label', labels.keyboard);
  book.style.cssText = 'position:relative;width:100%;height:100%;touch-action:pinch-zoom;';

  function measureToolbar() {
    const measured = `${Math.ceil(controls.getBoundingClientRect().height)}px`;
    if (document.documentElement.style.getPropertyValue('--reader-toolbar-height') !== measured) {
      document.documentElement.style.setProperty('--reader-toolbar-height', measured);
    }
  }
  function modeUI(value) {
    mode = value;
    document.documentElement.dataset.reader = value;
    reader.hidden = value !== 'book';
    source.hidden = value === 'book';
    reader.dataset.mode = value === 'book' ? 'book' : 'linear';
    controls.hidden = false;
    const coverOption = location.querySelector('option[value="front-cover"]');
    coverOption.disabled = coverOption.hidden = value !== 'book';
    bookMode.setAttribute('aria-pressed', String(value === 'book'));
    textMode.setAttribute('aria-pressed', String(value === 'text'));
    if (value === 'book') reader.setAttribute('role', 'main');
    else reader.removeAttribute('role');
    document.querySelector('.skip')?.setAttribute('href', value === 'book' ? '#page-book' : '#main');
    measureToolbar();
  }
  function restore() {
    clearDirectoryReferences();
    book.replaceChildren();
    for (const { node, marker } of homes.splice(0).reverse()) {
      marker.before(node);
      marker.remove();
      nodeHomes.delete(node);
    }
    for (const { node, marker } of roots.slice().reverse()) marker.before(node);
    pages = [];
  }
  function saveNode(node) {
    if (nodeHomes.has(node)) return;
    const marker = document.createComment('Book block position');
    node.before(marker);
    const saved = { node, marker };
    nodeHomes.set(node, saved);
    homes.push(saved);
  }
  function geometry() {
    const style = getComputedStyle(canvas);
    const availableWidth = Math.max(180, canvas.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const availableHeight = Math.max(150, canvas.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
    orientation = availableWidth >= 660 ? 'landscape' : 'portrait';
    // Measurement must use the same gutter padding as the finished leaves.
    reader.dataset.orientation = orientation;
    const count = orientation === 'landscape' ? 2 : 1;
    // Normal leaves retain a physical book's portrait proportions. Only a
    // short landscape window uses a wider leaf, rather than shrinking type.
    const ratio = 560 / 760;
    if (orientation === 'portrait' && document.documentElement.clientWidth <= 560) {
      // On phones the leaf is the reading viewport. Text remains full size and
      // repaginates into the available height instead of floating in a frame.
      width = Math.floor(availableWidth);
      height = Math.floor(availableHeight);
    } else if (availableHeight < 350) {
      height = Math.floor(availableHeight);
      width = Math.floor(Math.min(availableWidth / count, 540, Math.max(280, height * ratio)));
    } else {
      width = Math.floor(Math.min(availableWidth / count, 540, availableHeight * ratio));
      height = Math.floor(Math.min(availableHeight, width / ratio));
    }
    stage.style.width = `${width * count}px`;
    reader.style.setProperty('--book-width', `${width * count}px`);
    stage.style.height = `${height}px`;
    stage.style.setProperty('--page-width', `${width}px`);
    stage.style.setProperty('--page-height', `${height}px`);
    stage.style.perspective = 'none';
    return `${width}:${height}:${orientation}:${getComputedStyle(document.documentElement).fontSize}`;
  }
  function createPage(entry, continuation) {
    const leaf = document.createElement('section');
    leaf.className = `folio ${entry.cover ? 'folio-cover' : ''} ${entry.compactOpening ? 'folio-opening-compact' : ''} ${entry.directory ? 'folio-directory' : ''} ${continuation ? 'folio-continuation-leaf' : ''} ${orientation === 'portrait' || pages.length % 2 ? '--right' : '--left'}`;
    leaf.dataset.pageIndex = String(pages.length);
    leaf.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px;display:block;`;
    leaf.inert = true;
    leaf.setAttribute('aria-hidden', 'true');
    const inner = document.createElement('div');
    inner.className = 'folio-inner';
    const running = document.createElement('p');
    running.className = 'folio-running';
    running.setAttribute('aria-hidden', 'true');
    if (entry.chapterNumber) {
      const chapterNumber = document.createElement('span');
      chapterNumber.className = 'folio-running-number';
      chapterNumber.textContent = entry.chapterNumber;
      const chapterTitle = document.createElement('span');
      chapterTitle.className = 'folio-running-title';
      chapterTitle.textContent = entry.runningTitle;
      running.append(chapterNumber, chapterTitle);
    } else running.textContent = entry.label;
    const body = document.createElement('div');
    body.className = 'folio-body';
    const footer = document.createElement('p');
    footer.className = 'folio-number';
    footer.style.display = 'grid';
    footer.style.gridTemplateColumns = 'minmax(0, 1fr) auto minmax(0, 1fr)';
    footer.style.paddingInline = '24px';
    const number = document.createElement('span');
    number.textContent = String(Math.max(1, pages.length + 1 - (orientation === 'landscape' ? 2 : 1))).padStart(2, '0');
    number.style.gridColumn = '2';
    number.style.gridRow = '1';
    number.style.textAlign = 'center';
    footer.append(number);
    inner.append(running, body, footer);
    leaf.append(inner);
    book.append(leaf);
    const page = { leaf, body, footer, entry, continuation, shells: new Map(), tokens: [], anchor: entry.anchor };
    if (continuation) leaf.id = `reader-page-${pages.length + 1}`;
    pages.push(page);
    return page;
  }
  function atomic(node) {
    if (node.matches('.case-controls > div')) return true;
    if (node.matches('h1,h2,h3,p,li,dt,dd,select,label,button,.chapter-number,.chapter-title,.chapter-question')) return true;
    if (node.matches('a') && !node.closest('p,li,dd')) return true;
    return !node.children.length;
  }
  function tokensFrom(node, ancestors = [], result = []) {
    if (!(node instanceof Element)) return result;
    if (atomic(node)) result.push({
      node, ancestors, heading: node.matches('h1,h2,h3,.chapter-title,.chapter-number'),
      keepWithNext: node.matches('h1,h2,h3,dt,.chapter-title,.chapter-number,.chapter-question'),
      listOrdinal: node.matches('li') && node.parentElement?.matches('ol')
        ? Array.from(node.parentElement.children).indexOf(node) + (node.parentElement.start || 1) : null,
    });
    else for (const child of Array.from(node.children)) tokensFrom(child, [...ancestors, node], result);
    return result;
  }
  function parentFor(page, ancestors) {
    let parent = page.body;
    for (const original of ancestors) {
      let shell = page.shells.get(original);
      if (!shell) {
        if (original.matches('details')) {
          shell = document.createElement('section');
          for (const attribute of original.attributes) {
            if (attribute.name !== 'open') shell.setAttribute(attribute.name, attribute.value);
          }
        } else shell = original.cloneNode(false);
        // Keep IDs during measurement so ID-based margins match the final leaf;
        // duplicate continuation IDs are removed before the reader is shown.
        shell.removeAttribute('hidden');
        if (page.continuation && !page.tokens.length) shell.classList.add('folio-flow-start');
        if (shell.matches('details')) shell.open = true;
        if (shell.matches('summary')) shell.tabIndex = -1;
        page.shells.set(original, shell);
        shellOrigins.set(shell, original);
        parent.append(shell);
      }
      parent = shell;
    }
    return parent;
  }
  function cleanShells(page) {
    for (const [original, shell] of Array.from(page.shells.entries()).reverse()) {
      if (!shell.childNodes.length) {
        shell.remove();
        page.shells.delete(original);
      }
    }
  }
  function fits(page, reserve = 0) {
    const contentBottom = page.body.lastElementChild?.getBoundingClientRect().bottom || 0;
    return page.body.scrollHeight <= page.body.clientHeight + 1 &&
      page.body.scrollWidth <= page.body.clientWidth + 1 &&
      (!reserve || contentBottom + reserve <= page.body.getBoundingClientRect().bottom + 1);
  }
  function textRange(node, start, end) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    const range = document.createRange();
    let offset = 0;
    let began = false;
    for (const text of textNodes) {
      const limit = offset + text.data.length;
      if (!began && start <= limit) {
        range.setStart(text, Math.max(0, start - offset));
        began = true;
      }
      if (began && end <= limit) {
        range.setEnd(text, Math.max(0, end - offset));
        let content = range.cloneContents();
        let ancestor = range.commonAncestorContainer;
        if (ancestor.nodeType === Node.TEXT_NODE) ancestor = ancestor.parentElement;
        // cloneContents omits its common ancestor. Keep enclosing links and
        // emphasis when a slice starts and ends inside the same inline tree.
        while (ancestor && ancestor !== node) {
          const wrapper = ancestor.cloneNode(false);
          wrapper.append(content);
          content = document.createDocumentFragment();
          content.append(wrapper);
          ancestor = ancestor.parentElement;
        }
        return content;
      }
      offset = limit;
    }
    return document.createDocumentFragment();
  }
  function fragmentNode(node, start, end) {
    const part = node.cloneNode(false);
    if (start) {
      part.removeAttribute('id');
      part.classList.add('folio-continuation');
    }
    part.append(textRange(node, start, end));
    return part;
  }
  function lineCount(node) {
    // Text rectangles, rather than characters or element height, account for
    // real type metrics, emphasis, manual breaks and the current text zoom.
    const lines = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent.trim()) continue;
      range.selectNodeContents(walker.currentNode);
      for (const rect of range.getClientRects()) {
        if (rect.width < 0.1 || rect.height < 0.1) continue;
        const line = lines.find(item => Math.min(item.bottom, rect.bottom) - Math.max(item.top, rect.top)
          > Math.min(item.bottom - item.top, rect.height) * 0.5);
        if (line) { line.top = Math.min(line.top, rect.top); line.bottom = Math.max(line.bottom, rect.bottom); }
        else lines.push({ top: rect.top, bottom: rect.bottom });
      }
    }
    return lines.length;
  }
  function flowNextPage(page, entry) {
    let first = page.tokens.length;
    while (first > 0 && (page.tokens[first - 1].keepWithNext || !page.tokens[first - 1].ink)) first--;
    // A whole leaf of headings is already the shortest available layout. In
    // very small views it must be allowed to break rather than carry forever.
    const carried = first > 0 ? page.tokens.splice(first) : [];
    for (const token of carried) token.node.remove();
    cleanShells(page);
    const nextPage = createPage(entry, true);
    for (const token of carried) {
      parentFor(nextPage, token.ancestors).append(token.node);
      nextPage.tokens.push(token);
    }
    return nextPage;
  }
  function measureFlow(page, tokens, firstOffset = 0) {
    const copies = [];
    const previousLength = page.tokens.length;
    try {
      for (const [index, token] of tokens.entries()) {
        const copy = index === 0 && firstOffset
          ? fragmentNode(token.node, firstOffset, token.node.textContent.length) : token.node.cloneNode(true);
        parentFor(page, token.ancestors).append(copy);
        copies.push(copy);
        page.tokens.push(token);
      }
      return { fits: fits(page), lines: copies[0] ? lineCount(copies[0]) : 0 };
    } finally {
      copies.forEach(copy => copy.remove());
      page.tokens.length = previousLength;
      cleanShells(page);
    }
  }
  function measureFreshFlow(entry, tokens, firstOffset = 0) {
    const probe = createPage(entry, true);
    pages.pop();
    probe.leaf.style.visibility = 'hidden';
    try { return measureFlow(probe, tokens, firstOffset); }
    finally { probe.leaf.remove(); }
  }
  function fitsWithFollowing(page, token, reserve = 0) {
    return fits(page, reserve) && (!token.following || measureFlow(page, token.following).fits);
  }
  function prepareChapterTail(entry, tokens) {
    const chapter = entry.nodes.find(node => node.matches('details.chapter'));
    const body = chapter?.querySelector('.chapter-body');
    if (!body) return null;
    const bodyStart = tokens.findIndex(token => token.ancestors.includes(body));
    const output = tokens.findIndex(token => token.node.matches('.chapter-output'));
    if (bodyStart < 0) return null;
    const bodyTokens = tokens.slice(bodyStart);
    const bodyFitsFresh = measureFreshFlow(entry, bodyTokens).fits;
    const tailStart = output > bodyStart ? output - 1 : -1;
    const tail = tailStart >= 0 ? tokens.slice(tailStart) : [];
    const tailFitsFresh = tail.length > 1 && measureFreshFlow(entry, tail).fits;
    if (tail.length > 1 && !tailFitsFresh) {
      // If a long last paragraph needs to split, keep its final two lines
      // beside the output. The complete untouched tokens remain the source.
      const text = tail[0].node.textContent;
      const offsets = [0, ...Array.from(text.matchAll(/\S+\s*/g), match => match.index + match[0].length)]
        .filter(offset => offset < text.length);
      let lo = 0;
      let hi = offsets.length - 1;
      let best = -1;
      while (lo <= hi) {
        const middle = Math.floor((lo + hi) / 2);
        const measured = measureFreshFlow(entry, tail, offsets[middle]);
        if (measured.lines >= 2) { best = middle; lo = middle + 1; }
        else hi = middle - 1;
      }
      if (best >= 0 && measureFreshFlow(entry, tail, offsets[best]).fits) tail[0].following = tail.slice(1);
    }
    return { bodyStart, bodyTokens, bodyFitsFresh, tailStart, tail, tailFitsFresh };
  }
  function paginateToken(token, page, entry) {
    const node = token.node;
    const text = node.textContent || '';
    token.sourceNode = node;
    token.textStart = 0;
    token.textEnd = text.length;
    saveNode(node);
    parentFor(page, token.ancestors).append(node);
    const style = getComputedStyle(node);
    token.ink = Boolean(node.getClientRects().length);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
    const bodyStyle = getComputedStyle(page.body);
    const bodyLineHeight = parseFloat(bodyStyle.lineHeight) || parseFloat(bodyStyle.fontSize) * 1.5;
    const reserve = token.keepWithNext ? bodyLineHeight * 2 : 0;
    if (fitsWithFollowing(page, token, reserve) || (token.keepWithNext && fitsWithFollowing(page, token) && page.tokens.every(item => item.keepWithNext || !item.ink))) {
      page.tokens.push(token);
      return page;
    }
    node.remove();
    cleanShells(page);
    const usedBottom = page.body.lastElementChild?.getBoundingClientRect().bottom || page.body.getBoundingClientRect().top;
    const remaining = page.body.getBoundingClientRect().bottom - usedBottom;
    // The opening thought is one unit. If the title leaf is too short, move
    // the complete paragraph; only an overlarge paragraph may itself flow.
    const keepWhole = node.matches('.premise') && measureFreshFlow(entry, [token]).fits;
    const flowText = !keepWhole && node.matches('p,li,dd,.chapter-question') &&
      !node.matches('.chapter-directory-entry') && remaining >= lineHeight;
    if (!flowText && page.tokens.length) page = flowNextPage(page, entry);
    if (!flowText) {
      parentFor(page, token.ancestors).append(node);
      if (fitsWithFollowing(page, token)) {
        page.tokens.push(token);
        return page;
      }
      node.remove();
      cleanShells(page);
    }
    // Paragraphs flow through available space. Originals remain untouched in
    // the holder, while inline emphasis and links survive measured slices.
    holder.append(node);
    if (!text.trim() || node.matches('.case-controls > div,select,input,button')) {
      parentFor(page, token.ancestors).append(node);
      page.tokens.push(token);
      return page;
    }
    const boundaries = Array.from(text.matchAll(/\S+\s*/g), match => match.index + match[0].length);
    if (boundaries.at(-1) !== text.length) boundaries.push(text.length);
    let probe;
    const onNextLeaf = (start, end) => {
      if (!probe) {
        probe = createPage(entry, true);
        pages.pop();
        probe.leaf.classList.add('folio-measure');
        probe.leaf.style.visibility = 'hidden';
      }
      const right = orientation === 'portrait' || pages.length % 2 === 1;
      probe.leaf.classList.toggle('--right', right);
      probe.leaf.classList.toggle('--left', !right);
      const candidate = fragmentNode(node, start, end);
      parentFor(probe, token.ancestors).append(candidate);
      const measured = { lines: lineCount(candidate), fits: end === text.length ? fitsWithFollowing(probe, token) : fits(probe) };
      candidate.remove();
      return measured;
    };
    try {
      let start = 0;
      while (start < text.length) {
        const possible = boundaries.filter(end => end > start);
        const parent = parentFor(page, token.ancestors);
        const metrics = new Map();
        const onThisLeaf = end => {
          if (metrics.has(end)) return metrics.get(end);
          const candidate = fragmentNode(node, start, end);
          parent.append(candidate);
          const measured = { lines: lineCount(candidate), fits: end === text.length ? fitsWithFollowing(page, token) : fits(page) };
          candidate.remove();
          metrics.set(end, measured);
          return measured;
        };
        let lo = 0;
        let hi = possible.length - 1;
        let best = -1;
        while (lo <= hi) {
          const middle = Math.floor((lo + hi) / 2);
          if (onThisLeaf(possible[middle]).fits) { best = middle; lo = middle + 1; }
          else hi = middle - 1;
        }
        if (best < 0 && page.tokens.length) {
          cleanShells(page);
          page = flowNextPage(page, entry);
          continue;
        }
        const hasEarlierBody = page.tokens.some(item => item.ink && !item.keepWithNext);
        let end = possible[Math.max(0, best)];
        if (end < text.length) {
          // A lone first line belongs with its paragraph on the next leaf.
          // Keeping an overlarge opener is the one unavoidable exception.
          if (onThisLeaf(end).lines < 2 && hasEarlierBody) {
            cleanShells(page);
            page = flowNextPage(page, entry);
            continue;
          }
          if (onNextLeaf(end, text.length).lines < 2) {
            let balanced = -1;
            lo = 0;
            hi = best - 1;
            while (lo <= hi) {
              const middle = Math.floor((lo + hi) / 2);
              if (onNextLeaf(possible[middle], text.length).lines >= 2) { balanced = middle; lo = middle + 1; }
              else hi = middle - 1;
            }
            if (balanced >= 0 && onThisLeaf(possible[balanced]).lines >= 2) end = possible[balanced];
            else if (hasEarlierBody && onNextLeaf(start, text.length).fits) {
              // Three-line paragraphs cannot split 2+2: keep the paragraph
              // whole when the following leaf can accommodate it.
              cleanShells(page);
              page = flowNextPage(page, entry);
              continue;
            }
          }
        }
        const piece = fragmentNode(node, start, end);
        parent.append(piece);
        page.tokens.push({ ...token, node: piece, textStart: start, textEnd: end });
        start = end;
        if (start < text.length) page = createPage(entry, true);
      }
      return page;
    } finally { probe?.leaf.remove(); }
  }
  function buildPages() {
    for (const { node } of roots) holder.append(node);
    const seenIds = new Set();
    const liveIds = new Set();
    anchors = new Map();
    const coverEntry = { label: labels.cover, anchor: 'front-cover', frontMatter: true };
    if (orientation === 'landscape') {
      const spacer = createPage({ ...coverEntry, spacer: true }, false);
      spacer.leaf.classList.add('folio-cover-spacer');
      spacer.leaf.replaceChildren();
      spacer.leaf.setAttribute('role', 'presentation');
    }
    const cover = createPage(coverEntry, false);
    cover.leaf.classList.add('folio-front-cover', 'reader-front-cover');
    cover.leaf.id = 'front-cover';
    cover.leaf.querySelector('.folio-running').remove();
    cover.footer.remove();
    const design = document.createElement('div');
    design.className = 'designed-cover';
    const imprint = document.createElement('div');
    imprint.className = 'cover-imprint';
    const brand = document.createElement('span');
    brand.textContent = 'CourtOS';
    const volume = document.createElement('span');
    volume.className = 'cover-volume';
    volume.textContent = '01';
    imprint.append(brand, volume);
    const title = document.createElement('h1');
    title.className = 'cover-title';
    const fullTitle = Array.from(coverTitle.childNodes).map(node => node.nodeName === 'BR' ? ' ' : node.textContent).join('').trim();
    title.setAttribute('aria-label', fullTitle);
    const titleWords = fullTitle.split(/\s+/);
    const titleLines = source.dataset.coverLines ? JSON.parse(source.dataset.coverLines) : [titleWords.shift(), titleWords.slice(0, -1).join(' '), titleWords.at(-1)];
    ['building', 'legal', 'function'].forEach((line, index) => {
      const word = document.createElement('span');
      word.className = `cover-${line}`;
      word.textContent = titleLines[index];
      title.append(word);
      if (index < 2) title.append(' ');
    });
    const author = document.createElement('div');
    author.className = 'cover-author';
    author.textContent = coverAuthor;
    const edition = document.createElement('div');
    edition.className = 'cover-edition';
    for (const line of coverSubtitle) {
      const span = document.createElement('span');
      span.textContent = line;
      edition.append(span);
    }
    design.append(imprint, title, author, edition);
    cover.body.append(design);
    anchors.set('front-cover', 0);
    for (const entry of groups) {
      entry.start = pages.length;
      entry.compactOpening = false;
      let page = createPage(entry, false);
      const tokens = entry.nodes.flatMap(node => tokensFrom(node));
      if (entry.cover && !measureFlow(page, tokens).fits) {
        // Recover only the opening's vertical whitespace, never reduce text
        // size. Re-evaluate at every geometry/font change, in all editions.
        entry.compactOpening = true;
        page.leaf.classList.add('folio-opening-compact');
      }
      const chapter = prepareChapterTail(entry, tokens);
      const directoryMiddle = entry.directory
        ? tokens.filter(token => token.node.matches('.chapter-directory-entry'))[7] : null;
      for (const [index, token] of tokens.entries()) {
        if (orientation === 'landscape' && token === directoryMiddle && page === pages[entry.start]) {
          // Where seven entries fit, give the remaining seven an equal leaf.
          // Shorter spreads and single-page views retain measured flow.
          page = createPage(entry, true);
        }
        if (orientation === 'landscape' && chapter && index === chapter.bodyStart && chapter.bodyFitsFresh &&
            !measureFlow(page, chapter.bodyTokens).fits) {
          // A facing body makes a deliberate spread; a single-page view
          // instead flows the prose directly beneath its title.
          page.leaf.classList.add('folio-chapter-opener');
          page = createPage(entry, true);
        } else if (chapter && index === chapter.tailStart && chapter.tailFitsFresh &&
            !measureFlow(page, chapter.tail).fits) {
          page = flowNextPage(page, entry);
        }
        page = paginateToken(token, page, entry);
      }
      anchors.set(entry.anchor, entry.start);
      for (const alias of entry.aliases || []) anchors.set(alias, entry.start);
    }
    for (const [index, page] of pages.entries()) {
      for (const [original, shell] of page.shells) {
        if (original.id && !seenIds.has(original.id)) {
          shell.id = original.id;
          seenIds.add(original.id);
        }
        if (shell.matches('ol')) {
          const first = page.tokens.find(token => token.ancestors.includes(original) && token.node.matches('li'));
          if (first) {
            if (first.listOrdinal) shell.start = first.listOrdinal;
          }
        }
      }
      for (const node of page.leaf.querySelectorAll('[id]')) {
        if (liveIds.has(node.id)) node.removeAttribute('id');
        else {
          liveIds.add(node.id);
          if (!anchors.has(node.id)) anchors.set(node.id, index);
        }
      }
      if (page.leaf.id) anchors.set(page.leaf.id, index);
      if (!page.entry.spacer) page.leaf.setAttribute('aria-label', page.entry.frontMatter ? labels.cover : `${labels.page} ${index + 1 - (orientation === 'landscape' ? 2 : 1)}: ${page.entry.label}`);
      if (page.leaf.querySelector('select')) {
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.className = 'reader-example-jump';
        jump.textContent = 'Review';
        jump.setAttribute('aria-label', 'Read review steps');
        jump.style.cssText = 'grid-column:1;grid-row:1;justify-self:start;border:0;padding:0;background:none;font:inherit;line-height:inherit;color:var(--link);text-decoration:underline;white-space:nowrap;';
        jump.addEventListener('click', () => navigate('case-actions', true));
        page.footer.prepend(jump);
      }
    }
    anchors.set('main', anchors.get('book-title'));
    anchors.set('page-book', anchors.get('book-title'));
    fillDirectoryReferences();
  }
  function clearDirectoryReferences() {
    for (const item of directoryLinks) {
      item.folio.textContent = '';
      if (item.aria === null) item.link.removeAttribute('aria-label');
      else item.link.setAttribute('aria-label', item.aria);
    }
  }
  function fillDirectoryReferences() {
    const frontMatter = orientation === 'landscape' ? 2 : 1;
    for (const item of directoryLinks) {
      const index = anchors.get(item.anchor);
      if (index === undefined) continue;
      const number = index + 1 - frontMatter;
      const links = new Set([item.link, ...book.querySelectorAll(`.directory-link[href="#${item.anchor}"]`)]);
      for (const link of links) {
        const reference = link.querySelector('.directory-folio');
        if (reference) reference.textContent = String(number).padStart(2, '0');
        link.setAttribute('aria-label', `${labels.chapter} ${item.number}: ${item.title}, ${labels.page} ${number}`);
      }
    }
  }
  function spreadStart(index) {
    return orientation === 'landscape' ? index - index % 2 : index;
  }
  function endIndex() { return Math.min(pages.length, current + (orientation === 'landscape' ? 2 : 1)); }
  function updateUI() {
    if (mode !== 'book' || !pages.length) return;
    const end = endIndex();
    stage.dataset.atCover = String(Boolean(pages[current]?.entry.frontMatter));
    const addressed = anchors.get(fragment());
    const selected = addressed >= current && addressed < end ? addressed : current;
    location.value = pages[selected].entry.choice || pages[selected].entry.anchor;
    document.querySelectorAll('.language a').forEach(link => { link.href = link.getAttribute('href').split('#')[0] + '#' + location.value; });
    reader.dataset.page = String(current + 1);
    reader.dataset.currentIndex = String(current);
    reader.dataset.orientation = orientation;
    reader.dataset.state = curl ? 'flipping' : 'read';
    reader.dataset.pageCount = String(pages.length);
    const frontMatter = orientation === 'landscape' ? 2 : 1;
    status.textContent = pages[current].entry.frontMatter ? labels.cover : end === current + 1
      ? `${labels.page} ${current + 1 - frontMatter} / ${pages.length - frontMatter}`
      : `${labels.pages} ${current + 1 - frontMatter}–${end - frontMatter} / ${pages.length - frontMatter}`;
    const active = document.activeElement;
    previous.disabled = corners[0].disabled = current === 0;
    next.disabled = corners[1].disabled = end === pages.length;
    for (const button of [previous, next, ...corners]) button.setAttribute('aria-disabled', String(button.disabled || Boolean(curl)));
    if (pages.some((page, index) => (index < current || index >= end) && page.leaf.contains(active)) ||
        [previous, next, ...corners].some(button => button === active && button.disabled)) book.focus({ preventScroll: true });
    for (const [index, page] of pages.entries()) {
      const visible = index >= current && index < end;
      page.leaf.inert = !visible || Boolean(curl) || Boolean(page.entry.spacer);
      page.leaf.setAttribute('aria-hidden', String(!visible || Boolean(curl) || Boolean(page.entry.spacer)));
    }
  }
  function settle(index, updateHash = false) {
    current = Math.max(0, Math.min(spreadStart(index), pages.length - 1));
    const end = endIndex();
    stage.dataset.atCover = String(Boolean(pages[current]?.entry.frontMatter));
    for (const [number, page] of pages.entries()) {
      const visible = number >= current && number < end;
      const right = orientation === 'portrait' || number !== current;
      page.leaf.style.display = visible ? 'block' : 'none';
      page.leaf.style.visibility = '';
      page.leaf.style.left = orientation === 'landscape' && right ? `${width}px` : '0px';
      page.leaf.classList.toggle('--left', !right);
      page.leaf.classList.toggle('--right', right);
    }
    if (updateHash) hash(pages[current].anchor);
    updateUI();
  }
  function readingPosition() {
    const addressed = anchors.get(fragment());
    if (addressed >= current && addressed < endIndex()) return fragment();
    return pages[current]?.anchor || 'book-title';
  }
  function sourceAnchor(anchor) {
    if (anchor === 'front-cover') return 'book-title';
    if (anchor === 'book-colophon') return 'book-title';
    if (anchor.startsWith('reader-page-')) return pages[anchors.get(anchor)]?.entry.anchor || 'book-title';
    return anchor;
  }
  function textLocation(anchor) {
    const target = document.getElementById(anchor);
    const entry = groups.find(item => item.anchor === anchor || item.aliases?.includes(anchor)) ||
      groups.find(item => target && item.nodes.some(node => node === target || node.contains(target)));
    const choice = entry?.choice || entry?.anchor || (anchor === 'chapter-directory' ? 'chapter-directory' : 'book-title');
    if (Array.from(location.options).some(item => item.value === choice)) location.value = choice;
    document.querySelectorAll('.language a').forEach(link => { link.href = link.getAttribute('href').split('#')[0] + '#' + location.value; });
  }
  // Continuous reading follows the visible manuscript, not the last clicked
  // fragment. Scroll updates never add history entries or move the viewport.
  function visibleTextPosition(includeOffset = false) {
    const edge = Math.max(0, controls.getBoundingClientRect().bottom) + 16;
    const measured = groups.map(entry => ({ entry, rect: entry.nodes[0].getBoundingClientRect() }))
      .filter(item => item.rect.height > 0);
    if (!measured.length) return null;
    const entry = (measured.find(item => item.rect.bottom > edge) || measured.at(-1)).entry;
    if (!includeOffset) return { anchor: entry.anchor };
    const tokens = entry.nodes.flatMap(node => tokensFrom(node));
    const visible = tokens.filter(token => token.node.getBoundingClientRect().height > 0);
    const token = visible.find(item => item.node.getBoundingClientRect().bottom > edge) || visible.at(-1);
    if (!token) return { anchor: entry.anchor };
    const position = { anchor: entry.anchor, node: token.node, offset: 0 };
    if (token.node.getBoundingClientRect().top >= edge) return position;
    // A bounded binary search over word starts finds the first line below the
    // toolbar. Offsets use the same UTF-16 units as the measured page slices.
    const text = token.node.textContent || '';
    const starts = Array.from(text.matchAll(/\S+/g), match => match.index);
    const walker = document.createTreeWalker(token.node, NodeFilter.SHOW_TEXT);
    const nodes = []; let offset = 0;
    while (walker.nextNode()) { const node = walker.currentNode; nodes.push({ node, start: offset, end: offset + node.data.length }); offset += node.data.length; }
    const range = document.createRange();
    if (typeof range.getClientRects !== 'function') return position;
    function below(start) {
      const part = nodes.find(item => start >= item.start && start < item.end);
      if (!part) return false;
      range.setStart(part.node, start - part.start);
      range.setEnd(part.node, Math.min(part.node.data.length, start - part.start + 1));
      return Array.from(range.getClientRects()).some(rect => rect.bottom > edge);
    }
    let low = 0, high = starts.length - 1, first = -1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (below(starts[middle])) { first = middle; high = middle - 1; }
      else low = middle + 1;
    }
    if (first >= 0) position.offset = starts[first];
    return position;
  }
  let textLocationFrame;
  let textPosition = null;
  let textGeometryKey = '';
  let textRestoreFrame;
  let restoringText = false;
  let textAnchorStyle = null;
  function textGeometry() {
    return [window.innerWidth, window.innerHeight, source.getBoundingClientRect().width,
      controls.getBoundingClientRect().height, getComputedStyle(document.documentElement).fontSize].join(':');
  }
  function cancelTextRestore() {
    cancelAnimationFrame(textRestoreFrame);
    restoringText = false;
    if (textAnchorStyle !== null) {
      document.documentElement.style.overflowAnchor = textAnchorStyle;
      textAnchorStyle = null;
    }
  }
  function positionRect(position, target) {
    if (!position.offset) return target.getBoundingClientRect();
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    let remaining = position.offset;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (remaining >= node.data.length) { remaining -= node.data.length; continue; }
      const range = document.createRange();
      range.setStart(node, remaining);
      range.setEnd(node, remaining + 1);
      if (typeof range.getClientRects === 'function') {
        const rect = Array.from(range.getClientRects()).find(item => item.height > 0);
        if (rect) return rect;
      }
      break;
    }
    return target.getBoundingClientRect();
  }
  function restoreTextPosition(position) {
    cancelTextRestore();
    const target = position.node && source.contains(position.node) ? position.node : document.getElementById(position.anchor);
    if (!target) return;
    const chapter = target.closest('details.chapter');
    if (chapter) chapter.open = true;
    textLocation(position.anchor);
    // Retain manuscript identity, never a pre-reflow scrollY. Disable the
    // browser's competing scroll anchor while the restored layout settles.
    if (target.getBoundingClientRect().height <= 0) return;
    textPosition = { ...position, node: target };
    restoringText = true;
    textAnchorStyle = document.documentElement.style.overflowAnchor;
    document.documentElement.style.overflowAnchor = 'none';
    function align() {
      measureToolbar();
      const rect = positionRect(textPosition, target);
      const edge = controls.getBoundingClientRect().height + 16;
      window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - edge), behavior: 'instant' });
      textGeometryKey = textGeometry();
    }
    align();
    // Moving source nodes out of measured leaves and opening details can
    // trigger a subsequent layout/anchoring pass. Reassert the same text once.
    textRestoreFrame = requestAnimationFrame(() => {
      if (mode !== 'text' || printState) { cancelTextRestore(); return; }
      align();
      textRestoreFrame = requestAnimationFrame(() => { cancelTextRestore(); });
    });
  }
  function bookTextPosition(anchor) {
    const index = anchors.get(readingPosition()) ?? current;
    const token = pages[index]?.tokens[0];
    return token ? { anchor, node: token.sourceNode, offset: token.textStart || 0 } : { anchor };
  }
  function syncTextLocation() {
    if (!ready || mode !== 'text' || printState || restoringText || document.querySelector('dialog[open]')) return;
    // Resize events arrive after layout has changed. Do not overwrite the
    // last old-geometry paragraph with whatever happens to occupy that scrollY.
    if (textPosition && textGeometryKey !== textGeometry()) { scheduleResize(); return; }
    const position = visibleTextPosition(true);
    // Reaching the non-sticky header (including keyboard/browser scroll-to-view)
    // must not replace a chapter's language destination with the opening.
    // Explicit opening/directory navigation still calls textLocation directly.
    if (position && ['book-title', 'chapter-directory'].includes(position.anchor) &&
        chapters.some(chapter => chapter.id === location.value)) return;
    if (position) {
      textPosition = position;
      textGeometryKey = textGeometry();
      textLocation(position.anchor);
    }
  }
  window.addEventListener('scroll', () => {
    if (textLocationFrame || mode !== 'text') return;
    textLocationFrame = requestAnimationFrame(() => { textLocationFrame = null; syncTextLocation(); });
  }, { passive: true });
  // Resolve again at the click boundary, even if the final scroll frame has
  // not run. Only the chapter identifier enters a language URL.
  document.querySelectorAll('.language a').forEach(link => link.addEventListener('click', syncTextLocation));
  function scrollSource(anchor) {
    restoreTextPosition({ anchor, node: document.getElementById(anchor), offset: 0 });
  }
  function rebuild(anchor = readingPosition(), focusedId = '', transferredPosition = null) {
    if (rebuilding || mode !== 'book') return;
    rebuilding = true;
    finishCurl(false);
    const stableAnchor = sourceAnchor(anchor);
    const addressed = anchors.get(anchor);
    // scheduleResize has already measured the new orientation. A named target
    // on the old right-hand leaf remains authoritative when the new view has
    // only one leaf; do not test old visibility with that new page count.
    const readingIndex = addressed ?? current;
    const previousToken = pages[readingIndex]?.tokens[0];
    const position = transferredPosition?.node ? transferredPosition : previousToken ? { node: previousToken.sourceNode, offset: previousToken.textStart || 0 } : null;
    restore();
    geometryKey = geometry();
    buildPages();
    const matchingPage = position ? pages.findIndex(page => page.tokens.some(token =>
      token.sourceNode === position.node && token.textStart <= position.offset && token.textEnd > position.offset)) : -1;
    settle(matchingPage >= 0 ? matchingPage : anchors.get(anchor) ?? anchors.get(stableAnchor) ?? 0);
    if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
    ready = true;
    rebuilding = false;
    reader.dataset.ready = 'true';
  }
  function navigate(anchor, push = false) {
    anchor = canonicalAnchor(anchor);
    if (mode === 'text') {
      const target = document.getElementById(anchor);
      if (!target) return false;
      if (push) hash(anchor, 'pushState');
      scrollSource(anchor);
      return true;
    }
    const index = anchors.get(anchor);
    if (index === undefined) return false;
    finishCurl(false);
    if (push) hash(anchor, 'pushState');
    settle(index);
    if (anchor === 'page-book' || anchor === 'main') book.focus({ preventScroll: true });
    return true;
  }
  function clearExampleUpdate() {
    cancelAnimationFrame(exampleFrame);
    pendingExample = false;
    pendingExampleAnchor = '';
    queuedTurn = null;
  }
  function chooseMode(value, save = true) {
    if (value === mode && ready) return;
    const transferredPosition = ready && mode === 'text'
      ? (restoringText || (textPosition && textGeometryKey !== textGeometry()) ? textPosition : visibleTextPosition(true)) : null;
    const anchor = pendingExample ? pendingExampleAnchor
      : mode === 'book' ? sourceAnchor(readingPosition()) : transferredPosition?.anchor || fragment() || 'book-title';
    const bookPosition = mode === 'book' ? bookTextPosition(anchor) : null;
    cancelTextRestore();
    clearExampleUpdate();
    finishCurl(false);
    if (value === 'text') {
      restore();
      chapters.forEach(chapter => { chapter.open = true; });
      modeUI('text');
      if (fragment().startsWith('reader-page-')) hash(anchor);
      restoreTextPosition(bookPosition || { anchor });
      ready = true;
    } else {
      modeUI('book');
      if (transferredPosition) hash(anchor);
      rebuild(anchor, '', transferredPosition);
    }
    if (save) persist(value);
  }

  // A leaf is a developable sheet: untouched paper, a local half-cylinder,
  // and the flat reverse. Rigid tangent patches preserve the printed texture;
  // only the narrow bend is tessellated. All coordinates are in the book plane.
  function snapshot(leaf) {
    const clone = leaf.cloneNode(true);
    clone.removeAttribute('id');
    clone.inert = true;
    clone.setAttribute('aria-hidden', 'true');
    for (const item of clone.querySelectorAll('[id]')) item.removeAttribute('id');
    const originalControls = leaf.querySelectorAll('input,select,textarea');
    clone.querySelectorAll('input,select,textarea').forEach((item, index) => {
      if (item instanceof HTMLSelectElement) item.selectedIndex = originalControls[index].selectedIndex;
      else item.value = originalControls[index].value;
    });
    clone.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px;display:block;transform:none;clip-path:none;margin:0;pointer-events:none;`;
    return clone;
  }
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  function clipPolygon(points, normal, limit, less = true) {
    if (!points.length) return points;
    const clipped = [];
    for (let index = 0; index < points.length; index++) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      const da = dot(a, normal) - limit;
      const db = dot(b, normal) - limit;
      const insideA = less ? da <= 0.00001 : da >= -0.00001;
      const insideB = less ? db <= 0.00001 : db >= -0.00001;
      if (insideA) clipped.push(a);
      if (insideA !== insideB) {
        const fraction = da / (da - db);
        clipped.push({ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction });
      }
    }
    return clipped;
  }
  function bandPolygon(sheet, normal, low, high) {
    let result = sheet;
    if (Number.isFinite(low)) result = clipPolygon(result, normal, low, false);
    if (Number.isFinite(high)) result = clipPolygon(result, normal, high);
    return result;
  }
  function constrainGrip(point, state) {
    // A corner cannot travel farther from either end of the sewn binding.
    // The two discs intersect at the open and fully turned corner positions.
    const pins = [{ x: state.spine, y: 0 }, { x: state.spine, y: height }];
    const radii = pins.map(pin => distance(state.corner, pin));
    const valid = candidate => pins.every((pin, index) => distance(candidate, pin) <= radii[index] + 0.0001);
    if (valid(point)) return point;
    const candidates = [state.corner, state.end];
    pins.forEach((pin, index) => {
      const length = distance(point, pin);
      if (!length) return;
      const scale = radii[index] / length;
      const candidate = { x: pin.x + (point.x - pin.x) * scale, y: pin.y + (point.y - pin.y) * scale };
      if (valid(candidate)) candidates.push(candidate);
    });
    return candidates.reduce((best, candidate) => distance(candidate, point) < distance(best, point) ? candidate : best);
  }
  function foldAt(point, state) {
    const p = constrainGrip(point, state);
    const d = distance(state.corner, p);
    if (d < 0.0001) {
      const normal = { x: state.forward ? 1 : -1, y: 0 };
      return { point: p, normal, b: dot(state.corner, normal), radius: 0, length: 0 };
    }
    const normal = { x: (state.corner.x - p.x) / d, y: (state.corner.y - p.y) / d };
    const pins = [{ x: state.spine, y: 0 }, { x: state.spine, y: height }];
    const spineLimit = Math.min(...pins.map(pin =>
      (distance(state.corner, pin) ** 2 - distance(p, pin) ** 2) / (Math.PI * d)));
    const radius = Math.max(0, Math.min(width * 0.105, 42, d / (2 * Math.PI),
      distance(p, state.end) / (2 * Math.PI), spineLimit * 0.995));
    return { point: p, normal, b: dot(state.corner, normal) - (d + Math.PI * radius) / 2,
      radius, length: Math.PI * radius };
  }
  function mapPaper(point, fold) {
    const s = dot(point, fold.normal) - fold.b;
    let f = s;
    let z = 0;
    if (s > 0) {
      if (fold.radius > 0.0001 && s < fold.length) {
        const angle = s / fold.radius;
        f = fold.radius * Math.sin(angle);
        z = fold.radius * (1 - Math.cos(angle));
      } else { f = fold.length - s; z = 2 * fold.radius; }
    }
    return { x: point.x + (f - s) * fold.normal.x, y: point.y + (f - s) * fold.normal.y, z };
  }
  function screenPoint(point, state) {
    const scale = state.perspective / (state.perspective - point.z);
    return { x: state.origin.x + (point.x - state.origin.x) * scale,
      y: state.origin.y + (point.y - state.origin.y) * scale };
  }
  function hull(points) {
    const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (sorted.length < 3) return sorted;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const half = sequence => {
      const result = [];
      for (const p of sequence) {
        while (result.length > 1 && cross(result.at(-2), result.at(-1), p) <= 0) result.pop();
        result.push(p);
      }
      result.pop();
      return result;
    };
    return [...half(sorted), ...half(sorted.reverse())];
  }
  function pathData(points) {
    return points.length > 2 ? `M${points.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join('L')}Z` : '';
  }
  function beginCurl(direction, grabY = height * 0.88) {
    if (!ready || mode !== 'book' || curl) return false;
    const step = orientation === 'landscape' ? 2 : 1;
    const target = current + (direction === 'next' ? step : -step);
    if (target < 0 || target >= pages.length) return false;
    if (reducedMotion.matches) { settle(target, true); return false; }
    const forward = direction === 'next';
    const from = current;
    const frontIndex = orientation === 'landscape' && forward ? Math.min(current + 1, pages.length - 1) : current;
    const backIndex = orientation === 'landscape' && !forward ? target + 1 : target;
    const front = pages[frontIndex].leaf;
    const back = pages[Math.min(backIndex, pages.length - 1)].leaf;
    const templates = new Map();
    const copyPage = leaf => {
      if (!templates.has(leaf)) templates.set(leaf, snapshot(leaf));
      return templates.get(leaf).cloneNode(true);
    };
    const pageLeft = orientation === 'landscape' && forward ? width : 0;
    const spine = orientation === 'landscape' ? width : forward ? 0 : width;
    const corner = { x: pageLeft + (forward ? width : 0), y: clamp(grabY, 0, height) };
    const end = { x: 2 * spine - corner.x, y: corner.y };
    const totalWidth = orientation === 'landscape' ? width * 2 : width;
    const perspective = Math.max(1800, width * 5);
    const layer = document.createElement('div');
    layer.className = 'reader-curl-layer';
    layer.inert = true;
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:6;perspective:${perspective}px;perspective-origin:50% 50%;transform-style:preserve-3d;overflow:visible;`;
    if (orientation === 'landscape') {
      const fixedIndex = forward ? current : current + 1;
      if (pages[fixedIndex]) {
        const fixed = copyPage(pages[fixedIndex].leaf);
        fixed.classList.add('reader-curl-fixed');
        fixed.style.left = forward ? '0px' : `${width}px`;
        layer.append(fixed);
      }
    }
    const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    shadow.classList.add('reader-curl-shadow');
    shadow.setAttribute('viewBox', `0 0 ${totalWidth} ${height}`);
    shadow.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:hidden;pointer-events:none;transform:translateZ(.5px);';
    const drop = document.createElementNS(shadow.namespaceURI, 'path');
    drop.classList.add('reader-curl-drop-shadow');
    drop.setAttribute('fill', '#302516');
    const contact = document.createElementNS(shadow.namespaceURI, 'path');
    contact.classList.add('reader-curl-contact-shadow');
    contact.setAttribute('fill', '#2b261c');
    shadow.append(drop, contact);
    layer.append(shadow);
    const patches = [];
    const count = orientation === 'portrait' ? 20 : 24;
    for (let index = 0; index < count + 2; index++) {
      const patch = document.createElement('div');
      patch.className = `reader-curl-patch${index > 0 && index <= count ? ' reader-curl-strip' : ''}`;
      patch.dataset.region = index === 0 ? 'flat' : index === count + 1 ? 'turned' : 'bend';
      patch.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px;transform-origin:0 0;transform-style:preserve-3d;will-change:transform;`;
      const faces = [];
      for (const side of ['front', 'back']) {
        const face = document.createElement('div');
        face.className = `reader-curl-face reader-curl-${side}`;
        face.style.cssText = `position:absolute;inset:0;backface-visibility:hidden;background:#faf9f4;${side === 'back' ? 'transform:rotateY(180deg);' : ''}`;
        // A single leaf's reverse is unprinted paper. In an open spread its
        // reverse is the actual facing page that will settle at the binding.
        if (side === 'front' || orientation === 'landscape') {
          const copy = copyPage(side === 'front' ? front : back);
          if (side === 'back') {
            copy.classList.toggle('--left', forward);
            copy.classList.toggle('--right', !forward);
          }
          face.append(copy);
        }
        const tint = document.createElement('div');
        tint.className = 'reader-curl-paper-shade';
        tint.style.cssText = 'position:absolute;inset:0;background:#4b4030;pointer-events:none;opacity:0;';
        face.append(tint);
        patch.append(face);
        faces.push({ face, tint, side });
      }
      layer.append(patch);
      patches.push({ patch, faces });
    }
    stage.append(layer);
    curl = { from, target, direction, forward, layer, patches, drop, contact, progress: 0, count,
      pageLeft, spine, corner, end, perspective, origin: { x: totalWidth / 2, y: height / 2 },
      sheet: [{ x: pageLeft, y: 0 }, { x: pageLeft + width, y: 0 },
        { x: pageLeft + width, y: height }, { x: pageLeft, y: height }],
      pointer: { ...corner }, velocity: { x: 0, y: 0 }, paintFrame: 0 };
    settle(target);
    // No facing paper exists to the left of the closed front cover. The
    // turning cover's reverse supplies that page as it crosses the binding.
    if (orientation === 'landscape' && pages[from].entry.frontMatter && forward) pages[target].leaf.style.visibility = 'hidden';
    current = from;
    updateUI();
    renderCurl(corner);
    return true;
  }
  function renderPatch(state, patch, polygon, angle, distanceOnBend, fold) {
    if (polygon.length < 3) { patch.patch.style.display = 'none'; return; }
    patch.patch.style.display = 'block';
    const nx = fold.normal.x;
    const ny = fold.normal.y;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const a11 = 1 + (c - 1) * nx * nx;
    const a12 = (c - 1) * nx * ny;
    const a22 = 1 + (c - 1) * ny * ny;
    let k = 0;
    let tz = 0;
    if (angle > 0) {
      const f = angle >= Math.PI ? fold.length - distanceOnBend : fold.radius * s;
      k = fold.b + f - c * (fold.b + distanceOnBend);
      tz = fold.radius * (1 - c) - s * (fold.b + distanceOnBend);
    }
    const tx = nx * k + a11 * state.pageLeft;
    const ty = ny * k + a12 * state.pageLeft;
    tz += s * nx * state.pageLeft;
    patch.patch.style.transform = `matrix3d(${a11},${a12},${s * nx},0,${a12},${a22},${s * ny},0,${-s * nx},${-s * ny},${c},0,${tx},${ty},${tz + 1},1)`;
    for (const { face, tint, side } of patch.faces) {
      const back = side === 'back';
      face.style.clipPath = `polygon(${polygon.map(point => `${(back ? width - (point.x - state.pageLeft) : point.x - state.pageLeft).toFixed(3)}px ${point.y.toFixed(3)}px`).join(',')})`;
      const normalLight = (-s * nx * -0.24 - s * ny * -0.32 + c * 0.916) * (back ? -1 : 1);
      const shade = clamp((1 - normalLight) * 0.075 + Math.abs(s) * 0.018, 0, 0.17);
      // The flat, untouched region retains exactly its original paper colour.
      tint.style.opacity = String(angle === 0 ? 0 : shade);
    }
  }
  function renderCurl(pointer) {
    if (!curl) return;
    const state = curl;
    state.pointer = { ...pointer };
    let fold = foldAt(pointer, state);
    // Invert the overlay camera so the lifted edge stays beneath the finger.
    // The gripped point is on the flat reverse at z = 2R.
    for (let iteration = 0; iteration < 4; iteration++) {
      const scale = 1 - (2 * fold.radius + 1) / state.perspective;
      fold = foldAt({ x: state.origin.x + (pointer.x - state.origin.x) * scale,
        y: state.origin.y + (pointer.y - state.origin.y) * scale }, state);
    }
    const n = fold.normal;
    const epsilon = 0.12;
    renderPatch(state, state.patches[0], bandPolygon(state.sheet, n, -Infinity, fold.b + epsilon), 0, 0, fold);
    for (let index = 0; index < state.count; index++) {
      const low = fold.length * index / state.count;
      const high = fold.length * (index + 1) / state.count;
      const middle = (low + high) / 2;
      const polygon = fold.radius > 0.0001 ? bandPolygon(state.sheet, n, fold.b + low - epsilon, fold.b + high + epsilon) : [];
      renderPatch(state, state.patches[index + 1], polygon, (index + 0.5) * Math.PI / state.count, middle, fold);
    }
    renderPatch(state, state.patches.at(-1), bandPolygon(state.sheet, n, fold.b + fold.length - epsilon, Infinity), Math.PI, fold.length, fold);
    const lifted = bandPolygon(state.sheet, n, fold.b, Infinity);
    const samples = [];
    for (let index = 0; index < lifted.length; index++) {
      const a = lifted[index];
      const b = lifted[(index + 1) % lifted.length];
      for (let step = 0; step <= 12; step++) {
        const f = step / 12;
        const point = mapPaper({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, fold);
        samples.push({ x: point.x + point.z * 0.18, y: point.y + point.z * 0.24 });
      }
    }
    const shadeStrength = Math.min(1, fold.radius / 6);
    state.drop.setAttribute('d', pathData(hull(samples)));
    state.drop.style.opacity = String(shadeStrength * 0.16);
    state.drop.style.filter = `blur(${(1.5 + fold.radius * 0.11).toFixed(2)}px)`;
    const contactWidth = 1.6 + fold.radius * 0.075;
    state.contact.setAttribute('d', pathData(bandPolygon(state.sheet, n, fold.b - contactWidth, fold.b + contactWidth)));
    state.contact.style.opacity = String(shadeStrength * 0.19);
    state.contact.style.filter = 'blur(1.2px)';
    const grip = mapPaper(state.corner, fold);
    grip.z += 1;
    const projected = screenPoint(grip, state);
    state.progress = clamp((state.corner.x - fold.point.x) / (state.corner.x - state.end.x), 0, 1);
    state.layer.dataset.progress = state.progress.toFixed(4);
    state.layer.dataset.pointerX = pointer.x.toFixed(2);
    state.layer.dataset.pointerY = pointer.y.toFixed(2);
    state.layer.dataset.gripX = projected.x.toFixed(2);
    state.layer.dataset.gripY = projected.y.toFixed(2);
    state.layer.dataset.radius = fold.radius.toFixed(2);
    state.layer.dataset.normalY = n.y.toFixed(4);
  }
  function finishCurl(commit = true) {
    cancelAnimationFrame(frame);
    if (!commit) queuedCurlTurn = null;
    if (!curl) return;
    const saved = curl;
    cancelAnimationFrame(saved.paintFrame);
    curl = null;
    if (drag) {
      const id = drag.id;
      drag = null;
      if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
    }
    saved.layer.remove();
    settle(commit ? saved.target : saved.from, commit);
    if (commit && queuedCurlTurn) {
      const direction = queuedCurlTurn;
      queuedCurlTurn = null;
      turn(direction);
    }
  }
  function animateCurl(destination = 1, gesture = false) {
    if (!curl) return;
    cancelAnimationFrame(frame);
    cancelAnimationFrame(curl.paintFrame);
    const state = curl;
    const target = destination ? state.end : state.corner;
    const p = { ...state.pointer };
    const velocity = gesture ? { ...state.velocity } : { x: 0, y: 0 };
    const omega = gesture ? destination ? 17 : 21 : 12;
    const start = performance.now();
    let previousTime = start;
    const tick = now => {
      if (curl !== state) return;
      let elapsed = Math.min((now - previousTime) / 1000, 1 / 30);
      previousTime = now;
      while (elapsed > 0) {
        const dt = Math.min(elapsed, 1 / 120);
        const progress = clamp((state.corner.x - p.x) / (state.corner.x - state.end.x), 0, 1);
        const bow = gesture ? 0 : Math.sin(progress * Math.PI) * height * 0.12 * (state.corner.y > height / 2 ? -1 : 1);
        velocity.x += (omega * omega * (target.x - p.x) - 2 * 0.98 * omega * velocity.x) * dt;
        velocity.y += (omega * omega * (target.y + bow - p.y) - 2 * 0.98 * omega * velocity.y) * dt;
        p.x += velocity.x * dt;
        p.y += velocity.y * dt;
        elapsed -= dt;
      }
      renderCurl(p);
      if ((distance(p, target) < 0.35 && Math.hypot(velocity.x, velocity.y) < 6) || now - start > 1500) finishCurl(Boolean(destination));
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }
  function turn(direction) {
    if (curl) { if (!drag) queuedCurlTurn = direction; return; }
    if (pendingExample) { queuedTurn = direction; return; }
    if (beginCurl(direction)) animateCurl();
  }
  function interactive(target) {
    return target instanceof Element && Boolean(target.closest('a,button,input,select,textarea,label,[contenteditable="true"]'));
  }
  stage.addEventListener('pointerdown', event => {
    if (mode !== 'book' || !ready || curl || pendingExample || event.button !== 0) return;
    const cornerButton = event.target instanceof Element ? event.target.closest('.folio-turn') : null;
    if (interactive(event.target) && !cornerButton) return;
    const rect = stage.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const edge = Math.min(52, width * 0.16);
    const direction = cornerButton?.dataset.direction || (x >= rect.width - edge ? 'next' : x <= edge ? 'prev' : null);
    if (!direction) { book.focus({ preventScroll: true }); return; }
    if (reducedMotion.matches) {
      if (!cornerButton) { turn(direction); suppressClick = true; }
      return;
    }
    const grabY = cornerButton ? y < height / 2 ? 0 : height : y;
    if (!beginCurl(direction, grabY)) return;
    event.preventDefault();
    stage.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, rect, start: { x, y }, previous: { x, y }, at: performance.now(), direction, moved: false,
      offset: { x: curl.corner.x - x, y: curl.corner.y - y } };
    book.focus({ preventScroll: true });
  });
  stage.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId || !curl) return;
    event.preventDefault();
    const x = event.clientX - drag.rect.left;
    const y = event.clientY - drag.rect.top;
    const now = performance.now();
    const elapsed = Math.max(4, now - drag.at) / 1000;
    if (distance({ x, y }, drag.start) > 5) drag.moved = true;
    const decay = Math.exp(-elapsed / 0.035);
    curl.velocity.x = curl.velocity.x * decay + clamp((x - drag.previous.x) / elapsed, -2400, 2400) * (1 - decay);
    curl.velocity.y = curl.velocity.y * decay + clamp((y - drag.previous.y) / elapsed, -2400, 2400) * (1 - decay);
    drag.previous = { x, y };
    drag.at = now;
    curl.pointer = { x: x + drag.offset.x, y: y + drag.offset.y };
    if (!curl.paintFrame) curl.paintFrame = requestAnimationFrame(() => {
      if (!curl) return;
      curl.paintFrame = 0;
      renderCurl(curl.pointer);
    });
  });
  function releaseDrag(event, cancelled = false) {
    if (!drag || drag.id !== event.pointerId || !curl) return;
    const saved = drag;
    drag = null;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    // A cancelled pointer does not produce a click to suppress.
    suppressClick = !cancelled;
    cancelAnimationFrame(curl.paintFrame);
    curl.paintFrame = 0;
    const idleDecay = Math.exp(-(performance.now() - saved.at) / 70);
    curl.velocity.x *= idleDecay;
    curl.velocity.y *= idleDecay;
    renderCurl(curl.pointer);
    const predicted = curl.progress - curl.velocity.x * (curl.forward ? 1 : -1) * 0.16 / (width * 2);
    animateCurl(!cancelled && (!saved.moved || predicted > 0.42) ? 1 : 0, saved.moved);
  }
  stage.addEventListener('pointerup', event => releaseDrag(event));
  stage.addEventListener('pointercancel', event => releaseDrag(event, true));
  stage.addEventListener('lostpointercapture', event => { if (drag?.id === event.pointerId) releaseDrag(event, true); });
  stage.addEventListener('click', event => {
    if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; }
  }, true);
  previous.addEventListener('click', () => turn('prev'));
  next.addEventListener('click', () => turn('next'));
  corners.forEach(button => button.addEventListener('click', () => turn(button.dataset.direction)));
  location.addEventListener('change', () => navigate(location.value, true));
  bookMode.addEventListener('click', () => chooseMode('book'));
  textMode.addEventListener('click', () => chooseMode('text'));
  document.addEventListener('keydown', event => {
    if (mode !== 'book' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
        (!reader.contains(event.target) && !controls.contains(event.target)) ||
        (event.target instanceof Element && event.target.closest('input,select,textarea,[contenteditable="true"]'))) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      turn(event.key === 'ArrowRight' ? 'next' : 'prev');
    }
  });
  book.addEventListener('click', event => {
    if (mode === 'book' && event.target instanceof Element && event.target.closest('summary')) event.preventDefault();
  });
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || !url.hash) return;
    let anchor;
    try { anchor = decodeURIComponent(url.hash.slice(1)); } catch { return; }
    if (navigate(anchor, true)) event.preventDefault();
  });
  function historyChanged() { if (ready) navigate(fragment() || 'book-title'); }
  window.addEventListener('popstate', historyChanged);
  window.addEventListener('hashchange', historyChanged);
  function scheduleResize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (!ready || rebuilding || pendingExample || printState) return;
      if (mode === 'text') {
        if (!restoringText && textPosition && textGeometryKey !== textGeometry()) restoreTextPosition(textPosition);
        return;
      }
      const anchor = readingPosition();
      const previousKey = geometryKey;
      const key = geometry();
      if (key !== previousKey) rebuild(anchor, document.activeElement?.id || '');
    });
  }
  window.addEventListener('resize', scheduleResize);
  new ResizeObserver(measureToolbar).observe(controls);
  const resizeObserver = new ResizeObserver(scheduleResize);
  resizeObserver.observe(canvas);
  new MutationObserver(scheduleResize).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  document.fonts?.addEventListener('loadingdone', scheduleResize);
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) finishCurl(true); });
  window.addEventListener('beforeprint', () => {
    if (printState) return;
    printState = { mode, anchor: pendingExample ? pendingExampleAnchor : mode === 'book' ? readingPosition() : fragment(),
      hash: window.location.hash, page: current, geometry: geometryKey, pending: pendingExample };
    clearExampleUpdate();
    if (mode === 'book') {
      finishCurl(false);
      restore();
      modeUI('text');
    }
    chapters.forEach(chapter => { chapter.open = true; });
  });
  window.addEventListener('afterprint', () => {
    if (!printState) return;
    const saved = printState;
    printState = null;
    if (saved.mode === 'book') {
      modeUI('book');
      rebuild(saved.anchor);
      if (!saved.pending && saved.geometry === geometryKey) settle(saved.page);
    }
    const url = new URL(window.location.href);
    url.hash = saved.hash;
    history.replaceState(history.state, '', url);
  });
  const initialise = () => {
    try { chooseMode(preferredMode(), false); }
    catch (error) {
      finishCurl(false);
      restore();
      modeUI('text');
      chapters.forEach(chapter => { chapter.open = true; });
      status.textContent = labels.fallback;
      console.warn(labels.fallback);
    }
  };
  if (document.fonts?.ready) void document.fonts.ready.then(initialise);
  else initialise();
})();
