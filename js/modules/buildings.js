// buildings.js — Buildings CRUD with search, filter, archive.

import * as db from '../database.js';
import { STORES } from '../config.js';
import { uid } from '../database.js';
import { validateBuilding } from '../validation.js';
import { el, icon, pageHeader, button, card, emptyState, searchInput, renderList, formatDateShort } from '../ui.js';
import * as router from '../router.js';
import { toast, confirmDialog } from '../notifications.js';

let _listEl = null;
let _allBuildings = [];
let _filter = { q: '', archived: false };

export async function mount(container, ctx) {
  container.appendChild(pageHeader({
    title: 'المباني',
    subtitle: 'إدارة محفظة المباني',
    actions: [button('مبنى جديد', { variant: 'primary', icon: 'plus', onClick: () => showForm(null) })],
  }));

  const toolbar = el('div', { class: 'toolbar' });
  const search = searchInput('ابحث باسم المبنى أو العنوان…', q => { _filter.q = q; render(); });
  toolbar.appendChild(search);

  const filterBtns = el('div', { class: 'segmented' });
  for (const opt of [{id:false,label:'نشطة'},{id:true,label:'مؤرشفة'}]) {
    const b = el('button', {
      class: 'segmented__btn' + (_filter.archived === opt.id ? ' is-active' : ''),
      text: opt.label, onClick: () => {
        _filter.archived = opt.id;
        filterBtns.querySelectorAll('.segmented__btn').forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active');
        render();
      }
    });
    filterBtns.appendChild(b);
  }
  toolbar.appendChild(filterBtns);
  container.appendChild(toolbar);

  _listEl = el('div', { class: 'card-list' });
  container.appendChild(_listEl);

  await load();
  render();
}

async function load() {
  _allBuildings = await db.getAll(STORES.buildings);
  _allBuildings.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function render() {
  if (!_listEl) return;
  const q = _filter.q.trim().toLowerCase();
  const items = _allBuildings.filter(b => {
    if (b.archived !== _filter.archived) return false;
    if (!q) return true;
    return (b.name || '').toLowerCase().includes(q) ||
           (b.address || '').toLowerCase().includes(q);
  });
  renderList(_listEl, items, rowFactory, () => emptyState({
    icon: 'building',
    title: _filter.archived ? 'لا توجد مبانٍ مؤرشفة' : 'لا توجد مبانٍ',
    message: 'ابدأ بإضافة أول مبنى.',
    action: button('إضافة مبنى', { variant: 'primary', icon: 'plus', onClick: () => showForm(null) }),
  }));
}

function rowFactory(b) {
  const row = el('div', { class: 'card-list__item' }, [
    el('div', { class: 'card-list__icon' }, [icon('building', { size: 22 })]),
    el('div', { class: 'card-list__body' }, [
      el('div', { class: 'card-list__title', text: b.name }),
      el('div', { class: 'card-list__sub', text: b.address || '—' }),
      el('div', { class: 'card-list__meta' }, [
        el('span', { class: 'chip', text: `${b.floors || 0} أدوار` }),
        el('span', { class: 'chip', text: `${b.apartmentCount || 0} وحدة` }),
        b.archived ? el('span', { class: 'chip chip--warn', text: 'مؤرشف' }) : null,
      ]),
    ]),
    el('div', { class: 'card-list__actions' }, [
      el('button', { class: 'icon-btn', 'aria-label': 'تعديل', onClick: () => showForm(b) }, [icon('edit', { size: 18 })]),
      el('button', { class: 'icon-btn', 'aria-label': 'أرشفة', onClick: () => toggleArchive(b) }, [icon('archive', { size: 18 })]),
      el('button', { class: 'icon-btn icon-btn--danger', 'aria-label': 'حذف', onClick: () => remove(b) }, [icon('trash', { size: 18 })]),
    ]),
  ]);
  row.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    router.navigate(`/apartments`, ); // could route to apartments filtered by building
  });
  return row;
}

function showForm(building) {
  const isEdit = !!building;
  const overlay = el('div', { class: 'modal-overlay' });
  const cardEl = el('div', { class: 'modal-card', role: 'dialog', 'aria-modal': 'true' });
  cardEl.appendChild(el('h3', { class: 'modal-card__title', text: isEdit ? 'تعديل مبنى' : 'مبنى جديد' }));

  const form = el('form', { class: 'form' });
  const fields = [
    { name: 'name', label: 'اسم المبنى', type: 'text', required: true, value: building?.name || '' },
    { name: 'address', label: 'العنوان', type: 'text', value: building?.address || '' },
    { name: 'floors', label: 'عدد الأدوار', type: 'number', min: 0, value: building?.floors ?? '' },
    { name: 'apartmentCount', label: 'عدد الوحدات', type: 'number', min: 0, value: building?.apartmentCount ?? '' },
    { name: 'notes', label: 'ملاحظات', type: 'textarea', value: building?.notes || '' },
  ];
  const inputs = {};
  for (const f of fields) {
    const field = el('div', { class: 'form-field' });
    field.appendChild(el('label', { class: 'form-label', for: `f-${f.name}`, text: f.label + (f.required ? ' *' : '') }));
    const input = f.type === 'textarea'
      ? el('textarea', { id: `f-${f.name}`, class: 'input', rows: 3, name: f.name })
      : el('input', { id: `f-${f.name}`, class: 'input', type: f.type, name: f.name, value: f.value ?? '' });
    if (f.min != null) input.setAttribute('min', f.min);
    inputs[f.name] = input;
    field.appendChild(input);
    const err = el('div', { class: 'form-error', id: `err-${f.name}` });
    field.appendChild(err);
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

  function close() {
    overlay.classList.remove('is-visible');
    setTimeout(() => overlay.remove(), 200);
  }

  async function save() {
    const rec = {
      id: building?.id || uid(),
      name: inputs.name.value.trim(),
      address: inputs.address.value.trim(),
      floors: inputs.floors.value ? parseInt(inputs.floors.value, 10) : null,
      apartmentCount: inputs.apartmentCount.value ? parseInt(inputs.apartmentCount.value, 10) : null,
      notes: inputs.notes.value.trim(),
      archived: building?.archived || false,
      createdAt: building?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    const v = validateBuilding(rec);
    document.querySelectorAll('.form-error').forEach(e => e.textContent = '');
    if (!v.ok) {
      for (const [k, msg] of Object.entries(v.errors)) {
        const e = document.getElementById(`err-${k}`);
        if (e) e.textContent = msg;
      }
      return;
    }
    try {
      await db.put(STORES.buildings, rec);
      await db.audit('building.save', 'building', rec.id, { name: rec.name });
      toast('تم حفظ المبنى.', { type: 'success' });
      close();
      await load();
      render();
    } catch (err) {
      toast('فشل الحفظ: ' + (err.message || err), { type: 'error' });
    }
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

async function toggleArchive(b) {
  const updated = { ...b, archived: !b.archived, updatedAt: Date.now() };
  await db.put(STORES.buildings, updated);
  await db.audit(b.archived ? 'building.unarchive' : 'building.archive', 'building', b.id, {});
  toast(updated.archived ? 'تمت الأرشفة.' : 'تمت الاستعادة.', { type: 'success' });
  await load();
  render();
}

async function remove(b) {
  const ok = await confirmDialog({
    title: 'حذف المبنى',
    message: `سيتم حذف "${b.name}" نهائيًا. لا يمكن التراجع. تأكد من وجود نسخة احتياطية.`,
    confirmLabel: 'حذف',
    cancelLabel: 'إلغاء',
    danger: true,
  });
  if (!ok) return;
  // Cascade: delete apartments & obligations for this building
  const aparts = await db.getAll(STORES.apartments, 'buildingId', b.id);
  await db.remove(STORES.buildings, b.id);
  for (const a of aparts) await db.remove(STORES.apartments, a.id);
  await db.audit('building.delete', 'building', b.id, { name: b.name });
  toast('تم حذف المبنى والوحدات المرتبطة به.', { type: 'success' });
  await load();
  render();
}

export function unmount() {
  _listEl = null;
  _allBuildings = [];
}
