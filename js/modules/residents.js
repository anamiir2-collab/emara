// residents.js — Residents CRUD with contact details & history.

import * as db from '../database.js';
import { STORES } from '../config.js';
import { uid } from '../database.js';
import { validateResident, sanitizePhone } from '../validation.js';
import { el, icon, pageHeader, button, emptyState, searchInput, renderList, formatDateShort } from '../ui.js';
import { toast, confirmDialog } from '../notifications.js';
import { openWhatsApp } from '../whatsapp.js';

let _listEl = null;
let _allResidents = [];
let _apartments = [];
let _contracts = [];
let _filter = { q: '', type: '' };

export async function mount(container, ctx) {
  container.appendChild(pageHeader({
    title: 'السكان',
    subtitle: 'المالكون والمستأجرون',
    actions: [button('ساكن جديد', { variant: 'primary', icon: 'plus', onClick: () => showForm(null) })],
  }));

  [_allResidents, _apartments, _contracts] = await Promise.all([
    db.getAll(STORES.residents),
    db.getAll(STORES.apartments),
    db.getAll(STORES.contracts),
  ]);
  _allResidents.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));

  const toolbar = el('div', { class: 'toolbar' });
  toolbar.appendChild(searchInput('ابحث بالاسم أو الهاتف…', q => { _filter.q = q; render(); }));
  const typeSelect = el('select', { class: 'input', 'aria-label': 'تصفية بالنوع' });
  typeSelect.appendChild(el('option', { value: '', text: 'الكل' }));
  typeSelect.appendChild(el('option', { value: 'owner', text: 'مالك' }));
  typeSelect.appendChild(el('option', { value: 'tenant', text: 'مستأجر' }));
  typeSelect.addEventListener('change', () => { _filter.type = typeSelect.value; render(); });
  toolbar.appendChild(typeSelect);
  container.appendChild(toolbar);

  _listEl = el('div', { class: 'card-list' });
  container.appendChild(_listEl);
  render();
}

function render() {
  if (!_listEl) return;
  const q = _filter.q.trim().toLowerCase();
  const items = _allResidents.filter(r => {
    if (_filter.type && r.type !== _filter.type) return false;
    if (!q) return true;
    return (r.name || '').toLowerCase().includes(q) ||
           (r.phone || '').toLowerCase().includes(q) ||
           (r.nationalId || '').toLowerCase().includes(q);
  });
  renderList(_listEl, items, rowFactory, () => emptyState({
    icon: 'users', title: 'لا يوجد سكان',
    message: 'ابدأ بإضافة ساكن جديد.',
    action: button('إضافة ساكن', { variant: 'primary', icon: 'plus', onClick: () => showForm(null) }),
  }));
}

function rowFactory(r) {
  const typeLabel = r.type === 'owner' ? 'مالك' : r.type === 'tenant' ? 'مستأجر' : '—';
  const ownedApts = _apartments.filter(a => a.ownerId === r.id);
  const rentedApts = _apartments.filter(a => a.tenantId === r.id);
  const activeContracts = _contracts.filter(c => c.tenantId === r.id && c.status === 'active');

  const row = el('div', { class: 'card-list__item' }, [
    el('div', { class: 'card-list__icon' }, [icon('user', { size: 22 })]),
    el('div', { class: 'card-list__body' }, [
      el('div', { class: 'card-list__title', text: r.name }),
      el('div', { class: 'card-list__sub', text: r.phone || '—' }),
      el('div', { class: 'card-list__meta' }, [
        el('span', { class: 'chip', text: typeLabel }),
        ownedApts.length ? el('span', { class: 'chip chip--success', text: `${ownedApts.length} ملكية` }) : null,
        rentedApts.length ? el('span', { class: 'chip chip--info', text: `${rentedApts.length} إيجار` }) : null,
        activeContracts.length ? el('span', { class: 'chip', text: `${activeContracts.length} عقد ساري` }) : null,
      ]),
    ]),
    el('div', { class: 'card-list__actions' }, [
      r.phone ? el('button', { class: 'icon-btn', 'aria-label': 'واتساب', title: 'واتساب', onClick: () => openWhatsApp(r.phone, `السلام عليكم ${r.name}`) }, [icon('whatsapp', { size: 18 })]) : null,
      el('button', { class: 'icon-btn', 'aria-label': 'تعديل', onClick: () => showForm(r) }, [icon('edit', { size: 18 })]),
      el('button', { class: 'icon-btn icon-btn--danger', 'aria-label': 'حذف', onClick: () => remove(r) }, [icon('trash', { size: 18 })]),
    ]),
  ]);
  return row;
}

function showForm(resident) {
  const isEdit = !!resident;
  const overlay = el('div', { class: 'modal-overlay' });
  const cardEl = el('div', { class: 'modal-card', role: 'dialog', 'aria-modal': 'true' });
  cardEl.appendChild(el('h3', { class: 'modal-card__title', text: isEdit ? 'تعديل ساكن' : 'ساكن جديد' }));
  const form = el('form', { class: 'form' });

  const fields = [
    { name: 'name', label: 'الاسم', type: 'text', required: true, value: resident?.name || '' },
    { name: 'type', label: 'النوع', type: 'select', options: [{id:'',label:'—'},{id:'owner',label:'مالك'},{id:'tenant',label:'مستأجر'}], value: resident?.type || '' },
    { name: 'phone', label: 'الهاتف', type: 'tel', value: resident?.phone || '' },
    { name: 'email', label: 'البريد الإلكتروني', type: 'email', value: resident?.email || '' },
    { name: 'nationalId', label: 'الرقم القومي', type: 'text', value: resident?.nationalId || '' },
    { name: 'notes', label: 'ملاحظات', type: 'textarea', value: resident?.notes || '' },
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
      input = el('input', { id: `f-${f.name}`, class: 'input', type: f.type, value: f.value });
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
    const rec = {
      id: resident?.id || uid(),
      name: inputs.name.value.trim(),
      type: inputs.type.value,
      phone: sanitizePhone(inputs.phone.value),
      email: inputs.email.value.trim(),
      nationalId: inputs.nationalId.value.trim(),
      notes: inputs.notes.value.trim(),
      createdAt: resident?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    const v = validateResident(rec);
    document.querySelectorAll('.form-error').forEach(e => e.textContent = '');
    if (!v.ok) {
      for (const [k, msg] of Object.entries(v.errors)) {
        const e = document.getElementById(`err-${k}`); if (e) e.textContent = msg;
      }
      return;
    }
    try {
      await db.put(STORES.residents, rec);
      await db.audit('resident.save', 'resident', rec.id, { name: rec.name });
      toast('تم حفظ الساكن.', { type: 'success' });
      close();
      _allResidents = await db.getAll(STORES.residents);
      _allResidents.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
      render();
    } catch (err) {
      toast('فشل الحفظ: ' + (err.message || err), { type: 'error' });
    }
  }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

async function remove(r) {
  const ok = await confirmDialog({
    title: 'حذف الساكن', message: `سيتم حذف "${r.name}". قد تظل الوحدات تشير إليه حتى تُحدّث.`,
    confirmLabel: 'حذف', cancelLabel: 'إلغاء', danger: true,
  });
  if (!ok) return;
  await db.remove(STORES.residents, r.id);
  await db.audit('resident.delete', 'resident', r.id, { name: r.name });
  toast('تم الحذف.', { type: 'success' });
  _allResidents = await db.getAll(STORES.residents);
  render();
}

export function unmount() { _listEl = null; _allResidents = []; _apartments = []; _contracts = []; }
