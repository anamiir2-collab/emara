// database.js — IndexedDB wrapper
// Provides a promise-based API and repository helpers.
// All business logic lives in ledger.js / modules; this file is pure I/O.

import { APP_CONFIG, STORES, DEFAULT_SETTINGS } from './config.js';
import { applyMigrations } from './migrations.js';

let _db = null;

/**
 * Open (or reuse) the singleton database connection.
 * Runs migrations from current version to APP_CONFIG.dbVersion.
 */
export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(APP_CONFIG.dbName, APP_CONFIG.dbVersion);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      const oldVersion = event.oldVersion || 0;
      applyMigrations(db, tx, oldVersion, APP_CONFIG.dbVersion);
    };
    req.onsuccess = () => {
      _db = req.result;
      _db.onversionchange = () => { _db.close(); _db = null; };
      seedDefaults(_db).then(() => resolve(_db)).catch(reject);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('فتح قاعدة البيانات محظور بواسطة تبويب آخر. أغلق التبويبات الأخرى وأعد المحاولة.'));
  });
}

/** Seed default settings on first launch (idempotent). */
async function seedDefaults(db) {
  const tx = db.transaction(STORES.settings, 'readwrite');
  const store = tx.objectStore(STORES.settings);
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const exists = await reqToPromise(store.get(key));
    if (exists === undefined) {
      store.put({ key, value });
    }
  }
  return txToPromise(tx);
}

/** Generic helpers — wrap IDBRequest / IDBTransaction in promises. */
export function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function txToPromise(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('تم إلغاء المعاملة.'));
  });
}

/**
 * Begin a transaction across one or more stores.
 * @param {string|string[]} stores
 * @param {string} mode  'readonly' | 'readwrite'
 */
export function tx(stores, mode = 'readonly') {
  return openDB().then(db => db.transaction(stores, mode));
}

/** Get a single record by id. */
export async function get(store, id) {
  const t = await tx(store);
  return reqToPromise(t.objectStore(store).get(id));
}

/** Get all records (optionally filtered via index + range). */
export async function getAll(store, indexName = null, query = null) {
  const t = await tx(store);
  const src = indexName ? t.objectStore(store).index(indexName) : t.objectStore(store);
  return reqToPromise(src.getAll(query));
}

/** Put (insert/update) a record. Returns the record back. */
export async function put(store, record) {
  const t = await tx(store, 'readwrite');
  t.objectStore(store).put(record);
  await txToPromise(t);
  return record;
}

/** Bulk put within a single transaction. */
export async function bulkPut(store, records) {
  const t = await tx(store, 'readwrite');
  const os = t.objectStore(store);
  for (const r of records) os.put(r);
  await txToPromise(t);
  return records.length;
}

/** Delete a record by id. */
export async function remove(store, id) {
  const t = await tx(store, 'readwrite');
  t.objectStore(store).delete(id);
  await txToPromise(t);
  return true;
}

/** Clear all records in a store. */
export async function clearStore(store) {
  const t = await tx(store, 'readwrite');
  t.objectStore(store).clear();
  await txToPromise(t);
  return true;
}

/** Count records in a store. */
export async function count(store) {
  const t = await tx(store);
  return reqToPromise(t.objectStore(store).count());
}

/** Run a function inside a single transaction across multiple stores. */
export async function withTx(stores, mode, fn) {
  const db = await openDB();
  const t = db.transaction(stores, mode);
  const handles = {};
  for (const s of (Array.isArray(stores) ? stores : [stores])) {
    handles[s] = t.objectStore(s);
  }
  let result;
  try {
    result = await fn(handles, t);
  } catch (e) {
    try { t.abort(); } catch (_) {}
    throw e;
  }
  await txToPromise(t);
  return result;
}

/** Settings helpers (key/value). */
export async function getSetting(key, fallback = null) {
  const rec = await get(STORES.settings, key);
  return rec ? rec.value : fallback;
}
export async function setSetting(key, value) {
  return put(STORES.settings, { key, value });
}

/** Audit log writer. */
export async function audit(action, entity, entityId, data = null) {
  const rec = {
    id: crypto.randomUUID(),
    action,
    entity,
    entityId,
    data,
    timestamp: Date.now(),
  };
  return put(STORES.audit, rec);
}

/** Generate a unique id. */
export function uid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export default {
  openDB, get, getAll, put, bulkPut, remove, clearStore, count,
  withTx, getSetting, setSetting, audit, uid, tx, reqToPromise, txToPromise,
};
