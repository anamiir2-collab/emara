// expenses.js — Record expenses (paid / unpaid) + reversals.

import * as db from '../database.js';
import { STORES, EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../config.js';
import { parseEgp, parseDate, formatEgp, formatDateShort } from '../validation.js';
import { el, icon, pageHeader, button, emptyState, searchInput, renderList, statTile } from '../ui.js';
import { toast, confirmDialog } from '../notifications.js';
import { recordExpense, reverseExpense } from '../ledger.js';
import * as calc from '../calculations.js';

let _listEl = null;
let _expenses = [];
let _buildings = [];
let _filter = { q: '', status: 'all', buildingId: '' };

export async function mount(container, ctx) {
  container.appendChild(pageHeader({
    title: 'المصروفات',
    subtitle: 'مصروفات المباني وحالة السداد',
    actions: [button('مصروف جديد', { variant: 'primary', icon: 'plus', onClick: () => showForm() })],
  }));

  await reload();
  const stats = computeStats();
  const statGrid = el('div', { class: 'kpi-grid kpi-grid--compact' }, [
    statTile({ label: 'إجمالي', value: formatEgp(stats.total), variant: '' }),
    statTile({ label: 'مدفوع', value: formatEgp(stats.paid), variant: 'success' }),
    statTile({ label: 'غير مدفوع', value: formatEgp(stats.unpaid), variant: 'warn' }),
  ]);
  container.appendChild(statGrid);

  const toolbar = el('div', { class: 'toolbar' });
  toolbar.appendChild(searchInput('ابحث بالوصف أو التصنيف…', q => { _filter.q = q; render(); }));
  const stSel = el('select', { class: 'input', 'aria-label': 'الحالة' });
  for (const o of [{id:'all',label:'الكل'},{id:'paid',label:'مدفوع'},{id:'unpaid',label:'غير مدفوع'}]) {
    stSel.appendChild(el('option', { value: o.id, text: o.label }));
  }
  stSel.addEventListener('change', () => { _filter.status = stSel.value; render(); });
  toolbar.appendChild(stSel);
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

async function reload() {
  [_expenses, _buildings] = await Promise.all([
    db.getAll(STORES.expenses),
    db.getAll(STORES.buildings),
  ]);
  _expenses.sort((a, b) => (b.date || 0) - (a.date || 0));
}

function computeStats() {
  const total = _expenses.filter(e => !e.reversed).reduce((s, e) => s + e.amountPiastres, 0);
  const paid = calc.sumPaidExpenses(_expenses);
  const unpaid = _expenses.filter(e => !e.reversed && e.status === 'unpaid').reduce((s, e) => s + e.amountPiastres, 0);
  return { total, paid, unpaid };
}

function render() {
  if (!_listEl) return;
  const bMap = new Map(_buildings.map(b => [b.id, b]));
  const q = _filter.q.trim().toLowerCase();
  const items = _expenses.filter(e => {
    if (e.reversed) return _filter.status === 'all' && false; // hide reversed by default
    if (_filter.status !== 'all' && e.status !== _filter.status) return false;
    if (_filter.buildingId && e.buildingId !== _filter.buildingId) return false;
    if (!q) return true;
    return (e.description || '').toLowerCase().includes(q) ||
           (e.category || '').toLowerCase().includes(q);
  });
  renderList(_listEl, items, e => rowFactory(e, bMap), () => emptyState({
    icon: 'cart', title: 'لا توجد مصروفات',
    message: 'سجّل أول مصروف لمتابعة التدفقات النقدية.',
    action: button('مصروف جديد', { variant: 'primary', icon: 'plus', onClick: () => showForm() }),
  }));
}

function rowFactory(e, bMap) {
  const b = bMap.get(e.buildingId);
  return el('div', { class: 'card-list__item' + (e.reversed ? ' is-reversed' : '') }, [
    el('div', { class: 'card-list__icon' }, [icon('cart', { size: 22 })]),
    el('div', { class: 'card-list__body' }, [
      el('div', { class: 'card-list__title', text: `${formatEgp(e.amountPiastres)} — ${e.category}` }),
      el('div', { class: 'card-list__sub', text: `${b ? b.name : '—'} — ${e.description || ''}` }),
      el('div', { class: 'card-list__meta' }, [
        el('span', { class: 'chip ' + (e.status === 'paid' ? 'chip--success' : 'chip--warn'), text: e.status === 'paid' ? 'مدفوع' : 'غير مدفوع' }),
        el('span', { class: 'chip', text: formatDateShort(e.date) }),
        e.receiptNumber ? el('span', { class: 'chip', text: e.receiptNumber }) : null,
        e.reversed ? el('span', { class: 'chip chip--danger', text: 'ملغى' }) : null,
      ]),
    ]),
    el('div', { class: 'card-list__actions' }, [
      e.status === 'unpaid' && !e.reversed ? el('button', { class: 'icon-btn', 'aria-label': 'تعليم كمدفوع', title: 'تعليم كمدفوع', onClick: () => markPaid(e) }, [icon('check', { size: 18 })]) : null,
      !e.reversed ? el('button', { class: 'icon-btn icon-btn--danger', 'aria-label': 'إلغاء', title: 'إلغاء', onClick: () => reverse(e) }, [icon('undo', { size: 18 })]) : null,
    ]),
  ]);
}

function showForm() {
  const overlay = el('div', { class: 'modal-overlay' });
  const cardEl = el('div', { class: 'modal-card modal-card--wide', role: 'dialog', 'aria-modal': 'true' });
  cardEl.appendChild(el('h3', { class: 'modal-card__title', text: 'مصروف جديد' }));
  const form = el('form', { class: 'form' });

  const fields = [
    { name: 'buildingId', label: 'المبنى *', type: 'select', options: [{id:'',label:'—'}].concat(_buildings.filter(b=>!b.archived).map(b => ({id:b.id, label:b.name}))) },
    { name: 'category', label: 'التصنيف *', type: 'select', options: EXPENSE_CATEGORIES.map(c => ({id:c, label:c})) },
    { name: 'description', label: 'الوصف', type: 'text' },
    { name: 'amount', label: 'المبلغ (ج.م) *', type: 'number', step: '0.01' },
    { name: 'date', label: 'التاريخ *', type: 'date', value: new Date().toISOString().slice(0,10) },
    { name: 'status', label: 'الحالة *', type: 'select', options: [{id:'unpaid',label:'غير مدفوع'},{id:'paid',label:'مدفوع'}] },
    { name: 'method', label: 'طريقة الدفع', type: 'select', options: PAYMENT_METHODS.map(m => ({id:m.id, label:m.label})) },
    { name: 'notes', label: 'ملاحظات', type: 'textarea' },
  ];
  const inputs = {};
  for (const f of fields) {
    const field = el('div', { class: 'form-field' });
    field.appendChild(el('label', { class: 'form-label', for: `f-${f.name}`, text: f.label }));
    let input;
    if (f.type === 'select') {
      input = el('select', { id: `f-${f.name}`, class: 'input' });
      for (const o of f.options) input.appendChild(el('option', { value: o.id, text: o.label }));
    } else if (f.type === 'textarea') {
      input = el('textarea', { id: `f-${f.name}`, class: 'input', rows: 2 });
    } else {
      input = el('input', { id: `f-${f.name}`, class: 'input', type: f.type, value: f.value || '' });
      if (f.step) input.setAttribute('step', f.step);
    }
    inputs[f.name] = input;
    field.appendChild(input);
    field.appendChild(el('div', { class: 'form-error', id: `err-${f.name}` }));
    form.appendChild(field);
  }

  const actions = el('div', { class: 'modal-card__actions' });
  actions.appendChild(button('إلغاء', { variant: 'ghost', onClick: () => close() }));
  actions.appendChild(button('تسجيل', { variant: 'primary', icon: 'check', onClick: save }));
  form.appendChild(actions);
  cardEl.appendChild(form);
  overlay.appendChild(cardEl);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-visible'));

  function close() { overlay.classList.remove('is-visible'); setTimeout(() => overlay.remove(), 200); }

  async function save() {
    document.querySelectorAll('.form-error').forEach(e => e.textContent = '');
    const buildingId = inputs.buildingId.value;
    const category = inputs.category.value;
    const description = inputs.description.value;
    const amount = parseEgp(inputs.amount.value);
    const date = parseDate(inputs.date.value);
    const status = inputs.status.value;
    const method = inputs.method.value;
    const notes = inputs.notes.value;
    if (!buildingId) return setErr('buildingId', 'المبنى مطلوب');
    if (!category) return setErr('category', 'التصنيف مطلوب');
    if (amount == null || amount <= 0) return setErr('amount', 'مبلغ غير صحيح');
    if (!date) return setErr('date', 'تاريخ غير صحيح');
    try {
      await recordExpense({ buildingId, category, description, amountPiastres: amount, date, status, method, notes });
      toast('تم تسجيل المصروف.', { type: 'success' });
      close(); await reload(); render();
      // Update stats by reloading page header stats — easiest: re-render
      const stats = computeStats();
      const grid = document.querySelector('.kpi-grid--compact');
      if (grid) {
        const tiles = grid.querySelectorAll('.stat-tile');
        if (tiles[0]) tiles[0].querySelector('.stat-tile__value').textContent = formatEgp(stats.total);
        if (tiles[1]) tiles[1].querySelector('.stat-tile__value').textContent = formatEgp(stats.paid);
        if (tiles[2]) tiles[2].querySelector('.stat-tile__value').textContent = formatEgp(stats.unpaid);
      }
    } catch (err) {
      toast('فشل التسجيل: ' + (err.message || err), { type: 'error' });
    }
  }
  function setErr(k, m) { const e = document.getElementById(`err-${k}`); if (e) e.textContent = m; }

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

async function markPaid(e) {
  await db.put(STORES.expenses, { ...e, status: 'paid' });
  await db.audit('expense.markPaid', 'expense', e.id, {});
  toast('تم تعليم المصروف كمدفوع.', { type: 'success' });
  await reload(); render();
}

async function reverse(e) {
  const ok = await confirmDialog({
    title: 'إلغاء المصروف', message: 'سيتم إلغاء المصروف مع الاحتفاظ بسجل التدقيق.',
    confirmLabel: 'إلغاء المصروف', cancelLabel: 'تراجع', danger: true,
  });
  if (!ok) return;
  const reason = await promptReason();
  if (!reason) return;
  try {
    await reverseExpense(e.id, reason);
    toast('تم الإلغاء.', { type: 'success' });
    await reload(); render();
  } catch (err) {
    toast('فشل الإلغاء: ' + (err.message || err), { type: 'error' });
  }
}

function promptReason() {
  return new Promise((resolve) => {
    const overlay = el('div', { class: 'modal-overlay' });
    overlay.appendChild(el('div', { class: 'modal-card', role: 'dialog', 'aria-modal': 'true' }, [
      el('h3', { class: 'modal-card__title', text: 'سبب الإلغاء' }),
      el('textarea', { id: 'reason', class: 'input', rows: 3, placeholder: 'سبب إلغاء المصروف…' }),
      el('div', { class: 'modal-card__actions' }, [
        button('إلغاء', { variant: 'ghost', onClick: () => { close(); resolve(null); } }),
        button('تأكيد', { variant: 'danger', onClick: () => {
          const v = document.getElementById('reason').value.trim();
          if (!v) { toast('سبب الإلغاء مطلوب.', { type: 'warn' }); return; }
          close(); resolve(v);
        } }),
      ]),
    ]));
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-visible'));
    function close() { overlay.classList.remove('is-visible'); setTimeout(() => overlay.remove(), 200); }
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { close(); resolve(null); } });
  });
}

export function unmount() { _listEl = null; _expenses = []; }
