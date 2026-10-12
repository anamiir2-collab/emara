// receipts.js — Browse & print receipts. Printing never creates duplicate transactions.

import * as db from '../database.js';
import { STORES, APP_CONFIG } from '../config.js';
import { formatEgp, formatDateShort } from '../validation.js';
import { el, icon, pageHeader, button, emptyState, searchInput, renderList } from '../ui.js';

let _listEl = null;
let _all = [];
let _buildings = [];
let _apartments = [];
let _residents = [];
let _obligations = [];
let _filter = { q: '' };

export async function mount(container, ctx) {
  container.appendChild(pageHeader({
    title: 'الإيصالات',
    subtitle: 'سجل الإيصالات والطباعة',
  }));

  await reload();
  const toolbar = el('div', { class: 'toolbar' });
  toolbar.appendChild(searchInput('ابحث برقم الإيصال…', q => { _filter.q = q; render(); }));
  container.appendChild(toolbar);

  _listEl = el('div', { class: 'card-list' });
  container.appendChild(_listEl);
  render();
}

async function reload() {
  [_all, _buildings, _apartments, _residents, _obligations] = await Promise.all([
    db.getAll(STORES.receipts),
    db.getAll(STORES.buildings),
    db.getAll(STORES.apartments),
    db.getAll(STORES.residents),
    db.getAll(STORES.obligations),
  ]);
  _all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function render() {
  if (!_listEl) return;
  const q = _filter.q.trim().toLowerCase();
  const items = _all.filter(r => !q || (r.number || '').toLowerCase().includes(q));
  renderList(_listEl, items, rowFactory, () => emptyState({
    icon: 'receipt', title: 'لا توجد إيصالات',
    message: 'يتم إنشاء الإيصالات تلقائيًا عند تسجيل التحصيلات والمصروفات المدفوعة.',
  }));
}

function rowFactory(r) {
  const row = el('div', { class: 'card-list__item' }, [
    el('div', { class: 'card-list__icon' }, [icon('receipt', { size: 22 })]),
    el('div', { class: 'card-list__body' }, [
      el('div', { class: 'card-list__title', text: r.number }),
      el('div', { class: 'card-list__sub', text: `${r.type === 'payment' ? 'تحصيل' : 'صرف'} — ${formatDateShort(r.date)}` }),
      el('div', { class: 'card-list__meta' }, [
        el('span', { class: 'chip chip--info', text: formatEgp(r.amountPiastres) }),
        r.method ? el('span', { class: 'chip', text: r.method }) : null,
      ]),
    ]),
    el('div', { class: 'card-list__actions' }, [
      el('button', { class: 'icon-btn', 'aria-label': 'طباعة', onClick: () => printReceipt(r) }, [icon('print', { size: 18 })]),
    ]),
  ]);
  return row;
}

function printReceipt(r) {
  // Look up related obligation/expense to enrich the printed doc
  const win = window.open('', '_blank', 'noopener,width=480,height=720');
  if (!win) {
    alert('يرجى السماح بالنوافذ المنبثقة لطباعة الإيصال.');
    return;
  }
  // Build a printable HTML document. We DON'T write anything to the database here.
  // Printing is read-only and cannot create duplicate transactions.
  const html = buildReceiptHtml(r);
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { try { win.print(); } catch (e) {} }, 300);
}

function buildReceiptHtml(r) {
  let party = '—';
  let description = r.notes || '';
  if (r.type === 'payment') {
    // refIds are payment ids; find first obligation from these
    // (we didn't store obligationId on receipt; rely on notes)
  }
  const date = new Date(r.date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>إيصال ${r.number}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Noto Sans Arabic', 'Tahoma', sans-serif; margin: 0; padding: 24px; color: #1a1a1a; }
    .receipt { max-width: 480px; margin: 0 auto; border: 1px solid #d8d2c2; border-radius: 12px; padding: 24px; }
    .receipt__head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1f5f3f; padding-bottom: 12px; margin-bottom: 16px; }
    .receipt__brand { display: flex; align-items: center; gap: 10px; }
    .receipt__mark { width: 36px; height: 36px; background: #1f5f3f; border-radius: 8px; color: #fff; display: grid; place-items: center; font-weight: 700; }
    .receipt__title { font-size: 14px; color: #7a8a7a; }
    .receipt__no { font-size: 13px; color: #3d4a3d; }
    .receipt__row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #d8d2c2; font-size: 14px; }
    .receipt__row strong { color: #1f5f3f; }
    .receipt__amount { font-size: 28px; font-weight: 700; color: #1f5f3f; text-align: center; padding: 16px 0; border: 1px dashed #1f5f3f; border-radius: 8px; margin: 16px 0; }
    .receipt__notes { font-size: 13px; color: #7a8a7a; margin-top: 12px; }
    .receipt__foot { margin-top: 24px; font-size: 12px; color: #7a8a7a; text-align: center; }
    @media print { body { padding: 0; } .receipt { border: none; } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="receipt__head">
      <div class="receipt__brand">
        <div class="receipt__mark">ع</div>
        <div>
          <div style="font-size:18px;font-weight:700;">${APP_CONFIG.name}</div>
          <div class="receipt__title">${APP_CONFIG.tagline}</div>
        </div>
      </div>
      <div style="text-align:left;">
        <div style="font-weight:700;">${r.number}</div>
        <div class="receipt__no">${date}</div>
      </div>
    </div>
    <div class="receipt__row"><span>النوع</span><strong>${r.type === 'payment' ? 'سند قبض' : 'سند صرف'}</strong></div>
    ${r.method ? `<div class="receipt__row"><span>الطريقة</span><strong>${r.method}</strong></div>` : ''}
    ${description ? `<div class="receipt__row"><span>البيان</span><strong>${escapeHtml(description)}</strong></div>` : ''}
    <div class="receipt__amount">${formatEgp(r.amountPiastres)}</div>
    <div class="receipt__notes">هذا الإيصال مُولّد محليًا من تطبيق ${APP_CONFIG.name}.</div>
    <div class="receipt__foot">© ${new Date().getFullYear()} ${APP_CONFIG.name}</div>
  </div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

export function unmount() { _listEl = null; _all = []; }
