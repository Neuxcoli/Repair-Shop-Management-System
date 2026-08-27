// ---------- Shared formatting helpers ----------
export const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
export const dateFmt = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const STATUS_BADGE = {
  requested: 'grey', diagnosed: 'blue', approved: 'amber',
  in_progress: 'amber', on_hold: 'amber', completed: 'green',
  invoiced: 'blue', closed: 'green', cancelled: 'rose', rejected: 'rose',
};
export const PRIORITY_BADGE = { low: 'grey', normal: 'grey', high: 'amber', urgent: 'rose' };
export const INVOICE_BADGE = { unpaid: 'rose', partially_paid: 'amber', paid: 'green', void: 'grey' };
export const TECH_BADGE = { active: 'green', inactive: 'grey' };

export const label = (s) => String(s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function badge(kind, text) {
  return `<span class="badge badge-${kind}"><span class="bdot"></span>${esc(text)}</span>`;
}

export function initials(name) {
  return name.split(/[\s_.-]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: 'bi-check-circle-fill', error: 'bi-exclamation-circle-fill', info: 'bi-info-circle-fill' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<i class="toast-icon bi ${icons[type] || icons.info}"></i><span>${esc(message)}</span>`;
  container.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}
