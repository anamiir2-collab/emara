// tests/financial.test.mjs — Pure-function tests for js/calculations.js
// Run with: node --test tests/
//
// These tests import the SAME source file the app uses (relative path),
// so they verify the actual production code, not a copy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sumObligations, sumPayments, outstandingBalance, perObligationOutstanding,
  cashBalance, allocatePayment, sumExpenses, sumPaidExpenses, sumUnpaidExpenses,
  paymentFingerprint, expenseFingerprint, monthlySummary,
} from '../js/calculations.js';

test('sumObligations totals all amounts', () => {
  const obls = [{ amountPiastres: 1000 }, { amountPiastres: 2500 }, { amountPiastres: 500 }];
  assert.equal(sumObligations(obls), 4000);
});

test('sumObligations respects predicate', () => {
  const obls = [{ amountPiastres: 1000, type: 'rent' }, { amountPiastres: 2500, type: 'fee' }];
  assert.equal(sumObligations(obls, o => o.type === 'rent'), 1000);
});

test('sumPayments excludes reversed payments', () => {
  const pays = [
    { amountPiastres: 1000, reversed: false },
    { amountPiastres: 2000, reversed: true },
    { amountPiastres: 500, reversed: false },
  ];
  assert.equal(sumPayments(pays), 1500);
});

test('outstandingBalance = obligations - effective payments', () => {
  const obls = [{ id: 'o1', amountPiastres: 5000 }, { id: 'o2', amountPiastres: 3000 }];
  const pays = [
    { obligationId: 'o1', amountPiastres: 2000, reversed: false },
    { obligationId: 'o1', amountPiastres: 3000, reversed: false },
    { obligationId: 'o2', amountPiastres: 1000, reversed: true }, // reversed, ignored
  ];
  assert.equal(outstandingBalance(obls, pays), 8000 - 5000);
});

test('perObligationOutstanding computes per obligation', () => {
  const obls = [{ id: 'a', amountPiastres: 1000 }, { id: 'b', amountPiastres: 2000 }];
  const pays = [
    { obligationId: 'a', amountPiastres: 400, reversed: false },
    { obligationId: 'b', amountPiastres: 500, reversed: false },
    { obligationId: 'b', amountPiastres: 500, reversed: true },
  ];
  const m = perObligationOutstanding(obls, pays);
  assert.equal(m.get('a'), 600);
  assert.equal(m.get('b'), 1500);
});

test('cashBalance = opening + collections - paidExpenses', () => {
  assert.equal(cashBalance(100000, 50000, 30000), 120000);
  assert.equal(cashBalance(0, 0, 0), 0);
  assert.equal(cashBalance(1000, 0, 2000), -1000);
});

test('cashBalance ignores unpaid expenses (passed by caller)', () => {
  // The caller is responsible for passing only PAID expenses; verify the math:
  const opening = 100000;
  const collections = 50000;
  const expenses = [
    { amountPiastres: 30000, status: 'paid', reversed: false },
    { amountPiastres: 20000, status: 'unpaid', reversed: false },
  ];
  const paidExpenses = sumPaidExpenses(expenses);
  assert.equal(paidExpenses, 30000, 'only paid expenses counted');
  assert.equal(cashBalance(opening, collections, paidExpenses), 120000);
});

test('sumPaidExpenses excludes unpaid and reversed', () => {
  const exps = [
    { amountPiastres: 1000, status: 'paid', reversed: false },
    { amountPiastres: 2000, status: 'paid', reversed: true },    // reversed → excluded
    { amountPiastres: 3000, status: 'unpaid', reversed: false }, // unpaid → excluded
  ];
  assert.equal(sumPaidExpenses(exps), 1000);
  assert.equal(sumUnpaidExpenses(exps), 3000);
  assert.equal(sumExpenses(exps), 6000);
});

test('allocatePayment distributes amount oldest-first', () => {
  const obls = [
    { id: 'old', amountPiastres: 1000, dueDate: 100 },
    { id: 'mid', amountPiastres: 2000, dueDate: 200 },
    { id: 'new', amountPiastres: 3000, dueDate: 300 },
  ];
  const alloc = allocatePayment(obls, 3500);
  // oldest-first: 1000 (old) + 2000 (mid) + 500 (new) = 3500
  assert.equal(alloc.length, 3);
  assert.equal(alloc[0].obligationId, 'old');
  assert.equal(alloc[0].amountPiastres, 1000);
  assert.equal(alloc[1].obligationId, 'mid');
  assert.equal(alloc[1].amountPiastres, 2000);
  assert.equal(alloc[2].obligationId, 'new');
  assert.equal(alloc[2].amountPiastres, 500);
  // Total must equal the input
  const total = alloc.reduce((s, a) => s + a.amountPiastres, 0);
  assert.equal(total, 3500);
});

test('allocatePayment stops when total exhausted', () => {
  const obls = [{ id: 'a', amountPiastres: 1000 }, { id: 'b', amountPiastres: 1000 }];
  const alloc = allocatePayment(obls, 1500);
  assert.equal(alloc.length, 2);
  assert.equal(alloc[0].amountPiastres, 1000);
  assert.equal(alloc[1].amountPiastres, 500);
});

test('paymentFingerprint is deterministic and discriminates fields', () => {
  const a = paymentFingerprint({ obligationId: 'o1', amountPiastres: 1000, date: 1700000000, method: 'cash' });
  const b = paymentFingerprint({ obligationId: 'o1', amountPiastres: 1000, date: 1700000000, method: 'cash' });
  const c = paymentFingerprint({ obligationId: 'o1', amountPiastres: 1000, date: 1700000000, method: 'bank' });
  assert.equal(a, b, 'identical inputs → identical fingerprint');
  assert.notEqual(a, c, 'different method → different fingerprint');
});

test('expenseFingerprint distinguishes descriptions', () => {
  const a = expenseFingerprint({ buildingId: 'b1', amountPiastres: 1000, date: 1, category: 'نظافة', description: 'تقرير شهري' });
  const b = expenseFingerprint({ buildingId: 'b1', amountPiastres: 1000, date: 1, category: 'نظافة', description: 'تقرير شهري' });
  const c = expenseFingerprint({ buildingId: 'b1', amountPiastres: 1000, date: 1, category: 'نظافة', description: 'تقرير سنوي' });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('monthlySummary filters by month correctly', () => {
  const payments = [
    { amountPiastres: 1000, date: Date.UTC(2026, 0, 15), reversed: false },   // Jan 2026
    { amountPiastres: 2000, date: Date.UTC(2026, 1, 10), reversed: false },   // Feb 2026
    { amountPiastres: 500, date: Date.UTC(2026, 1, 20), reversed: true },     // reversed
  ];
  const expenses = [
    { amountPiastres: 800, date: Date.UTC(2026, 1, 5), status: 'paid', reversed: false },
    { amountPiastres: 600, date: Date.UTC(2026, 1, 25), status: 'unpaid', reversed: false },
  ];
  const obligations = [
    { amountPiastres: 5000, dueDate: Date.UTC(2026, 1, 1) },
  ];
  const s = monthlySummary({ payments, expenses, obligations, year: 2026, month: 2 });
  assert.equal(s.collectionsPiastres, 2000);
  assert.equal(s.expensesPiastres, 800);
  assert.equal(s.netPiastres, 1200);
  assert.equal(s.obligationsPiastres, 5000);
});

test('reversed payments do not contribute to outstanding calculation', () => {
  const obls = [{ id: 'o1', amountPiastres: 1000 }];
  // 700 paid, then reversed. Then 300 paid again.
  const pays = [
    { obligationId: 'o1', amountPiastres: 700, reversed: true },
    { obligationId: 'o1', amountPiastres: 300, reversed: false },
  ];
  assert.equal(outstandingBalance(obls, pays), 700);
});

test('partial payment reduces outstanding proportionally', () => {
  const obls = [{ id: 'o1', amountPiastres: 10000 }];
  const pays = [{ obligationId: 'o1', amountPiastres: 3500, reversed: false }];
  assert.equal(outstandingBalance(obls, pays), 6500);
});
