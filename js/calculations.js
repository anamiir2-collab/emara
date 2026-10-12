// calculations.js — Pure financial calculations (integer piastres)
// No side effects, no DOM, no IndexedDB. Safe to unit-test in isolation.

import { formatEgp as fmtEgp, formatNumber as fmtNum } from './validation.js';

/**
 * Sum obligations (optionally filtered) → total expected piastres.
 * @param {Array} obligations
 * @param {(o)=>boolean} [pred]
 */
export function sumObligations(obligations, pred) {
  return obligations.reduce((s, o) => (pred && !pred(o)) ? s : s + (o.amountPiastres || 0), 0);
}

/**
 * Sum effective payments (non-reversed) → total collected piastres.
 * Reversed payments are excluded entirely from financial totals.
 */
export function sumPayments(payments, pred) {
  return payments.reduce((s, p) => {
    if (p.reversed) return s;
    if (pred && !pred(p)) return s;
    return s + (p.amountPiastres || 0);
  }, 0);
}

/**
 * Outstanding balance for a set of obligations + their payments.
 * = sum(obligations) − sum(effective payments allocated to those obligations).
 */
export function outstandingBalance(obligations, payments) {
  const totalObl = sumObligations(obligations);
  const obligationIds = new Set(obligations.map(o => o.id));
  const totalPaid = sumPayments(payments, p => obligationIds.has(p.obligationId));
  return totalObl - totalPaid;
}

/**
 * Per-obligation outstanding breakdown.
 * Returns Map<obligationId, outstandingPiastres>.
 */
export function perObligationOutstanding(obligations, payments) {
  const paidByObl = new Map();
  for (const p of payments) {
    if (p.reversed) continue;
    paidByObl.set(p.obligationId, (paidByObl.get(p.obligationId) || 0) + (p.amountPiastres || 0));
  }
  const out = new Map();
  for (const o of obligations) {
    out.set(o.id, (o.amountPiastres || 0) - (paidByObl.get(o.id) || 0));
  }
  return out;
}

/**
 * Closing cash balance.
 * = openingBalance + actualCollections − actualPaidExpenses
 * Unpaid expenses are NOT subtracted (per spec).
 */
export function cashBalance(openingPiastres, collectionsPiastres, paidExpensesPiastres) {
  return (openingPiastres || 0) + (collectionsPiastres || 0) - (paidExpensesPiastres || 0);
}

/**
 * Allocate a payment amount across multiple obligations (oldest due first).
 * Returns array of { obligationId, amountPiastres } that sums to totalPaid.
 * Used to split a single lump-sum payment across several due obligations.
 */
export function allocatePayment(obligations, totalPaidPiastres) {
  const sorted = [...obligations].sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));
  const out = [];
  let remaining = totalPaidPiastres;
  for (const o of sorted) {
    if (remaining <= 0) break;
    // Compute current outstanding for this obligation
    // (we don't have payments here; caller should pass only outstanding obligations)
    const owed = o.amountPiastres || 0;
    if (owed <= 0) continue;
    const chunk = Math.min(owed, remaining);
    out.push({ obligationId: o.id, amountPiastres: chunk });
    remaining -= chunk;
  }
  return out;
}

/** Sum expense amounts (optionally filtered). */
export function sumExpenses(expenses, pred) {
  return expenses.reduce((s, e) => {
    if (pred && !pred(e)) return s;
    return s + (e.amountPiastres || 0);
  }, 0);
}

/** Sum only PAID expenses (cash outflow). */
export function sumPaidExpenses(expenses) {
  return sumExpenses(expenses, e => e.status === 'paid' && !e.reversed);
}

/** Sum UNPAID expenses (no cash impact yet). */
export function sumUnpaidExpenses(expenses) {
  return sumExpenses(expenses, e => e.status === 'unpaid');
}

/** Format piastres → EGP string (re-export for convenience). */
export function formatEgp(p) { return fmtEgp(p); }
export function formatNumber(p) { return fmtNum(p); }

/** Build a deterministic fingerprint for a payment to prevent double-submission. */
export function paymentFingerprint({ obligationId, amountPiastres, date, method }) {
  return `pay|${obligationId}|${amountPiastres}|${date}|${method}`;
}

/** Build a deterministic fingerprint for an expense. */
export function expenseFingerprint({ buildingId, amountPiastres, date, category, description }) {
  return `exp|${buildingId}|${amountPiastres}|${date}|${category}|${(description || '').trim()}`;
}

/**
 * Monthly summary for a given month (1-12) & year.
 * Returns { collectionsPiastres, expensesPiastres, netPiastres, obligationsPiastres }.
 */
export function monthlySummary({ payments, expenses, obligations, year, month }) {
  const start = Date.UTC(year, month - 1, 1);
  const end = Date.UTC(year, month, 1);
  const inMonth = ts => ts >= start && ts < end;
  const collections = sumPayments(payments, p => inMonth(p.date));
  const paidExpenses = sumPaidExpenses(expenses.filter(e => inMonth(e.date)));
  const obligationsTotal = sumObligations(obligations.filter(o => inMonth(o.dueDate)));
  return {
    collectionsPiastres: collections,
    expensesPiastres: paidExpenses,
    netPiastres: collections - paidExpenses,
    obligationsPiastres: obligationsTotal,
  };
}

export default {
  sumObligations, sumPayments, outstandingBalance, perObligationOutstanding,
  cashBalance, allocatePayment, sumExpenses, sumPaidExpenses, sumUnpaidExpenses,
  formatEgp, formatNumber, paymentFingerprint, expenseFingerprint, monthlySummary,
};
