// resident-portal.js — Local-only resident view.
// IMPORTANT: This is a read-only convenience view, NOT a secure multi-tenant portal.
// Local-only mode does NOT provide secure authentication or sync across devices.

import * as db from '../database.js';
import { STORES } from '../config.js';
import { formatEgp, formatDateShort } from '../validation.js';
import { el, icon, pageHeader, button, emptyState, statTile } from '../ui.js';
import * as calc from '../calculations.js';
import { openWhatsApp, outstandingMessage } from '../whatsapp.js';

let _state = { residentId: null };

export async function mount(container, ctx) {
  container.appendChild(pageHeader({
    title: 'بوابة الساكن',
    subtitle: 'عرض محلي للساكن — ليس بديلًا عن المصادقة الآمنة',
  }));

  // Disclaimer banner
  const banner = el('div', { class: 'banner banner--warn' }, [
    el('div', { class: 'banner__icon' }, [icon('alert', { size: 18 })]),
    el('div', { class: 'banner__body' }, [
      el('strong', { text: 'تنبيه:' }),
      ' ',
      'هذه البوابة تعمل محليًا على هذا الجهاز فقط. لا توفر مصادقة آمنة بين المستخدمين، ولا تزامنًا بين الأجهزة. لا تستخدمها لمشاركة بيانات حساسة بين ملاك أو مستأجرين متعددين على نفس الجهاز.',
    ]),
  ]);
  container.appendChild(banner);

  const residents = await db.getAll(STORES.residents);
  const picker = el('div', { class: 'form-field' }, [
    el('label', { class: 'form-label', for: 'portal-resident', text: 'اختر الساكن للعرض' }),
  ]);
  const sel = el('select', { id: 'portal-resident', class: 'input' });
  sel.appendChild(el('option', { value: '', text: '— اختر —' }));
  for (const r of residents.sort((a,b) => (a.name||'').localeCompare(b.name||'', 'ar'))) {
    sel.appendChild(el('option', { value: r.id, text: `${r.name} — ${r.phone || '—'}` }));
  }
  picker.appendChild(sel);
  container.appendChild(picker);

  const out = el('div', { class: 'portal-out' });
  container.appendChild(out);

  sel.addEventListener('change', async () => {
    _state.residentId = sel.value || null;
    await render(out);
  });

  if (_state.residentId) {
    sel.value = _state.residentId;
    await render(out);
  }
}

async function render(out) {
  while (out.firstChild) out.removeChild(out.firstChild);
  if (!_state.residentId) {
    out.appendChild(emptyState({ icon: 'user', title: 'اختر ساكنًا', message: 'لعرض بياناته ومستحقاته.' }));
    return;
  }
  const [resident, apartments, contracts, obligations, payments] = await Promise.all([
    db.get(STORES.residents, _state.residentId),
    db.getAll(STORES.apartments),
    db.getAll(STORES.contracts),
    db.getAll(STORES.obligations),
    db.getAll(STORES.payments),
  ]);
  if (!resident) {
    out.appendChild(emptyState({ icon: 'alert', title: 'الساكن غير موجود' }));
    return;
  }
  // Resident's obligations (as tenant)
  const myObligations = obligations.filter(o => o.tenantId === resident.id);
  const myPayments = payments.filter(p => !p.reversed && myObligations.some(o => o.id === p.obligationId));
  const outstanding = calc.outstandingBalance(myObligations, myPayments);
  const totalPaid = calc.sumPayments(myPayments);
  const totalObl = calc.sumObligations(myObligations);
  const myApartments = apartments.filter(a => a.ownerId === resident.id || a.tenantId === resident.id);
  const myContracts = contracts.filter(c => c.tenantId === resident.id);

  const grid = el('div', { class: 'kpi-grid' }, [
    statTile({ label: 'إجمالي الالتزامات', value: formatEgp(totalObl) }),
    statTile({ label: 'إجمالي المدفوع', value: formatEgp(totalPaid), variant: 'success' }),
    statTile({ label: 'المتبقي', value: formatEgp(outstanding), variant: outstanding > 0 ? 'danger' : '' }),
    statTile({ label: 'عقود سارية', value: String(myContracts.filter(c => c.status === 'active').length) }),
  ]);
  out.appendChild(grid);

  // Quick contact button (to landlord — we'll just open WhatsApp to the resident themselves for demo)
  if (resident.phone) {
    const actions = el('div', { class: 'toolbar' }, [
      button('تذكير بالسداد عبر واتساب', { variant: 'ghost', icon: 'whatsapp', onClick: () => {
        const a = myApartments[0];
        openWhatsApp(resident.phone, outstandingMessage({
          residentName: resident.name,
          buildingName: '',
          apartmentNumber: a ? a.number : '',
          outstandingPiastres: outstanding,
        }));
      } }),
    ]);
    out.appendChild(actions);
  }

  // Recent obligations table
  if (myObligations.length === 0) {
    out.appendChild(emptyState({ icon: 'check', title: 'لا توجد التزامات', message: 'لا توجد التزامات مسجلة لهذا الساكن.' }));
    return;
  }
  const outstandingMap = calc.perObligationOutstanding(myObligations, myPayments);
  const section = el('section', { class: 'report-section' }, [el('h2', { class: 'section-title', text: 'الالتزامات الأخيرة' })]);
  const table = el('table', { class: 'data-table' });
  table.appendChild(el('thead', {}, [el('tr', {}, [
    el('th', { text: 'الفترة' }),
    el('th', { text: 'الاستحقاق' }),
    el('th', { text: 'المبلغ' }),
    el('th', { text: 'المتبقي' }),
  ])]));
  const tbody = el('tbody');
  for (const o of myObligations.slice().sort((a,b) => (b.dueDate||0) - (a.dueDate||0)).slice(0, 12)) {
    tbody.appendChild(el('tr', {}, [
      el('td', { text: o.period }),
      el('td', { text: formatDateShort(o.dueDate) }),
      el('td', { class: 'num', text: formatEgp(o.amountPiastres) }),
      el('td', { class: 'num ' + ((outstandingMap.get(o.id) || 0) > 0 ? 'neg' : 'pos'), text: formatEgp(outstandingMap.get(o.id) || 0) }),
    ]));
  }
  table.appendChild(tbody);
  section.appendChild(table);
  out.appendChild(section);
}

export function unmount() { _state = { residentId: null }; }
