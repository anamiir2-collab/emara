// reports.js — Financial reports: collections, expenses, outstanding, monthly summary, building statements.

import * as db from '../database.js';
import { STORES } from '../config.js';
import { formatEgp, formatDateShort } from '../validation.js';
import { el, icon, pageHeader, button, statTile, emptyState } from '../ui.js';
import * as calc from '../calculations.js';
import * as exportCsv from '../export.js';

export async function mount(container, ctx) {
  container.appendChild(pageHeader({
    title: 'التقارير',
    subtitle: 'ملخص مالي وأداء المحفظة',
    actions: [
      button('تصدير التحصيلات', { variant: 'ghost', icon: 'download', onClick: () => exportCsv.exportPaymentsCsv() }),
      button('تصدير المصروفات', { variant: 'ghost', icon: 'download', onClick: () => exportCsv.exportExpensesCsv() }),
      button('تصدير المستحقات', { variant: 'ghost', icon: 'download', onClick: () => exportCsv.exportOutstandingCsv() }),
      button('طباعة', { variant: 'primary', icon: 'print', onClick: () => window.print() }),
    ],
  }));

  const data = await loadData();
  renderOverview(container, data);
  renderMonthly(container, data);
  renderByBuilding(container, data);
  renderOutstanding(container, data);
}

async function loadData() {
  const [buildings, apartments, contracts, obligations, payments, expenses, settings] = await Promise.all([
    db.getAll(STORES.buildings),
    db.getAll(STORES.apartments),
    db.getAll(STORES.contracts),
    db.getAll(STORES.obligations),
    db.getAll(STORES.payments),
    db.getAll(STORES.expenses),
    db.getAll(STORES.settings),
  ]);
  return { buildings, apartments, contracts, obligations, payments, expenses, settings };
}

function renderOverview(c, data) {
  const totalObl = calc.sumObligations(data.obligations);
  const totalCollected = calc.sumPayments(data.payments);
  const totalPaidExp = calc.sumPaidExpenses(data.expenses);
  const totalUnpaidExp = calc.sumUnpaidExpenses(data.expenses);
  const outstanding = calc.outstandingBalance(data.obligations, data.payments);
  const openingCash = (data.settings.find(s => s.key === 'opening_cash_piastres')?.value) || 0;
  const cashBalance = calc.cashBalance(openingCash, totalCollected, totalPaidExp);

  const grid = el('section', { class: 'report-section' }, [
    el('h2', { class: 'section-title', text: 'نظرة عامة' }),
    el('div', { class: 'kpi-grid' }, [
      statTile({ label: 'إجمالي الالتزامات', value: formatEgp(totalObl) }),
      statTile({ label: 'إجمالي التحصيل', value: formatEgp(totalCollected), variant: 'success' }),
      statTile({ label: 'المستحقات المتبقية', value: formatEgp(outstanding), variant: outstanding > 0 ? 'danger' : '' }),
      statTile({ label: 'مصروفات مدفوعة', value: formatEgp(totalPaidExp), variant: 'warn' }),
      statTile({ label: 'مصروفات مستحقة', value: formatEgp(totalUnpaidExp) }),
      statTile({ label: 'الرصيد النقدي', value: formatEgp(cashBalance), variant: 'primary' }),
    ]),
  ]);
  c.appendChild(grid);
}

function renderMonthly(c, data) {
  // Group by month (yyyy-mm) for last 12 months
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ key: `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, label: new Intl.DateTimeFormat('ar-EG', { year:'numeric', month:'long', timeZone:'UTC' }).format(d) });
  }
  const section = el('section', { class: 'report-section' }, [
    el('h2', { class: 'section-title', text: 'الملخص الشهري (آخر 12 شهرًا)' }),
  ]);
  const table = el('table', { class: 'data-table' });
  table.appendChild(el('thead', {}, [el('tr', {}, [
    el('th', { text: 'الشهر' }),
    el('th', { text: 'تحصيلات' }),
    el('th', { text: 'مصروفات مدفوعة' }),
    el('th', { text: 'صافي' }),
  ])]));
  const tbody = el('tbody');
  for (const m of months) {
    const start = Date.UTC(m.year, m.month - 1, 1);
    const end = Date.UTC(m.year, m.month, 1);
    const inMonth = ts => ts >= start && ts < end;
    const coll = calc.sumPayments(data.payments, p => inMonth(p.date));
    const exp = calc.sumPaidExpenses(data.expenses.filter(e => inMonth(e.date)));
    tbody.appendChild(el('tr', {}, [
      el('td', { text: m.label }),
      el('td', { class: 'num', text: formatEgp(coll) }),
      el('td', { class: 'num', text: formatEgp(exp) }),
      el('td', { class: 'num ' + (coll - exp >= 0 ? 'pos' : 'neg'), text: formatEgp(coll - exp) }),
    ]));
  }
  table.appendChild(tbody);
  section.appendChild(table);
  c.appendChild(section);
}

function renderByBuilding(c, data) {
  const section = el('section', { class: 'report-section' }, [
    el('h2', { class: 'section-title', text: 'كشف per المبنى' }),
  ]);
  const table = el('table', { class: 'data-table' });
  table.appendChild(el('thead', {}, [el('tr', {}, [
    el('th', { text: 'المبنى' }),
    el('th', { text: 'التزامات' }),
    el('th', { text: 'تحصيلات' }),
    el('th', { text: 'متبقي' }),
    el('th', { text: 'مصروفات مدفوعة' }),
  ])]));
  const tbody = el('tbody');
  for (const b of data.buildings.filter(b => !b.archived)) {
    const obls = data.obligations.filter(o => o.buildingId === b.id);
    const oblIds = new Set(obls.map(o => o.id));
    const pays = data.payments.filter(p => !p.reversed && oblIds.has(p.obligationId));
    const exps = data.expenses.filter(e => !e.reversed && e.status === 'paid' && e.buildingId === b.id);
    const totalObl = calc.sumObligations(obls);
    const totalPaid = calc.sumPayments(pays);
    const totalExp = calc.sumPaidExpenses(exps);
    tbody.appendChild(el('tr', {}, [
      el('td', { text: b.name }),
      el('td', { class: 'num', text: formatEgp(totalObl) }),
      el('td', { class: 'num', text: formatEgp(totalPaid) }),
      el('td', { class: 'num ' + (totalObl - totalPaid > 0 ? 'neg' : 'pos'), text: formatEgp(totalObl - totalPaid) }),
      el('td', { class: 'num', text: formatEgp(totalExp) }),
    ]));
  }
  table.appendChild(tbody);
  section.appendChild(table);
  c.appendChild(section);
}

function renderOutstanding(c, data) {
  // Per-contract outstanding list (top 10)
  const section = el('section', { class: 'report-section' }, [
    el('h2', { class: 'section-title', text: 'أكبر المستحقات (حسب العقد)' }),
  ]);
  const outstanding = calc.perObligationOutstanding(data.obligations, data.payments);
  const byContract = new Map();
  for (const o of data.obligations) {
    const out = outstanding.get(o.id) || 0;
    if (out <= 0) continue;
    byContract.set(o.contractId, (byContract.get(o.contractId) || 0) + out);
  }
  const arr = Array.from(byContract.entries())
    .map(([cid, amt]) => ({ contract: data.contracts.find(c => c.id === cid), amount: amt }))
    .filter(x => x.contract)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
  if (arr.length === 0) {
    section.appendChild(emptyState({ icon: 'check', title: 'لا توجد مستحقات', message: 'كل الالتزامات مسددة.' }));
  } else {
    const table = el('table', { class: 'data-table' });
    table.appendChild(el('thead', {}, [el('tr', {}, [el('th', { text: 'العقد' }), el('th', { text: 'متبقي' })])]));
    const tbody = el('tbody');
    for (const x of arr) {
      const c = x.contract;
      const a = data.apartments.find(a => a.id === c.apartmentId);
      const b = a ? data.buildings.find(b => b.id === a.buildingId) : null;
      tbody.appendChild(el('tr', {}, [
        el('td', { text: `${c.code || c.id} — ${b ? b.name : ''} / ${a ? a.number : ''}` }),
        el('td', { class: 'num neg', text: formatEgp(x.amount) }),
      ]));
    }
    table.appendChild(tbody);
    section.appendChild(table);
  }
  c.appendChild(section);
}

export function unmount() {}
