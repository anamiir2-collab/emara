// backup.js — JSON backup & restore with merge/replacement
// Validates imported JSON before applying. Prevents duplicate financial records
// by fingerprinting payments & expenses.

import { APP_CONFIG, STORES, DEFAULT_SETTINGS } from './config.js';
import * as db from './database.js';

const BACKUP_MAGIC = 'emara-backup';
const BACKUP_VERSION = 1;

/** Build a full snapshot object. */
export async function buildBackup() {
  const data = {
    magic: BACKUP_MAGIC,
    version: BACKUP_VERSION,
    appVersion: APP_CONFIG.version,
    exportedAt: new Date().toISOString(),
    stores: {},
  };
  for (const s of Object.values(STORES)) {
    data.stores[s] = await db.getAll(s);
  }
  return data;
}

/** Trigger a browser download of the JSON backup. */
export async function downloadBackup() {
  const snapshot = await buildBackup();
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `emara-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return snapshot;
}

/**
 * Validate the structure & shape of an imported snapshot.
 * Returns { ok, errors, snapshot }.
 */
export function validateBackup(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== 'object') {
    return { ok: false, errors: ['الملف غير صالح: ليس كائن JSON.'], snapshot: null };
  }
  if (snapshot.magic !== BACKUP_MAGIC) {
    errors.push('الملف ليس نسخة احتياطية صالحة لتطبيق عِمارة.');
  }
  if (typeof snapshot.version !== 'number') {
    errors.push('إصدار النسخة الاحتياطية غير معروف.');
  }
  if (!snapshot.stores || typeof snapshot.stores !== 'object') {
    errors.push('بنية المتاجر (stores) غير موجودة.');
    return { ok: false, errors, snapshot: null };
  }
  // Ensure all expected stores exist (ignore unknown ones)
  for (const s of Object.values(STORES)) {
    if (!Array.isArray(snapshot.stores[s])) {
      errors.push(`المتجر "${s}" غير موجود أو ليس قائمة.`);
    }
  }
  // Basic shape checks for financial records
  for (const p of (snapshot.stores[STORES.payments] || [])) {
    if (!p.id || !p.obligationId || typeof p.amountPiastres !== 'number') {
      errors.push('يوجد سجل دفعة غير مكتمل الحقول.');
      break;
    }
  }
  for (const e of (snapshot.stores[STORES.expenses] || [])) {
    if (!e.id || !e.buildingId || typeof e.amountPiastres !== 'number') {
      errors.push('يوجد سجل مصروف غير مكتمل الحقول.');
      break;
    }
  }
  return { ok: errors.length === 0, errors, snapshot };
}

/**
 * Apply an imported snapshot.
 * @param {object} snapshot validated snapshot
 * @param {object} options  { mode: 'merge'|'replace' }
 * - merge: add new records only; existing ids are kept unchanged.
 *          Payments/expenses are deduped by fingerprint to prevent doubles.
 * - replace: clear all stores first, then import.
 */
export async function applyBackup(snapshot, { mode = 'merge' } = {}) {
  if (mode !== 'merge' && mode !== 'replace') {
    throw new Error('وضع الاستيراد غير معروف.');
  }
  const allStores = Object.values(STORES);
  return db.withTx(allStores, 'readwrite', async (stores) => {
    if (mode === 'replace') {
      for (const s of allStores) stores[s].clear();
      // Re-seed defaults
      for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
        stores[STORES.settings].put({ key: k, value: v });
      }
    }
    // Pre-compute existing fingerprints to dedupe financial records in merge mode
    let existingPaymentFps = new Set();
    let existingExpenseFps = new Set();
    if (mode === 'merge') {
      const pays = await db.reqToPromise(stores[STORES.payments].getAll());
      for (const p of pays) if (p.fingerprint) existingPaymentFps.add(p.fingerprint);
      const exs = await db.reqToPromise(stores[STORES.expenses].getAll());
      for (const e of exs) if (e.fingerprint) existingExpenseFps.add(e.fingerprint);
    }
    const counts = {};
    for (const s of allStores) {
      const rows = snapshot.stores[s] || [];
      let written = 0;
      for (const r of rows) {
        if (mode === 'merge') {
          // For settings: prefer imported values when key missing
          const existing = await db.reqToPromise(stores[s].get(r.id || r.key));
          if (existing) continue; // do not overwrite existing in merge mode
          // For payments/expenses: dedupe by fingerprint
          if (s === STORES.payments && r.fingerprint && existingPaymentFps.has(r.fingerprint)) continue;
          if (s === STORES.expenses && r.fingerprint && existingExpenseFps.has(r.fingerprint)) continue;
          if (s === STORES.payments && r.fingerprint) existingPaymentFps.add(r.fingerprint);
          if (s === STORES.expenses && r.fingerprint) existingExpenseFps.add(r.fingerprint);
        }
        stores[s].put(r);
        written += 1;
      }
      counts[s] = written;
    }
    stores[STORES.audit].put({
      id: db.uid(),
      action: 'backup.import',
      entity: 'meta',
      entityId: null,
      data: { mode, counts },
      timestamp: Date.now(),
    });
    return counts;
  });
}

/** Read a File object as JSON. Returns a promise. */
export function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        resolve(obj);
      } catch (e) {
        reject(new Error('تعذر تحليل الملف كـ JSON.'));
      }
    };
    reader.onerror = () => reject(new Error('فشل قراءة الملف.'));
    reader.readAsText(file, 'utf-8');
  });
}

export default { buildBackup, downloadBackup, validateBackup, applyBackup, readBackupFile };
