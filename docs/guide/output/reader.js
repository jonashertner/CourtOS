(() => {
  'use strict';
  const pages = Array.from(document.querySelectorAll('main .section'));
  if (!pages.length) return;
  const chapter = document.querySelector('#chapter');
  const modes = Array.from(document.querySelectorAll('[data-mode]'));
  const previous = document.querySelector('#previous-spread');
  const next = document.querySelector('#next-spread');
  const progress = document.querySelector('#reading-progress');
  const narrow = window.matchMedia('(max-width:1100px)');
  let book = false;
  let ready = false;
  let current = Math.max(0, pages.findIndex(p => '#' + p.id === location.hash));
  const spreadSize = () => narrow.matches ? 1 : 2;
  function render(move = false) {
    const size = spreadSize();
    const start = Math.floor(current / size) * size;
    document.body.classList.toggle('book-mode', book);
    pages.forEach((page, i) => { page.hidden = book && (i < start || i >= start + size); });
    modes.forEach(button => button.setAttribute('aria-pressed', String((button.dataset.mode === 'book') === book)));
    chapter.value = pages[current].id;
    document.querySelectorAll('header .language a').forEach(link => { link.href = link.getAttribute('href').split('#')[0] + '#' + pages[current].id; });
    previous.disabled = start === 0;
    next.disabled = start + size >= pages.length;
    progress.textContent = `${start + 1}${size > 1 && start + 1 < pages.length ? '–' + Math.min(start + size, pages.length) : ''} / ${pages.length}`;
    if (move) {
      history.replaceState(null, '', '#' + pages[current].id);
      const target = book ? document.querySelector('.reader-tools') : pages[current];
      target.scrollIntoView({block:'start', behavior:'instant'});
    }
  }
  modes.forEach(button => button.addEventListener('click', () => { book = button.dataset.mode === 'book'; render(true); }));
  chapter.addEventListener('change', () => { current = pages.findIndex(p => p.id === chapter.value); history.replaceState(null, '', '#' + pages[current].id); render(true); });
  previous.addEventListener('click', () => { current = Math.max(0, Math.floor(current / spreadSize()) * spreadSize() - spreadSize()); render(true); });
  next.addEventListener('click', () => { current = Math.min(pages.length - 1, Math.floor(current / spreadSize()) * spreadSize() + spreadSize()); render(true); });
  window.addEventListener('hashchange', () => { const index = pages.findIndex(p => '#' + p.id === location.hash); if (index >= 0) { current = index; render(true); } });
  narrow.addEventListener('change', () => render());
  document.addEventListener('keydown', event => {
    if (!book || event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName)) return;
    if (event.key === 'ArrowLeft' && !previous.disabled) { previous.click(); event.preventDefault(); }
    if (event.key === 'ArrowRight' && !next.disabled) { next.click(); event.preventDefault(); }
  });
  render();
  document.fonts.ready.then(() => {
    // Honour the incoming chapter after font metrics and anchor layout settle.
    const requested = pages.findIndex(p => '#' + p.id === location.hash);
    if (requested >= 0) current = requested;
    render(Boolean(location.hash));
    ready = true;
    document.documentElement.classList.remove('no-js');
  });
})();
