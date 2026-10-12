// app.js — Application bootstrap & shell.
// Dynamically imports module files on navigation. Owns the DOM shell:
// sidebar, top bar, bottom nav, page container. Modules render into #page.

import { APP_CONFIG, ROUTES } from './config.js';
import * as router from './router.js';
import { openDB, getSetting } from './database.js';
import { toast } from './notifications.js';

const MODULE_CACHE = new Map();

async function loadModule(name) {
  if (MODULE_CACHE.has(name)) return MODULE_CACHE.get(name);
  // Use relative path so it works under GitHub Pages subpaths.
  // app.js lives in /js/, so modules are at ./modules/<name>.js (relative to app.js).
  const url = `./modules/${name}.js`;
  const mod = await import(url);
  MODULE_CACHE.set(name, mod);
  return mod;
}

// --- SVG icon library (inline, no emoji) ---
const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-7H10v7H5a2 2 0 0 1-2-2z"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h0M15 7h0M9 11h0M15 11h0M9 15h0M15 15h0"/></svg>',
  door: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M3 21h18"/><circle cx="15" cy="12" r="1"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><circle cx="16" cy="14" r="1"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 1 5.4-5.4l-3 3a2 2 0 0 1-2.8 0l-.3-.3a2 2 0 0 1 0-2.8z"/></svg>',
  receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7"/><rect x="12" y="6" width="3" height="11"/><rect x="17" y="13" width="3" height="4"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01C17.18 3.03 14.69 2 12.04 2zm0 18.15h-.01c-1.52 0-3.01-.41-4.31-1.18l-.31-.18-3.2.84.86-3.12-.2-.32a8.21 8.21 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42-.14 0-.31-.02-.47-.02-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
};

export function icon(name, opts = {}) {
  const svg = ICONS[name] || ICONS.doc;
  const span = document.createElement('span');
  span.className = 'icon' + (opts.size ? ` icon--${opts.size}` : '');
  span.innerHTML = svg;
  span.setAttribute('aria-hidden', 'true');
  return span;
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined && v !== false) {
      node.setAttribute(k, v);
    }
  }
  for (const c of (Array.isArray(children) ? children : [children])) {
    if (c == null) continue;
    if (typeof c === 'string' || typeof c === 'number') {
      node.appendChild(document.createTextNode(String(c)));
    } else {
      node.appendChild(c);
    }
  }
  return node;
}

// --- Shell rendering ---

function renderShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <aside class="sidebar" id="sidebar" aria-label="القائمة الجانبية"></aside>
    <div class="sidebar-backdrop" id="sidebar-backdrop" hidden></div>
    <div class="app-main">
      <header class="topbar">
        <button class="icon-btn topbar__menu" id="menu-toggle" aria-label="القائمة">${ICONS.menu}</button>
        <div class="topbar__title" id="page-title">عِمارة</div>
        <button class="icon-btn topbar__refresh" id="refresh-btn" aria-label="تحديث">${ICONS.refresh}</button>
      </header>
      <main class="page" id="page" role="main" tabindex="-1"></main>
      <nav class="bottomnav" id="bottomnav" aria-label="التنقل السفلي"></nav>
    </div>
  `;

  // Build sidebar
  buildSidebar();
  // Build bottom nav (subset: 5 most-used)
  buildBottomNav();

  // Wire up
  document.getElementById('menu-toggle').addEventListener('click', toggleSidebar);
  document.getElementById('sidebar-backdrop').addEventListener('click', closeSidebar);
  document.getElementById('refresh-btn').addEventListener('click', () => {
    router.navigate(router.current().path || '/', { replace: true });
    // force re-render
    const parsed = router.parse();
    renderRoute(parsed).catch(err => {
      console.error(err);
      toast('حدث خطأ أثناء التحديث.', { type: 'error' });
    });
  });
}

function buildSidebar() {
  const sb = document.getElementById('sidebar');
  const header = document.createElement('div');
  header.className = 'sidebar__header';
  header.innerHTML = `
    <div class="brand">
      <div class="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <rect x="3" y="3" width="26" height="26" rx="7" fill="currentColor"/>
          <path d="M10 23V12l6-4 6 4v11" stroke="#fff" stroke-width="2" stroke-linejoin="round" fill="none"/>
          <path d="M14 23v-5h4v5" stroke="#fff" stroke-width="2" fill="none"/>
        </svg>
      </div>
      <div class="brand__text">
        <div class="brand__name">${APP_CONFIG.name}</div>
        <div class="brand__sub">${APP_CONFIG.tagline}</div>
      </div>
    </div>
  `;
  sb.appendChild(header);
  const nav = document.createElement('nav');
  nav.className = 'sidebar__nav';
  for (const r of ROUTES) {
    const a = document.createElement('a');
    a.className = 'side-link';
    a.href = '#' + r.path;
    a.dataset.path = r.path;
    a.innerHTML = `<span class="side-link__icon" aria-hidden="true">${ICONS[r.icon] || ICONS.doc}</span><span class="side-link__label">${r.label}</span>`;
    a.addEventListener('click', closeSidebar);
    nav.appendChild(a);
  }
  sb.appendChild(nav);
  const footer = document.createElement('div');
  footer.className = 'sidebar__footer';
  footer.innerHTML = `<div class="sidebar__version">الإصدار ${APP_CONFIG.version}</div>`;
  sb.appendChild(footer);
}

function buildBottomNav() {
  const bn = document.getElementById('bottomnav');
  // Pick 5 most-used destinations for bottom bar
  const picks = ['/', '/collections', '/expenses', '/maintenance', '/reports'];
  for (const path of picks) {
    const r = ROUTES.find(x => x.path === path);
    if (!r) continue;
    const a = document.createElement('a');
    a.className = 'bn-item';
    a.href = '#' + path;
    a.dataset.path = path;
    a.setAttribute('aria-label', r.label);
    a.innerHTML = `<span class="bn-item__icon" aria-hidden="true">${ICONS[r.icon] || ICONS.doc}</span><span class="bn-item__label">${r.label}</span>`;
    bn.appendChild(a);
  }
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('sidebar-backdrop');
  const open = sb.classList.toggle('is-open');
  bd.hidden = !open;
}
function closeSidebar() {
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('sidebar-backdrop');
  sb.classList.remove('is-open');
  bd.hidden = true;
}

function highlightActive(path) {
  // Bottom nav
  document.querySelectorAll('.bn-item').forEach(a => {
    a.classList.toggle('is-active', path === a.dataset.path || path.startsWith(a.dataset.path + '/'));
  });
  // Sidebar
  document.querySelectorAll('.side-link').forEach(a => {
    a.classList.toggle('is-active', path === a.dataset.path || path.startsWith(a.dataset.path + '/'));
  });
  // Page title
  const route = ROUTES.find(r => path === r.path || path.startsWith(r.path + '/'));
  document.getElementById('page-title').textContent = route ? route.label : APP_CONFIG.name;
}

let _activeModule = null;

async function renderRoute(parsed) {
  const { route, params } = router.matchRoute(parsed);
  const page = document.getElementById('page');
  if (!route) {
    page.innerHTML = `<div class="empty-state"><h2>الصفحة غير موجودة</h2><p>عنوان المسار غير صالح: <code>${escapeHtml(parsed.path)}</code></p><p><a href="#/">العودة للرئيسية</a></p></div>`;
    return;
  }
  highlightActive(parsed.path);

  // Cleanup previous module
  if (_activeModule && typeof _activeModule.unmount === 'function') {
    try { _activeModule.unmount(); } catch (e) { console.warn('unmount error', e); }
  }
  _activeModule = null;

  // Page transition
  page.classList.remove('page--enter');
  page.innerHTML = '';
  // Loading placeholder
  const loading = el('div', { class: 'page-loading', text: 'جارٍ التحميل…' });
  page.appendChild(loading);

  try {
    const mod = await loadModule(route.module);
    if (typeof mod.mount !== 'function') {
      throw new Error(`الوحدة ${route.module} لا تصدّر دالة mount.`);
    }
    page.innerHTML = '';
    await mod.mount(page, { params, route });
    _activeModule = mod;
    // Animate
    requestAnimationFrame(() => page.classList.add('page--enter'));
    page.focus({ preventScroll: true });
  } catch (err) {
    console.error('Module load/render error:', err);
    page.innerHTML = `<div class="empty-state empty-state--error">
      <h2>تعذر تحميل الصفحة</h2>
      <p>${escapeHtml(err.message || String(err))}</p>
      <p><a href="#/">العودة للرئيسية</a></p>
    </div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

/** Register service worker (after load). */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // Use relative path so it works under GitHub Pages subpath.
  const swUrl = new URL(APP_CONFIG.swPath, location.href).href;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl, { scope: './' })
      .then(reg => {
        // Listen for updates
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              toast('يتوفر إصدار جديد. سيُفعّل بعد إعادة التشغيل.', {
                type: 'info', duration: 6000,
                action: { label: 'تحديث الآن', cb: () => location.reload() }
              });
            }
          });
        });
      })
      .catch(err => {
        console.warn('Service worker registration failed:', err);
      });
  });
}

/** Show install prompt handling */
function setupInstallPrompt() {
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Show an in-app banner
    toast('يمكنك تثبيت التطبيق على جهازك.', {
      type: 'info', duration: 8000,
      action: {
        label: 'تثبيت', cb: async () => {
          if (!deferredPrompt) return;
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') toast('جارٍ التثبيت…', { type: 'success' });
          deferredPrompt = null;
        }
      }
    });
  });
}

async function bootstrap() {
  // Apply stored preferences
  const theme = await getSetting('theme', 'light');
  document.documentElement.setAttribute('data-theme', theme);
  const lang = await getSetting('language', 'ar');
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

  renderShell();
  router.start();
  router.subscribe(async (parsed) => {
    await renderRoute(parsed);
  });

  registerSW();
  setupInstallPrompt();
}

// Boot when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

// Ensure DB is opened early (warm-up)
openDB().catch(err => {
  console.error('DB open failed', err);
  toast('تعذر فتح قاعدة البيانات المحلية.', { type: 'error', duration: 8000 });
});

export { ICONS };
