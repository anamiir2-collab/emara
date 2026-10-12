// whatsapp.js — Build editable wa.me links.
// NEVER auto-sends. Always opens WhatsApp with a pre-filled, URL-encoded message
// that the user can review and edit before sending.

import { formatEgp, formatDateShort } from './validation.js';
import { APP_CONFIG } from './config.js';

/**
 * Normalize a phone number to international digits (no leading +, no spaces).
 * Assumes Egyptian numbers without country code start with 0; replaces 0 with default CC.
 */
export function normalizePhone(phone, countryCode = APP_CONFIG.defaultCountryCode) {
  if (!phone) return '';
  let s = String(phone).replace(/[^\d]/g, '');
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('0')) s = countryCode + s.slice(1);
  return s;
}

/**
 * Build a wa.me URL.
 * @param {string} phone  raw phone (will be normalized)
 * @param {string} text   pre-filled message text
 */
export function buildWaLink(phone, text) {
  const p = normalizePhone(phone);
  const t = encodeURIComponent(text || '');
  if (!p) return `https://wa.me/?text=${t}`;
  return `https://wa.me/${p}?text=${t}`;
}

/** Compose a payment-confirmation message. */
export function paymentMessage({ residentName, buildingName, apartmentNumber, period, amountPiastres, receiptNumber, date }) {
  const lines = [
    `السلام عليكم ${residentName || ''}`.trim(),
    `نؤكد استلام دفعة (${period || ''}) للوحدة رقم ${apartmentNumber || ''} – ${buildingName || ''}`.trim(),
    `المبلغ: ${formatEgp(amountPiastres)}`,
    `رقم الإيصال: ${receiptNumber}`,
    `التاريخ: ${formatDateShort(date)}`,
    `شكرًا لتعاونكم.`,
    `— ${APP_CONFIG.name}`,
  ];
  return lines.join('\n');
}

/** Compose an outstanding-balance reminder. */
export function outstandingMessage({ residentName, buildingName, apartmentNumber, outstandingPiastres, dueDate }) {
  const lines = [
    `السلام عليكم ${residentName || ''}`.trim(),
    `تذكير: يوجد مبالغ مستحقة بقيمة ${formatEgp(outstandingPiastres)} للوحدة ${apartmentNumber || ''} – ${buildingName || ''}`.trim(),
    dueDate ? `تاريخ الاستحقاق: ${formatDateShort(dueDate)}` : '',
    `يرجى السداد في أقرب وقت. شكرًا لتفهمكم.`,
    `— ${APP_CONFIG.name}`,
  ].filter(Boolean);
  return lines.join('\n');
}

/** Compose a maintenance-update message. */
export function maintenanceMessage({ residentName, title, status, scheduledAt, notes }) {
  const lines = [
    `السلام عليكم ${residentName || ''}`.trim(),
    `تحديث بخصوص طلب الصيانة: ${title || ''}`,
    `الحالة: ${status || ''}`,
    scheduledAt ? `الموعد: ${formatDateShort(scheduledAt)}` : '',
    notes ? `ملاحظات: ${notes}` : '',
    `— ${APP_CONFIG.name}`,
  ].filter(Boolean);
  return lines.join('\n');
}

/**
 * Open WhatsApp in a new tab with the prefilled message.
 * The user can edit the text inside WhatsApp before sending.
 */
export function openWhatsApp(phone, text) {
  const url = buildWaLink(phone, text);
  window.open(url, '_blank', 'noopener,noreferrer');
  return url;
}

export default { normalizePhone, buildWaLink, paymentMessage, outstandingMessage, maintenanceMessage, openWhatsApp };
