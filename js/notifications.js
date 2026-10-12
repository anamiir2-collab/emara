// notifications.js — Lightweight toast & inline notification system.
// No external deps. Respects prefers-reduced-motion via CSS.

const CONTAINER_ID = 'emara-toasts';

function ensureContainer() {
  let el = document.getElementById(CONTAINER_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = CONTAINER_ID;
    el.className = 'toast-stack';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Show a toast.
 * @param {string} message
 * @param {object} [opts]  { type: 'info'|'success'|'warn'|'error', duration: 3500, action: {label, cb} }
 */
export function toast(message, opts = {}) {
  const stack = ensureContainer();
  const { type = 'info', duration = 3500, action = null } = opts;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', 'status');
  el.innerHTML = '';
  const msg = document.createElement('span');
  msg.className = 'toast__msg';
  msg.textContent = message;
  el.appendChild(msg);
  if (action && action.label) {
    const btn = document.createElement('button');
    btn.className = 'toast__action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      try { action.cb && action.cb(); } finally { dismiss(); }
    });
    el.appendChild(btn);
  }
  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast__close';
  closeBtn.setAttribute('aria-label', 'إغلاق');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', dismiss);
  el.appendChild(closeBtn);
  stack.appendChild(el);
  // animate in
  requestAnimationFrame(() => el.classList.add('is-visible'));

  let timer = null;
  if (duration > 0) timer = setTimeout(dismiss, duration);

  function dismiss() {
    if (timer) clearTimeout(timer);
    el.classList.remove('is-visible');
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 250);
  }
  return dismiss;
}

export function info(msg, opts) { return toast(msg, { ...opts, type: 'info' }); }
export function success(msg, opts) { return toast(msg, { ...opts, type: 'success' }); }
export function warn(msg, opts) { return toast(msg, { ...opts, type: 'warn' }); }
export function error(msg, opts) { return toast(msg, { ...opts, type: 'error', duration: 6000 }); }

/**
 * Confirm modal (Promise-based). Returns true if user confirmed.
 */
export function confirmDialog({ title, message, confirmLabel = 'تأكيد', cancelLabel = 'إلغاء', danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h3 id="modal-title" class="modal-card__title">${escapeHtml(title)}</h3>
        <p class="modal-card__body">${escapeHtml(message)}</p>
        <div class="modal-card__actions">
          <button class="btn btn--ghost" data-act="cancel">${escapeHtml(cancelLabel)}</button>
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-act="ok">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-visible'));
    function close(value) {
      overlay.classList.remove('is-visible');
      setTimeout(() => overlay.remove(), 200);
      resolve(value);
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
      const act = e.target?.getAttribute?.('data-act');
      if (act === 'ok') close(true);
      else if (act === 'cancel') close(false);
    });
    // Esc to cancel
    const onKey = (e) => { if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

export default { toast, info, success, warn, error, confirmDialog };
