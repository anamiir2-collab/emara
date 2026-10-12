// settings.js — Org settings, theme, opening cash, receipt prefix, backup/restore, data management.

import * as db from '../database.js';
import { STORES, APP_CONFIG, DEFAULT_SETTINGS } from '../config.js';
import { parseEgp, formatEgp } from '../validation.js';
import { el, icon, pageHeader, button, card } from '../ui.js';
import { toast, confirmDialog } from '../notifications.js';
import * as backup from '../backup.js';
import * as exportCsv from '../export.js';

export async function mount(container, ctx) {
  container.appendChild(pageHeader({
    title: 'الإعدادات',
    subtitle: 'التفضيلات والنسخ الاحتياطي والبيانات',
  }));

  container.appendChild(await buildOrgCard());
  container.appendChild(await buildDisplayCard());
  container.appendChild(buildBackupCard());
  container.appendChild(buildDataCard());
  container.appendChild(buildAboutCard());
}

async function buildOrgCard() {
  const opening = await db.getSetting('opening_cash_piastres', 0);
  const prefix = await db.getSetting('receipt_prefix', 'REC');
  const orgName = await db.getSetting('org_name', APP_CONFIG.name);
  const orgPhone = await db.getSetting('org_phone', '');

  const c = card({ title: 'بيانات الجهة', cls: 'settings-card' });
  const form = el('div', { class: 'form' });

  const orgNameInput = field('اسم الجهة', orgName);
  const orgPhoneInput = field('هاتف الجهة', orgPhone);
  const openingInput = field('الرصيد الافتتاحي (ج.م)', (opening || 0) / 100, 'number');
  const prefixInput = field('بادئة الإيصال', prefix);

  form.appendChild(orgNameInput.wrap);
  form.appendChild(orgPhoneInput.wrap);
  form.appendChild(openingInput.wrap);
  form.appendChild(prefixInput.wrap);
  form.appendChild(button('حفظ البيانات', { variant: 'primary', icon: 'check', onClick: async () => {
    await db.setSetting('org_name', orgNameInput.input.value.trim() || APP_CONFIG.name);
    await db.setSetting('org_phone', orgPhoneInput.input.value.trim());
    await db.setSetting('opening_cash_piastres', parseEgp(openingInput.input.value) || 0);
    await db.setSetting('receipt_prefix', (prefixInput.input.value.trim() || 'REC').toUpperCase());
    toast('تم حفظ البيانات.', { type: 'success' });
  } }));
  c.appendChild(form);
  return c;
}

async function buildDisplayCard() {
  const theme = await db.getSetting('theme', 'light');
  const c = card({ title: 'المظهر', cls: 'settings-card' });
  const seg = el('div', { class: 'segmented' });
  for (const opt of [{id:'light',label:'فاتح'},{id:'dark',label:'داكن'}]) {
    const b = el('button', {
      class: 'segmented__btn' + (theme === opt.id ? ' is-active' : ''),
      text: opt.label,
      onClick: async () => {
        await db.setSetting('theme', opt.id);
        document.documentElement.setAttribute('data-theme', opt.id);
        seg.querySelectorAll('.segmented__btn').forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active');
        toast('تم تحديث المظهر.', { type: 'success' });
      }
    });
    seg.appendChild(b);
  }
  c.appendChild(seg);
  return c;
}

function buildBackupCard() {
  const c = card({ title: 'النسخ الاحتياطي والاستعادة', cls: 'settings-card' });
  c.appendChild(el('p', { class: 'muted', text: 'أنشئ نسخة احتياطية كاملة بصيغة JSON تشمل كل السجلات والإعدادات. يُنصح بإنشاء نسخة قبل أي استبدال.' }));

  const actions = el('div', { class: 'button-row' });
  actions.appendChild(button('تنزيل نسخة احتياطية', { variant: 'primary', icon: 'download', onClick: async () => {
    try { await backup.downloadBackup(); toast('تم تنزيل النسخة الاحتياطية.', { type: 'success' }); }
    catch (e) { toast('فشل التنزيل: ' + (e.message || e), { type: 'error' }); }
  } }));

  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  actions.appendChild(fileInput);
  actions.appendChild(button('استيراد نسخة (دمج)', { variant: 'ghost', icon: 'upload', onClick: () => fileInput.click() }));
  actions.appendChild(button('استيراد نسخة (استبدال)', { variant: 'danger', icon: 'upload', onClick: async () => {
    const ok = await confirmDialog({
      title: 'استبدال كل البيانات',
      message: 'سيتم مسح كل البيانات الحالية واستبدالها بالنسخة المستوردة. يُنصح بشدة بإنشاء نسخة احتياطية أولًا. لا يمكن التراجع.',
      confirmLabel: 'متابعة الاستبدال', cancelLabel: 'إلغاء', danger: true,
    });
    if (ok) {
      _pendingImportMode = 'replace';
      fileInput.click();
    }
  } }));

  let _pendingImportMode = 'merge';
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const obj = await backup.readBackupFile(file);
      const v = backup.validateBackup(obj);
      if (!v.ok) {
        toast('ملف غير صالح: ' + v.errors.join(' '), { type: 'error', duration: 8000 });
        return;
      }
      const mode = _pendingImportMode;
      const counts = await backup.applyBackup(v.snapshot, { mode });
      toast(`تم الاستيراد (${mode === 'merge' ? 'دمج' : 'استبدال'}) بنجاح.`, { type: 'success', duration: 5000 });
      console.log('Import counts:', counts);
      // Reload after a short delay so toasts can be read
      setTimeout(() => location.reload(), 1500);
    } catch (err) {
      toast('فشل الاستيراد: ' + (err.message || err), { type: 'error', duration: 8000 });
    } finally {
      fileInput.value = '';
      _pendingImportMode = 'merge';
    }
  });

  c.appendChild(actions);
  return c;
}

function buildDataCard() {
  const c = card({ title: 'تصدير البيانات', cls: 'settings-card' });
  const actions = el('div', { class: 'button-row' });
  actions.appendChild(button('تصدير السكان (CSV)', { variant: 'ghost', icon: 'download', onClick: () => exportCsv.exportResidentsCsv() }));
  actions.appendChild(button('تصدير التحصيلات (CSV)', { variant: 'ghost', icon: 'download', onClick: () => exportCsv.exportPaymentsCsv() }));
  actions.appendChild(button('تصدير المصروفات (CSV)', { variant: 'ghost', icon: 'download', onClick: () => exportCsv.exportExpensesCsv() }));
  actions.appendChild(button('تصدير المستحقات (CSV)', { variant: 'ghost', icon: 'download', onClick: () => exportCsv.exportOutstandingCsv() }));
  c.appendChild(actions);

  c.appendChild(el('hr', { class: 'divider' }));
  c.appendChild(el('h3', { class: 'card__title', text: 'إدارة التخزين', style: { marginTop: '8px' } }));
  c.appendChild(el('p', { class: 'muted', text: 'مسح كل البيانات لا يمكن التراجع عنه. ينصح بتنزيل نسخة احتياطية أولًا.' }));
  c.appendChild(button('مسح كل البيانات', { variant: 'danger', icon: 'trash', onClick: async () => {
    const ok = await confirmDialog({
      title: 'مسح كل البيانات',
      message: 'سيتم حذف كل السجلات نهائيًا. هل أنت متأكد؟',
      confirmLabel: 'مسح', cancelLabel: 'إلغاء', danger: true,
    });
    if (!ok) return;
    for (const s of Object.values(STORES)) {
      await db.clearStore(s);
    }
    toast('تم مسح كل البيانات.', { type: 'success' });
    setTimeout(() => location.reload(), 1200);
  } }));
  return c;
}

function buildAboutCard() {
  const c = card({ title: 'حول التطبيق', cls: 'settings-card' });
  c.appendChild(el('div', { class: 'about-grid' }, [
    el('div', {}, [el('div', { class: 'muted', text: 'الاسم' }), el('div', { text: APP_CONFIG.name + ' | ' + APP_CONFIG.nameLatin })]),
    el('div', {}, [el('div', { class: 'muted', text: 'الإصدار' }), el('div', { text: APP_CONFIG.version })]),
    el('div', {}, [el('div', { class: 'muted', text: 'قاعدة البيانات' }), el('div', { text: 'IndexedDB محلي' })]),
    el('div', {}, [el('div', { class: 'muted', text: 'الترخيص' }), el('div', { text: 'استخدام شخصي/تجاري' })]),
  ]));
  c.appendChild(el('p', { class: 'muted', text: 'يعمل التطبيق بالكامل في المتصفح دون خادم. لا تُرسل أي بيانات خارج الجهاز.' }));
  return c;
}

function field(label, value, type = 'text') {
  const wrap = el('div', { class: 'form-field' });
  wrap.appendChild(el('label', { class: 'form-label', text: label }));
  const input = el('input', { class: 'input', type, value: String(value ?? '') });
  if (type === 'number') input.setAttribute('step', '0.01');
  wrap.appendChild(input);
  return { wrap, input };
}

export function unmount() {}
