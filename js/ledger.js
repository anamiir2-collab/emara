// ledger.js — High-level financial operations
// Wraps database.js + calculations.js into business-meaningful actions.
// Enforces: idempotent payments (fingerprint), audit trail, atomic reversals,
// no duplicate receipts, no double counting.

import { STORES } from './config.js';
import * as db from './database.js';
import {
  paymentFingerprint, expenseFingerprint, sumPayments,
} from './calculations.js';

/**
 * Record a payment against one or more obligations.
 * - Allocates the amount across provided obligations (oldest first).
 * - Generates ONE receipt per call (lump sum).
 * - Prevents duplicate submission via fingerprint check.
 *
 * @param {object} params
 * @param {Array} params.allocations  [{ obligationId, amountPiastres }]
 * @param {number} params.date        timestamp
 * @param {string} params.method      payment method id
 * @param {string} [params.notes]
 * @returns {Promise<{ receipt, payments }>}
 */
export async function recordPayment({ allocations, date, method, notes = '' }) {
  if (!allocations || allocations.length === 0) {
    throw new Error('لا توجد توزيعات للدفع.');
  }
  const total = allocations.reduce((s, a) => s + a.amountPiastres, 0);
  if (total <= 0) throw new Error('المبلغ الإجمالي يجب أن يكون أكبر من صفر.');

  // Compute a single fingerprint covering all allocations (sorted for stability)
  const sortedAlloc = [...allocations].sort((a, b) =>
    a.obligationId < b.obligationId ? -1 : a.obligationId > b.obligationId ? 1 : 0
  );
  const fp = paymentFingerprint({
    obligationId: sortedAlloc.map(a => a.obligationId).join('+'),
    amountPiastres: total,
    date,
    method,
  });

  return db.withTx([STORES.payments, STORES.receipts, STORES.obligations, STORES.audit, STORES.settings], 'readwrite',
    async (stores) => {
      // Idempotency: if any existing payment shares the fingerprint, refuse.
      const idx = stores[STORES.payments].index('fingerprint');
      const existing = await db.reqToPromise(idx.get(fp));
      if (existing) {
        throw new Error('تم تسجيل هذه الدفعة بالفعل. تم تجاهل التكرار.');
      }

      // Generate sequential receipt number
      const prefix = (await db.reqToPromise(stores[STORES.settings].get('receipt_prefix')))?.value || 'REC';
      let nextRec = (await db.reqToPromise(stores[STORES.settings].get('receipt_next')))?.value || 1;
      const receiptNumber = `${prefix}-${String(nextRec).padStart(6, '0')}`;
      nextRec += 1;
      stores[STORES.settings].put({ key: 'receipt_next', value: nextRec });

      const receiptId = db.uid();
      const receipt = {
        id: receiptId,
        number: receiptNumber,
        type: 'payment',
        refIds: [],
        amountPiastres: total,
        date,
        method,
        notes,
        createdAt: Date.now(),
      };

      const payments = [];
      for (const a of allocations) {
        const p = {
          id: db.uid(),
          obligationId: a.obligationId,
          amountPiastres: a.amountPiastres,
          date,
          method,
          receiptId,
          reversed: false,
          reversedAt: null,
          reversalReason: null,
          fingerprint: fp,
          notes,
          createdAt: Date.now(),
        };
        stores[STORES.payments].put(p);
        receipt.refIds.push(p.id);
        payments.push(p);
      }
      stores[STORES.receipts].put(receipt);
      stores[STORES.audit].put({
        id: db.uid(),
        action: 'payment.create',
        entity: 'payment',
        entityId: receiptId,
        data: { total, method, date, allocationCount: allocations.length },
        timestamp: Date.now(),
      });
      return { receipt, payments };
    }
  );
}

/**
 * Reverse a payment (audit-trail style; never deletes the row).
 * Marks reversed=true, records reason & timestamp.
 * Cannot reverse an already-reversed payment.
 */
export async function reversePayment(paymentId, reason) {
  if (!reason || !reason.trim()) throw new Error('سبب الإلغاء مطلوب.');
  return db.withTx([STORES.payments, STORES.audit], 'readwrite', async (stores) => {
    const p = await db.reqToPromise(stores[STORES.payments].get(paymentId));
    if (!p) throw new Error('الدفعة غير موجودة.');
    if (p.reversed) throw new Error('الدفعة ملغاة بالفعل.');
    const updated = {
      ...p,
      reversed: true,
      reversedAt: Date.now(),
      reversalReason: reason.trim(),
    };
    stores[STORES.payments].put(updated);
    stores[STORES.audit].put({
      id: db.uid(),
      action: 'payment.reverse',
      entity: 'payment',
      entityId: paymentId,
      data: { reason: reason.trim(), amountPiastres: p.amountPiastres },
      timestamp: Date.now(),
    });
    return updated;
  });
}

/**
 * Record an expense. status can be 'paid' (cash outflow now) or 'unpaid'.
 * Prevents duplicates via fingerprint.
 */
export async function recordExpense({ buildingId, category, description, amountPiastres, date, status, method = 'cash', notes = '' }) {
  const fp = expenseFingerprint({ buildingId, amountPiastres, date, category, description });
  return db.withTx([STORES.expenses, STORES.receipts, STORES.settings, STORES.audit], 'readwrite',
    async (stores) => {
      const idx = stores[STORES.expenses].index('fingerprint');
      const existing = await db.reqToPromise(idx.get(fp));
      if (existing) throw new Error('هذا المصروف مسجل بالفعل. تم تجاهل التكرار.');

      let receiptId = null;
      let receiptNumber = null;
      if (status === 'paid') {
        const prefix = (await db.reqToPromise(stores[STORES.settings].get('receipt_prefix')))?.value || 'REC';
        let nextRec = (await db.reqToPromise(stores[STORES.settings].get('receipt_next')))?.value || 1;
        receiptNumber = `${prefix}-E${String(nextRec).padStart(6, '0')}`;
        nextRec += 1;
        stores[STORES.settings].put({ key: 'receipt_next', value: nextRec });
        receiptId = db.uid();
        stores[STORES.receipts].put({
          id: receiptId,
          number: receiptNumber,
          type: 'expense',
          refId: null,
          amountPiastres,
          date,
          method,
          notes: description || notes,
          createdAt: Date.now(),
        });
      }
      const expense = {
        id: db.uid(),
        buildingId,
        category,
        description: (description || '').trim(),
        amountPiastres,
        date,
        status,
        method,
        receiptId,
        receiptNumber,
        reversed: false,
        reversedAt: null,
        reversalReason: null,
        fingerprint: fp,
        notes,
        createdAt: Date.now(),
      };
      stores[STORES.expenses].put(expense);
      stores[STORES.audit].put({
        id: db.uid(),
        action: 'expense.create',
        entity: 'expense',
        entityId: expense.id,
        data: { amountPiastres, status, category, date },
        timestamp: Date.now(),
      });
      return expense;
    }
  );
}

/** Reverse an expense (audit trail). */
export async function reverseExpense(expenseId, reason) {
  if (!reason || !reason.trim()) throw new Error('سبب الإلغاء مطلوب.');
  return db.withTx([STORES.expenses, STORES.audit], 'readwrite', async (stores) => {
    const e = await db.reqToPromise(stores[STORES.expenses].get(expenseId));
    if (!e) throw new Error('المصروف غير موجود.');
    if (e.reversed) throw new Error('المصروف ملغى بالفعل.');
    const updated = { ...e, reversed: true, reversedAt: Date.now(), reversalReason: reason.trim() };
    stores[STORES.expenses].put(updated);
    stores[STORES.audit].put({
      id: db.uid(),
      action: 'expense.reverse',
      entity: 'expense',
      entityId: expenseId,
      data: { reason: reason.trim(), amountPiastres: e.amountPiastres },
      timestamp: Date.now(),
    });
    return updated;
  });
}

/**
 * Generate obligations for a contract over a date range.
 * Creates one obligation per month (rent + optional association fee).
 * Idempotent: skips periods that already have an obligation for this contract.
 */
export async function generateObligationsForContract(contract, months = 12) {
  const start = new Date(contract.startDate);
  const obligations = [];
  const existing = await db.getAll(STORES.obligations, 'contractId', contract.id);
  const existingPeriods = new Set(existing.map(o => o.period));
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (existingPeriods.has(period)) continue;
    const due = d.getTime();
    const rentObl = {
      id: db.uid(),
      contractId: contract.id,
      apartmentId: contract.apartmentId,
      buildingId: contract.buildingId,
      tenantId: contract.tenantId,
      type: 'rent',
      amountPiastres: contract.rentValuePiastres,
      dueDate: due,
      period,
      notes: `إيجار ${period}`,
      createdAt: Date.now(),
    };
    obligations.push(rentObl);
    if (contract.associationFeePiastres && contract.associationFeePiastres > 0) {
      obligations.push({
        id: db.uid(),
        contractId: contract.id,
        apartmentId: contract.apartmentId,
        buildingId: contract.buildingId,
        tenantId: contract.tenantId,
        type: 'association_fee',
        amountPiastres: contract.associationFeePiastres,
        dueDate: due,
        period,
        notes: `اشتراك اتحاد ${period}`,
        createdAt: Date.now(),
      });
    }
  }
  if (obligations.length > 0) {
    await db.bulkPut(STORES.obligations, obligations);
  }
  return obligations;
}

/** Convenience: get all obligations for a building. */
export async function obligationsForBuilding(buildingId) {
  return db.getAll(STORES.obligations, 'buildingId', buildingId);
}

/** Convenience: get all payments for a set of obligations. */
export async function paymentsForObligations(obligationIds) {
  const set = new Set(obligationIds);
  const all = await db.getAll(STORES.payments);
  return all.filter(p => set.has(p.obligationId));
}

export default {
  recordPayment, reversePayment,
  recordExpense, reverseExpense,
  generateObligationsForContract,
  obligationsForBuilding, paymentsForObligations,
};
