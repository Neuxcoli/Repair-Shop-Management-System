import 'bootstrap-icons/font/bootstrap-icons.css';
import { dateFmt, esc, label } from './ui.js';

const STEPS = ['requested', 'diagnosed', 'approved', 'in_progress', 'completed', 'closed'];
const STATUS_INDEX = {
  requested: 0, diagnosed: 1, approved: 2,
  in_progress: 3, on_hold: 3, completed: 4, invoiced: 4, closed: 5,
};
const STATUS_COLOR = {
  requested: '#6b7280', diagnosed: '#2563EB', approved: '#D97706',
  in_progress: '#7C3AED', on_hold: '#D97706', completed: '#059669', invoiced: '#059669', closed: '#059669',
};
const PRIORITY_COLOR = {
  urgent: '#E11D48', high: '#D97706', normal: '#2563EB', low: '#6b7280',
};

function stepper(status) {
  const idx = STATUS_INDEX[status] ?? -1;
  return `<div class="stepper">${STEPS.map((s, i) => `
    <div class="step ${i <= idx ? 'done' : ''}">
      <div class="step-dot">${i <= idx ? '&#10003;' : ''}</div>
      <div class="step-label">${label(s)}</div>
    </div>`).join('')}</div>`;
}

function badge(color, text) {
  return `<span class="badge" style="background:${color}15;color:${color};border-color:${color}30;"><span class="bdot" style="background:${color};"></span>${text}</span>`;
}

const form = document.getElementById('track-form');
const errBox = document.getElementById('track-error');
const result = document.getElementById('track-result');
const btn = document.getElementById('track-btn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  errBox.hidden = true;
  result.innerHTML = '';

  const ro = form.ro_number.value.trim();
  const phone = form.phone.value.trim();
  if (!ro || !phone) {
    errBox.textContent = 'Please enter both an order number and phone number or email.';
    errBox.hidden = false;
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Checking&hellip;';
  try {
    const res = await fetch(`/api/public/track?ro_number=${encodeURIComponent(ro)}&phone=${encodeURIComponent(phone)}`);
    if (!res.ok) {
      throw new Error('No repair order found with that information.');
    }
    render(await res.json());
  } catch (err) {
    errBox.textContent = err.message || 'No repair order found with that information.';
    errBox.hidden = false;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-search"></i> Track Repair';
  }
});

function render(o) {
  const statusColor = STATUS_COLOR[o.status] || '#6b7280';
  const priorityColor = PRIORITY_COLOR[o.priority] || '#6b7280';

  result.innerHTML = `
    <div class="result">
      <div class="result-head">
        <div>
          <div class="result-ro">${esc(o.ro_number)}</div>
          <div class="result-sub">${esc(o.item_description || 'Repair order')}${o.item_identifier ? ` &middot; ${esc(o.item_identifier)}` : ''}</div>
        </div>
        ${badge(statusColor, label(o.status))}
      </div>
      ${['cancelled', 'rejected'].includes(o.status)
        ? `<div style="background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;border-radius:10px;padding:12px 16px;font-size:14px;font-weight:600;margin-bottom:16px;">This repair order was ${o.status}.</div>`
        : stepper(o.status)}
      <div class="detail-grid">
        <div><div class="detail-label">Priority</div><div class="detail-value" style="color:${priorityColor};font-weight:600;">${label(o.priority)}</div></div>
        <div><div class="detail-label">Date Received</div><div class="detail-value">${dateFmt(o.created_at)}</div></div>
        <div><div class="detail-label">Last Updated</div><div class="detail-value">${dateFmt(o.updated_at)}</div></div>
        ${o.released_at ? `<div><div class="detail-label">Released</div><div class="detail-value">${dateFmt(o.released_at)}</div></div>` : ''}
        ${o.completed_at ? `<div><div class="detail-label">Completed</div><div class="detail-value">${dateFmt(o.completed_at)}</div></div>` : ''}
      </div>
    </div>`;

  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
