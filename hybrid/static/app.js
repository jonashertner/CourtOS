'use strict';

(() => {
  const scriptURL = document.querySelector('script[src$="app.js"]').src;
  const base = new URL('../', scriptURL);
  const $ = id => document.getElementById(id);
  const state = {
    csrf: null, user: null, authMode: null, bootstrap: null, step: 1,
    packet: null, question: null, selectedSources: new Set(), references: new Map(),
    jobs: { chronology: null, external: null, synthesis: null }, busy: new Set(),
    completed: new Set(), generation: 0
  };
  const jobAreas = { chronology: 'chronology', external: 'analysis', synthesis: 'synthesis' };
  const activeJob = job => job && ['queued', 'running'].includes(job.status);
  const apiURL = path => new URL(`api/${path}`, base);

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  }

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 25000);
    const headers = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.method && options.method !== 'GET' && state.csrf) headers['X-CSRF-Token'] = state.csrf;
    try {
      const response = await fetch(apiURL(path), {
        method: options.method || 'GET', credentials: 'same-origin', cache: 'no-store',
        headers, signal: controller.signal,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
      });
      let data;
      try { data = await response.json(); }
      catch (_) { throw Object.assign(new Error('Die Antwort konnte nicht gelesen werden. Prüfen Sie Ihre Verbindung oder melden Sie sich erneut an.'), { status: response.status }); }
      if (!response.ok) {
        if (data.auth_mode) state.authMode = data.auth_mode;
        const error = new Error(typeof data.error === 'string' ? data.error : 'Die Anfrage konnte nicht ausgeführt werden.');
        error.status = response.status;
        if (response.status === 401 && state.user) expireSession();
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Die Verbindung hat zu lange gedauert. Ein bereits gestarteter Auftrag kann auf dem Server weiterlaufen.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  function globalMessage(message, error = false) {
    $('global-message').textContent = message || '';
    $('global-message').hidden = !message;
    $('global-message').classList.toggle('error', error);
  }

  function setBusy(name, busy) {
    if (busy) state.busy.add(name); else state.busy.delete(name);
    updateControls();
  }

  function safeURL(value) {
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
    catch (_) { return null; }
  }

  function sourceLink(source) {
    const href = safeURL(source.url);
    if (!href) return null;
    const link = make('a', 'source-original', 'Originalquelle öffnen ↗');
    link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `Originalquelle öffnen: ${source.title}`);
    return link;
  }

  function paragraphCard(paragraph, attachID = false) {
    const card = make('div', 'paragraph-card');
    if (attachID) card.id = `paragraph-${paragraph.id}`;
    const kind = paragraph.kind === 'editorial_context' ? 'Redaktionelle Einordnung · kein Zitat' : paragraph.kind === 'quotation' ? 'Wortlautauszug' : '';
    card.append(make('span', 'paragraph-id', [paragraph.id, kind, paragraph.locator].filter(Boolean).join(' · ')), make('p', '', paragraph.text));
    return card;
  }

  function registerReferences() {
    state.references.clear();
    for (const document of state.bootstrap.documents || []) {
      state.references.set(String(document.id), { kind: 'document', item: document });
      for (const paragraph of document.paragraphs || []) state.references.set(String(paragraph.id), { kind: 'document', item: document, paragraph });
    }
    for (const source of state.bootstrap.sources || []) {
      state.references.set(String(source.id), { kind: 'source', item: source });
      for (const paragraph of source.passages || []) state.references.set(String(paragraph.id), { kind: 'source', item: source, paragraph });
    }
  }

  function renderDocuments() {
    const list = $('documents'); list.replaceChildren();
    for (const [index, document] of (state.bootstrap.documents || []).entries()) {
      const details = make('details', 'document-card');
      if (index === 0) details.open = true;
      const summary = make('summary');
      summary.append(make('span', 'document-code', document.id), make('h2', '', document.title));
      const body = make('div', 'document-body');
      body.append(make('p', 'document-meta', [document.date, 'Synthetisches Dokument'].filter(Boolean).join(' · ')));
      for (const paragraph of document.paragraphs || []) body.append(paragraphCard(paragraph, true));
      details.append(summary, body); list.append(details);
    }
  }

  function invalidatePacket() {
    state.packet = null;
    state.completed.delete(4);
    $('packet-review').hidden = true; $('packet-empty').hidden = false;
    updateControls();
  }

  function renderQuestions() {
    const container = $('questions'); container.replaceChildren();
    for (const question of state.bootstrap.questions || []) {
      const label = make('label', 'question-option');
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'public-question'; radio.value = question.id;
      radio.checked = question.id === state.question;
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        state.question = question.id;
        state.selectedSources = new Set((question.source_ids || []).map(String));
        invalidatePacket(); renderSources();
      });
      const description = make('div');
      description.append(make('strong', '', question.title || question.id), make('p', '', question.text));
      label.append(radio, description); container.append(label);
    }
  }

  function sourceCard(source, selectable = true) {
    const card = make('article', 'source-card');
    const label = make(selectable ? 'label' : 'div', 'source-select-label');
    if (selectable) {
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = source.id;
      checkbox.checked = state.selectedSources.has(String(source.id)); checkbox.name = 'source';
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.selectedSources.add(String(source.id)); else state.selectedSources.delete(String(source.id));
        invalidatePacket();
      });
      label.append(checkbox);
    }
    label.append(make('strong', '', `${source.id} · ${source.title}`)); card.append(label);
    const locator = [source.locator, source.checked_date ? `Geprüfter Stand: ${source.checked_date}` : ''].filter(Boolean).join(' · ');
    if (locator) card.append(make('p', 'source-locator', locator));
    const link = sourceLink(source); if (link) card.append(link);
    const details = make('details'); details.append(make('summary', '', 'Auszüge und redaktionelle Einordnung lesen'));
    for (const passage of source.passages || []) details.append(paragraphCard(passage));
    card.append(details); return card;
  }

  function renderSources() {
    $('source-selection').replaceChildren(...(state.bootstrap.sources || []).map(source => sourceCard(source)));
    updateControls();
  }

  function showReference(id) {
    const reference = state.references.get(id); if (!reference) return;
    $('reference-kind').textContent = reference.kind === 'source' ? 'Öffentliche Rechtsquelle · Beleg und Einordnung' : 'Synthetisches Dossier · Originalstelle';
    $('reference-title').textContent = `${reference.item.id} · ${reference.item.title}`;
    const content = $('reference-content'); content.replaceChildren();
    if (reference.kind === 'source') {
      if (reference.item.locator) content.append(make('p', 'muted', reference.item.locator));
      const link = sourceLink(reference.item); if (link) content.append(link);
    }
    const paragraphs = reference.paragraph ? [reference.paragraph] : (reference.item.paragraphs || reference.item.passages || []);
    for (const paragraph of paragraphs) content.append(paragraphCard(paragraph));
    $('reference-dialog').showModal();
  }

  function appendReferencedText(container, text) {
    const pattern = /\[([^\]\n]{1,120})\]/g;
    let previous = 0;
    for (const match of text.matchAll(pattern)) {
      const ids = match[1].split(/\s*[,;]\s*/).map(id => id.trim());
      if (!ids.length || !ids.every(id => state.references.has(id))) continue;
      container.append(document.createTextNode(text.slice(previous, match.index)));
      for (const id of ids) {
        const button = make('button', 'reference-button', `[${id}]`); button.type = 'button';
        button.setAttribute('aria-label', `Originalstelle ${id} anzeigen`);
        button.addEventListener('click', () => showReference(id));
        container.append(button);
      }
      previous = match.index + match[0].length;
    }
    container.append(document.createTextNode(text.slice(previous)));
  }

  function appendModelInline(container, text) {
    // Only paired emphasis markers are interpreted; model HTML stays text.
    const pattern = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
    let previous = 0;
    for (const match of text.matchAll(pattern)) {
      appendReferencedText(container, text.slice(previous, match.index));
      const emphasis = make(match[1] !== undefined ? 'strong' : 'em');
      appendReferencedText(emphasis, match[1] ?? match[2]);
      container.append(emphasis);
      previous = match.index + match[0].length;
    }
    appendReferencedText(container, text.slice(previous));
  }

  function renderModelText(container, result) {
    container.replaceChildren();
    const text = typeof result === 'string' ? result : typeof result?.text === 'string' ? result.text : JSON.stringify(result ?? '', null, 2);
    let paragraph = [], list = null;
    const flushParagraph = () => {
      if (!paragraph.length) return;
      const block = make('p');
      appendModelInline(block, paragraph.join('\n'));
      container.append(block); paragraph = [];
    };
    for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
      if (!line.trim()) { flushParagraph(); list = null; continue; }
      const bullet = line.match(/^\s*[-*]\s+(.+)$/);
      if (bullet) {
        flushParagraph();
        if (!list) { list = make('ul'); container.append(list); }
        const item = make('li'); appendModelInline(item, bullet[1]); list.append(item);
      } else if (/^\s*\*\*[^*\n]+\*\*:?\s*$/.test(line)) {
        flushParagraph(); list = null;
        const heading = make('h3'); appendModelInline(heading, line.trim()); container.append(heading);
      } else if (list && /^\s+\S/.test(line)) {
        appendModelInline(list.lastElementChild, '\n' + line.trimStart());
      } else {
        list = null; paragraph.push(line);
      }
    }
    flushParagraph();
  }

  function updateControls() {
    if (!state.bootstrap) return;
    const model = state.bootstrap.model || {}; const status = state.bootstrap.status || {};
    const localReady = status.local_ready === true && model.ready !== false;
    const externalReady = status.external_ready === true;
    const localActive = activeJob(state.jobs.chronology) || activeJob(state.jobs.synthesis);
    const externalActive = activeJob(state.jobs.external);
    $('runtime-model').textContent = model.name || 'Lokales Modell noch nicht eingerichtet';
    $('runtime-location').textContent = status.location || 'Selbst betriebenes Modell auf der Hetzner-Testumgebung in Deutschland. CPU-Betrieb; nicht im Netz Ihres Gerichts.';
    $('runtime-state').textContent = localReady ? 'Lokales Modell erreichbar' : 'Lokales Modell noch nicht bereit';
    $('runtime-state').classList.toggle('ready', localReady);
    const availability = localReady ? 'Der lokale CPU-Aufruf kann mehrere Minuten dauern. Sie können währenddessen andere Schritte und Originalstellen ansehen.' : 'Das lokale Modell ist derzeit nicht bereit. Sie können das Dossier und die öffentlichen Quellen bereits lesen; der Modellaufruf bleibt deaktiviert.';
    $('chronology-availability').textContent = availability; $('synthesis-availability').textContent = availability;
    $('run-chronology').disabled = !localReady || localActive || state.busy.has('chronology');
    $('run-synthesis').disabled = !localReady || localActive || externalActive || state.busy.has('synthesis');
    $('prepare-packet').disabled = !state.question || !state.selectedSources.size || state.busy.has('packet') || externalActive || activeJob(state.jobs.synthesis);
    $('prepare-packet').textContent = state.busy.has('packet') ? 'Anfrage wird vorbereitet …' : 'Anfrage zur Prüfung vorbereiten →';
    $('send-packet').disabled = !state.packet || state.packet.status !== 'prepared' || !externalReady || state.busy.has('send') || externalActive;
    $('send-packet').textContent = state.busy.has('send') ? 'Freigabe wird übermittelt …' : state.packet?.status === 'submitted' ? 'Für dieses Paket wurde ein Auftrag angelegt' : 'Dieses Paket freigeben und senden ↗';
    $('external-availability').textContent = externalReady ? 'Nur dieses unveränderte Paket wird übermittelt. Es gibt keine automatische Weiterleitung Ihres Dossiers.' : 'Der externe Dienst ist noch nicht freigeschaltet oder derzeit nicht bereit. Die Anfrage bleibt zur Prüfung verfügbar.';
    document.querySelectorAll('#questions input, #source-selection input').forEach(input => { input.disabled = externalActive || state.busy.has('packet') || state.busy.has('send') || activeJob(state.jobs.synthesis); });
    $('change-packet').disabled = externalActive || state.busy.has('send');
    const externalResult = state.jobs.external?.status === 'succeeded';
    $('synthesis-input-note').textContent = externalResult ? 'Der lokale Aufruf verbindet das synthetische Dossier mit der externen Quellenanalyse aus Schritt 5. Prüfen Sie diese Analyse vorher selbst.' : 'Der Vermerk wird aus dem synthetischen Dossier erstellt. Es liegt noch keine erfolgreiche externe Analyse zur Einbeziehung vor.';
    for (const button of document.querySelectorAll('.step-button')) {
      const step = Number(button.dataset.step);
      if (step === state.step) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
      button.querySelector('.step-check').textContent = state.completed.has(step) ? '✓' : '';
    }
  }

  function showStep(step, focus = true) {
    state.step = Number(step);
    document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = Number(panel.dataset.panel) !== state.step; });
    updateControls();
    const heading = $(`heading-${state.step}`);
    if (focus && heading) { heading.focus({ preventScroll: true }); heading.scrollIntoView({ block: 'start', behavior: 'auto' }); }
  }

  function flattenContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map(block => typeof block === 'string' ? block : block.text !== undefined ? String(block.text) : JSON.stringify(block, null, 2)).join('\n\n');
    return JSON.stringify(content ?? '', null, 2);
  }

  function renderPacket() {
    const packet = state.packet; if (!packet) return;
    $('packet-empty').hidden = true; $('packet-review').hidden = false;
    $('packet-provider').textContent = packet.provider || 'Nicht angegeben'; $('packet-model').textContent = packet.model || packet.payload?.model || 'Nicht angegeben';
    $('packet-json').textContent = JSON.stringify(packet.payload, null, 2); $('packet-hash').textContent = packet.hash;
    const messages = $('packet-messages'); messages.replaceChildren();
    const addMessage = (title, content) => {
      const section = make('section', 'message-preview'); section.append(make('h2', '', title));
      const body = make('div', 'message-content', flattenContent(content)); body.tabIndex = 0;
      body.setAttribute('aria-label', title); section.append(body); messages.append(section);
    };
    if (packet.payload?.system !== undefined) addMessage('Vollständige Systemanweisung', packet.payload.system);
    for (const [index, message] of (packet.payload?.messages || []).entries()) {
      addMessage(`Nachricht ${index + 1} · ${message.role === 'user' ? 'Nutzereingabe' : message.role || 'Inhalt'}`, message.content);
    }
    if (!messages.childElementCount) addMessage('Vollständiger Anfrageinhalt', packet.payload);
    state.completed.add(3); updateControls();
  }

  async function preparePacket() {
    if (!state.question || !state.selectedSources.size || state.busy.has('packet')) return;
    const selectedSources = Array.from(state.selectedSources);
    const question = state.question;
    setBusy('packet', true); globalMessage('');
    try {
      state.packet = await api('packets', { method: 'POST', body: { question_id: question, source_ids: selectedSources } });
      state.packet.source_ids = selectedSources;
      state.jobs.external = null; state.jobs.synthesis = null;
      state.completed.delete(4); state.completed.delete(5); state.completed.delete(6);
      ['analysis-job', 'analysis-result', 'analysis-sources', 'synthesis-job', 'synthesis-result', 'export-link'].forEach(id => { $(id).hidden = true; });
      $('analysis-empty').hidden = false;
      renderPacket(); showStep(4);
    } catch (error) { globalMessage(error.message, true); }
    finally { setBusy('packet', false); }
  }

  function elapsedLabel(job) {
    const seconds = Math.max(0, Math.floor((Date.now() - job.startedAt) / 1000));
    return seconds < 60 ? `${seconds} Sek. seit Beginn der Statusanzeige` : `${Math.floor(seconds / 60)} Min. ${seconds % 60} Sek. seit Beginn der Statusanzeige`;
  }

  function renderJob(kind) {
    const job = state.jobs[kind]; if (!job) return;
    const area = $(`${jobAreas[kind]}-job`);
    const renderKey = `${job.status}:${job.paused || ''}`;
    if (job.renderKey === renderKey && !area.hidden) {
      const elapsed = area.querySelector('.job-elapsed');
      if (elapsed) elapsed.textContent = elapsedLabel(job);
      return;
    }
    job.renderKey = renderKey; area.hidden = false; area.replaceChildren();
    const status = make('div', `job-status ${job.status}`); status.setAttribute('role', 'status');
    const heading = make('div', 'job-heading');
    if (activeJob(job) && !job.paused) { const spinner = make('span', 'job-spinner'); spinner.setAttribute('aria-hidden', 'true'); heading.append(spinner); }
    const statusLabels = { queued: 'Auftrag wartet auf Verarbeitung', running: 'Auftrag wird verarbeitet', succeeded: 'Auftrag abgeschlossen', failed: 'Auftrag fehlgeschlagen' };
    heading.append(make('strong', '', job.paused ? 'Statusabfrage unterbrochen' : statusLabels[job.status] || job.status)); status.append(heading);
    if (activeJob(job)) {
      status.append(make('p', '', job.paused || (kind === 'external' ? 'Die freigegebene Anfrage wird extern verarbeitet.' : 'Die Verarbeitung erfolgt auf dem CPU-Server; sie kann mehrere Minuten dauern.')));
      const elapsed = make('p', 'job-elapsed', elapsedLabel(job)); elapsed.setAttribute('aria-live', 'off'); status.append(elapsed);
      status.append(make('p', '', 'Sie können andere Schritte ansehen. Ein Wechsel des Schritts beendet den Auftrag nicht.'));
    }
    if (job.status === 'failed') status.append(make('p', '', typeof job.error === 'string' ? job.error : 'Der Server konnte den Auftrag nicht abschliessen. Es erfolgt keine automatische Weiterleitung.'));
    if (job.status === 'succeeded') status.append(make('p', '', job.result?.truncated ? 'Ausgabe am Tokenlimit beendet; möglicherweise unvollständig. Prüfen Sie die fehlenden Teile, bevor Sie mit dem Ergebnis weiterarbeiten.' : 'Das Ergebnis steht unten zur fachlichen Prüfung bereit.'));
    if (job.paused) {
      const resume = make('button', 'secondary-button', 'Status erneut abrufen'); resume.type = 'button';
      resume.addEventListener('click', () => { job.paused = null; job.pollStartedAt = Date.now(); job.errors = 0; pollJob(kind); }); status.append(resume);
    }
    area.append(status);
    if (kind === 'external') $('analysis-empty').hidden = true;
    if (job.status === 'succeeded') {
      const prefix = jobAreas[kind]; $(`${prefix}-result`).hidden = false;
      const resultCard = $(`${prefix}-result`);
      resultCard.querySelector('.truncation-warning')?.remove();
      if (job.result?.truncated) {
        const warning = make('div', 'boundary-note truncation-warning', 'Ausgabe am Tokenlimit beendet; möglicherweise unvollständig. Dieser Entwurf ist kein vollständiges Arbeitsergebnis.');
        warning.setAttribute('role', 'status'); resultCard.querySelector('header').after(warning);
      }
      renderModelText($(`${prefix}-text`), job.result);
      if (!job.result?.truncated) state.completed.add(kind === 'chronology' ? 2 : kind === 'external' ? 5 : 6);
      if (kind === 'external') {
        $('analysis-provenance').textContent = [job.provider || state.packet?.provider, job.result?.model || state.packet?.model].filter(Boolean).join(' · ');
        $('analysis-sources').hidden = false;
        const ids = job.source_ids || state.packet?.source_ids || [];
        $('analysis-source-list').replaceChildren(...(state.bootstrap.sources || []).filter(source => ids.includes(String(source.id))).map(source => sourceCard(source, false)));
      }
      if (kind === 'synthesis') { $('export-link').href = apiURL(`export/${encodeURIComponent(job.id)}`).href; $('export-link').hidden = false; }
    }
    updateControls();
  }

  function trackJob(kind, data) {
    if (state.jobs[kind]?.timer) clearTimeout(state.jobs[kind].timer);
    state.completed.delete(kind === 'chronology' ? 2 : kind === 'external' ? 5 : 6);
    state.jobs[kind] = { ...data, startedAt: Date.now(), pollStartedAt: Date.now(), errors: 0, generation: state.generation };
    $(`${jobAreas[kind]}-result`).hidden = true;
    if (kind === 'synthesis') $('export-link').hidden = true;
    renderJob(kind);
    if (activeJob(state.jobs[kind])) pollJob(kind);
  }

  async function pollJob(kind) {
    const job = state.jobs[kind]; if (!job || !activeJob(job) || job.generation !== state.generation) return;
    if (Date.now() - job.pollStartedAt > 12 * 60 * 1000) {
      job.paused = 'Der Auftrag dauert länger als erwartet. Die automatische Statusabfrage pausiert; ein Serverauftrag wird dadurch nicht abgebrochen.';
      renderJob(kind); return;
    }
    try {
      const data = await api(`jobs/${encodeURIComponent(job.id)}`);
      if (state.jobs[kind] !== job || job.generation !== state.generation) return;
      Object.assign(job, data, { errors: 0, paused: null }); renderJob(kind);
    } catch (error) {
      if (job.generation !== state.generation) return;
      job.errors++;
      if (job.errors >= 3 || [401, 403, 404].includes(error.status)) {
        job.paused = `Der aktuelle Serverstatus konnte nicht abgerufen werden. ${error.message}`;
        renderJob(kind); return;
      }
    }
    if (activeJob(job)) job.timer = window.setTimeout(() => pollJob(kind), 2000);
  }

  async function runLocal(action) {
    if (state.busy.has(action)) return;
    setBusy(action, true); globalMessage('');
    try {
      const body = { action };
      if (action === 'synthesis' && state.jobs.external?.status === 'succeeded') body.analysis_id = state.jobs.external.id;
      const data = await api('local', { method: 'POST', body }); trackJob(action, data);
    } catch (error) { globalMessage(error.message, true); }
    finally { setBusy(action, false); }
  }

  async function sendPacket() {
    const packet = state.packet;
    if (!packet || packet.status !== 'prepared' || state.busy.has('send')) return;
    setBusy('send', true); globalMessage('');
    try {
      const data = await api(`packets/${encodeURIComponent(packet.id)}/send`, { method: 'POST', body: { hash: packet.hash } });
      packet.status = 'submitted'; state.completed.add(4);
      trackJob('external', { ...data, source_ids: packet.source_ids, provider: packet.provider });
      showStep(5);
    } catch (error) {
      globalMessage(`${error.message} Die Anfrage wird nicht automatisch nochmals versendet.`, true);
      try {
        const actual = await api(`packets/${encodeURIComponent(packet.id)}`);
        Object.assign(packet, actual);
        if (actual.status === 'submitted' && actual.job_id) {
          const recoveredJob = await api(`jobs/${encodeURIComponent(actual.job_id)}`);
          trackJob('external', { ...recoveredJob, source_ids: packet.source_ids, provider: packet.provider }); showStep(5);
        } else if (actual.status === 'submitted') globalMessage('Das Paket wurde bereits angenommen. Der Auftragsstatus ist noch nicht verfügbar. Versenden Sie es nicht erneut; wenden Sie sich an den Betreiber.');
      } catch (_) { packet.status = 'unknown'; globalMessage('Der Versandstatus ist unbekannt. Ein Auftrag kann bereits laufen. Es erfolgt kein erneuter Versand; wenden Sie sich an den Betreiber.', true); }
    } finally { setBusy('send', false); }
  }

  function clearSession() {
    state.generation++;
    for (const job of Object.values(state.jobs)) if (job?.timer) clearTimeout(job.timer);
    state.jobs = { chronology: null, external: null, synthesis: null };
    state.csrf = null; state.user = null; state.bootstrap = null; state.packet = null;
    state.question = null; state.selectedSources.clear(); state.references.clear(); state.completed.clear(); state.busy.clear();
    ['documents', 'questions', 'source-selection', 'packet-messages', 'packet-json', 'packet-hash', 'chronology-text', 'analysis-text', 'synthesis-text', 'analysis-source-list', 'reference-content'].forEach(id => $(id).replaceChildren());
    ['chronology-job', 'analysis-job', 'synthesis-job', 'chronology-result', 'analysis-result', 'synthesis-result', 'analysis-sources', 'packet-review'].forEach(id => { $(id).hidden = true; });
    $('analysis-empty').hidden = false; $('packet-empty').hidden = false; $('export-link').hidden = true;
    $('account-name').textContent = ''; $('password').value = ''; $('workspace').hidden = true;
    $('account').hidden = true; $('edition').hidden = false; $('login-view').hidden = false;
    if ($('reference-dialog').open) $('reference-dialog').close();
  }

  function loginScreen(message = '') {
    $('login-view').hidden = false; $('workspace').hidden = true;
    $('login-form').hidden = false; $('login-submit').disabled = false;
    $('login-message').textContent = message;
    if (state.authMode === 'cloudflare') {
      $('login-form').hidden = true;
      const existing = $('access-login'); if (existing) existing.remove();
      const group = make('div'); group.id = 'access-login';
      group.append(make('p', 'muted', message || 'Melden Sie sich über Cloudflare Access mit Ihrer zugelassenen E-Mail-Adresse und dem Einmalcode an.'));
      const button = make('button', 'primary-button full-width', 'Mit E-Mail-Code anmelden →'); button.type = 'button';
      button.addEventListener('click', () => window.location.reload()); group.append(button);
      $('login-form').before(group);
    }
  }

  function expireSession() {
    const mode = state.authMode;
    clearSession(); state.authMode = mode;
    loginScreen('Ihre Sitzung ist abgelaufen. Melden Sie sich erneut an. Bereits gestartete Serveraufträge können weiterlaufen.');
  }

  async function loadWorkspace(me) {
    state.user = me.user; state.csrf = me.csrf; state.authMode = me.auth_mode || 'password';
    const data = await api('bootstrap'); state.bootstrap = data;
    if (data.status?.auth_mode) state.authMode = data.status.auth_mode;
    registerReferences();
    const firstQuestion = (data.questions || [])[0];
    state.question = firstQuestion?.id || null;
    state.selectedSources = new Set((firstQuestion?.source_ids || []).map(String));
    const resume = data.resume || {};
    if (resume.packet) {
      const content = JSON.parse(resume.packet.payload.messages[0].content);
      state.packet = resume.packet;
      state.packet.source_ids = content.sources.map(source => String(source.id));
      state.question = content.question.id;
      state.selectedSources = new Set(state.packet.source_ids);
    }
    renderDocuments(); renderQuestions(); renderSources();
    $('login-view').hidden = true; $('workspace').hidden = false; $('account').hidden = false; $('edition').hidden = true;
    $('account-name').textContent = state.user.username || state.user.email || 'Persönlicher Zugang';
    state.completed.add(1);
    if (state.packet) {
      renderPacket();
      if (state.packet.status === 'submitted') state.completed.add(4);
    }
    for (const kind of ['chronology', 'external', 'synthesis']) {
      if (resume.jobs?.[kind]) trackJob(kind, resume.jobs[kind]);
    }
    const lastStep = state.jobs.synthesis ? 6 : state.jobs.external ? 5 : state.packet ? 4 : state.jobs.chronology ? 2 : 1;
    showStep(lastStep, false); globalMessage('');
    $('main').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'auto' });
  }

  async function refreshStatus() {
    if (!state.user) return;
    $('refresh-status').disabled = true;
    try {
      const current = await api('bootstrap');
      state.bootstrap.model = current.model; state.bootstrap.status = current.status;
      updateControls(); globalMessage('Der Betriebsstatus wurde aktualisiert.');
    } catch (error) { globalMessage(error.message, true); }
    finally { $('refresh-status').disabled = false; }
  }

  $('login-form').addEventListener('submit', async event => {
    event.preventDefault(); $('login-submit').disabled = true; $('login-message').textContent = 'Zugang wird geprüft …';
    try {
      const me = await api('login', { method: 'POST', body: { username: $('username').value.trim(), password: $('password').value } });
      $('password').value = ''; await loadWorkspace(me);
    } catch (error) { $('password').value = ''; loginScreen(error.message); }
    finally { $('login-submit').disabled = false; }
  });
  $('logout').addEventListener('click', async () => {
    $('logout').disabled = true;
    try {
      await api('logout', { method: 'POST', body: {} });
      const cloudflare = state.authMode === 'cloudflare'; clearSession();
      if (cloudflare) window.location.assign(new URL('/cdn-cgi/access/logout', window.location.origin).href);
      else loginScreen('Sie sind abgemeldet.');
    } catch (error) { globalMessage(`Abmeldung nicht bestätigt: ${error.message}`, true); }
    finally { $('logout').disabled = false; }
  });
  document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => showStep(button.dataset.step)));
  document.querySelectorAll('[data-next]').forEach(button => button.addEventListener('click', () => showStep(button.dataset.next)));
  $('run-chronology').addEventListener('click', () => runLocal('chronology'));
  $('run-synthesis').addEventListener('click', () => runLocal('synthesis'));
  $('prepare-packet').addEventListener('click', preparePacket);
  $('send-packet').addEventListener('click', sendPacket);
  $('change-packet').addEventListener('click', () => showStep(3));
  $('refresh-status').addEventListener('click', refreshStatus);
  $('close-reference').addEventListener('click', () => $('reference-dialog').close());
  $('reference-dialog').addEventListener('click', event => {
    if (event.target !== $('reference-dialog')) return;
    const rect = $('reference-dialog').getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('reference-dialog').close();
  });
  window.addEventListener('unhandledrejection', event => {
    if (state.user) globalMessage('Ein Schritt konnte nicht abgeschlossen werden. Prüfen Sie den aktuellen Serverstatus, bevor Sie eine Anfrage erneut starten.', true);
  });

  async function start() {
    $('login-form').hidden = true;
    try { const me = await api('me'); await loadWorkspace(me); }
    catch (error) { loginScreen(error.status === 401 ? '' : error.message); }
  }
  start();
})();
