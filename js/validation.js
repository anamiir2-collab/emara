// validation.js — Form & input validation helpers
// Pure functions; no DOM access. Returns { ok, errors } objects.

import { APARTMENT_TYPES, PAYMENT_METHODS, EXPENSE_CATEGORIES } from './config.js';

export function isNonEmpty(s) {
  return typeof s === 'string' && s.trim().length > 0;
}

export function isPositiveInt(n) {
  return Number.isInteger(n) && n > 0;
}

export function isNonNegInt(n) {
  return Number.isInteger(n) && n >= 0;
}

/** Parse user input "1234.56" EGP into integer piastres. */
export function parseEgp(input) {
  if (input == null) return null;
  if (typeof input === 'number') return Math.round(input * 100);
  const s = String(input).trim().replace(/[^\d.\-]/g, '');
  if (s === '' || s === '-' || s === '.') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Format integer piastres as Arabic EGP string. */
export function formatEgp(piastres) {
  const v = Number(piastres) || 0;
  const egp = v / 100;
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(egp);
}

/** Format integer piastres as plain "1,234.56" without currency symbol. */
export function formatNumber(piastres) {
  const v = (Number(piastres) || 0) / 100;
  return new Intl.NumberFormat('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

/** Parse a YYYY-MM-DD string into a timestamp (midnight UTC). */
export function parseDate(s) {
  if (!s) return null;
  // Accept yyyy-mm-dd
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(d.getTime())) return null;
  return d.getTime();
}

export function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export function formatDateShort(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    timeZone: 'UTC',
  }).format(d);
}

/** Sanitize phone: digits only, leading + allowed. */
export function sanitizePhone(s) {
  if (!s) return '';
  return String(s).replace(/[^\d+]/g, '');
}

export function validatePhone(s) {
  const p = sanitizePhone(s);
  return p.length >= 7 && p.length <= 15;
}

export function validateEmail(s) {
  if (!s) return true; // optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
}

export function validateBuilding(rec) {
  const errors = {};
  if (!isNonEmpty(rec.name)) errors.name = 'الاسم مطلوب';
  if (rec.floors != null && rec.floors !== '' && !Number.isInteger(+rec.floors)) {
    errors.floors = 'عدد الأدوار يجب أن يكون رقمًا صحيحًا';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateApartment(rec) {
  const errors = {};
  if (!isNonEmpty(rec.number)) errors.number = 'رقم الوحدة مطلوب';
  if (!rec.buildingId) errors.buildingId = 'المبنى مطلوب';
  if (!APARTMENT_TYPES.some(t => t.id === rec.type)) errors.type = 'النوع غير صالح';
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateResident(rec) {
  const errors = {};
  if (!isNonEmpty(rec.name)) errors.name = 'الاسم مطلوب';
  if (rec.phone && !validatePhone(rec.phone)) errors.phone = 'رقم هاتف غير صالح';
  if (rec.email && !validateEmail(rec.email)) errors.email = 'بريد إلكتروني غير صالح';
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateContract(rec) {
  const errors = {};
  if (!rec.apartmentId) errors.apartmentId = 'الوحدة مطلوبة';
  if (!rec.tenantId) errors.tenantId = 'المستأجر مطلوب';
  const start = parseDate(rec.startDate);
  const end = parseDate(rec.endDate);
  if (!start) errors.startDate = 'تاريخ البداية غير صالح';
  if (!end) errors.endDate = 'تاريخ النهاية غير صالح';
  if (start && end && end < start) errors.endDate = 'تاريخ النهاية قبل البداية';
  const rent = parseEgp(rec.rentValue);
  if (rent == null || rent <= 0) errors.rentValue = 'قيمة الإيجار غير صحيحة';
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validatePayment(rec) {
  const errors = {};
  if (!rec.obligationId) errors.obligationId = 'الالتزام مطلوب';
  const amt = parseEgp(rec.amount);
  if (amt == null || amt <= 0) errors.amount = 'المبلغ غير صحيح';
  if (!parseDate(rec.date)) errors.date = 'التاريخ غير صالح';
  if (!PAYMENT_METHODS.some(m => m.id === rec.method)) errors.method = 'الطريقة غير صحيحة';
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateExpense(rec) {
  const errors = {};
  if (!rec.buildingId) errors.buildingId = 'المبنى مطلوب';
  if (!EXPENSE_CATEGORIES.includes(rec.category)) errors.category = 'التصنيف غير صالح';
  const amt = parseEgp(rec.amount);
  if (amt == null || amt <= 0) errors.amount = 'المبلغ غير صحيح';
  if (!parseDate(rec.date)) errors.date = 'التاريخ غير صالح';
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateMaintenance(rec) {
  const errors = {};
  if (!isNonEmpty(rec.title)) errors.title = 'العنوان مطلوب';
  if (!rec.buildingId) errors.buildingId = 'المبنى مطلوب';
  return { ok: Object.keys(errors).length === 0, errors };
}

export default {
  isNonEmpty, isPositiveInt, isNonNegInt,
  parseEgp, formatEgp, formatNumber,
  parseDate, formatDate, formatDateShort,
  sanitizePhone, validatePhone, validateEmail,
  validateBuilding, validateApartment, validateResident, validateContract,
  validatePayment, validateExpense, validateMaintenance,
};
