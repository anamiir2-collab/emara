// assistant.js — Bonyan assistant (safe guided-command MVP).
// Important: this module creates a reviewable draft only. It never writes to the ledger.
// Financial actions must be completed in the existing collections/expenses forms.
import { el, pageHeader, button } from '../ui.js';
import { toast } from '../notifications.js';
import * as router from '../router.js';

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EN_DIGITS = '0123456789';

function normalizeDigits(value) {
  return String(value || '').replace(/[٠-٩]/g, d => EN_DIGITS[AR_DIGITS.indexOf(d)]);
}

function parseCommand(raw) {
  const text = normalizeDigits(raw).trim();
  const lower = text.toLowerCase();
  const amountMatch = text.match(/(?:جنيه|جنيه(?:ا)?|مبلغ|بقيمة|بمبلغ)?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:جنيه|جنيه(?:ا)?|ج.م)?/i);
  const amount = amountMatch ? Number(amountMatch[1].replace(',', '.')) : null;
  const isExpense = /مصروف|صرف|دفعت للمورد|فاتورة|صيانة|شراء/.test(lower);
  const isPayment = /تحصيل|استلمت|استلم|دفع|دفعت|سدد|سداد/.test(lower);
  const apartmentMatch = text.match(/(?:شقة|وحدة)\s*(?:رقم\s*)?(\d+)/i);
  const nameMatch = text.match(/(?:الساكن|من|السيد|السيدة|أحمد|محمد|محمود|مصطفى|علي|عمر|فاطمة|منى|سارة)\s+([\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,})?)/);
  const date = new Date();
  const kind = isExpense && !isPayment ? 'expense' : isPayment && !isExpense ? 'payment' : 'unknown';
  return {
    raw: text,
    kind,
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    apartment: apartmentMatch ? apartmentMatch[1] : '',
    resident: nameMatch ? nameMatch[1].trim() : '',
    date: date.toISOString().slice(0, 10),
    needsClarification: kind === 'unknown' || !amount || (kind === 'payment' && !apartmentMatch),
  };
}

export async function mount(container) {
  container.appendChild(pageHeader({
    title: 'مساعد بُنيان الذكي',
    subtitle: 'سجّل أوامرك بالصوت أو الكتابة، وراجع التفاصيل قبل الانتقال للتسجيل',
  }));

  const wrap = el('section', { class: 'bonyan-assistant' });
  const intro = el('div', { class: 'bonyan-assistant__intro' });
  intro.appendChild(el('div', { class: 'bonyan-assistant__mark', text: 'ب' }));
  const introText = el('div');
  introText.appendChild(el('h2', { text: 'أهلاً، أنا مساعد بُنيان' }));
  introText.appendChild(el('p', { text: 'اكتب الأمر أو استخدم الميكروفون. سأجهز ملخصًا للمراجعة، ولن أسجل أي حركة مالية تلقائيًا.' }));
  intro.appendChild(introText);
  wrap.appendChild(intro);

  const examples = el('div', { class: 'bonyan-assistant__examples' });
  examples.appendChild(el('span', { class: 'muted', text: 'جرّب مثلًا:' }));
  const exampleBtn = button('سجل تحصيل ٤٠٠ جنيه لشقة ٦', {
    variant: 'secondary',
    onClick: () => { input.value = 'سجل تحصيل ٤٠٠ جنيه لشقة ٦'; input.focus(); },
  });
  examples.appendChild(exampleBtn);
  wrap.appendChild(examples);

  const form = el('div', { class: 'bonyan-assistant__form' });
  const input = el('textarea', {
    class: 'input bonyan-assistant__input',
    rows: '3',
    placeholder: 'مثال: سجل تحصيل ٤٠٠ جنيه لشقة ٦ عن شهر أكتوبر',
    'aria-label': 'اكتب الأمر للمساعد',
  });
  form.appendChild(input);

  const actions = el('div', { class: 'bonyan-assistant__actions' });
  const micBtn = button('تحدث 🎙', { variant: 'secondary', onClick: () => startVoice(input, micBtn) });
  const analyzeBtn = button('فهم الأمر', { variant: 'primary', onClick: () => renderDraft(input.value) });
  actions.append(micBtn, analyzeBtn);
  form.appendChild(actions);
  wrap.appendChild(form);

  const status = el('p', { class: 'bonyan-assistant__status', text: 'المساعد التجريبي: قد لا يفهم كل صيغ اللهجة المصرية بعد.' });
  wrap.appendChild(status);
  const draftHost = el('div', { class: 'bonyan-assistant__draft-host' });
  wrap.appendChild(draftHost);
  container.appendChild(wrap);

  function renderDraft(raw) {
    draftHost.replaceChildren();
    if (!raw.trim()) {
      toast('اكتب الأمر أولًا أو سجله بالصوت.');
      return;
    }
    const draft = parseCommand(raw);
    const card = el('div', { class: 'card bonyan-assistant__draft' });
    card.appendChild(el('h3', { text: 'راجع الأمر قبل المتابعة' }));
    card.appendChild(el('p', { class: 'muted', text: 'النص الذي تم فهمه:' }));
    card.appendChild(el('blockquote', { class: 'bonyan-assistant__quote', text: draft.raw }));
    const rows = [
      ['نوع العملية', draft.kind === 'payment' ? 'تحصيل دفعة' : draft.kind === 'expense' ? 'مصروف' : 'غير واضح'],
      ['المبلغ', draft.amount ? draft.amount.toLocaleString('ar-EG', { maximumFractionDigits: 2 }) + ' جنيه' : 'لم يتم تحديده'],
      ['رقم الشقة', draft.apartment || 'لم يتم تحديده'],
      ['اسم الساكن', draft.resident || 'لم يتم تحديده'],
      ['التاريخ', draft.date],
    ];
    const list = el('dl', { class: 'bonyan-assistant__details' });
    for (const [label, value] of rows) {
      list.append(el('dt', { text: label }), el('dd', { text: value }));
    }
    card.appendChild(list);
    if (draft.needsClarification) {
      card.appendChild(el('p', { class: 'bonyan-assistant__warning', text: 'هناك بيانات ناقصة أو ملتبسة. عدّل الأمر بوضوح قبل المتابعة.' }));
    } else {
      card.appendChild(el('p', { class: 'bonyan-assistant__notice', text: 'راجع البيانات. زر المتابعة لن يسجل العملية؛ سينقلك إلى شاشة التسجيل الموجودة لإكمالها بنفسك.' }));
    }
    const footer = el('div', { class: 'bonyan-assistant__actions' });
    footer.appendChild(button('تعديل الأمر', { variant: 'secondary', onClick: () => input.focus() }));
    const proceed = button(draft.kind === 'expense' ? 'متابعة إلى المصروفات' : 'متابعة إلى التحصيلات', {
      variant: 'primary',
      onClick: () => {
        if (draft.needsClarification) {
          toast('صحح البيانات الناقصة أو الملتبسة أولًا.');
          input.focus();
          return;
        }
        toast('لم يتم تسجيل أي عملية. أكمل المراجعة في شاشة التسجيل.');
        router.navigate(draft.kind === 'expense' ? '/expenses' : '/collections');
      },
    });
    if (draft.needsClarification) proceed.disabled = true;
    footer.appendChild(proceed);
    card.appendChild(footer);
    draftHost.appendChild(card);
  }
}

function startVoice(input, micBtn) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    toast('التعرف الصوتي غير مدعوم في هذا المتصفح. يمكنك كتابة الأمر بدلًا من ذلك.');
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = 'ar-EG';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  micBtn.disabled = true;
  micBtn.textContent = 'جارٍ الاستماع…';
  recognition.onresult = event => {
    input.value = event.results?.[0]?.[0]?.transcript || '';
    input.focus();
  };
  recognition.onerror = event => {
    toast(event.error === 'not-allowed' ? 'لم يتم السماح باستخدام الميكروفون.' : 'تعذر فهم التسجيل. جرّب الكتابة أو أعد المحاولة.');
  };
  recognition.onend = () => {
    micBtn.disabled = false;
    micBtn.textContent = 'تحدث 🎙';
  };
  try { recognition.start(); }
  catch (_) {
    micBtn.disabled = false;
    micBtn.textContent = 'تحدث 🎙';
    toast('تعذر بدء التسجيل الآن.');
  }
}
