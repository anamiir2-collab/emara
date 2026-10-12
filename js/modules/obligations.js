// obligations.js — Obligations list & management (sub-view reached from contracts & collections).

import * as db from '../database.js';
import { STORES, OBLIGATION_TYPES } from '../config.js';
import { el, icon, pageHeader, button, emptyState, searchInput, renderList, formatEgp, formatDateShort } from '../ui.js';
import * as calc from '../calculations.js';
import { perObligationOutstanding } from '../calculations.js';

let _listEl = null;
let _all = [];
let _payments = [];
let _contracts = [];
let _apartments = [];
let _buildings = [];
let _residents = [];
let _filter = { q: '', status: 'all', buildingId: '' };

export async function mount(container, ctx) {
  const subtitle = 'الالتزامات الشهرية على العقود';
  container.appendChild(pageHeader({ title: 'الالتزامات', subtitle }));

  [_all, _payments, _contracts, _apartments, _buildings, _residents] = await Promise.all([
    db.getAll(STORES.obligations),
    db.getAll(STORES.payments),
    db.getAll(STORES.contracts),
    db.getAll(STORES.apartments),
    db.getAll(STORES.buildings),
    db.getAll(STORES.residents),
  ]);
  _all.sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));

  const toolbar = el('div', { class: 'toolbar' });
  toolbar.appendChild(searchInput('ابحث بالفترة أو الملاحظات…', q => { _filter.q = q; render(); }));
  const statusSel = el('select', { class: 'input', 'aria-label': 'الحالة' });
  for (const s of [{id:'all',label:'الكل'},{id:'paid',label:'مدفوعة بالكامل'},{id:'partial',label:'مدفوعة جزئيًا'},{id:'unpaid',label:'غير مدفوعة'}]) {
    statusSel.appendChild(el('option', { value: s.id, text: s.label }));
  }
  statusSel.addEventListener('change', () => { _filter.status = statusSel.value; render(); });
  toolbar.appendChild(statusSel);
  const bSel = el('select', { class: 'input', 'aria-label': 'المبنى' });
  bSel.appendChild(el('option', { value: '', text: 'كل المباني' }));
  for (const b of _buildings.filter(b => !b.archived)) bSel.appendChild(el('option', { value: b.id, text: b.name }));
  bSel.addEventListener('change', () => { _filter.buildingId = bSel.value; render(); });
  toolbar.appendChild(bSel);
  container.appendChild(toolbar);

  _listEl = el('div', { class: 'card-list' });
  container.appendChild(_listEl);
  render();
}

function render() {
  if (!_listEl) return;
  const aMap = new Map(_apartments.map(a => [a.id, a]));
  const bMap = new Map(_buildings.map(b => [b.id, b]));
  const cMap = new Map(_contracts.map(c => [c.id, c]));
  const tMap = new Map(_residents.map(r => [r.id, r]));
  const outstanding = perObligationOutstanding(_all, _payments);

  const q = _filter.q.trim().toLowerCase();
  const items = _all.filter(o => {
    if (_filter.buildingId && o.buildingId !== _filter.buildingId) return false;
    const out = outstanding.get(o.id) || 0;
    if (_filter.status === 'paid' && out !== 0) return false;
    if (_filter.status === 'unpaid' && out !== o.amountPiastres) return false;
    if (_filter.status === 'partial' && (out === 0 || out === o.amountPiastres)) return false;
    if (!q) return true;
    return (o.period || '').toLowerCase().includes(q) || (o.notes || '').toLowerCase().includes(q);
  });

  renderList(_listEl, items, o => rowFactory(o, aMap, bMap, cMap, tMap, outstanding), () => emptyState({
    icon: 'list', title: 'لا توجد التزامات',
    message: 'أنشئ عقدًا ثم ولّد التزاماته الشهرية.',
  }));
}

function rowFactory(o, aMap, bMap, cMap, tMap, outstanding) {
  const a = aMap.get(o.apartmentId);
  const b = a ? bMap.get(a.buildingId) : (o.buildingId ? bMap.get(o.buildingId) : null);
  const c = cMap.get(o.contractId);
  const t = tMap.get(o.tenantId);
  const out = outstanding.get(o.id) || 0;
  const typeLabel = OBLIGATION_TYPES.find(x => x.id === o.type)?.label || o.type;
  const statusChip = out === 0
    ? el('span', { class: 'chip chip--success', text: 'مدفوع' })
    : out === o.amountPiastres
      ? el('span', { class: 'chip chip--warn', text: 'غير مدفوع' })
      : el('span', { class: 'chip chip--info', text: `متبقي ${formatEgp(out)}` });
  return el('div', { class: 'card-list__item' }, [
    el('div', { class: 'card-list__icon' }, [icon('calendar', { size: 22 })]),
    el('div', { class: 'card-list__body' }, [
      el('div', { class: 'card-list__title', text: `${o.notes || typeLabel} — ${o.period}` }),
      el('div', { class: 'card-list__sub', text: `${b ? b.name : '—'} – وحدة ${a ? a.number : '—'}` }),
      el('div', { class: 'card-list__meta' }, [
        el('span', { class: 'chip', text: typeLabel }),
        el('span', { class: 'chip', text: `استحقاق ${formatDateShort(o.dueDate)}` }),
        t ? el('span', { class: 'chip', text: t.name }) : null,
        c ? el('span', { class: 'chip', text: c.code || 'عقد' }) : null,
        statusChip,
        el('span', { class: 'chip chip--info', text: `${formatEgp(o.amountPiastres)}` }),
      ]),
    ]),
  ]);
}

export function unmount() { _listEl = null; _all = []; }
