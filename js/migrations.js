// migrations.js — Versioned schema migrations for IndexedDB
// Each migration receives (db, tx) and may create stores / indexes.
// Never break existing data: only additive changes when bumping dbVersion.

import { STORES } from './config.js';

/**
 * Migration definitions keyed by target DB version.
 * Each entry is a function that runs inside an upgrade transaction.
 */
export const MIGRATIONS = {
  1: (db, tx) => {
    // buildings
    if (!db.objectStoreNames.contains(STORES.buildings)) {
      const s = db.createObjectStore(STORES.buildings, { keyPath: 'id' });
      s.createIndex('name', 'name', { unique: false });
      s.createIndex('archived', 'archived', { unique: false });
      s.createIndex('createdAt', 'createdAt', { unique: false });
    }
    // apartments
    if (!db.objectStoreNames.contains(STORES.apartments)) {
      const s = db.createObjectStore(STORES.apartments, { keyPath: 'id' });
      s.createIndex('buildingId', 'buildingId', { unique: false });
      s.createIndex('number', 'number', { unique: false });
      s.createIndex('type', 'type', { unique: false });
      s.createIndex('occupied', 'occupied', { unique: false });
    }
    // residents
    if (!db.objectStoreNames.contains(STORES.residents)) {
      const s = db.createObjectStore(STORES.residents, { keyPath: 'id' });
      s.createIndex('name', 'name', { unique: false });
      s.createIndex('phone', 'phone', { unique: false });
      s.createIndex('type', 'type', { unique: false });
    }
    // contracts
    if (!db.objectStoreNames.contains(STORES.contracts)) {
      const s = db.createObjectStore(STORES.contracts, { keyPath: 'id' });
      s.createIndex('apartmentId', 'apartmentId', { unique: false });
      s.createIndex('tenantId', 'tenantId', { unique: false });
      s.createIndex('status', 'status', { unique: false });
      s.createIndex('startDate', 'startDate', { unique: false });
      s.createIndex('endDate', 'endDate', { unique: false });
    }
    // obligations
    if (!db.objectStoreNames.contains(STORES.obligations)) {
      const s = db.createObjectStore(STORES.obligations, { keyPath: 'id' });
      s.createIndex('contractId', 'contractId', { unique: false });
      s.createIndex('apartmentId', 'apartmentId', { unique: false });
      s.createIndex('buildingId', 'buildingId', { unique: false });
      s.createIndex('type', 'type', { unique: false });
      s.createIndex('dueDate', 'dueDate', { unique: false });
      s.createIndex('period', 'period', { unique: false });
    }
    // payments
    if (!db.objectStoreNames.contains(STORES.payments)) {
      const s = db.createObjectStore(STORES.payments, { keyPath: 'id' });
      s.createIndex('obligationId', 'obligationId', { unique: false });
      s.createIndex('receiptId', 'receiptId', { unique: false });
      s.createIndex('date', 'date', { unique: false });
      s.createIndex('method', 'method', { unique: false });
      s.createIndex('reversed', 'reversed', { unique: false });
      s.createIndex('fingerprint', 'fingerprint', { unique: false });
    }
    // expenses
    if (!db.objectStoreNames.contains(STORES.expenses)) {
      const s = db.createObjectStore(STORES.expenses, { keyPath: 'id' });
      s.createIndex('buildingId', 'buildingId', { unique: false });
      s.createIndex('category', 'category', { unique: false });
      s.createIndex('date', 'date', { unique: false });
      s.createIndex('status', 'status', { unique: false });
      s.createIndex('receiptId', 'receiptId', { unique: false });
      s.createIndex('fingerprint', 'fingerprint', { unique: false });
    }
    // maintenance
    if (!db.objectStoreNames.contains(STORES.maintenance)) {
      const s = db.createObjectStore(STORES.maintenance, { keyPath: 'id' });
      s.createIndex('buildingId', 'buildingId', { unique: false });
      s.createIndex('apartmentId', 'apartmentId', { unique: false });
      s.createIndex('status', 'status', { unique: false });
      s.createIndex('priority', 'priority', { unique: false });
      s.createIndex('createdAt', 'createdAt', { unique: false });
    }
    // receipts
    if (!db.objectStoreNames.contains(STORES.receipts)) {
      const s = db.createObjectStore(STORES.receipts, { keyPath: 'id' });
      s.createIndex('number', 'number', { unique: false });
      s.createIndex('type', 'type', { unique: false });
      s.createIndex('refId', 'refId', { unique: false });
      s.createIndex('date', 'date', { unique: false });
    }
    // settings (key-value)
    if (!db.objectStoreNames.contains(STORES.settings)) {
      db.createObjectStore(STORES.settings, { keyPath: 'key' });
    }
    // audit log
    if (!db.objectStoreNames.contains(STORES.audit)) {
      const s = db.createObjectStore(STORES.audit, { keyPath: 'id' });
      s.createIndex('entity', 'entity', { unique: false });
      s.createIndex('entityId', 'entityId', { unique: false });
      s.createIndex('action', 'action', { unique: false });
      s.createIndex('timestamp', 'timestamp', { unique: false });
    }
    // meta (single-row metadata store)
    if (!db.objectStoreNames.contains(STORES.meta)) {
      db.createObjectStore(STORES.meta, { keyPath: 'key' });
    }
  },
  // Future migrations add keys like:
  // 2: (db, tx) => { ... additive only ... },
};

/**
 * Apply migrations from `fromVersion` (exclusive) up to `toVersion` (inclusive).
 */
export function applyMigrations(db, tx, fromVersion, toVersion) {
  for (let v = fromVersion + 1; v <= toVersion; v++) {
    const m = MIGRATIONS[v];
    if (typeof m === 'function') {
      m(db, tx);
    }
  }
}

export default MIGRATIONS;
