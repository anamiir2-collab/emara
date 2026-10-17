// config.js — Application configuration & constants
// Central place for app-wide constants. Imported by nearly every module.

export const APP_CONFIG = {
  name: 'عِمارة',
  nameLatin: 'Emara',
  tagline: 'نظام إدارة العقارات',
  version: '1.0.0',
  dbVersion: 1,
  dbName: 'emara_db',
  defaultCurrency: 'EGP',
  locale: 'ar-EG',
  direction: 'rtl',
  // GitHub Pages safe root (relative)
  base: './',
  // PWA
  swPath: './service-worker.js',
  manifestPath: './manifest.webmanifest',
  // Number formatting
  piastresPerUnit: 100,
  // WhatsApp default country code (Egypt)
  defaultCountryCode: '20',
};

// IndexedDB object stores
export const STORES = {
  buildings: 'buildings',
  apartments: 'apartments',
  residents: 'residents',
  contracts: 'contracts',
  obligations: 'obligations',
  payments: 'payments',
  expenses: 'expenses',
  maintenance: 'maintenance',
  receipts: 'receipts',
  settings: 'settings',
  audit: 'audit',
  meta: 'meta',
};

// Expense categories
export const EXPENSE_CATEGORIES = [
  'صيانة',
  'نظافة',
  'كهرباء',
  'مياه',
  'غاز',
  'مصاريف إدارية',
  'رواتب',
  'أمن',
  'أخرى',
];

// Maintenance priorities
export const MAINTENANCE_PRIORITIES = [
  { id: 'low', label: 'منخفضة' },
  { id: 'medium', label: 'متوسطة' },
  { id: 'high', label: 'عالية' },
  { id: 'urgent', label: 'عاجلة' },
];

// Maintenance statuses
export const MAINTENANCE_STATUSES = [
  { id: 'open', label: 'مفتوح' },
  { id: 'in_progress', label: 'قيد التنفيذ' },
  { id: 'done', label: 'مكتمل' },
  { id: 'cancelled', label: 'ملغى' },
];

// Contract statuses
export const CONTRACT_STATUSES = [
  { id: 'active', label: 'ساري' },
  { id: 'expired', label: 'منتهي' },
  { id: 'terminated', label: 'مفسوخ' },
  { id: 'upcoming', label: 'قادم' },
];

// Apartment types
export const APARTMENT_TYPES = [
  { id: 'ownership', label: 'تمليك' },
  { id: 'rental', label: 'إيجار' },
];

// Payment methods
export const PAYMENT_METHODS = [
  { id: 'cash', label: 'نقدي' },
  { id: 'bank', label: 'تحويل بنكي' },
  { id: 'wallet', label: 'محفظة إلكترونية' },
  { id: 'cheque', label: 'شيك' },
];

// Obligation types
export const OBLIGATION_TYPES = [
  { id: 'rent', label: 'إيجار' },
  { id: 'association_fee', label: 'اشتراك اتحاد الملاك' },
  { id: 'other', label: 'أخرى' },
];

// Default settings applied on first launch
export const DEFAULT_SETTINGS = {
  theme: 'light',
  language: 'ar',
  opening_cash_piastres: 0,
  org_name: 'عِمارة',
  org_phone: '',
  receipt_prefix: 'REC',
  receipt_next: 1,
  enable_notifications: true,
};

// Color palette — also reflected in CSS variables
export const PALETTE = {
  forest: '#1f5f3f',
  forestDark: '#174527',
  forestLight: '#2f8a5a',
  ivory: '#f7f3e8',
  ivoryDark: '#efe9d5',
  cream: '#fbf8f1',
  ink: '#1a1a1a',
  inkSoft: '#3d4a3d',
  muted: '#7a8a7a',
  border: '#d8d2c2',
  danger: '#b3261e',
  warn: '#c77700',
  success: '#2e7d32',
  info: '#1f6feb',
};

// Route registry — used by router & nav rendering
export const ROUTES = [
  { path: '/', label: 'الرئيسية', icon: 'home', module: 'dashboard' },
  { path: '/buildings', label: 'المباني', icon: 'building', module: 'buildings' },
  { path: '/apartments', label: 'الوحدات', icon: 'door', module: 'apartments' },
  { path: '/residents', label: 'السكان', icon: 'users', module: 'residents' },
  { path: '/contracts', label: 'العقود', icon: 'doc', module: 'contracts' },
  { path: '/obligations', label: 'الالتزامات', icon: 'list', module: 'obligations' },
  { path: '/collections', label: 'التحصيلات', icon: 'wallet', module: 'collections' },
  { path: '/expenses', label: 'المصروفات', icon: 'cart', module: 'expenses' },
  { path: '/maintenance', label: 'الصيانة', icon: 'wrench', module: 'maintenance' },
  { path: '/receipts', label: 'الإيصالات', icon: 'receipt', module: 'receipts' },
  { path: '/reports', label: 'التقارير', icon: 'chart', module: 'reports' },
  { path: '/assistant', label: 'مساعد بُنيان الذكي', icon: 'user', module: 'assistant' },
  { path: '/portal', label: 'بوابة الساكن', icon: 'user', module: 'resident-portal' },
  { path: '/settings', label: 'الإعدادات', icon: 'gear', module: 'settings' },
];

export default APP_CONFIG;
