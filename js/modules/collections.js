// collections.js — Record payments (full / partial / split across obligations).

import * as db from '../database.js';
import { STORES, PAYMENT_METHODS } from '../config.js';
import { parseEgp, parseDate, formatEgp, formatDateShort } from '../validation.js';
import { el, icon, pageHeader, button, emptyState, searchInput, renderList } from '../ui.js';
import { toast, confirmDialog } from '../notifications.js';
import { recordPayment, reversePayment } from '../ledger.js';
import * as calc from '../calculations.js';
import { openWhatsApp, paymentMessage } from '../whatsapp.js';

let _listEl = null;
let _payments = [];
let _obligations = [];
let _contracts = [];
let _apartments = [];
let _buildings = [];
let _residents = [];
let _filter = { q: '', reversed: 'hide' };

export async function mount(container, ctx) {
  container.appendChild(pageHeader({
    title: 'التحصيلات',
    subtitle: 'تسجيل الدفعات وربطها بالالتزامات',
    actions: [button('تحصيل جديد', { variant: 'primary', icon: 'plus', onClick: () => showForm() })],
  }));

  await reload();
  const toolbar = el('div', { class: 'toolbar' });
  toolbar.appendChild(searchInput('ابحث برقم الإيصال أو الفترة…', q => { _filter.q = q; render(); }));
  const revSel = el('select', { class: 'input', 'aria-label': 'تصفية الملغاة' });
  for (const o of [{id:'hide',label:'إخفاء الملغاة'},{id:'show',label:'إظهار الكل'},{id:'only',label:'الملغاة فقط'}]) {
    revSel.appendChild(el('option', { value: o.id, text: o.label }));
  }
  revSel.addEventListener('change', () => { _filter.reversed = revSel.value; render(); });
  toolbar.appendChild(revSel);
  container.appendChild(toolbar);

  _listEl = el('div', { class: 'card-list' });
  container.appendChild(_listEl);
  render();
}

async function reload() {
  [_payments, _obligations, _contracts, _apartments, _buildings, _residents] = await Promise.all([
    db.getAll(STORES.payments),
    db.getAll(STORES.obligations),
    db.getAll(STORES.contracts),
    db.getAll(STORES.apartments),
    db.getAll(STORES.buildings),
    db.getAll(STORES.residents),
  ]);
  _payments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function render() {
  if (!_listEl) return;
  const oMap = new Map(_obligations.map(o => [o.id, o]));
  const cMap = new Map(_contracts.map(c => [c.id, c]));
  const aMap = new Map(_apartments.map(a => [a.id, a]));
  const bMap = new Map(_buildings.map(b => [b.id, b]));
  const tMap = new Map(_residents.map(r => [r.id, r]));
  const q = _filter.q.trim().toLowerCase();
  const items = _payments.filter(p => {
    if (_filter.reversed === 'hide' && p.reversed) return false;
    if (_filter.reversed === 'only' && !p.reversed) return false;
    if (!q) return true;
    const o = oMap.get(p.obligationId);
    return (p.receiptId || '').toLowerCase().includes(q) ||
           (o?.period || '').toLowerCase().includes(q) ||
           (o?.notes || '').toLowerCase().includes(q);
  });
  renderList(_listEl, items, p => rowFactory(p, oMap, cMap, aMap, bMap, tMap), () => emptyState({
    icon: 'wallet', title: 'لا توجد تحصيلات',
    message: 'سجّل أول دفعة لبدء تتبع التحصيل.',
    action: button('تحصيل جديد', { variant: 'primary', icon: 'plus', onClick: () => showForm() }),
  }));
}

function rowFactory(p, oMap, cMap, aMap, bMap, tMap) {
  const o = oMap.get(p.obligationId);
  const c = o ? cMap.get(o.contractId) : null;
  const a = o ? aMap.get(o.apartmentId) : (c ? aMap.get(c.apartmentId) : null);
  const b = a ? bMap.get(a.buildingId) : null;
  const t = o ? tMap.get(o.tenantId) : (c ? tMap.get(c.tenantId) : null);
  const methodLabel = PAYMENT_METHODS.find(m => m.id === p.method)?.label || p.method;
  return el('div', { class: 'card-list__item' + (p.reversed ? ' is-reversed' : '') }, [
    el('div', { class: 'card-list__icon' }, [icon('wallet', { size: 22 })]),
    el('div', { class: 'card-list__body' }, [
      el('div', { class: 'card-list__title', text: `${formatEgp(p.amountPiastres)} — ${o ? o.notes : 'دفعة'}` }),
      el('div', { class: 'card-list__sub', text: `${b ? b.name : '—'} – وحدة ${a ? a.number : '—'}` }),
      el('div', { class: 'card-list__meta' }, [
        el('span', { class: 'chip', text: methodLabel }),
        el('span', { class: 'chip', text: formatDateShort(p.date) }),
        t ? el('span', { class: 'chip', text: t.name }) : null,
        p.reversed ? el('span', { class: 'chip chip--danger', text: 'ملغاة' }) : null,
      ]),
    ]),
    el('div', { class: 'card-list__actions' }, [
      t?.phone ? el('button', { class: 'icon-btn', 'aria-label': 'إرسال إيصال عبر واتساب', title: 'واتساب', onClick: () => {
        openWhatsApp(t.phone, paymentMessage({
          residentName: t.name, buildingName: b?.name, apartmentNumber: a?.number,
          period: o?.period, amountPiastres: p.amountPiastres, receiptNumber: p.receiptId || '', date: p.date,
        }));
      } }, [icon('whatsapp', { size: 18 })]) : null,
      !p.reversed ? el('button', { class: 'icon-btn icon-btn--danger', 'aria-label': 'إلغاء الدفعة', title: 'إلغاء', onClick: () => reverse(p) }, [icon('undo', { size: 18 })]) : null,
    ]),
  ]);
}

function showForm() {
  const overlay = el('div', { class: 'modal-overlay' });
  const cardEl = el('div', { class: 'modal-card modal-card--wide', role: 'dialog', 'aria-modal': 'true' });
  cardEl.appendChild(el('h3', { class: 'modal-card__title', text: 'تحصيل دفعة' }));
  const form = el('form', { class: 'form' });

  // Build obligation options (only those with outstanding > 0)
  const outstanding = calc.perObligationOutstanding(_obligations, _payments);
  const aMap = new Map(_apartments.map(a => [a.id, a]));
  const bMap = new Map(_buildings.map(b => [b.id, b]));
  const tMap = new Map(_residents.map(r => [r.id, r]));
  const openObls = _obligations
    .filter(o => (outstanding.get(o.id) || 0) > 0)
    .sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));

  const obligationsList = el('div', { class: 'obligation-list' });
  const selectedAllocations = new Map(); // obligationId -> amountPiastres

  function rebuildObligationList() {
    while (obligationsList.firstChild) obligationsList.removeChild(obligationsList.firstChild);
    if (openObls.length === 0) {
      obligationsList.appendChild(el('p', { class: 'muted', text: 'لا توجد التزامات مستحقة. ولّد التزامات من صفحة العقود أولًا.' }));
      return;
    }
    for (const o of openObls) {
      const a = aMap.get(o.apartmentId);
      const b = a ? bMap.get(a.buildingId) : null;
      const t = tMap.get(o.tenantId);
      const out = outstanding.get(o.id) || 0;
      const row = el('label', { class: 'obligation-row' });
      const cb = el('input', { type: 'checkbox' });
      const amountInput = el('input', { type: 'number', class: 'input input--small', step: '0.01', min: '0', value: (out/100).toFixed(2) });
      amountInput.disabled = true;
      cb.addEventListener('change', () => {
        amountInput.disabled = !cb.checked;
        if (cb.checked) {
          selectedAllocations.set(o.id, parseEgp(amountInput.value) || 0);
        } else {
          selectedAllocations.delete(o.id);
        }
        updateTotal();
      });
      amountInput.addEventListener('input', () => {
        if (cb.checked) selectedAllocations.set(o.id, parseEgp(amountInput.value) || 0);
        updateTotal();
      });
      row.appendChild(cb);
      row.appendChild(el('div', { class: 'obligation-row__body' }, [
        el('div', { class: 'obligation-row__title', text: `${o.notes || o.period} — ${b ? b.name : ''} / ${a ? a.number : ''}` }),
        el('div', { class: 'obligation-row__sub', text: `متبقي ${formatEgp(out)}${t ? ' — ' + t.name : ''}` }),
      ]));
      row.appendChild(amountInput);
      obligationsList.appendChild(row);
    }
  }

  const field1 = el('div', { class: 'form-field' }, [
    el('label', { class: 'form-label', text: 'الالتزامات' }),
    obligationsList,
  ]);
  form.appendChild(field1);
  rebuildObligationList();

  // Other fields
  const dateField = el('div', { class: 'form-field' }, [
    el('label', { class: 'form-label', for: 'f-date', text: 'تاريخ الدفع *' }),
  ]);
  const dateInput = el('input', { id: 'f-date', class: 'input', type: 'date', value: new Date().toISOString().slice(0,10) });
  dateField.appendChild(dateInput);
  form.appendChild(dateField);

  const methodField = el('div', { class: 'form-field' }, [
    el('label', { class: 'form-label', for: 'f-method', text: 'طريقة الدفع *' }),
  ]);
  const methodSel = el('select', { id: 'f-method', class: 'input' });
  for (const m of PAYMENT_METHODS) methodSel.appendChild(el('option', { value: m.id, text: m.label }));
  methodField.appendChild(methodSel);
  form.appendChild(methodField);

  const notesField = el('div', { class: 'form-field' }, [
    el('label', { class: 'form-label', for: 'f-notes', text: 'ملاحظات' }),
    el('textarea', { id: 'f-notes', class: 'input', rows: 2 }),
  ]);
  form.appendChild(notesField);

  const totalWrap = el('div', { class: 'form-field total-display' }, [
    el('span', { class: 'form-label', text: 'الإجمالي' }),
    el('span', { class: 'total-display__value', id: 'total-value', text: formatEgp(0) }),
  ]);
  form.appendChild(totalWrap);

  function updateTotal() {
    const total = Array.from(selectedAllocations.values()).reduce((s, a) => s + a, 0);
    document.getElementById('total-value').textContent = formatEgp(total);
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
    if (selectedAllocations.size === 0) {
      toast('اختر التزامًا واحدًا على الأقل.', { type: 'warn' });
      return;
    }
    const allocations = Array.from(selectedAllocations.entries()).map(([obligationId, amountPiastres]) => ({ obligationId, amountPiastres }));
    if (allocations.some(a => !a.amountPiastres || a.amountPiastres <= 0)) {
      toast('جميع المبالغ يجب أن تكون أكبر من صفر.', { type: 'warn' });
      return;
    }
    const date = parseDate(dateInput.value);
    if (!date) { toast('تاريخ غير صالح.', { type: 'warn' }); return; }
    const notes = document.getElementById('f-notes').value.trim();
    try {
      const { receipt } = await recordPayment({
        allocations, date, method: methodSel.value, notes,
      });
      toast(`تم تسجيل الدفعة. رقم الإيصال: ${receipt.number}`, { type: 'success', duration: 6000 });
      close();
      await reload();
      render();
    } catch (err) {
      toast('فشل التسجيل: ' + (err.message || err), { type: 'error' });
    }
  }

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

async function reverse(p) {
  const ok = await confirmDialog({
    title: 'إلغاء الدفعة',
    message: 'سيتم إلغاء الدفعة مع الاحتفاظ بسجل التدقيق. لا يمكن التراجع.',
    confirmLabel: 'إلغاء الدفعة', cancelLabel: 'تراجع', danger: true,
  });
  if (!ok) return;
  const reason = await promptReason();
  if (!reason) return;
  try {
    await reversePayment(p.id, reason);
    toast('تم إلغاء الدفعة.', { type: 'success' });
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
      el('textarea', { id: 'reason', class: 'input', rows: 3, placeholder: 'مثال: دفعة مكررة، خطأ في المبلغ…' }),
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

export function unmount() { _listEl = null; _payments = []; }
