// dashboard.js — Home dashboard with KPIs & recent activity.

import * as db from '../database.js';
import { STORES } from '../config.js';
import * as calc from '../calculations.js';
import * as ledger from '../ledger.js';
import { el, icon, pageHeader, statTile, card, formatEgp, formatDateShort, emptyState } from '../ui.js';
import * as router from '../router.js';

export async function mount(container, ctx) {
  container.appendChild(pageHeader({
    title: 'الرئيسية',
    subtitle: 'نظرة عامة على أداء المحفظة العقارية',
  }));

  const grid = el('div', { class: 'kpi-grid' });
  container.appendChild(grid);
  const loading = el('div', { class: 'page-loading', text: 'جارٍ تحميل البيانات…' });
  grid.appendChild(loading);

  try {
    const [buildings, apartments, residents, contracts, obligations, payments, expenses] = await Promise.all([
      db.getAll(STORES.buildings),
      db.getAll(STORES.apartments),
      db.getAll(STORES.residents),
      db.getAll(STORES.contracts),
      db.getAll(STORES.obligations),
      db.getAll(STORES.payments),
      db.getAll(STORES.expenses),
    ]);

    const activeBuildings = buildings.filter(b => !b.archived).length;
    const occupiedApartments = apartments.filter(a => a.occupied).length;
    const occupancyRate = apartments.length ? Math.round((occupiedApartments / apartments.length) * 100) : 0;
    const activeContracts = contracts.filter(c => c.status === 'active').length;
    const outstanding = calc.outstandingBalance(obligations, payments);
    const collectionsTotal = calc.sumPayments(payments);
    const paidExpensesTotal = calc.sumPaidExpenses(expenses);
    const openingCash = await db.getSetting('opening_cash_piastres', 0) || 0;
    const cashBalance = calc.cashBalance(openingCash, collectionsTotal, paidExpensesTotal);

    clear(grid);

    grid.appendChild(statTile({
      label: 'المباني النشطة',
      value: String(activeBuildings),
      hint: `${buildings.length} إجمالي`,
    }));
    grid.appendChild(statTile({
      label: 'الوحدات المشغولة',
      value: `${occupiedApartments}/${apartments.length}`,
      hint: `نسبة الإشغال ${occupancyRate}%`,
    }));
    grid.appendChild(statTile({
      label: 'عقود سارية',
      value: String(activeContracts),
      hint: `${contracts.length} إجمالي`,
    }));
    grid.appendChild(statTile({
      label: 'إجمالي التحصيلات',
      value: formatEgp(collectionsTotal),
      hint: 'كل المدفوعات السارية',
      variant: 'success',
    }));
    grid.appendChild(statTile({
      label: 'إجمالي المصروفات المدفوعة',
      value: formatEgp(paidExpensesTotal),
      hint: 'مصروفات خرجت بالفعل',
      variant: 'warn',
    }));
    grid.appendChild(statTile({
      label: 'المستحقات غير المحصلة',
      value: formatEgp(outstanding),
      hint: 'إجمالي الالتزامات ناقص المدفوع',
      variant: outstanding > 0 ? 'danger' : '',
    }));
    grid.appendChild(statTile({
      label: 'الرصيد النقدي الحالي',
      value: formatEgp(cashBalance),
      hint: 'افتتاحي + تحصيلات − مصروفات مدفوعة',
      variant: 'primary',
    }));
    grid.appendChild(statTile({
      label: 'عدد السكان',
      value: String(residents.length),
      hint: 'مالكون ومستأجرون',
    }));

    // Recent payments
    const recentPayments = [...payments]
      .filter(p => !p.reversed)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 6);
    const recentCard = card({ title: 'أحدث التحصيلات' });
    if (recentPayments.length === 0) {
      recentCard.appendChild(el('p', { class: 'muted', text: 'لا توجد تحصيلات بعد.' }));
    } else {
      const list = el('ul', { class: 'recent-list' });
      const oblMap = new Map(obligations.map(o => [o.id, o]));
      for (const p of recentPayments) {
        const o = oblMap.get(p.obligationId);
        const li = el('li', { class: 'recent-item' }, [
          el('div', { class: 'recent-item__icon' }, [icon('wallet', { size: 18 })]),
          el('div', { class: 'recent-item__body' }, [
            el('div', { class: 'recent-item__title', text: o ? o.notes : 'دفعة' }),
            el('div', { class: 'recent-item__sub', text: formatDateShort(p.date) }),
          ]),
          el('div', { class: 'recent-item__amount', text: formatEgp(p.amountPiastres) }),
        ]);
        list.appendChild(li);
      }
      recentCard.appendChild(list);
    }
    container.appendChild(el('div', { class: 'dashboard-cols' }, [
      recentCard,
      card({
        title: 'إجراءات سريعة',
        body: (() => {
          const wrap = el('div', { class: 'quick-actions' });
          const actions = [
            { label: 'تحصيل دفعة', icon: 'wallet', path: '/collections' },
            { label: 'تسجيل مصروف', icon: 'cart', path: '/expenses' },
            { label: 'طلب صيانة', icon: 'wrench', path: '/maintenance' },
            { label: 'عرض التقارير', icon: 'chart', path: '/reports' },
            { label: 'إيصالات', icon: 'receipt', path: '/receipts' },
            { label: 'إعدادات', icon: 'gear', path: '/settings' },
          ];
          for (const a of actions) {
            const b = el('button', { class: 'quick-action' });
            b.appendChild(icon(a.icon, { size: 20 }));
            b.appendChild(el('span', { text: a.label }));
            b.addEventListener('click', () => router.navigate(a.path));
            wrap.appendChild(b);
          }
          return wrap;
        })(),
      }),
    ]));

  } catch (err) {
    console.error(err);
    clear(grid);
    grid.appendChild(emptyState({
      icon: 'alert', title: 'تعذر تحميل البيانات',
      message: err.message || String(err),
    }));
  }
}

export function unmount() { /* nothing to clean */ }

function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
}
