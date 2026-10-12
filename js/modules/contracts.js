// contracts.js — Contracts CRUD + obligation generation.

import * as db from '../database.js';
import { STORES, CONTRACT_STATUSES } from '../config.js';
import { uid } from '../database.js';
import { validateContract, parseEgp, parseDate, formatEgp, formatDateShort } from '../validation.js';
import { el, icon, pageHeader, button, emptyState, searchInput, renderList } from '../ui.js';
import { toast, confirmDialog } from '../notifications.js';
import { generateObligationsForContract } from '../ledger.js';

let _listEl = null;
let _all = [];
let _apartments = [];
let _buildings = [];
let _residents = [];
let _filter = { q: '', status: '' };

export async function mount(container, ctx) {
  container.appendChild(pageHeader({
    title: 'العقود',
    subtitle: 'إدارة عقود الإيجار',
    actions: [button('عقد جديد', { variant: 'primary', icon: 'plus', onClick: () => showForm(null) })],
  }));

  [_all, _apartments, _buildings, _residents] = await Promise.all([
    db.getAll(STORES.contracts),
    db.getAll(STORES.apartments),
    db.getAll(STORES.buildings),
    db.getAll(STORES.residents),
  ]);
  _all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const toolbar = el('div', { class: 'toolbar' });
  toolbar.appendChild(searchInput('ابحث برمز العقد…', q => { _filter.q = q; render(); }));
  const statusSel = el('select', { class: 'input', 'aria-label': 'تصفية بالحالة' });
  statusSel.appendChild(el('option', { value: '', text: 'كل الحالات' }));
  for (const s of CONTRACT_STATUSES) statusSel.appendChild(el('option', { value: s.id, text: s.label }));
  statusSel.addEventListener('change', () => { _filter.status = statusSel.value; render(); });
  toolbar.appendChild(statusSel);
  container.appendChild(toolbar);

  _listEl = el('div', { class: 'card-list' });
  container.appendChild(_listEl);
  render();
}

function render() {
  if (!_listEl) return;
  const q = _filter.q.trim().toLowerCase();
  const aMap = new Map(_apartments.map(a => [a.id, a]));
  const bMap = new Map(_buildings.map(b => [b.id, b]));
  const tMap = new Map(_residents.map(r => [r.id, r]));
  const items = _all.filter(c => {
    if (_filter.status && c.status !== _filter.status) return false;
    if (!q) return true;
    return (c.code || '').toLowerCase().includes(q) || (c.notes || '').toLowerCase().includes(q);
  });
  renderList(_listEl, items, c => rowFactory(c, aMap, bMap, tMap), () => emptyState({
    icon: 'doc', title: 'لا توجد عقود',
    message: 'ابدأ بإنشاء أول عقد إيجار.',
    action: button('عقد جديد', { variant: 'primary', icon: 'plus', onClick: () => showForm(null) }),
  }));
}

function rowFactory(c, aMap, bMap, tMap) {
  const a = aMap.get(c.apartmentId);
  const b = a ? bMap.get(a.buildingId) : null;
  const t = tMap.get(c.tenantId);
  const status = CONTRACT_STATUSES.find(s => s.id === c.status)?.label || c.status;
  const today = Date.now();
  const isExpiringSoon = c.status === 'active' && c.endDate > today && (c.endDate - today) < 30 * 86400000;
  return el('div', { class: 'card-list__item' }, [
    el('div', { class: 'card-list__icon' }, [icon('doc', { size: 22 })]),
    el('div', { class: 'card-list__body' }, [
      el('div', { class: 'card-list__title', text: c.code ? `عقد ${c.code}` : 'عقد' }),
      el('div', { class: 'card-list__sub', text: `${b ? b.name : '—'} – وحدة ${a ? a.number : '—'}` }),
      el('div', { class: 'card-list__meta' }, [
        el('span', { class: 'chip ' + (c.status === 'active' ? 'chip--success' : c.status === 'expired' ? 'chip--warn' : 'chip--muted'), text: status }),
        t ? el('span', { class: 'chip', text: t.name }) : null,
        el('span', { class: 'chip', text: `${formatDateShort(c.startDate)} → ${formatDateShort(c.endDate)}` }),
        el('span', { class: 'chip chip--info', text: `إيجار ${formatEgp(c.rentValuePiastres)}/شهر` }),
        isExpiringSoon ? el('span', { class: 'chip chip--warn', text: 'يقرب الانتهاء' }) : null,
      ]),
    ]),
    el('div', { class: 'card-list__actions' }, [
      el('button', { class: 'icon-btn', 'aria-label': 'توليد التزامات', title: 'توليد التزامات', onClick: () => genObligations(c) }, [icon('plus', { size: 18 })]),
      el('button', { class: 'icon-btn', 'aria-label': 'تعديل', onClick: () => showForm(c) }, [icon('edit', { size: 18 })]),
      el('button', { class: 'icon-btn icon-btn--danger', 'aria-label': 'حذف', onClick: () => remove(c) }, [icon('trash', { size: 18 })]),
    ]),
  ]);
}

function showForm(contract) {
  const isEdit = !!contract;
  const overlay = el('div', { class: 'modal-overlay' });
  const cardEl = el('div', { class: 'modal-card modal-card--wide', role: 'dialog', 'aria-modal': 'true' });
  cardEl.appendChild(el('h3', { class: 'modal-card__title', text: isEdit ? 'تعديل عقد' : 'عقد جديد' }));
  const form = el('form', { class: 'form' });

  const rentalApartments = _apartments.filter(a => a.type === 'rental' || !a.type);
  const tenants = _residents.filter(r => r.type === 'tenant' || !r.type);

  const fields = [
    { name: 'code', label: 'رمز العقد', type: 'text', value: contract?.code || '' },
    { name: 'apartmentId', label: 'الوحدة', type: 'select', required: true, options: [{id:'',label:'—'}].concat(rentalApartments.map(a => {
      const b = _buildings.find(x => x.id === a.buildingId);
      return { id: a.id, label: `${b ? b.name : '—'} – وحدة ${a.number}` };
    })), value: contract?.apartmentId || '' },
    { name: 'tenantId', label: 'المستأجر', type: 'select', required: true, options: [{id:'',label:'—'}].concat(tenants.map(r => ({id:r.id,label:r.name}))), value: contract?.tenantId || '' },
    { name: 'startDate', label: 'تاريخ البداية', type: 'date', required: true, value: contract?.startDate ? new Date(contract.startDate).toISOString().slice(0,10) : '' },
    { name: 'endDate', label: 'تاريخ النهاية', type: 'date', required: true, value: contract?.endDate ? new Date(contract.endDate).toISOString().slice(0,10) : '' },
    { name: 'rentValue', label: 'الإيجار الشهري (ج.م)', type: 'number', step: '0.01', required: true, value: contract?.rentValuePiastres ? (contract.rentValuePiastres/100) : '' },
    { name: 'associationFee', label: 'اشتراك اتحاد الملاك (ج.م)', type: 'number', step: '0.01', value: contract?.associationFeePiastres ? (contract.associationFeePiastres/100) : '' },
    { name: 'status', label: 'الحالة', type: 'select', options: CONTRACT_STATUSES, value: contract?.status || 'active' },
    { name: 'notes', label: 'ملاحظات', type: 'textarea', value: contract?.notes || '' },
  ];
  const inputs = {};
  for (const f of fields) {
    const field = el('div', { class: 'form-field' });
    field.appendChild(el('label', { class: 'form-label', for: `f-${f.name}`, text: f.label + (f.required ? ' *' : '') }));
    let input;
    if (f.type === 'select') {
      input = el('select', { id: `f-${f.name}`, class: 'input' });
      for (const o of f.options) input.appendChild(el('option', { value: o.id, text: o.label }));
      input.value = f.value;
    } else if (f.type === 'textarea') {
      input = el('textarea', { id: `f-${f.name}`, class: 'input', rows: 2 });
      input.value = f.value;
    } else {
      input = el('input', { id: `f-${f.name}`, class: 'input', type: f.type });
      if (f.step) input.setAttribute('step', f.step);
      input.value = f.value;
    }
    inputs[f.name] = input;
    field.appendChild(input);
    field.appendChild(el('div', { class: 'form-error', id: `err-${f.name}` }));
    form.appendChild(field);
  }

  const actions = el('div', { class: 'modal-card__actions' });
  actions.appendChild(button('إلغاء', { variant: 'ghost', onClick: () => close() }));
  actions.appendChild(button('حفظ', { variant: 'primary', icon: 'check', onClick: save }));
  form.appendChild(actions);
  cardEl.appendChild(form);
  overlay.appendChild(cardEl);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-visible'));

  function close() { overlay.classList.remove('is-visible'); setTimeout(() => overlay.remove(), 200); }

  async function save() {
    const apartment = _apartments.find(a => a.id === inputs.apartmentId.value);
    const rec = {
      id: contract?.id || uid(),
      code: inputs.code.value.trim(),
      apartmentId: inputs.apartmentId.value,
      buildingId: apartment?.buildingId || null,
      tenantId: inputs.tenantId.value,
      startDate: parseDate(inputs.startDate.value),
      endDate: parseDate(inputs.endDate.value),
      rentValuePiastres: parseEgp(inputs.rentValue.value) || 0,
      associationFeePiastres: parseEgp(inputs.associationFee.value) || 0,
      status: inputs.status.value,
      notes: inputs.notes.value.trim(),
      createdAt: contract?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    const v = validateContract({
      ...rec,
      rentValue: inputs.rentValue.value,
      startDate: inputs.startDate.value,
      endDate: inputs.endDate.value,
    });
    document.querySelectorAll('.form-error').forEach(e => e.textContent = '');
    if (!v.ok) {
      for (const [k, msg] of Object.entries(v.errors)) {
        const e = document.getElementById(`err-${k}`); if (e) e.textContent = msg;
      }
      return;
    }
    try {
      await db.put(STORES.contracts, rec);
      await db.audit('contract.save', 'contract', rec.id, { code: rec.code, apartmentId: rec.apartmentId });
      toast('تم حفظ العقد.', { type: 'success' });
      close();
      _all = await db.getAll(STORES.contracts);
      _all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      render();
    } catch (err) {
      toast('فشل الحفظ: ' + (err.message || err), { type: 'error' });
    }
  }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

async function genObligations(c) {
  try {
    const created = await generateObligationsForContract(c, 12);
    toast(`تم توليد ${created.length} التزام جديد.`, { type: 'success' });
  } catch (err) {
    toast('فشل توليد الالتزامات: ' + (err.message || err), { type: 'error' });
  }
}

async function remove(c) {
  const ok = await confirmDialog({
    title: 'حذف العقد', message: `سيتم حذف العقد ${c.code || ''} والتزاماته. لا يمكن التراجع.`,
    confirmLabel: 'حذف', cancelLabel: 'إلغاء', danger: true,
  });
  if (!ok) return;
  const obligations = await db.getAll(STORES.obligations, 'contractId', c.id);
  await db.withTx([STORES.contracts, STORES.obligations, STORES.payments], 'readwrite', async (stores) => {
    stores[STORES.contracts].delete(c.id);
    for (const o of obligations) {
      stores[STORES.obligations].delete(o.id);
      // Note: payments are kept (audit trail) but they reference deleted obligations.
    }
  });
  await db.audit('contract.delete', 'contract', c.id, { code: c.code });
  toast('تم الحذف.', { type: 'success' });
  _all = await db.getAll(STORES.contracts);
  render();
}

export function unmount() { _listEl = null; _all = []; }
