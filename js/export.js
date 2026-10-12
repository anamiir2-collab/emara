// export.js — CSV & printable exports (UTF-8 BOM for Arabic Excel compatibility)

import { STORES } from './config.js';
import * as db from './database.js';
import { formatNumber, formatDateShort } from './validation.js';

/** Convert a 2D array to CSV with proper escaping. */
export function toCsv(rows) {
  return rows.map(row =>
    row.map(cell => {
      if (cell == null) return '';
      const s = String(cell);
      if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }).join(',')
  ).join('\r\n');
}

/** Trigger CSV download with UTF-8 BOM (so Excel reads Arabic correctly). */
export function downloadCsv(filename, rows) {
  const csv = toCsv(rows);
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export all payments as CSV. */
export async function exportPaymentsCsv() {
  const [pays, obls, contracts] = await Promise.all([
    db.getAll(STORES.payments),
    db.getAll(STORES.obligations),
    db.getAll(STORES.contracts),
  ]);
  const oblMap = new Map(obls.map(o => [o.id, o]));
  const contractMap = new Map(contracts.map(c => [c.id, c]));
  const header = ['رقم الإيصال', 'التاريخ', 'الالتزام', 'العقد', 'الفترة', 'المبلغ (ج.م)', 'الطريقة', 'الحالة'];
  const rows = [header];
  for (const p of pays) {
    const o = oblMap.get(p.obligationId);
    const c = o ? contractMap.get(o.contractId) : null;
    rows.push([
      p.receiptId || '',
      formatDateShort(p.date),
      o ? o.notes : '',
      c ? c.code || c.id : '',
      o ? o.period : '',
      formatNumber(p.amountPiastres),
      p.method,
      p.reversed ? 'ملغاة' : 'سارية',
    ]);
  }
  downloadCsv('emara-payments', rows);
}

/** Export all expenses as CSV. */
export async function exportExpensesCsv() {
  const [exs, buildings] = await Promise.all([
    db.getAll(STORES.expenses),
    db.getAll(STORES.buildings),
  ]);
  const bMap = new Map(buildings.map(b => [b.id, b]));
  const header = ['التاريخ', 'المبنى', 'التصنيف', 'الوصف', 'المبلغ (ج.م)', 'الحالة', 'ملغى'];
  const rows = [header];
  for (const e of exs) {
    const b = bMap.get(e.buildingId);
    rows.push([
      formatDateShort(e.date),
      b ? b.name : '',
      e.category,
      e.description,
      formatNumber(e.amountPiastres),
      e.status === 'paid' ? 'مدفوع' : 'غير مدفوع',
      e.reversed ? 'نعم' : 'لا',
    ]);
  }
  downloadCsv('emara-expenses', rows);
}

/** Export residents as CSV. */
export async function exportResidentsCsv() {
  const residents = await db.getAll(STORES.residents);
  const header = ['الاسم', 'النوع', 'الهاتف', 'البريد', 'الرقم القومي', 'ملاحظات'];
  const rows = [header];
  for (const r of residents) {
    rows.push([r.name, r.type, r.phone, r.email, r.nationalId, r.notes]);
  }
  downloadCsv('emara-residents', rows);
}

/** Export outstanding balances per apartment as CSV. */
export async function exportOutstandingCsv() {
  const [obls, pays, aparts, buildings, contracts] = await Promise.all([
    db.getAll(STORES.obligations),
    db.getAll(STORES.payments),
    db.getAll(STORES.apartments),
    db.getAll(STORES.buildings),
    db.getAll(STORES.contracts),
  ]);
  const bMap = new Map(buildings.map(b => [b.id, b]));
  const aMap = new Map(aparts.map(a => [a.id, a]));
  const cMap = new Map(contracts.map(c => [c.id, c]));
  const header = ['المبنى', 'الوحدة', 'العقد', 'إجمالي الالتزامات (ج.م)', 'إجمالي المدفوع (ج.م)', 'المتبقي (ج.م)'];
  const rows = [header];
  // Group obligations by contractId
  const byContract = new Map();
  for (const o of obls) {
    if (!byContract.has(o.contractId)) byContract.set(o.contractId, []);
    byContract.get(o.contractId).push(o);
  }
  const paysByObl = new Map();
  for (const p of pays) {
    if (p.reversed) continue;
    if (!paysByObl.has(p.obligationId)) paysByObl.set(p.obligationId, 0);
    paysByObl.set(p.obligationId, paysByObl.get(p.obligationId) + p.amountPiastres);
  }
  for (const [cid, contractObls] of byContract) {
    const c = cMap.get(cid);
    if (!c) continue;
    const a = aMap.get(c.apartmentId);
    const b = a ? bMap.get(a.buildingId) : null;
    const totalObl = contractObls.reduce((s, o) => s + o.amountPiastres, 0);
    const totalPaid = contractObls.reduce((s, o) => s + (paysByObl.get(o.id) || 0), 0);
    rows.push([
      b ? b.name : '',
      a ? a.number : '',
      c.code || c.id,
      formatNumber(totalObl),
      formatNumber(totalPaid),
      formatNumber(totalObl - totalPaid),
    ]);
  }
  downloadCsv('emara-outstanding', rows);
}

export default { toCsv, downloadCsv, exportPaymentsCsv, exportExpensesCsv, exportResidentsCsv, exportOutstandingCsv };
