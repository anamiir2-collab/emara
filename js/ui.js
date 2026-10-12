// ui.js — Shared DOM helpers & small UI primitives used by every module.
// Kept separate from app.js to avoid circular imports (modules import from here,
// app.js dynamically imports modules — no cycle).

import { formatEgp as fmtEgp, formatNumber as fmtNum, formatDate as fmtDate, formatDateShort as fmtDateShort } from './validation.js';

// SVG icon library — same as in app.js but standalone.
const ICON_PATHS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-7H10v7H5a2 2 0 0 1-2-2z"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h0M15 7h0M9 11h0M15 11h0M9 15h0M15 15h0"/>',
  door: '<path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M3 21h18"/><circle cx="15" cy="12" r="1"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><circle cx="16" cy="14" r="1"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 1 5.4-5.4l-3 3a2 2 0 0 1-2.8 0l-.3-.3a2 2 0 0 1 0-2.8z"/>',
  receipt: '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7"/><rect x="12" y="6" width="3" height="11"/><rect x="17" y="13" width="3" height="4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  back: '<path d="M9 18l6-6-6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  whatsapp: '<path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01C17.18 3.03 14.69 2 12.04 2zm0 18.15h-.01c-1.52 0-3.01-.41-4.31-1.18l-.31-.18-3.2.84.86-3.12-.2-.32a8.21 8.21 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42-.14 0-.31-.02-.47-.02-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  refresh: '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h0"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h0M18 12h0"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  undo: '<path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 0 1 0 8h-1"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h0"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h0M3 12h0M3 18h0"/>',
  star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
};

const STROKE_ICONS = new Set(['home', 'building', 'door', 'users', 'doc', 'wallet', 'cart', 'wrench', 'receipt', 'chart', 'user', 'gear', 'back', 'plus', 'search', 'edit', 'trash', 'print', 'download', 'upload', 'check', 'menu', 'close', 'refresh', 'filter', 'archive', 'alert', 'phone', 'mail', 'cash', 'calendar', 'undo', 'info', 'list', 'star']);
const FILL_ICONS = new Set(['whatsapp']);

export function icon(name, opts = {}) {
  const path = ICON_PATHS[name];
  if (!path) return document.createElement('span');
  const size = opts.size || 20;
  const stroke = STROKE_ICONS.has(name);
  const fill = FILL_ICONS.has(name) ? 'currentColor' : 'none';
  const attrs = stroke
    ? 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
    : `fill="${fill}"`;
  const span = document.createElement('span');
  span.className = 'icon' + (opts.cls ? ` ${opts.cls}` : '');
  span.setAttribute('aria-hidden', 'true');
  span.style.width = size + 'px';
  span.style.height = size + 'px';
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" ${attrs}>${path}</svg>`;
  return span;
}

/**
 * Create a DOM element with attributes & children.
 * @param {string} tag
 * @param {object} attrs  { class, html, text, onXxx, ...data-* }
 * @param {Node[]|Node|string} children
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k.startsWith('data-')) {
      node.setAttribute(k, v);
    } else {
      node.setAttribute(k, v);
    }
  }
  const arr = Array.isArray(children) ? children : [children];
  for (const c of arr) {
    if (c == null || c === false) continue;
    if (typeof c === 'string' || typeof c === 'number') {
      node.appendChild(document.createTextNode(String(c)));
    } else {
      node.appendChild(c);
    }
  }
  return node;
}

export function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
}

export function formatEgp(p) { return fmtEgp(p); }
export function formatNumber(p) { return fmtNum(p); }
export function formatDate(t) { return fmtDate(t); }
export function formatDateShort(t) { return fmtDateShort(t); }

/** Build a standard page header with title, subtitle, and action buttons. */
export function pageHeader({ title, subtitle = '', actions = [] }) {
  const h = el('header', { class: 'page-header' });
  h.appendChild(el('div', { class: 'page-header__titles' }, [
    el('h1', { class: 'page-header__title', text: title }),
    subtitle ? el('p', { class: 'page-header__subtitle', text: subtitle }) : null,
  ]));
  if (actions.length) {
    const wrap = el('div', { class: 'page-header__actions' }, actions);
    h.appendChild(wrap);
  }
  return h;
}

/** Primary / ghost / danger button. */
export function button(label, opts = {}) {
  const { variant = 'ghost', icon: iconName = null, onClick = null, type = 'button', cls = '', attrs = {} } = opts;
  const b = el('button', { type, class: `btn btn--${variant} ${cls}`.trim() });
  if (iconName) b.appendChild(icon(iconName, { size: 18 }));
  b.appendChild(el('span', { text: label }));
  if (onClick) b.addEventListener('click', onClick);
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
  return b;
}

/** Empty-state card. */
export function emptyState({ icon: iconName = 'info', title, message, action = null }) {
  const wrap = el('div', { class: 'empty-state' }, [
    el('div', { class: 'empty-state__icon' }, [icon(iconName, { size: 36 })]),
    el('h2', { class: 'empty-state__title', text: title }),
    message ? el('p', { class: 'empty-state__msg', text: message }) : null,
  ]);
  if (action) wrap.appendChild(action);
  return wrap;
}

/** Stat tile (small KPI). */
export function statTile({ label, value, hint = '', variant = '' }) {
  return el('div', { class: `stat-tile ${variant ? 'stat-tile--' + variant : ''}`.trim() }, [
    el('div', { class: 'stat-tile__label', text: label }),
    el('div', { class: 'stat-tile__value', text: value }),
    hint ? el('div', { class: 'stat-tile__hint', text: hint }) : null,
  ]);
}

/** Generic card. */
export function card({ title = '', body = '', actions = [], cls = '' }) {
  const c = el('div', { class: `card ${cls}`.trim() });
  if (title) c.appendChild(el('div', { class: 'card__title', text: title }));
  if (typeof body === 'string') {
    c.appendChild(el('div', { class: 'card__body', text: body }));
  } else if (body) {
    const div = el('div', { class: 'card__body' });
    div.appendChild(body);
    c.appendChild(div);
  }
  if (actions.length) {
    c.appendChild(el('div', { class: 'card__actions' }, actions));
  }
  return c;
}

/** Search input with debounced callback. */
export function searchInput(placeholder, onInput, opts = {}) {
  const i = el('input', {
    type: 'search',
    class: 'input search-input',
    placeholder,
    'aria-label': placeholder,
  });
  let timer = null;
  i.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => onInput(i.value), opts.debounce || 200);
  });
  return i;
}

/** Render a list of items inside a container using a row factory. */
export function renderList(container, items, rowFactory, emptyFactory = null) {
  clear(container);
  if (items.length === 0) {
    if (emptyFactory) container.appendChild(emptyFactory());
    return;
  }
  for (const it of items) {
    container.appendChild(rowFactory(it));
  }
}

/** Generic confirm-modal trigger (re-export from notifications). */
export { confirmDialog } from './notifications.js';

export default {
  icon, el, clear, formatEgp, formatNumber, formatDate, formatDateShort,
  pageHeader, button, emptyState, statTile, card, searchInput, renderList,
};
