// maintenance.js — Maintenance requests with priority, technician, status, costs.

import * as db from '../database.js';
import { STORES, MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES } from '../config.js';
import { uid } from '../database.js';
import { validateMaintenance, parseEgp, formatEgp, formatDateShort } from '../validation.js';
import { el, icon, pageHeader, button, emptyState, searchInput, renderList, statTile } from '../ui.js';
import { toast, confirmDialog } from '../notifications.js';
import { openWhatsApp, maintenanceMessage } from '../whatsapp.js';

let _listEl = null;
let _all = [];
let _buildings = [];
let _apartments = [];
let _residents = [];
let _filter = { q: '', status: '', priority: '' };

export async function mount(container, ctx) {
  container.appendChild(pageHeader({
    title: 'الصيانة',
    subtitle: 'طلبات الصيانة ومتابعتها',
    actions: [button('طلب جديد', { variant: 'primary', icon: 'plus', onClick: () => showForm(null) })],
  }));

  await reload();
  const stats = computeStats();
  const grid = el('div', { class: 'kpi-grid kpi-grid--compact' }, [
    statTile({ label: 'مفتوحة', value: String(stats.open), variant: 'warn' }),
    statTile({ label: 'قيد التنفيذ', value: String(stats.inProgress) }),
    statTile({ label: 'مكتملة', value: String(stats.done), variant: 'success' }),
    statTile({ label: 'إجمالي التكلفة', value: formatEgp(stats.totalCost) }),
  ]);
  container.appendChild(grid);

  const toolbar = el('div', { class: 'toolbar' });
  toolbar.appendChild(searchInput('ابحث بالعنوان أو الوصف…', q => { _filter.q = q; render(); }));
  const stSel = el('select', { class: 'input', 'aria-label': 'الحالة' });
  stSel.appendChild(el('option', { value: '', text: 'كل الحالات' }));
  for (const s of MAINTENANCE_STATUSES) stSel.appendChild(el('option', { value: s.id, text: s.label }));
  stSel.addEventListener('change', () => { _filter.status = stSel.value; render(); });
  toolbar.appendChild(stSel);
  const prSel = el('select', { class: 'input', 'aria-label': 'الأولوية' });
  prSel.appendChild(el('option', { value: '', text: 'كل الأولويات' }));
  for (const p of MAINTENANCE_PRIORITIES) prSel.appendChild(el('option', { value: p.id, text: p.label }));
  prSel.addEventListener('change', () => { _filter.priority = prSel.value; render(); });
  toolbar.appendChild(prSel);
  container.appendChild(toolbar);

  _listEl = el('div', { class: 'card-list' });
  container.appendChild(_listEl);
  render();
}

async function reload() {
  [_all, _buildings, _apartments, _residents] = await Promise.all([
    db.getAll(STORES.maintenance),
    db.getAll(STORES.buildings),
    db.getAll(STORES.apartments),
    db.getAll(STORES.residents),
  ]);
  _all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function computeStats() {
  return {
    open: _all.filter(m => m.status === 'open').length,
    inProgress: _all.filter(m => m.status === 'in_progress').length,
    done: _all.filter(m => m.status === 'done').length,
    totalCost: _all.reduce((s, m) => s + (m.costPiastres || 0), 0),
  };
}

function render() {
  if (!_listEl) return;
  const bMap = new Map(_buildings.map(b => [b.id, b]));
  const aMap = new Map(_apartments.map(a => [a.id, a]));
  const q = _filter.q.trim().toLowerCase();
  const items = _all.filter(m => {
    if (_filter.status && m.status !== _filter.status) return false;
    if (_filter.priority && m.priority !== _filter.priority) return false;
    if (!q) return true;
    return (m.title || '').toLowerCase().includes(q) || (m.description || '').toLowerCase().includes(q);
  });
  renderList(_listEl, items, m => rowFactory(m, bMap, aMap), () => emptyState({
    icon: 'wrench', title: 'لا توجد طلبات صيانة',
    message: 'أنشئ أول طلب صيانة.',
    action: button('طلب جديد', { variant: 'primary', icon: 'plus', onClick: () => showForm(null) }),
  }));
}

function rowFactory(m, bMap, aMap) {
  const b = bMap.get(m.buildingId);
  const a = m.apartmentId ? aMap.get(m.apartmentId) : null;
  const priority = MAINTENANCE_PRIORITIES.find(p => p.id === m.priority)?.label || m.priority;
  const status = MAINTENANCE_STATUSES.find(s => s.id === m.status)?.label || m.status;
  const priorityCls = m.priority === 'urgent' ? 'chip--danger' : m.priority === 'high' ? 'chip--warn' : '';
  const statusCls = m.status === 'done' ? 'chip--success' : m.status === 'in_progress' ? 'chip--info' : m.status === 'cancelled' ? 'chip--muted' : 'chip--warn';
  return el('div', { class: 'card-list__item' }, [
    el('div', { class: 'card-list__icon' }, [icon('wrench', { size: 22 })]),
    el('div', { class: 'card-list__body' }, [
      el('div', { class: 'card-list__title', text: m.title }),
      el('div', { class: 'card-list__sub', text: `${b ? b.name : '—'}${a ? ' – وحدة ' + a.number : ''}` }),
      el('div', { class: 'card-list__meta' }, [
        el('span', { class: 'chip ' + statusCls, text: status }),
        el('span', { class: 'chip ' + priorityCls, text: priority }),
        m.technician ? el('span', { class: 'chip', text: `الفني: ${m.technician}` }) : null,
        m.costPiastres ? el('span', { class: 'chip chip--info', text: `تكلفة ${formatEgp(m.costPiastres)}` }) : null,
        el('span', { class: 'chip', text: formatDateShort(m.createdAt) }),
      ]),
      m.description ? el('div', { class: 'card-list__desc', text: m.description }) : null,
    ]),
    el('div', { class: 'card-list__actions' }, [
      el('button', { class: 'icon-btn', 'aria-label': 'تعديل', onClick: () => showForm(m) }, [icon('edit', { size: 18 })]),
      el('button', { class: 'icon-btn icon-btn--danger', 'aria-label': 'حذف', onClick: () => remove(m) }, [icon('trash', { size: 18 })]),
    ]),
  ]);
}

function showForm(req) {
  const isEdit = !!req;
  const overlay = el('div', { class: 'modal-overlay' });
  const cardEl = el('div', { class: 'modal-card modal-card--wide', role: 'dialog', 'aria-modal': 'true' });
  cardEl.appendChild(el('h3', { class: 'modal-card__title', text: isEdit ? 'تعديل طلب صيانة' : 'طلب صيانة جديد' }));
  const form = el('form', { class: 'form' });

  const fields = [
    { name: 'title', label: 'العنوان *', type: 'text', required: true, value: req?.title || '' },
    { name: 'buildingId', label: 'المبنى *', type: 'select', required: true, options: [{id:'',label:'—'}].concat(_buildings.filter(b=>!b.archived).map(b => ({id:b.id, label:b.name}))), value: req?.buildingId || '' },
    { name: 'apartmentId', label: 'الوحدة (اختياري)', type: 'select', options: [{id:'',label:'—'}].concat(_apartments.map(a => ({id:a.id, label:a.number}))), value: req?.apartmentId || '' },
    { name: 'priority', label: 'الأولوية', type: 'select', options: MAINTENANCE_PRIORITIES, value: req?.priority || 'medium' },
    { name: 'status', label: 'الحالة', type: 'select', options: MAINTENANCE_STATUSES, value: req?.status || 'open' },
    { name: 'technician', label: 'الفني', type: 'text', value: req?.technician || '' },
    { name: 'cost', label: 'التكلفة (ج.م)', type: 'number', step: '0.01', value: req?.costPiastres ? (req.costPiastres/100) : '' },
    { name: 'scheduledAt', label: 'موعد التنفيذ', type: 'date', value: req?.scheduledAt ? new Date(req.scheduledAt).toISOString().slice(0,10) : '' },
    { name: 'description', label: 'الوصف', type: 'textarea', value: req?.description || '' },
    { name: 'notes', label: 'ملاحظات', type: 'textarea', value: req?.notes || '' },
  ];
  const inputs = {};
  for (const f of fields) {
    const field = el('div', { class: 'form-field' });
    field.appendChild(el('label', { class: 'form-label', for: `f-${f.name}`, text: f.label }));
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
      if (f.step) input.setAttribute('step', f.step);
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
      id: req?.id || uid(),
      title: inputs.title.value.trim(),
      buildingId: inputs.buildingId.value,
      apartmentId: inputs.apartmentId.value || null,
      priority: inputs.priority.value,
      status: inputs.status.value,
      technician: inputs.technician.value.trim(),
      costPiastres: parseEgp(inputs.cost.value) || 0,
      scheduledAt: inputs.scheduledAt.value ? new Date(inputs.scheduledAt.value).getTime() : null,
      description: inputs.description.value.trim(),
      notes: inputs.notes.value.trim(),
      createdAt: req?.createdAt || Date.now(),
      updatedAt: Date.now(),
      completedAt: inputs.status.value === 'done' ? (req?.completedAt || Date.now()) : null,
    };
    const v = validateMaintenance(rec);
    document.querySelectorAll('.form-error').forEach(e => e.textContent = '');
    if (!v.ok) {
      for (const [k, msg] of Object.entries(v.errors)) {
        const e = document.getElementById(`err-${k}`); if (e) e.textContent = msg;
      }
      return;
    }
    try {
      await db.put(STORES.maintenance, rec);
      await db.audit('maintenance.save', 'maintenance', rec.id, { title: rec.title });
      toast('تم حفظ الطلب.', { type: 'success' });
      close(); await reload(); render();
    } catch (err) {
      toast('فشل الحفظ: ' + (err.message || err), { type: 'error' });
    }
  }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

async function remove(m) {
  const ok = await confirmDialog({
    title: 'حذف الطلب', message: `حذف "${m.title}"؟ لا يمكن التراجع.`,
    confirmLabel: 'حذف', cancelLabel: 'إلغاء', danger: true,
  });
  if (!ok) return;
  await db.remove(STORES.maintenance, m.id);
  await db.audit('maintenance.delete', 'maintenance', m.id, {});
  toast('تم الحذف.', { type: 'success' });
  await reload(); render();
}

export function unmount() { _listEl = null; _all = []; }
