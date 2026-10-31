const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'style') Object.assign(node.style, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  });
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
};

const ICONS = {
  logo: '<svg class="logo" viewBox="0 0 32 32"><path d="M7 2h13l8 8v18a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#2b4fe0"/><path d="M20 2l8 8h-6a2 2 0 0 1-2-2z" fill="#8ea5ff"/><rect x="9" y="15" width="14" height="6" rx="1" fill="#ffe14d"/><path d="M9 25h10" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
  cursor: '<path d="M5 3l6 17 2.5-7 7-2.5z"/>',
  text: '<path d="M5 7V4h14v3M12 4v16M9 20h6"/>',
  signature: '<path d="M3 16c3-8 5-12 7-12s-1 12 1 12 3-6 4-6 1 4 3 4 2-1 3-2M3 21h18"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5L6 20"/>',
  marker: '<path d="M9 11l-5 5v4h4l5-5"/><path d="M9 11l7-7 4 4-7 7z"/><path d="M14 20h7"/>',
  pen: '<path d="M4 20l1-5L16 4l4 4L9 19z"/><path d="M14 6l4 4"/>',
  shapes: '<rect x="3" y="3" width="11" height="11" rx="1.5"/><circle cx="16" cy="16" r="5"/>',
  undo: '<path d="M9 6L4 11l5 5"/><path d="M4 11h10a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="M15 6l5 5-5 5"/><path d="M20 11H10a5 5 0 0 0 0 10h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M4 20h16"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  rotate: '<path d="M20 11a8 8 0 1 0-2.3 6"/><path d="M20 4v7h-7"/>',
  rotateLeft: '<path d="M4 11a8 8 0 1 1 2.3 6"/><path d="M4 4v7h7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  pagePlus: '<path d="M6 3h8l4 4v14H6z"/><path d="M12 10v6M9 13h6"/>',
  merge: '<path d="M8 3h8v6H8zM8 15h8v6H8zM12 9v6"/>',
  numbers: '<path d="M5 4h14v16H5z"/><path d="M10 16h4M12 16v-5l-1.5 1"/>',
  stamp: '<path d="M5 20h14M7 16h10l-1-4H8zM12 12V8"/><circle cx="12" cy="6" r="2.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  type: '<path d="M4 18l5-12 5 12M6 14h6M15 18c0-3 5-3 5 0v-5"/>',
};
const icon = (name) => {
  const holder = document.createElement('template');
  holder.innerHTML = name === 'logo' ? ICONS.logo : `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  return holder.content.firstChild;
};
document.querySelectorAll('[data-icon]').forEach((node) => node.prepend(icon(node.dataset.icon)));

// Los cambios se aplican de a uno: asi un clic no se adelanta al texto que se esta guardando.
let queue = Promise.resolve();
const enqueue = (task) => (queue = queue.then(task, task));

let requests = 0;
let busyTimer;
function trackBusy(delta) {
  requests += delta;
  clearTimeout(busyTimer);
  if (requests > 0) busyTimer = setTimeout(() => ($('busy').hidden = false), 180);
  else $('busy').hidden = true;
}

const api = async (path, options = {}) => {
  trackBusy(1);
  const res = await fetch(path, { ...options, headers: { 'X-PDF-Editor': '1', ...options.headers } }).finally(() => trackBusy(-1));
  const isJson = (res.headers.get('Content-Type') || '').includes('json');
  if (!res.ok) {
    const data = isJson ? await res.json() : {};
    throw Object.assign(new Error(data.error || 'No se pudo completar la acción.'), { status: res.status });
  }
  return isJson ? res.json() : res;
};
const postJson = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

const state = {
  version: 0, zoom: 1.25, pages: [], dirty: false, tool: 'select', selected: null, editing: null, current: 0,
  lastProp: null, capabilities: { googleFonts: false, desktop: false }, openSections: {}, pressingPanel: false, removeBackground: true, signature: null, signatures: [], hits: [], hitIndex: -1, fonts: null, style: { color: '#e02020', fill: null, strokeWidth: 2 },
};
const IMAGE_DPR = () => Math.min(devicePixelRatio || 1, 2);
let statusTimer;

function say(message, isError = false) {
  const box = $('status');
  box.textContent = message;
  box.className = isError ? 'show error' : 'show';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (box.className = ''), isError ? 8000 : 4500);
}

function applyState(s) {
  state.version = s.version;
  $('undo').disabled = !s.canUndo;
  $('redo').disabled = !s.canRedo;
  state.dirty = s.dirty;
  showSaved();
}

function showSaved() {
  $('saved').textContent = state.dirty ? 'Cambios sin descargar' : `${state.pages.length || ''} ${state.pages.length === 1 ? 'página' : 'páginas'}`;
}

// Abrir documentos

async function openFile(file, password = '') {
  if (!file) return;
  if (!password && state.dirty && !confirm('Vas a perder los cambios sin descargar. ¿Abrir otro PDF igual?')) return;
  try {
    const headers = { 'X-Filename': encodeURIComponent(file.name), 'Content-Type': 'application/pdf' };
    if (password) headers['X-Password'] = encodeURIComponent(password);
    const data = await api('/api/open', { method: 'POST', headers, body: file });
    applyState(data);
    state.selected = null;
    state.fonts = null;
    $('name').textContent = data.name;
    document.title = data.name + ' – Editor de PDF';
    $('welcome').hidden = true;
    $('app').hidden = false;
    state.zoom = Math.min(1.25, Math.max(0.5, ($('pages').clientWidth - 48) / Math.max(...data.pages.map((p) => p.w))));
    buildPages(data.pages);
    showSaved();
    renderPanel(true);
    if (data.wasEncrypted) say('El PDF se abrió sin contraseña. Podés ponerle una al descargarlo.');
  } catch (error) {
    if (error.status === 401) {
      const next = prompt(error.message + ' Escribila para abrirlo:');
      if (next) return openFile(file, next);
      return;
    }
    say(error.message, true);
  }
}

// Paginas

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) loadPage(state.pages[+entry.target.dataset.page]);
    });
  },
  { root: null, rootMargin: '600px' },
);
const currentObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) setCurrent(+entry.target.dataset.page);
    });
  },
  { threshold: 0.5 },
);

function setCurrent(number) {
  state.current = number;
  document.querySelectorAll('.thumb').forEach((t, i) => t.classList.toggle('current', i === number));
  if (state.selected === null && state.tool === 'select') renderPanel();
}

function buildPages(pages) {
  observer.disconnect();
  currentObserver.disconnect();
  $('pages').replaceChildren();
  state.pages = pages.map((size, number) => {
    const img = el('img', { class: 'page', alt: `Página ${number + 1}`, draggable: false });
    const layer = el('div');
    const sheet = el('div', { class: 'sheet' }, img, el('span', { class: 'num' }, String(number + 1)), layer);
    sheet.dataset.page = number;
    $('pages').append(sheet);
    observer.observe(sheet);
    currentObserver.observe(sheet);
    const page = { number, ...size, el: sheet, img, layer, loaded: false, elements: [], objects: [] };
    sheet.addEventListener('pointerdown', (event) => sheetPointerDown(page, event));
    return page;
  });
  layoutPages();
  buildThumbs();
  setTool(state.tool);
}

function layoutPages() {
  $('zoomValue').textContent = Math.round(state.zoom * 100) + '%';
  state.pages.forEach((page) => {
    page.el.style.width = page.w * state.zoom + 'px';
    page.el.style.height = page.h * state.zoom + 'px';
    if (page.loaded) drawLayer(page);
  });
}

const imageUrl = (page, extra = '') => `/api/page/${page.number}/image?scale=${(state.zoom * IMAGE_DPR()).toFixed(2)}&v=${state.version}${extra}`;

function swapImage(page) {
  return new Promise((resolve) => {
    const next = new Image();
    next.onload = () => {
      page.img.src = next.src;
      resolve();
    };
    next.onerror = resolve;
    next.src = imageUrl(page);
  });
}

async function loadPage(page) {
  if (page.loaded) return;
  page.loaded = true;
  try {
    await refreshPage(page);
  } catch (error) {
    page.loaded = false;
    say(error.message, true);
  }
}

async function refreshPage(page) {
  const [data] = await Promise.all([api(`/api/page/${page.number}/elements`), swapImage(page)]);
  page.elements = data.elements;
  page.objects = data.objects;
  page.fields = data.fields;
  drawLayer(page);
  const thumb = document.querySelectorAll('.thumb img')[page.number];
  if (thumb) thumb.src = `/api/page/${page.number}/image?scale=0.25&v=${state.version}`;
}

function buildThumbs() {
  const items = state.pages.map((page) => {
    const img = el('img', { alt: '', draggable: false, loading: 'lazy', src: `/api/page/${page.number}/image?scale=0.25&v=${state.version}` });
    const small = (name, title, run, cls) => {
      const button = el('button', { type: 'button', title, 'aria-label': `${title}, página ${page.number + 1}`, class: cls || '', onclick: run });
      button.append(icon(name));
      return button;
    };
    const thumb = el('div', {
      class: 'thumb', draggable: true,
      ondragstart: (event) => event.dataTransfer.setData('application/x-page', page.number),
      ondragover: (event) => {
        if (![...event.dataTransfer.types].includes('application/x-page')) return;
        event.preventDefault();
        event.stopPropagation();
        thumb.classList.add('drop-before');
      },
      ondragleave: () => thumb.classList.remove('drop-before'),
      ondrop: (event) => {
        const from = event.dataTransfer.getData('application/x-page');
        thumb.classList.remove('drop-before');
        if (from === '') return;
        event.preventDefault();
        event.stopPropagation();
        const to = +from < page.number ? page.number - 1 : page.number;
        if (+from !== to) enqueue(() => act({ action: 'page_move', from: +from, to }).catch(() => {}));
      },
    },
    el('button', { class: 'thumb-go', type: 'button', 'aria-label': `Ir a la página ${page.number + 1}`, title: 'Arrastrá para cambiar el orden', onclick: () => page.el.scrollIntoView({ block: 'start' }) }, img, el('small', {}, String(page.number + 1))),
    el('div', { class: 'thumb-actions' },
      small('rotate', 'Girar', () => pageAction({ action: 'page_rotate', pages: [page.number], angle: 90 })),
      small('copy', 'Duplicar', () => pageAction({ action: 'page_duplicate', page: page.number })),
      small('trash', 'Eliminar', () => pageAction({ action: 'page_delete', pages: [page.number] }), 'danger')));
    return thumb;
  });
  const add = el('button', { class: 'add-page', type: 'button', onclick: () => pageAction({ action: 'page_blank', after: state.pages.length - 1 }) });
  add.append(icon('plus'), 'Página nueva');
  $('thumbs').replaceChildren(...items, add);
  setCurrent(Math.min(state.current, state.pages.length - 1));
}

const pageAction = (request) => enqueue(() => act(request).catch(() => {}));

// Capa interactiva

function pos(obj) {
  if (obj.type === 'text') return obj.box;
  const x = Math.min(obj.x, obj.x + obj.w), y = Math.min(obj.y, obj.y + obj.h);
  return { x, y, w: Math.abs(obj.w), h: Math.abs(obj.h) };
}

function place(node, box) {
  const z = state.zoom;
  Object.assign(node.style, { left: box.x * z + 'px', top: box.y * z + 'px', width: box.w * z + 'px', height: box.h * z + 'px' });
}

function drawLayer(page) {
  const nodes = [];
  page.elements.forEach((element) => {
    const [x0, y0, x1, y1] = element.bbox;
    const hit = el('button', { class: 'hit', 'aria-label': 'Editar: ' + element.text });
    place(hit, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    hit.addEventListener('pointerdown', (event) => itemPointerDown(event, page, { element }));
    hit.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectElement(page, element, true);
      }
    });
    nodes.push(hit);
  });
  page.objects.forEach((obj) => {
    const node = el('button', { class: 'obj ' + obj.type, 'aria-label': obj.type === 'text' ? 'Editar: ' + obj.text : 'Seleccionar elemento' });
    place(node, pos(obj));
    if (obj.type === 'text' && obj.rotation) node.style.transform = `rotate(${obj.rotation}deg)`, node.style.transformOrigin = `0 ${obj.ascent * state.zoom}px`;
    node.addEventListener('pointerdown', (event) => itemPointerDown(event, page, { obj }));
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        selectObject(page, obj, obj.type === 'text');
      }
    });
    nodes.push(node);
  });
  (page.fields || []).forEach((item) => nodes.push(fieldNode(page, item)));
  state.hits.forEach((hit, index) => {
    if (hit.page !== page.number) return;
    const [x0, y0, x1, y1] = hit.bbox;
    const mark = el('i', { class: 'match' + (index === state.hitIndex ? ' now' : '') });
    place(mark, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    nodes.push(mark);
  });
  page.layer.replaceChildren(...nodes);
  drawSelection();
}

// Campos de formulario: el valor se ve en la pagina y el control solo aparece al escribir.
function fieldNode(page, item) {
  const [x0, y0, x1, y1] = item.bbox;
  const save = (value) => enqueue(async () => {
    state.lastProp = null;
    await act({ action: 'field', page: page.number, xref: item.xref, value }).catch(() => {});
  });
  let node;
  const label = item.name || 'Campo del formulario';
  if (item.kind === 'checkbox' || item.kind === 'radiobutton') {
    node = el('button', { class: 'pdf-check', type: 'button', role: 'checkbox', 'aria-checked': item.on ? 'true' : 'false', 'aria-label': label, title: label, onclick: () => save(!item.on) });
  } else if (item.kind === 'combobox' || item.kind === 'listbox') {
    node = el('select', { class: 'pdf-field', 'aria-label': label, title: label, onchange: (event) => save(event.target.value) }, ...item.options.map((o) => el('option', { value: o, selected: o === item.value }, o)));
  } else if (item.kind === 'text') {
    node = el(item.multiline ? 'textarea' : 'input', { class: 'pdf-field', 'aria-label': label, title: label, value: item.value || '', onchange: (event) => save(event.target.value) });
    node.style.fontSize = Math.max(10, (y1 - y0) * 0.65 * state.zoom) + 'px';
    if (item.multiline) node.style.fontSize = 12 * state.zoom + 'px';
  } else {
    return document.createTextNode('');
  }
  place(node, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  node.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    commitEdit();
  });
  return node;
}

function selectedObject() {
  if (!state.selected || state.selected.kind !== 'object') return null;
  const page = state.pages[state.selected.page];
  return page && page.objects.find((o) => o.id === state.selected.id);
}

function selectedElement() {
  if (!state.selected || state.selected.kind !== 'element') return null;
  const page = state.pages[state.selected.page];
  if (!page) return null;
  // Los id cambian al editar otro texto: se reconoce por contenido y posicion.
  const { text, bbox } = state.selected.ref;
  return page.elements.find((e) => e.text === text && Math.abs(e.bbox[0] - bbox[0]) + Math.abs(e.bbox[1] - bbox[1]) < 4) || null;
}

function drawSelection() {
  document.querySelectorAll('.selection, .quickbar').forEach((n) => n.remove());
  if (!state.selected) return;
  const page = state.pages[state.selected.page];
  if (!page) return;
  const obj = selectedObject();
  const element = selectedElement();
  if (!obj && !element) return;
  const box = obj ? pos(obj) : { x: element.bbox[0], y: element.bbox[1], w: element.bbox[2] - element.bbox[0], h: element.bbox[3] - element.bbox[1] };
  const node = el('div', { class: 'selection' });
  place(node, box);
  if (obj && obj.type === 'text' && obj.rotation) node.style.transform = `rotate(${obj.rotation}deg)`, node.style.transformOrigin = `0 ${obj.ascent * state.zoom}px`;
  const isText = obj ? obj.type === 'text' : true;
  const handles = isText ? ['w', 'e', 'se'] : obj.type === 'line' ? ['nw', 'se'] : ['nw', 'ne', 'sw', 'se'];
  if (!state.editing) {
    handles.forEach((h) => {
      const handle = el('span', { class: 'handle', title: h === 'se' && isText ? 'Cambiar tamaño de letra' : 'Cambiar tamaño' });
      handle.dataset.h = h;
      handle.addEventListener('pointerdown', (event) => resizeStart(event, page, h));
      node.append(handle);
    });
    node.addEventListener('pointerdown', (event) => {
      if (event.target !== node) return;
      itemPointerDown(event, page, obj ? { obj } : { element });
    });
  } else {
    node.style.pointerEvents = 'none';
  }
  page.el.append(node);
  drawQuickbar(page, box, obj, element);
}

// Acciones a mano junto a lo seleccionado. Actuan en pointerdown para no perderse si la pagina se redibuja.
function drawQuickbar(page, box, obj, element) {
  const item = obj || (element && elementAsDraft(element));
  if (!item) return;
  const press = (label, title, run, cls) => el('button', {
    type: 'button', title, 'aria-label': title, class: cls || '',
    onpointerdown: (event) => {
      event.preventDefault();
      event.stopPropagation();
      commitEdit();
      run();
    },
    onkeydown: (event) => { if (event.key === 'Enter') { event.preventDefault(); run(); } },
  }, label);
  const parts = [];
  if (item.type === 'text') {
    parts.push(
      press(el('b', {}, 'N'), 'Negrita', () => setProps({ bold: !item.bold }), item.bold ? 'on' : ''),
      press(el('i', {}, 'K'), 'Cursiva', () => setProps({ italic: !item.italic }), item.italic ? 'on' : ''),
      press(el('u', {}, 'S'), 'Subrayado', () => setProps({ underline: !item.underline }), item.underline ? 'on' : ''),
      el('span', { class: 'sep' }),
      press(icon('minus'), 'Letra más chica', () => setProps({ size: Math.max(2, item.size - 1) }, 'size')),
      el('span', { class: 'size' }, String(Math.round(item.size * 10) / 10)),
      press(icon('plus'), 'Letra más grande', () => setProps({ size: item.size + 1 }, 'size')),
      el('span', { class: 'sep' }));
  }
  parts.push(press(icon('copy'), 'Duplicar', duplicateSelected), press(icon('trash'), 'Borrar', deleteSelected, 'danger'));
  const bar = el('div', { class: 'quickbar', role: 'toolbar', 'aria-label': 'Acciones rápidas', onpointerdown: (event) => event.stopPropagation() }, ...parts);
  const z = state.zoom;
  const above = box.y * z - 50;
  Object.assign(bar.style, { left: Math.max(0, box.x * z) + 'px', top: (above >= 0 ? above : (box.y + box.h) * z + 12) + 'px' });
  page.el.append(bar);
}

function selectElement(page, element, edit = false) {
  commitEdit();
  closeEdit();
  state.selected = { kind: 'element', page: page.number, id: element.id, ref: { text: element.text, bbox: element.bbox } };
  state.lastProp = null;
  drawSelection();
  renderPanel(true);
  if (edit) startEdit(page, element, null);
}

function selectObject(page, obj, edit = false) {
  if (state.editing && state.editing.objId !== obj.id) {
    commitEdit();
    closeEdit();
  }
  state.selected = { kind: 'object', page: page.number, id: obj.id };
  state.lastProp = null;
  drawSelection();
  renderPanel(true);
  if (edit) startEdit(page, null, obj);
}

function deselect() {
  state.selected = null;
  drawSelection();
  renderPanel(true);
}

// Acciones con el servidor

async function act(request, { refresh = true } = {}) {
  try {
    const result = await postJson('/api/do', { version: state.version, ...request });
    applyState(result);
    if (result.pages) syncPages(result);
    else if (refresh && result.pagesChanged) await refreshChanged(result.pagesChanged);
    return result;
  } catch (error) {
    say(error.message, true);
    throw error;
  }
}

async function syncPages(result) {
  const sameLayout = result.pages.length === state.pages.length && result.pages.every((p, i) => p.w === state.pages[i].w && p.h === state.pages[i].h);
  if (!sameLayout || result.pagesChanged === 'all') {
    if (!sameLayout) {
      buildPages(result.pages);
      if (state.selected && state.selected.page >= result.pages.length) state.selected = null;
      return;
    }
  }
  await refreshChanged(result.pagesChanged);
}

async function refreshChanged(changed) {
  const pages = changed === 'all' || !changed ? state.pages.filter((p) => p.loaded) : changed.map((n) => state.pages[n]).filter((p) => p && p.loaded);
  await Promise.all(pages.map(refreshPage));
  if (changed === 'all') buildThumbs();
  drawSelection();
  showSaved();
  renderPanel();
}

async function ensureObject() {
  const obj = selectedObject();
  if (obj) return obj;
  const element = selectedElement();
  if (!element) return null;
  const pageNumber = state.selected.page;
  const result = await act({ action: 'objectify', page: pageNumber, id: element.id, ref: { text: element.text, bbox: element.bbox } });
  await refreshPage(state.pages[pageNumber]);
  state.selected = { kind: 'object', page: pageNumber, id: result.object.id };
  drawSelection();
  return state.pages[pageNumber].objects.find((o) => o.id === result.object.id);
}

function setProps(props, key) {
  return enqueue(() => setPropsNow(props, key));
}

async function setPropsNow(props, key) {
  try {
    const obj = await ensureObject();
    if (!obj) return;
    const merge = key && state.lastProp === `${obj.id}:${key}`;
    state.lastProp = key ? `${obj.id}:${key}` : null;
    const pageNumber = obj.page;
    const result = await act({ action: 'update', objectId: obj.id, props, merge });
    await refreshPage(state.pages[pageNumber]);
    notifyFont(result.object);
    drawSelection();
    renderPanel();
    return result;
  } catch (error) {
    await refreshChanged('all').catch(() => {});
  }
}

function notifyFont(obj) {
  if (obj && obj.box && obj.box.note && obj.box.note.kind === 'installed') say(`Se usó ${obj.box.note.font}, la misma fuente instalada en tu compu.`);
  if (obj && obj.box && obj.box.note && obj.box.note.kind === 'twin') say(`Este PDF no trae todas las letras. Se usó ${obj.box.note.font}, una fuente casi idéntica.`);
}

// Arrastrar, seleccionar y crear

function pagePoint(page, event) {
  const rect = page.el.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / state.zoom, y: (event.clientY - rect.top) / state.zoom };
}

function itemPointerDown(event, page, target) {
  if (state.tool !== 'select' || event.button) return;
  event.preventDefault();
  event.stopPropagation();
  commitEdit();
  const start = { x: event.clientX, y: event.clientY };
  let drag = null;
  const move = (ev) => {
    const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
    if (!drag && Math.hypot(dx, dy) > 4) drag = beginDrag(page, target);
    if (drag) drag.update(dx / state.zoom, dy / state.zoom);
  };
  const up = async (ev) => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    if (drag) return drag.finish((ev.clientX - start.x) / state.zoom, (ev.clientY - start.y) / state.zoom);
    if (target.obj) selectObject(page, target.obj, target.obj.type === 'text');
    else selectElement(page, target.element, true);
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
}

function beginDrag(page, target) {
  closeEdit();
  let box;
  if (target.obj) box = pos(target.obj);
  else {
    const [x0, y0, x1, y1] = target.element.bbox;
    box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const ghost = el('div', { class: 'ghost-box' });
  place(ghost, box);
  page.el.append(ghost);
  document.querySelectorAll('.selection, .quickbar').forEach((n) => n.remove());
  const objectReady = (async () => {
    if (target.obj) {
      state.selected = { kind: 'object', page: page.number, id: target.obj.id };
      return target.obj;
    }
    state.selected = { kind: 'element', page: page.number, id: target.element.id, ref: { text: target.element.text, bbox: target.element.bbox } };
    return enqueue(ensureObject);
  })();
  let floating = null;
  const offset = { dx: 0, dy: 0 };
  // La vista previa es el objeto real dibujado por el servidor, no una aproximacion.
  objectReady.then(async (obj) => {
    if (!obj || ghost.isConnected === false) return;
    const scale = (state.zoom * IMAGE_DPR()).toFixed(2);
    const under = new Image();
    under.src = imageUrl(page, `&exclude=${obj.id}`);
    await under.decode().catch(() => {});
    if (!ghost.isConnected) return;
    page.img.src = under.src;
    floating = el('img', { class: 'float', src: `/api/page/${page.number}/object?id=${obj.id}&scale=${scale}&v=${state.version}`, alt: '', draggable: false });
    floating.style.transform = `translate(${offset.dx * state.zoom}px, ${offset.dy * state.zoom}px)`;
    page.el.append(floating);
    ghost.style.background = 'none';
  }).catch(() => {});
  return {
    update(dx, dy) {
      offset.dx = dx;
      offset.dy = dy;
      ghost.style.transform = `translate(${dx * state.zoom}px, ${dy * state.zoom}px)`;
      if (floating) floating.style.transform = `translate(${dx * state.zoom}px, ${dy * state.zoom}px)`;
    },
    async finish(dx, dy) {
      const obj = await objectReady.catch(() => null);
      ghost.remove();
      if (obj) {
        state.lastProp = null;
        const fresh = page.objects.find((o) => o.id === obj.id) || obj;
        await setProps({ x: fresh.x + dx, y: fresh.y + dy });
      }
      if (floating) floating.remove();
      await swapImage(page);
      drawSelection();
    },
  };
}

function resizeStart(event, page, handle) {
  event.preventDefault();
  event.stopPropagation();
  const obj = selectedObject();
  const element = selectedElement();
  const box = obj ? pos(obj) : { x: element.bbox[0], y: element.bbox[1], w: element.bbox[2] - element.bbox[0], h: element.bbox[3] - element.bbox[1] };
  const size = obj ? obj.size : element ? element.size : null;
  const isText = obj ? obj.type === 'text' : true;
  const start = pagePoint(page, event);
  const ghost = el('div', { class: 'ghost-box' });
  place(ghost, box);
  page.el.append(ghost);
  document.querySelectorAll('.selection, .quickbar').forEach((n) => n.remove());
  let next = { ...box };
  const move = (ev) => {
    const point = pagePoint(page, ev);
    const dx = point.x - start.x, dy = point.y - start.y;
    next = { ...box };
    if (handle.includes('w')) { next.x = box.x + dx; next.w = box.w - dx; }
    if (handle.includes('e')) next.w = box.w + dx;
    if (handle.includes('n')) { next.y = box.y + dy; next.h = box.h - dy; }
    if (handle.includes('s')) next.h = box.h + dy;
    if (obj && obj.type === 'image') {
      // Las imagenes conservan la proporcion, sin importar que esquina se tome.
      next.w = Math.max(next.w, 8);
      next.h = (next.w * box.h) / box.w;
      next.x = handle.includes('w') ? box.x + box.w - next.w : box.x;
      next.y = handle.includes('n') ? box.y + box.h - next.h : box.y;
    }
    if (isText && handle === 'se') next.h = box.h * (next.w / box.w);
    next.w = Math.max(next.w, 4);
    next.h = Math.max(next.h, 2);
    place(ghost, next);
  };
  const up = async () => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    ghost.remove();
    if (isText) {
      if (handle === 'se') {
        await setProps({ size: Math.max(2, +(size * (next.w / box.w)).toFixed(2)), width: next.w });
      } else {
        await setProps({ x: next.x, width: next.w, wrap: true });
      }
    } else if (obj.type === 'line') {
      const x2 = obj.x + obj.w + (handle === 'se' ? next.w - box.w : 0);
      await setProps(handle === 'se' ? { w: x2 - obj.x, h: obj.h + (next.h - box.h) } : { x: next.x, y: next.y, w: obj.w + (box.x - next.x), h: obj.h + (box.y - next.y) });
    } else {
      await setProps({ x: next.x, y: next.y, w: next.w, h: next.h });
    }
    drawSelection();
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
}

function sheetPointerDown(page, event) {
  if (event.button) return;
  if (state.tool === 'select') {
    if (event.target.closest('.editing')) return;
    commitEdit();
    if (event.target.closest('.selection, .hit, .obj')) return;
    deselect();
    return;
  }
  event.preventDefault();
  const start = pagePoint(page, event);
  const tool = state.tool;
  if (tool === 'text') {
    createText(page, start);
    return;
  }
  if (tool === 'signature') {
    placeSignature(page, start);
    return;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'draft');
  svg.setAttribute('viewBox', `0 0 ${page.w} ${page.h}`);
  const shape = document.createElementNS('http://www.w3.org/2000/svg', tool === 'ink' ? 'polyline' : tool === 'line' ? 'line' : tool === 'ellipse' ? 'ellipse' : 'rect');
  const color = tool === 'highlight' ? '#ffd400' : state.style.color;
  shape.setAttribute('fill', tool === 'highlight' ? color : state.style.fill || 'none');
  shape.setAttribute('fill-opacity', tool === 'highlight' ? 0.4 : 1);
  shape.setAttribute('stroke', tool === 'highlight' ? 'none' : color);
  shape.setAttribute('stroke-width', state.style.strokeWidth);
  shape.setAttribute('stroke-linecap', 'round');
  svg.append(shape);
  page.el.append(svg);
  const points = [[start.x, start.y]];
  let end = start;
  const move = (ev) => {
    end = pagePoint(page, ev);
    const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y), w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
    if (tool === 'ink') {
      points.push([end.x, end.y]);
      if (tool === 'ink') shape.setAttribute('fill', 'none');
      shape.setAttribute('points', points.map((p) => p.join(',')).join(' '));
    } else if (tool === 'line') {
      shape.setAttribute('x1', start.x); shape.setAttribute('y1', start.y); shape.setAttribute('x2', end.x); shape.setAttribute('y2', end.y);
    } else if (tool === 'ellipse') {
      shape.setAttribute('cx', x + w / 2); shape.setAttribute('cy', y + h / 2); shape.setAttribute('rx', w / 2); shape.setAttribute('ry', h / 2);
    } else {
      shape.setAttribute('x', x); shape.setAttribute('y', y); shape.setAttribute('width', w); shape.setAttribute('height', h);
    }
  };
  const up = async () => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    svg.remove();
    const moved = Math.hypot(end.x - start.x, end.y - start.y) > 3;
    if (!moved) return;
    const base = { page: page.number, color, strokeWidth: state.style.strokeWidth };
    let spec;
    if (tool === 'ink') {
      const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(Math.max(...xs) - x, 1), h = Math.max(Math.max(...ys) - y, 1);
      spec = { ...base, type: 'ink', x, y, w, h, points: points.map(([px, py]) => [(px - x) / w, (py - y) / h]) };
    } else if (tool === 'line') {
      spec = { ...base, type: 'line', x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y };
    } else {
      const rect = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) };
      spec = tool === 'highlight'
        ? { ...base, ...rect, type: 'rect', color: null, fill: '#ffd400', strokeWidth: 0, opacity: 0.4 }
        : { ...base, ...rect, type: tool, fill: state.style.fill };
    }
    const result = await enqueue(() => act({ action: 'add', object: spec }).catch(() => null));
    if (result) {
      await refreshPage(page);
      if (tool !== 'ink' && tool !== 'highlight') setTool('select');
      const created = page.objects.find((o) => o.id === result.object.id);
      if (created && state.tool === 'select') selectObject(page, created);
    }
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
}

async function createText(page, point) {
  const result = await enqueue(() => act({ action: 'add', object: { type: 'text', page: page.number, x: point.x, y: point.y, text: 'Texto', size: 14 } }).catch(() => null));
  setTool('select');
  if (!result) return;
  await refreshPage(page);
  const created = page.objects.find((o) => o.id === result.object.id);
  if (created) selectObject(page, created, true);
}

const SHAPES = ['rect', 'ellipse', 'line'];

function setTool(tool) {
  commitEdit();
  closeEdit();
  if (tool === 'image') {
    const page = state.pages[state.current];
    state.imageAt = { page, point: { x: page.w / 2, y: page.h / 3 } };
    $('imagePick').click();
    tool = 'select';
  }
  state.tool = tool;
  document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool || (b.dataset.tool === 'rect' && SHAPES.includes(tool))));
  state.pages.forEach((p) => p.el.classList.toggle('drawing', tool !== 'select'));
  if (tool !== 'select') state.selected = null;
  drawSelection();
  renderPanel(true);
}

// Edicion de texto en el lugar

function cssFont(font, flags, bold, italic) {
  const family = /cour|mono|consol/i.test(font) || flags & 8 ? '"Courier New", monospace'
    : flags & 4 || /times|serif|georgia|garamond|minion|cambria/i.test(font) ? '"Times New Roman", serif' : 'Arial, Helvetica, sans-serif';
  return { fontFamily: `"${font.replace(/[-,].*$/, '')}", ${family}`, fontWeight: bold ? 700 : 400, fontStyle: italic ? 'italic' : 'normal' };
}

function backgroundAt(page, x, y) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const scale = page.img.naturalWidth / page.w;
    ctx.drawImage(page.img, Math.max(0, x - 1) * scale, (y + 0.5) * scale, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${r},${g},${b})`;
  } catch {
    return '#fff';
  }
}

function startEdit(page, element, obj) {
  const z = state.zoom;
  const item = obj || element;
  const box = obj ? obj.box : { x: element.bbox[0], y: element.bbox[1], w: element.bbox[2] - element.bbox[0], h: element.bbox[3] - element.bbox[1] };
  const fontName = obj ? obj.font.name : element.font;
  const flags = item.flags || 0;
  const bold = obj ? obj.bold : /bold|black|heavy/i.test(fontName) || flags & 16;
  const italic = obj ? obj.italic : /italic|oblique/i.test(fontName) || flags & 2;
  const multi = obj ? obj.wrap : element.multi;
  const lead = (item.lineHeight || 1.2) * item.size;
  const node = el('div', { class: 'editing', contentEditable: 'plaintext-only', spellcheck: false, 'aria-label': 'Texto' });
  node.textContent = item.text;
  Object.assign(node.style, cssFont(fontName, flags, bold, italic), {
    left: box.x * z + 'px', top: box.y * z + 'px', minWidth: Math.max(box.w, 8) * z + 'px', fontSize: item.size * z + 'px',
    lineHeight: (multi ? lead : box.h) * z + 'px', minHeight: box.h * z + 'px', color: item.color, background: backgroundAt(page, box.x, box.y),
    whiteSpace: multi ? 'pre-wrap' : 'pre', width: multi ? box.w * z + 'px' : 'auto', textAlign: item.align === 'justify' ? 'left' : item.align || 'left',
  });
  page.el.append(node);
  state.editing = { page, element, obj, objId: obj && obj.id, node, done: false, original: item.text };
  drawSelection();
  node.focus();
  getSelection().selectAllChildren(node);
  node.addEventListener('pointerdown', (event) => event.stopPropagation());
  node.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      node.blur();
    }
    if (event.key === 'Escape') {
      state.editing.done = true;
      closeEdit();
      drawSelection();
    }
  });
  node.addEventListener('blur', commitEdit);
}

function closeEdit() {
  if (state.editing) {
    state.editing.done = true;
    // Si se esta guardando, el recuadro sigue visible hasta que termine.
    if (!state.editing.node.classList.contains('busy')) state.editing.node.remove();
  }
  state.editing = null;
}

function commitEdit() {
  const edit = state.editing;
  if (!edit || edit.done) return;
  // Se fija que texto se edito antes de que el usuario pase a otro.
  edit.done = true;
  const text = edit.node.innerText.replace(/\n$/, '');
  const finish = () => {
    edit.node.remove();
    if (state.editing === edit) state.editing = null;
    drawSelection();
  };
  if (text === edit.original) return finish();
  edit.node.contentEditable = 'false';
  edit.node.classList.add('busy');
  return enqueue(async () => {
    state.lastProp = null;
    const ref = edit.element && { text: edit.element.text, bbox: edit.element.bbox };
    const wasSelected = (edit.element && state.selected && state.selected.kind === 'element' && state.selected.ref.text === edit.element.text) || (edit.obj && state.selected && state.selected.id === edit.obj.id);
    try {
      if (!text.trim() && edit.element) {
        await act({ action: 'remove_span', page: edit.page.number, id: edit.element.id, ref });
        if (wasSelected) state.selected = null;
      } else if (!text.trim()) {
        await act({ action: 'remove', objectId: edit.obj.id });
        if (wasSelected) state.selected = null;
      } else {
        let id = edit.obj && edit.obj.id;
        if (!id) {
          id = (await act({ action: 'objectify', page: edit.page.number, id: edit.element.id, ref })).object.id;
          if (wasSelected) state.selected = { kind: 'object', page: edit.page.number, id };
        }
        const result = await act({ action: 'update', objectId: id, props: { text } });
        notifyFont(result.object);
      }
      await refreshPage(edit.page);
    } catch (error) {
      await refreshPage(edit.page).catch(() => {});
    }
    finish();
    renderPanel();
  });
}

// Panel de propiedades

const PALETTE = ['#000000', '#ffffff', '#c4293f', '#e8710a', '#1e8e3e', '#2b4fe0', '#7b2fd0'];

function field(label, control, value) {
  return el('label', { class: 'field' }, el('span', {}, label, value ? el('b', {}, value) : null), control);
}

function numberInput(value, onChange, { min, max, step = 0.5 } = {}) {
  return el('input', { type: 'number', value: Math.round(value * 100) / 100, min, max, step, onchange: (event) => { if (event.target.value !== '') onChange(+event.target.value); } });
}

function segmented(options, current, onPick, label) {
  return el('div', { class: 'segmented', role: 'group', 'aria-label': label }, ...options.map(([value, text, title]) =>
    el('button', { type: 'button', class: current === value ? 'on' : '', title: title || '', 'aria-pressed': current === value ? 'true' : 'false', onclick: () => onPick(value) }, text)));
}

function colorControl(value, onChange, { clearable, emptyLabel } = {}) {
  const swatches = PALETTE.map((color) => el('button', { type: 'button', class: 'swatch' + (value === color ? ' on' : ''), style: { background: color }, title: color, 'aria-label': `Color ${color}`, onclick: () => onChange(color) }));
  const custom = el('input', { type: 'color', value: value || '#ffffff', title: 'Elegir otro color', 'aria-label': 'Elegir otro color', oninput: debounce((event) => onChange(event.target.value, true), 120) });
  const none = clearable ? el('button', { type: 'button', class: 'swatch none' + (value ? '' : ' on'), title: emptyLabel || 'Sin color', 'aria-label': emptyLabel || 'Sin color', onclick: () => onChange(null) }) : null;
  return el('div', { class: 'swatches' }, none, ...swatches, custom);
}

function debounce(run, wait) {
  let timer;
  return (event) => {
    clearTimeout(timer);
    const target = { target: event.target };
    timer = setTimeout(() => run(target), wait);
  };
}

function section(title, id, ...content) {
  return el('details', { open: !!state.openSections[id], ontoggle: (event) => (state.openSections[id] = event.target.open) }, el('summary', {}, title), ...content);
}

async function fontOptions() {
  if (!state.fonts) state.fonts = await api('/api/fonts');
  return state.fonts;
}

function renderPanel(force = false) {
  const panel = $('panel');
  const active = document.activeElement;
  // No se reemplaza el panel en medio de un clic ni con el selector de color abierto.
  if (!force && (state.pressingPanel || (active && active.type === 'color' && panel.contains(active)))) return;
  const controls = () => [...panel.querySelectorAll('input, select, textarea, button, summary')];
  const focusIndex = panel.contains(active) ? controls().indexOf(active) : -1;
  const obj = selectedObject();
  const element = selectedElement();
  if (state.tool !== 'select') panel.replaceChildren(...toolPanel());
  else if (obj && obj.type === 'text') panel.replaceChildren(...textPanel(obj));
  else if (element) panel.replaceChildren(...textPanel(elementAsDraft(element)));
  else if (obj) panel.replaceChildren(...shapePanel(obj));
  else panel.replaceChildren(...idlePanel());
  if (focusIndex >= 0 && !force && controls()[focusIndex]) controls()[focusIndex].focus();
}

$('panel').addEventListener('pointerdown', () => (state.pressingPanel = true));
addEventListener('pointerup', () => {
  if (!state.pressingPanel) return;
  setTimeout(() => {
    state.pressingPanel = false;
    renderPanel();
  }, 0);
});

function elementAsDraft(element) {
  const bold = /bold|black|heavy/i.test(element.font) || !!(element.flags & 16);
  const italic = /italic|oblique/i.test(element.font) || !!(element.flags & 2);
  return { id: null, type: 'text', text: element.text, size: element.size, font: { kind: 'doc', name: element.font }, color: element.color, bold, italic, underline: false, strike: false, align: element.align, spacing: 0, lineHeight: element.lineHeight, rotation: 0, opacity: 1, bg: null, wrap: element.multi, box: { w: element.bbox[2] - element.bbox[0] }, x: element.bbox[0], y: element.bbox[1] };
}

function step_(iconName, title, text) {
  return el('li', {}, icon(iconName), el('div', {}, el('b', {}, title), el('span', {}, text)));
}

function idlePanel() {
  return [
    el('h2', {}, 'Empezá por acá'),
    el('ul', { class: 'steps' },
      step_('cursor', 'Cambiar un texto', 'Hacé clic en cualquier texto y escribí encima.'),
      step_('shapes', 'Moverlo', 'Arrastralo a donde quieras. Con los puntos cambiás su ancho o tamaño.'),
      step_('signature', 'Firmar', 'Elegí Firma en la barra de la izquierda y hacé clic en la página.'),
      step_('download', 'Guardar', 'Tocá Descargar. Tu archivo original no cambia.')),
    section('Atajos de teclado', 'keys', el('ul', { class: 'keys' },
      ...[['Salto de línea', '⇧ Enter'], ['Deshacer', '⌘Z'], ['Buscar', '⌘F'], ['Descargar', '⌘S'], ['Mover de a poco', 'Flechas'], ['Duplicar', '⌘D'], ['Borrar', 'Supr']].map(([a, b]) => el('li', {}, a, el('kbd', {}, b))))),
  ];
}

function signaturePanel() {
  const list = el('div', { class: 'signatures' });
  const removeBackground = el('input', { type: 'checkbox', checked: state.removeBackground, onchange: (event) => (state.removeBackground = event.target.checked) });
  api('/api/signatures').then(({ signatures }) => {
    state.signatures = signatures;
    if (!signatures.some((item) => item.id === state.signature)) state.signature = signatures[0] ? signatures[0].id : null;
    if (!signatures.length) return list.replaceChildren(el('div', { class: 'empty' }, 'Todavía no cargaste ninguna firma.'));
    list.replaceChildren(...signatures.map((item) => {
      const remove = el('button', { type: 'button', class: 'remove', title: 'Eliminar esta firma', 'aria-label': 'Eliminar esta firma', onclick: () => removeSignature(item.id) });
      remove.append(icon('trash'));
      return el('div', { class: 'signature-item' },
        el('button', { type: 'button', class: 'signature' + (item.id === state.signature ? ' on' : ''), 'aria-label': 'Elegir esta firma', 'aria-pressed': item.id === state.signature ? 'true' : 'false', onclick: () => { state.signature = item.id; renderPanel(true); } },
          el('img', { src: `/api/signatures/${item.id}`, alt: '' })),
        remove);
    }));
  }).catch((error) => say(error.message, true));
  const load = el('button', { type: 'button', class: 'ghost', style: { width: '100%', marginBottom: '10px' }, onclick: () => $('signaturePick').click() });
  load.append(icon('plus'), 'Cargar firma');
  return [
    el('h2', {}, 'Firma'),
    el('p', {}, 'Elegí una firma y hacé clic en la página donde va.'),
    list, load,
    el('label', { class: 'check' }, removeBackground, 'Quitar el fondo de la imagen'),
  ];
}

async function removeSignature(id) {
  if (!confirm('¿Eliminar esta firma guardada? Las ya colocadas no cambian.')) return;
  try {
    await postJson('/api/signatures/delete', { id });
    renderPanel(true);
  } catch (error) {
    say(error.message, true);
  }
}

async function placeSignature(page, point) {
  const item = (state.signatures || []).find((s) => s.id === state.signature);
  if (!item) return say('Primero cargá una imagen de tu firma.', true);
  const w = Math.min(150, page.w * 0.5);
  const h = (w * item.h) / item.w;
  const spec = { type: 'image', page: page.number, x: point.x - w / 2, y: point.y - h / 2, w, h, signature: item.id };
  const result = await enqueue(() => act({ action: 'add', object: spec }).catch(() => null));
  setTool('select');
  if (!result) return;
  await refreshPage(page);
  const created = page.objects.find((o) => o.id === result.object.id);
  if (created) selectObject(page, created);
}

function copyToPagesDialog(obj) {
  const pages = el('input', { placeholder: 'Por ejemplo 2-4, 7' });
  const run = async (value) => {
    $('dialog').close();
    const result = await enqueue(() => act({ action: 'copy_to_pages', objectId: obj.id, pages: value }).catch(() => null));
    if (result) say(result.count === 1 ? 'Se colocó en 1 página más.' : `Se colocó en ${result.count} páginas más.`);
  };
  openDialog('Colocar en otras páginas', [field('Páginas', pages)], [
    el('button', { class: 'ghost', onclick: () => run('all') }, 'Todas'),
    el('button', { class: 'primary', onclick: () => run(pages.value) }, 'Colocar'),
  ]);
}

function toolPanel() {
  if (state.tool === 'signature') return signaturePanel();
  const hints = {
    text: ['Agregar texto', 'Hacé clic en la página donde quieras escribir.'],
    highlight: ['Resaltar', 'Arrastrá sobre lo que quieras resaltar. Podés hacerlo varias veces.'],
    ink: ['Dibujar', 'Dibujá con el mouse o el trackpad.'],
    rect: ['Formas', 'Arrastrá sobre la página para dibujar.'], ellipse: ['Formas', 'Arrastrá sobre la página para dibujar.'], line: ['Formas', 'Arrastrá sobre la página para dibujar.'],
  };
  const [title, hint] = hints[state.tool] || ['', ''];
  const out = [el('h2', {}, title), el('p', {}, hint)];
  if (SHAPES.includes(state.tool)) out.push(segmented([['rect', 'Rectángulo'], ['ellipse', 'Elipse'], ['line', 'Línea']], state.tool, setTool, 'Tipo de forma'));
  if ([...SHAPES, 'ink'].includes(state.tool)) {
    out.push(field('Color', colorControl(state.style.color, (v, live) => { state.style.color = v; if (!live) renderPanel(true); })));
    if (state.tool === 'rect' || state.tool === 'ellipse') {
      out.push(field('Relleno', colorControl(state.style.fill, (v, live) => { state.style.fill = v; if (!live) renderPanel(true); }, { clearable: true })));
    }
    out.push(field('Grosor', numberInput(state.style.strokeWidth, (v) => (state.style.strokeWidth = v), { min: 0, max: 40 })));
  }
  const done = el('button', { type: 'button', class: 'ghost', style: { width: '100%' }, onclick: () => setTool('select') }, 'Terminar');
  out.push(done);
  return out;
}

function textPanel(item) {
  const set = (props, key) => setProps(props, key);
  const out = [el('h2', {}, 'Texto')];
  const missing = item.box && item.box.missing;
  if (missing) {
    out.push(el('div', { class: 'warning' },
      `Este PDF no trae todas las letras de ${item.font.name}. Las que faltan se ven en ${missing}. Para igualarlas, agregá la fuente.`,
      el('div', { class: 'actions-row' },
        state.capabilities.googleFonts ? el('button', { type: 'button', onclick: () => googleFont(item.font.name) }, 'Buscar en Google') : null,
        el('button', { type: 'button', onclick: () => $('fontPick').click() }, 'Cargar archivo'))));
  }
  out.push(field('Contenido', el('textarea', { value: item.text, rows: 3, onchange: (event) => set({ text: event.target.value }) })));

  const fontSelect = el('select', { onchange: (event) => set({ font: JSON.parse(event.target.value) }) });
  const currentFont = JSON.stringify(item.font.kind === 'doc' ? { kind: 'doc', name: item.font.name } : { kind: 'file', path: item.font.path, name: item.font.name });
  fontSelect.append(el('option', { value: currentFont, selected: true }, item.font.name));
  fontOptions().then((fonts) => {
    const docGroup = el('optgroup', { label: 'Fuentes de este PDF' }, ...fonts.document.filter((n) => n !== item.font.name).map((name) => el('option', { value: JSON.stringify({ kind: 'doc', name }) }, name)));
    const fileGroup = el('optgroup', { label: 'Instaladas en tu compu' }, ...fonts.installed.filter((f) => f.name !== item.font.name).map((f) => el('option', { value: JSON.stringify(f) }, f.name)));
    fontSelect.append(docGroup, fileGroup);
  }).catch(() => {});
  out.push(field('Fuente', fontSelect));

  const styleBtn = (label, on, run, title) => el('button', { type: 'button', class: on ? 'on' : '', title, 'aria-label': title, 'aria-pressed': on ? 'true' : 'false', onclick: run }, label);
  out.push(el('div', { class: 'row' },
    field('Tamaño', numberInput(item.size, (v) => set({ size: v }), { min: 2, max: 400 })),
    field('Estilo', el('div', { class: 'segmented' },
      styleBtn(el('b', {}, 'N'), item.bold, () => set({ bold: !item.bold }), 'Negrita'),
      styleBtn(el('i', {}, 'K'), item.italic, () => set({ italic: !item.italic }), 'Cursiva'),
      styleBtn(el('u', {}, 'S'), item.underline, () => set({ underline: !item.underline }), 'Subrayado'),
      styleBtn(el('s', {}, 'T'), item.strike, () => set({ strike: !item.strike }), 'Tachado')))));

  out.push(field('Color', colorControl(item.color, (v) => set({ color: v }, 'color'))));
  out.push(field('Alineación', segmented([['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha'], ['justify', 'Justif.']], item.align, (value) => set({ align: value }), 'Alineación')));

  out.push(section('Fondo y opacidad', 'look',
    field('Color de fondo', colorControl(item.bg, (v, live) => set({ bg: v }, live ? 'bg' : null), { clearable: true, emptyLabel: 'Sin fondo' })),
    field('Opacidad', el('input', { type: 'range', min: 5, max: 100, value: Math.round((item.opacity ?? 1) * 100), onchange: (event) => set({ opacity: +event.target.value / 100 }, 'opacity') }), Math.round((item.opacity ?? 1) * 100) + '%')));

  out.push(section('Posición y tamaño', 'place',
    el('div', { class: 'row' }, field('Horizontal', numberInput(item.x, (v) => set({ x: v }))), field('Vertical', numberInput(item.y, (v) => set({ y: v })))),
    el('div', { class: 'row' }, field('Ancho', numberInput(item.box && item.box.w ? item.box.w : item.width || 0, (v) => set({ width: v, wrap: true }), { min: 4 })), field('Giro', numberInput(item.rotation || 0, (v) => set({ rotation: v }), { step: 1, min: -360, max: 360 }))),
    el('label', { class: 'check', style: { marginBottom: '14px' } }, el('input', { type: 'checkbox', checked: !!item.wrap, onchange: (event) => set({ wrap: event.target.checked }) }), 'Pasar a otra línea al llegar al ancho')));

  out.push(section('Espaciado y mayúsculas', 'space',
    el('div', { class: 'row' }, field('Entre letras', numberInput(item.spacing || 0, (v) => set({ spacing: v }), { min: -5, max: 50, step: 0.1 })), field('Entre líneas', numberInput(item.lineHeight || 1.2, (v) => set({ lineHeight: v }), { min: 0.5, max: 5, step: 0.05 }))),
    el('div', { class: 'actions-row', style: { marginBottom: '14px' } },
      el('button', { type: 'button', onclick: () => set({ text: item.text.toUpperCase() }) }, 'MAYÚSCULAS'),
      el('button', { type: 'button', onclick: () => set({ text: item.text.toLowerCase() }) }, 'minúsculas'))));
  out.push(actionButtons(item));
  return out;
}

function shapePanel(obj) {
  const set = (props, key) => setProps(props, key);
  const titles = { rect: 'Forma', ellipse: 'Forma', line: 'Línea', ink: 'Dibujo', image: 'Imagen' };
  const ratio = obj.h / obj.w;
  const out = [el('h2', {}, titles[obj.type] || 'Elemento')];
  if (obj.type !== 'image') {
    out.push(field('Color', colorControl(obj.color, (v, live) => set({ color: v }, live ? 'color' : null), { clearable: obj.type === 'rect' || obj.type === 'ellipse', emptyLabel: 'Sin borde' })));
    if (obj.type === 'rect' || obj.type === 'ellipse') out.push(field('Relleno', colorControl(obj.fill, (v, live) => set({ fill: v }, live ? 'fill' : null), { clearable: true, emptyLabel: 'Sin relleno' })));
    out.push(field('Grosor', numberInput(obj.strokeWidth ?? 1, (v) => set({ strokeWidth: v }), { min: 0, max: 40 })));
    out.push(field('Opacidad', el('input', { type: 'range', min: 5, max: 100, value: Math.round((obj.opacity ?? 1) * 100), onchange: (event) => set({ opacity: +event.target.value / 100 }, 'opacity') }), Math.round((obj.opacity ?? 1) * 100) + '%'));
  }
  const size = obj.type === 'image'
    ? [field('Ancho', numberInput(obj.w, (v) => set({ w: v, h: v * ratio }), { min: 8 })), field('Alto', numberInput(obj.h, (v) => set({ h: v, w: v / ratio }), { min: 2 }))]
    : [field('Ancho', numberInput(obj.w, (v) => set({ w: v }))), field('Alto', numberInput(obj.h, (v) => set({ h: v })))];
  out.push(section('Posición y tamaño', 'place',
    el('div', { class: 'row' }, field('Horizontal', numberInput(obj.x, (v) => set({ x: v }))), field('Vertical', numberInput(obj.y, (v) => set({ y: v })))),
    el('div', { class: 'row' }, ...size)));
  if (obj.type === 'image') {
    const copy = el('button', { type: 'button', class: 'ghost', style: { width: '100%', marginBottom: '8px' }, onclick: () => copyToPagesDialog(obj) });
    copy.append(icon('copy'), 'Colocar en otras páginas');
    out.push(copy);
  }
  out.push(actionButtons(obj));
  return out;
}

function actionButtons() {
  return el('div', { class: 'actions-row' },
    el('button', { type: 'button', onclick: duplicateSelected }, 'Duplicar'),
    el('button', { type: 'button', class: 'danger', onclick: deleteSelected }, 'Borrar'),
    el('button', { type: 'button', onclick: () => orderSelected('front') }, 'Traer al frente'),
    el('button', { type: 'button', onclick: () => orderSelected('back') }, 'Enviar al fondo'));
}

function duplicateSelected() {
  return enqueue(async () => {
    const obj = await ensureObject().catch(() => null);
    if (!obj) return;
    const result = await act({ action: 'duplicate', objectId: obj.id }).catch(() => null);
    if (result) {
      await refreshPage(state.pages[obj.page]);
      const created = state.pages[obj.page].objects.find((o) => o.id === result.object.id);
      if (created) selectObject(state.pages[obj.page], created);
    }
  });
}

function orderSelected(to) {
  return enqueue(async () => {
    const obj = await ensureObject().catch(() => null);
    if (obj) await act({ action: 'order', objectId: obj.id, to }).catch(() => {});
  });
}

function deleteSelected() {
  return enqueue(async () => {
    const obj = selectedObject();
    const element = selectedElement();
    const page = state.selected && state.selected.page;
    if (obj) await act({ action: 'remove', objectId: obj.id }).catch(() => {});
    else if (element) await act({ action: 'remove_span', page, id: element.id, ref: { text: element.text, bbox: element.bbox } }).catch(() => {});
    else return;
    state.selected = null;
    renderPanel(true);
    drawSelection();
  });
}

// Fuentes

async function googleFont(name) {
  say(`Buscando ${name} en Google Fonts…`);
  try {
    const result = await postJson('/api/fonts/google', { name });
    applyState(result);
    state.fonts = null;
    await refreshChanged('all');
    say(`Se agregó ${result.family}. El texto ya la usa.`);
  } catch (error) {
    say(error.message, true);
  }
}

$('fontPick').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const result = await api('/api/fonts/upload', { method: 'POST', headers: { 'X-Filename': encodeURIComponent(file.name) }, body: file });
    applyState(result);
    state.fonts = null;
    await refreshChanged('all');
    say(`Se cargó ${result.name}.`);
  } catch (error) {
    say(error.message, true);
  }
});

// Firmas

$('signaturePick').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const result = await api('/api/signatures/upload', { method: 'POST', headers: { 'X-Remove-Background': state.removeBackground ? '1' : '0' }, body: file });
    state.signature = result.id;
    renderPanel();
    say('Firma guardada. Hacé clic en la página donde va.');
  } catch (error) {
    say(error.message, true);
  }
});

// Imagen

$('imagePick').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  placeImage(file, state.imageAt);
});

addEventListener('paste', (event) => {
  if ($('app').hidden || /INPUT|TEXTAREA/.test(event.target.tagName) || event.target.isContentEditable) return;
  const file = [...event.clipboardData.files].find((f) => /image\/(png|jpeg)/.test(f.type));
  if (!file) return;
  event.preventDefault();
  const page = state.pages[state.current];
  placeImage(file, { page, point: { x: page.w / 2, y: page.h / 3 } });
});

async function placeImage(file, target) {
  if (!file || !target) return;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return say('Esa imagen no se pudo leer. Probá con PNG o JPG.', true);
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buffer.length; i += 32768) binary += String.fromCharCode(...buffer.subarray(i, i + 32768));
  const width = Math.min(bitmap.width, target.page.w * 0.5);
  const spec = { type: 'image', page: target.page.number, x: target.point.x - width / 2, y: target.point.y, w: width, h: (width * bitmap.height) / bitmap.width, data: btoa(binary) };
  const result = await enqueue(() => act({ action: 'add', object: spec }).catch(() => null));
  setTool('select');
  if (result) {
    await refreshPage(target.page);
    const created = target.page.objects.find((o) => o.id === result.object.id);
    if (created) selectObject(target.page, created);
  }
}

// Buscar y reemplazar

let findTimer;
async function runFind() {
  const q = $('findText').value;
  const data = await api(`/api/search?q=${encodeURIComponent(q)}&case=${$('findCase').checked ? 1 : 0}`);
  state.hits = data.hits;
  state.hitIndex = state.hits.length ? 0 : -1;
  showFindCount();
  state.pages.filter((p) => p.loaded).forEach(drawLayer);
  focusHit();
}

function showFindCount() {
  $('findCount').textContent = $('findText').value ? (state.hits.length ? `${state.hitIndex + 1} de ${state.hits.length}` : 'Sin resultados') : '';
}

function focusHit() {
  const hit = state.hits[state.hitIndex];
  if (!hit) return;
  const page = state.pages[hit.page];
  loadPage(page).then(() => {
    page.el.scrollIntoView({ block: 'center' });
    state.pages.filter((p) => p.loaded).forEach(drawLayer);
  });
}

function stepHit(delta) {
  if (!state.hits.length) return;
  state.hitIndex = (state.hitIndex + delta + state.hits.length) % state.hits.length;
  showFindCount();
  focusHit();
}

function toggleFind(show) {
  $('findbar').hidden = !show;
  if (show) $('findText').focus();
  else {
    state.hits = [];
    state.pages.filter((p) => p.loaded).forEach(drawLayer);
  }
}

$('findOpen').addEventListener('click', () => toggleFind($('findbar').hidden));
$('findClose').addEventListener('click', () => toggleFind(false));
$('findPrev').addEventListener('click', () => stepHit(-1));
$('findNext').addEventListener('click', () => stepHit(1));
$('findCase').addEventListener('change', runFind);
$('findText').addEventListener('input', () => {
  clearTimeout(findTimer);
  findTimer = setTimeout(runFind, 200);
});
$('findText').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    stepHit(event.shiftKey ? -1 : 1);
  }
  if (event.key === 'Escape') toggleFind(false);
});
$('replaceAll').addEventListener('click', async () => {
  const result = await enqueue(() => act({ action: 'replace', find: $('findText').value, replace: $('replaceText').value, matchCase: $('findCase').checked }).catch(() => null));
  if (!result) return;
  say(result.count === 1 ? 'Se reemplazó 1 coincidencia.' : `Se reemplazaron ${result.count} coincidencias.`);
  state.selected = null;
  await runFind();
});

// Dialogos

function openDialog(title, body, actions) {
  const dialog = $('dialog');
  dialog.replaceChildren(el('h2', {}, title), ...body, el('div', { class: 'actions' }, el('button', { type: 'button', onclick: () => dialog.close() }, actions.length ? 'Cancelar' : 'Cerrar'), ...actions));
  dialog.showModal();
}

function downloadDialog() {
  const pages = el('input', { placeholder: 'Todas, o por ejemplo 1-3, 5' });
  const password = el('input', { type: 'password', placeholder: 'Sin contraseña', autocomplete: 'new-password' });
  openDialog('Descargar PDF', [field('Páginas', pages), field('Contraseña para abrirlo', password)], [
    el('button', { class: 'primary', onclick: async () => {
      try {
        const res = await postJson('/api/download', { pages: pages.value, password: password.value });
        const blob = await res.blob();
        const link = el('a', { href: URL.createObjectURL(blob), download: decodeURIComponent(res.headers.get('X-Filename')) });
        link.click();
        URL.revokeObjectURL(link.href);
        $('dialog').close();
        state.dirty = false;
        $('saved').textContent = 'Descargado';
        say('PDF descargado.');
      } catch (error) {
        say(error.message, true);
      }
    } }, 'Descargar'),
  ]);
}

function toolsDialog() {
  const current = state.current;
  const item = (iconName, text, run, cls) => {
    const button = el('button', { type: 'button', class: cls || '', onclick: () => { $('dialog').close(); run(); } });
    button.append(icon(iconName), text);
    return button;
  };
  openDialog('Más opciones', [
    el('h3', {}, `Página ${current + 1}`),
    el('div', { class: 'menu' },
      item('rotate', 'Girar a la derecha', () => pageAction({ action: 'page_rotate', pages: [current], angle: 90 })),
      item('rotateLeft', 'Girar a la izquierda', () => pageAction({ action: 'page_rotate', pages: [current], angle: 270 })),
      item('copy', 'Duplicar', () => pageAction({ action: 'page_duplicate', page: current })),
      item('pagePlus', 'Agregar página en blanco después', () => pageAction({ action: 'page_blank', after: current })),
      item('trash', 'Eliminar', () => pageAction({ action: 'page_delete', pages: [current] }), 'danger')),
    el('h3', {}, 'Documento'),
    el('div', { class: 'menu' },
      item('open', 'Abrir otro PDF', () => document.querySelector('header .picker').click()),
      item('merge', 'Agregar otro PDF después de esta página', () => $('pdfPick').click()),
      item('numbers', 'Numerar páginas', numbersDialog),
      item('stamp', 'Agregar marca de agua', watermarkDialog),
      item('info', 'Título, autor y otros datos', metadataDialog)),
  ], []);
}

function numbersDialog() {
  const format = el('input', { value: '{n} de {total}' });
  const position = el('select', {}, el('option', { value: 'bottom' }, 'Abajo'), el('option', { value: 'top' }, 'Arriba'));
  openDialog('Numerar páginas', [field('Formato', format), field('Posición', position)], [
    el('button', { class: 'primary', onclick: () => { $('dialog').close(); pageAction({ action: 'page_numbers', format: format.value, position: position.value }); } }, 'Numerar'),
  ]);
}

function watermarkDialog() {
  const text = el('input', { value: 'BORRADOR' });
  const color = el('input', { type: 'color', value: '#808080' });
  openDialog('Agregar marca de agua', [field('Texto', text), field('Color', color)], [
    el('button', { class: 'primary', onclick: () => { $('dialog').close(); if (text.value.trim()) pageAction({ action: 'watermark', text: text.value, color: color.value }); } }, 'Agregar'),
  ]);
}

async function metadataDialog() {
  const info = await api('/api/metadata');
  const inputs = Object.fromEntries(['title', 'author', 'subject', 'keywords'].map((key) => [key, el('input', { value: info[key] || '' })]));
  openDialog('Datos del documento', [field('Título', inputs.title), field('Autor', inputs.author), field('Asunto', inputs.subject), field('Palabras clave', inputs.keywords)], [
    el('button', { class: 'primary', onclick: async () => {
      $('dialog').close();
      await enqueue(() => act({ action: 'metadata', title: inputs.title.value, author: inputs.author.value, subject: inputs.subject.value, keywords: inputs.keywords.value }));
      say('Datos guardados.');
    } }, 'Guardar'),
  ]);
}

$('pdfPick').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const result = await api('/api/insert', { method: 'POST', headers: { 'X-After': state.current, 'Content-Type': 'application/pdf' }, body: file });
    applyState(result);
    buildPages(result.pages);
    say(`Se agregó ${file.name}.`);
  } catch (error) {
    say(error.message, true);
  }
});

// Barra y teclado

function step(path) {
  commitEdit();
  return enqueue(() => stepNow(path));
}

async function stepNow(path) {
  try {
    const result = await postJson(path);
    applyState(result);
    state.selected = null;
    state.lastProp = null;
    const sameCount = result.pages.length === state.pages.length && result.pages.every((p, i) => p.w === state.pages[i].w && p.h === state.pages[i].h);
    if (sameCount) await refreshChanged('all');
    else buildPages(result.pages);
    renderPanel();
  } catch (error) {
    say(error.message, true);
  }
}

let zoomTimer;
function setZoom(value) {
  state.zoom = Math.min(4, Math.max(0.3, Math.round(value * 100) / 100));
  layoutPages();
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => state.pages.filter((p) => p.loaded).forEach(swapImage), 200);
}

$('undo').addEventListener('click', () => step('/api/undo'));
$('redo').addEventListener('click', () => step('/api/redo'));
$('zoomIn').addEventListener('click', () => setZoom(state.zoom + 0.25));
$('zoomOut').addEventListener('click', () => setZoom(state.zoom - 0.25));
$('zoomValue').addEventListener('click', () => setZoom(($('pages').clientWidth - 48) / Math.max(...state.pages.map((p) => p.w))));
$('downloadOpen').addEventListener('click', downloadDialog);
$('toolsOpen').addEventListener('click', toolsDialog);
document.querySelectorAll('.tool').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
document.querySelectorAll('.picker').forEach((input) => input.addEventListener('change', () => {
  openFile(input.files[0]);
  input.value = '';
}));

addEventListener('keydown', (event) => {
  if ($('app').hidden || $('dialog').open) return;
  const inField = /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable;
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (mod && key === 'f') { event.preventDefault(); return toggleFind(true); }
  if (mod && key === 's') { event.preventDefault(); return downloadDialog(); }
  if (inField) return;
  if (mod && key === 'z') {
    event.preventDefault();
    const id = event.shiftKey ? 'redo' : 'undo';
    if (!$(id).disabled) step(`/api/${id}`);
    return;
  }
  if (mod && key === 'd') { event.preventDefault(); return duplicateSelected(); }
  if (mod && (key === '=' || key === '+')) { event.preventDefault(); return setZoom(state.zoom + 0.25); }
  if (mod && key === '-') { event.preventDefault(); return setZoom(state.zoom - 0.25); }
  if (mod) return;
  if (key === 'escape') { if (state.tool !== 'select') setTool('select'); else deselect(); return; }
  if ((key === 'delete' || key === 'backspace') && state.selected) { event.preventDefault(); return deleteSelected(); }
  if (key.startsWith('arrow') && state.selected) {
    event.preventDefault();
    const obj = selectedObject();
    const element = selectedElement();
    const amount = event.shiftKey ? 10 : 1;
    const dx = key === 'arrowleft' ? -amount : key === 'arrowright' ? amount : 0;
    const dy = key === 'arrowup' ? -amount : key === 'arrowdown' ? amount : 0;
    const x = obj ? obj.x : element.bbox[0], y = obj ? obj.y : element.bbox[1];
    if (obj) return setProps({ x: x + dx, y: y + dy }, 'nudge');
    return enqueue(ensureObject).then((o) => o && setProps({ x: o.x + dx, y: o.y + dy }, 'nudge'));
  }
  const tools = { v: 'select', f: 'signature', t: 'text', r: 'rect', l: 'line', h: 'highlight', d: 'ink' };
  if (tools[key]) setTool(tools[key]);
});

$('pages').addEventListener('wheel', (event) => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  setZoom(state.zoom * (event.deltaY < 0 ? 1.08 : 0.93));
}, { passive: false });

addEventListener('dragover', (event) => {
  if (event.dataTransfer.types.includes('Files')) {
    event.preventDefault();
    document.body.classList.add('dragging');
  }
});
addEventListener('dragleave', (event) => {
  if (!event.relatedTarget) document.body.classList.remove('dragging');
});
addEventListener('drop', (event) => {
  event.preventDefault();
  document.body.classList.remove('dragging');
  const file = event.dataTransfer.files[0];
  if (file) openFile(file);
});
addEventListener('beforeunload', (event) => {
  if (state.dirty) event.preventDefault();
});

// Al iniciar: que puede hacer esta version y si habia un documento abierto antes de recargar.
(async function startup() {
  try {
    state.capabilities = await api('/api/capabilities');
    if (state.capabilities.desktop) {
      const ping = () => fetch('/api/ping').catch(() => {});
      ping();
      setInterval(ping, 15000);
      addEventListener('pagehide', () => navigator.sendBeacon('/api/closed'));
    }
    const current = await api('/api/state');
    if (!current.open) return;
    applyState(current);
    $('name').textContent = current.name;
    document.title = current.name + ' – Editor de PDF';
    $('welcome').hidden = true;
    $('app').hidden = false;
    state.zoom = Math.min(1.25, Math.max(0.5, ($('pages').clientWidth - 48) / Math.max(...current.pages.map((p) => p.w))));
    buildPages(current.pages);
    showSaved();
    renderPanel(true);
  } catch {
    // Sin estado previo se muestra la bienvenida.
  }
})();

// Demostracion de la bienvenida: una sola vez, y quieta si se pidio menos movimiento.
(function playDemo() {
  const target = $('demoEdit');
  const sign = document.querySelector('.demo-sign');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    target.textContent = '$ 2.750';
    return;
  }
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  (async () => {
    await wait(700);
    target.classList.add('mark');
    await wait(650);
    target.classList.add('typing');
    target.textContent = '';
    for (const char of '$ 2.750') {
      target.textContent += char;
      await wait(95);
    }
    await wait(350);
    target.classList.remove('typing', 'mark');
    target.style.backgroundSize = '0 100%';
    await wait(250);
    sign.classList.add('draw');
  })();
})();
