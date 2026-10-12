// apartments.js — Apartments CRUD with building filter & occupancy.

import * as db from '../database.js';
import { STORES, APARTMENT_TYPES } from '../config.js';
import { uid } from '../database.js';
import { validateApartment } from '../validation.js';
import { el, icon, pageHeader, button, emptyState, searchInput, renderList } from '../ui.js';
import { toast, confirmDialog } from '../notifications.js';

let _listEl = null;
let _allApartments = [];
let _buildings = [];
let _residents = [];
let _filter = { q: '', buildingId: '', type: '' };

export async function mount(container, ctx) {
  container.appendChild(pageHeader({
    title: 'الوحدات',
    subtitle: 'إدارة الشقق والوحدات',
    actions: [button('وحدة جديدة', { variant: 'primary', icon: 'plus', onClick: () => showForm(null) })],
  }));

  [_allApartments, _buildings, _residents] = await Promise.all([
    db.getAll(STORES.apartments),
    db.getAll(STORES.buildings),
    db.getAll(STORES.residents),
  ]);
  // Filter out archived buildings' apartments? Keep but mark.
  _allApartments.sort((a, b) => (a.number || '').localeCompare(b.number || ''));

  const toolbar = el('div', { class: 'toolbar' });
  toolbar.appendChild(searchInput('ابحث برقم الوحدة…', q => { _filter.q = q; render(); }));

  const buildingSelect = el('select', { class: 'input', 'aria-label': 'تصفية بالمبنى' });
  buildingSelect.appendChild(el('option', { value: '', text: 'كل المباني' }));
  for (const b of _buildings.filter(b => !b.archived)) {
    buildingSelect.appendChild(el('option', { value: b.id, text: b.name }));
  }
  buildingSelect.addEventListener('change', () => { _filter.buildingId = buildingSelect.value; render(); });
  toolbar.appendChild(buildingSelect);

  const typeSelect = el('select', { class: 'input', 'aria-label': 'تصفية بالنوع' });
  typeSelect.appendChild(el('option', { value: '', text: 'كل الأنواع' }));
  for (const t of APARTMENT_TYPES) typeSelect.appendChild(el('option', { value: t.id, text: t.label }));
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
  const buildingMap = new Map(_buildings.map(b => [b.id, b]));
  const items = _allApartments.filter(a => {
    if (_filter.buildingId && a.buildingId !== _filter.buildingId) return false;
    if (_filter.type && a.type !== _filter.type) return false;
    if (!q) return true;
    return (a.number || '').toLowerCase().includes(q) || (a.notes || '').toLowerCase().includes(q);
  });
  renderList(_listEl, items, it => rowFactory(it, buildingMap), () => emptyState({
    icon: 'door', title: 'لا توجد وحدات',
    message: 'ابدأ بإضافة وحدة جديدة.',
    action: button('إضافة وحدة', { variant: 'primary', icon: 'plus', onClick: () => showForm(null) }),
  }));
}

function rowFactory(a, buildingMap) {
  const b = buildingMap.get(a.buildingId);
  const owner = a.ownerId ? _residents.find(r => r.id === a.ownerId) : null;
  const tenant = a.tenantId ? _residents.find(r => r.id === a.tenantId) : null;
  const typeLabel = APARTMENT_TYPES.find(t => t.id === a.type)?.label || a.type;
  return el('div', { class: 'card-list__item' }, [
    el('div', { class: 'card-list__icon' }, [icon('door', { size: 22 })]),
    el('div', { class: 'card-list__body' }, [
      el('div', { class: 'card-list__title', text: `وحدة ${a.number}` }),
      el('div', { class: 'card-list__sub', text: b ? b.name : '—' }),
      el('div', { class: 'card-list__meta' }, [
        el('span', { class: 'chip', text: typeLabel }),
        el('span', { class: 'chip', text: `الدور ${a.floor || '—'}` }),
        el('span', { class: 'chip ' + (a.occupied ? 'chip--success' : 'chip--muted'), text: a.occupied ? 'مشغولة' : 'شاغرة' }),
        owner ? el('span', { class: 'chip', text: `مالك: ${owner.name}` }) : null,
        tenant ? el('span', { class: 'chip', text: `مستأجر: ${tenant.name}` }) : null,
      ]),
    ]),
    el('div', { class: 'card-list__actions' }, [
      el('button', { class: 'icon-btn', 'aria-label': 'تعديل', onClick: () => showForm(a) }, [icon('edit', { size: 18 })]),
      el('button', { class: 'icon-btn icon-btn--danger', 'aria-label': 'حذف', onClick: () => remove(a) }, [icon('trash', { size: 18 })]),
    ]),
  ]);
}

function showForm(apartment) {
  const isEdit = !!apartment;
  const overlay = el('div', { class: 'modal-overlay' });
  const cardEl = el('div', { class: 'modal-card', role: 'dialog', 'aria-modal': 'true' });
  cardEl.appendChild(el('h3', { class: 'modal-card__title', text: isEdit ? 'تعديل وحدة' : 'وحدة جديدة' }));
  const form = el('form', { class: 'form' });

  const fields = [
    { name: 'buildingId', label: 'المبنى', type: 'select', options: _buildings.filter(b => !b.archived), value: apartment?.buildingId || '' },
    { name: 'number', label: 'رقم الوحدة', type: 'text', required: true, value: apartment?.number || '' },
    { name: 'floor', label: 'الدور', type: 'number', value: apartment?.floor ?? '' },
    { name: 'type', label: 'النوع', type: 'select', options: APARTMENT_TYPES, value: apartment?.type || 'ownership' },
    { name: 'ownerId', label: 'المالك', type: 'select', options: [{id:'',label:'—'}].concat(_residents.filter(r => r.type === 'owner' || !r.type).map(r => ({id:r.id, label:r.name}))), value: apartment?.ownerId || '' },
    { name: 'tenantId', label: 'المستأجر', type: 'select', options: [{id:'',label:'—'}].concat(_residents.filter(r => r.type === 'tenant' || !r.type).map(r => ({id:r.id, label:r.name}))), value: apartment?.tenantId || '' },
    { name: 'occupied', label: 'مشغولة', type: 'checkbox', value: apartment?.occupied || false },
    { name: 'notes', label: 'ملاحظات', type: 'textarea', value: apartment?.notes || '' },
  ];
  const inputs = {};
  for (const f of fields) {
    const field = el('div', { class: 'form-field' + (f.type === 'checkbox' ? ' form-field--inline' : '') });
    if (f.type === 'checkbox') {
      const cb = el('input', { type: 'checkbox', id: `f-${f.name}`, name: f.name });
      if (f.value) cb.checked = true;
      inputs[f.name] = cb;
      field.appendChild(cb);
      field.appendChild(el('label', { class: 'form-label', for: `f-${f.name}`, text: f.label }));
    } else {
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
    }
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
      id: apartment?.id || uid(),
      buildingId: inputs.buildingId.value,
      number: inputs.number.value.trim(),
      floor: inputs.floor.value ? parseInt(inputs.floor.value, 10) : null,
      type: inputs.type.value,
      ownerId: inputs.ownerId.value || null,
      tenantId: inputs.tenantId.value || null,
      occupied: inputs.occupied.checked,
      notes: inputs.notes.value.trim(),
      createdAt: apartment?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    const v = validateApartment(rec);
    document.querySelectorAll('.form-error').forEach(e => e.textContent = '');
    if (!v.ok) {
      for (const [k, msg] of Object.entries(v.errors)) {
        const e = document.getElementById(`err-${k}`); if (e) e.textContent = msg;
      }
      return;
    }
    try {
      await db.put(STORES.apartments, rec);
      await db.audit('apartment.save', 'apartment', rec.id, { number: rec.number, buildingId: rec.buildingId });
      toast('تم حفظ الوحدة.', { type: 'success' });
      close();
      _allApartments = await db.getAll(STORES.apartments);
      _allApartments.sort((a, b) => (a.number || '').localeCompare(b.number || ''));
      render();
    } catch (err) {
      toast('فشل الحفظ: ' + (err.message || err), { type: 'error' });
    }
  }

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

async function remove(a) {
  const ok = await confirmDialog({
    title: 'حذف الوحدة', message: `سيتم حذف الوحدة ${a.number} نهائيًا. لا يمكن التراجع.`,
    confirmLabel: 'حذف', cancelLabel: 'إلغاء', danger: true,
  });
  if (!ok) return;
  await db.remove(STORES.apartments, a.id);
  await db.audit('apartment.delete', 'apartment', a.id, { number: a.number });
  toast('تم حذف الوحدة.', { type: 'success' });
  _allApartments = await db.getAll(STORES.apartments);
  render();
}

export function unmount() { _listEl = null; _allApartments = []; _buildings = []; _residents = []; }
