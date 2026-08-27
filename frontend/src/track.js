import 'bootstrap-icons/font/bootstrap-icons.css';
import './style.css';
import { badge, dateFmt, esc, label, peso, STATUS_BADGE } from './ui.js';

const STEPS = ['requested', 'diagnosed', 'approved', 'in_progress', 'completed', 'closed'];
const STATUS_INDEX = {
  requested: 0, diagnosed: 1, approved: 2,
  in_progress: 3, on_hold: 3, completed: 4, invoiced: 4, closed: 5,
};

function stepper(status) {
  const idx = STATUS_INDEX[status] ?? -1;
  return `<div class="stepper">${STEPS.map((s, i) => `
    <div class="step ${i <= idx ? 'done' : ''}">
      <div class="step-dot">${i <= idx ? '&#10003;' : ''}</div>
      <div class="step-label">${label(s)}</div>
    </div>`).join('')}</div>`;
}

const form = document.getElementById('track-form');
const errBox = document.getElementById('track-error');
const result = document.getElementById('track-result');
const btn = document.getElementById('track-btn');

// Pull a token straight from the URL: /track.html?token=abc123 or a pasted link.
function extractToken(input) {
  const value = String(input ?? '').trim();
  if (!value) return '';
  if (/^[A-Za-z0-9_-]{16,}$/.test(value)) return value;
  const match = value.match(/[?&]token=([A-Za-z0-9_-]+)/);
  return match ? match[1] : value;
}

function goBack() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    result.innerHTML = '';
    errBox.hidden = true;
    form.reset();
    form.token.focus();
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  errBox.hidden = true;
  result.innerHTML = '';
  const token = extractToken(form.token.value);
  if (!token) {
    errBox.textContent = 'Please enter a valid tracking code.';
    errBox.hidden = false;
    return;
  }
  btn.disabled = true;
  btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Checking&hellip;';
  try {
    const res = await fetch(`/api/public/track?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.detail || 'Could not find that order.');
    }
    render(await res.json());
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-search"></i> Track';
  }
});

const urlToken = new URLSearchParams(window.location.search).get('token');
if (urlToken) {
  form.token.value = urlToken;
  form.requestSubmit();
}

function render(o) {
  const parts = o.parts.length
    ? `<div class="track-panel">
        <div class="track-section-title">Parts Used</div>
        <table class="track-table">
          <thead><tr><th>Part</th><th>Qty</th><th>Unit Price</th><th style="text-align:right">Line Total</th></tr></thead>
          <tbody>${o.parts.map((p) => `
            <tr>
              <td>${esc(p.name)}${p.sku ? `<div style="font-size:11px;color:#9ca3af">${esc(p.sku)}</div>` : ''}</td>
              <td>${p.quantity}</td>
              <td>${peso(p.unit_price)}</td>
              <td style="text-align:right">${peso(p.line_total)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div class="track-totals">
          <div><div class="tt-label">Labor</div><div class="tt-value">${peso(o.labor_cost)}</div></div>
          <div><div class="tt-label">Parts</div><div class="tt-value">${peso(o.parts_total)}</div></div>
          <div><div class="tt-label">Total</div><div class="tt-value">${peso(o.quote_total)}</div></div>
        </div>
      </div>`
    : o.labor_cost > 0 || o.estimated_cost > 0 || o.quote_total > 0
      ? `<div class="track-panel">
          <div class="track-section-title">Estimated Cost</div>
          <div class="track-totals">
            <div><div class="tt-label">Labor</div><div class="tt-value">${peso(o.labor_cost)}</div></div>
            <div><div class="tt-label">Total</div><div class="tt-value">${peso(o.estimated_cost ?? o.quote_total)}</div></div>
            ${o.actual_cost != null ? `<div><div class="tt-label">Actual</div><div class="tt-value">${peso(o.actual_cost)}</div></div>` : ''}
          </div>
        </div>`
      : '';

  const invoice = o.invoice
    ? `<div class="track-panel">
        <div class="track-section-title">Payment</div>
        <div>Invoice ${esc(o.invoice.invoice_number)} ${badge(STATUS_BADGE[o.invoice.status] || 'grey', label(o.invoice.status))}</div>
        <div class="pay-status">
          Total ${peso(o.invoice.total)} &middot; Paid ${peso(o.invoice.amount_paid)}
          <b>${o.invoice.balance > 0 ? `&middot; Balance ${peso(o.invoice.balance)}` : '&middot; Fully paid'}</b>
        </div>
      </div>`
    : '';

  const notes = [
    ['Problem Description', o.problem_description],
    ['Inspection Notes', o.inspection_notes],
    ['Diagnosis', o.diagnosis],
    ['Warranty', o.warranty_days ? `${o.warranty_days} days${o.warranty_notes ? ` &middot; ${esc(o.warranty_notes)}` : ''}` : (o.warranty_notes || null)],
  ].filter(([, v]) => v).map(([t, v]) => `
    <div class="track-panel">
      <div class="track-section-title">${t}</div>
      <p>${esc(v)}</p>
    </div>`).join('');

  result.innerHTML = `
    <div class="track-result">
      <div class="track-top">
        <button class="btn btn-primary" id="track-back-btn" type="button"><i class="bi bi-arrow-left"></i> Back</button>
      </div>
      <div class="track-head">
        <div>
          <div class="track-ro">${esc(o.ro_number)}</div>
          <div class="track-sub" style="margin-bottom:0;">${esc(o.item_description || 'Repair order')}${o.item_identifier ? ` &middot; ${esc(o.item_identifier)}` : ''}</div>
        </div>
        ${badge(STATUS_BADGE[o.status] || 'grey', label(o.status))}
      </div>
      ${['cancelled', 'rejected'].includes(o.status) ? `<div class="cancel-banner">This repair order was ${o.status}.</div>` : stepper(o.status)}
      <div class="track-grid">
        <div><div class="track-label">Customer</div><div class="track-value">${esc(o.customer_name)}</div></div>
        <div><div class="track-label">Priority</div><div class="track-value">${label(o.priority)}</div></div>
        <div><div class="track-label">Received</div><div class="track-value">${dateFmt(o.created_at)}</div></div>
        <div><div class="track-label">Last Updated</div><div class="track-value">${dateFmt(o.updated_at)}</div></div>
        ${o.released_at ? `<div><div class="track-label">Released</div><div class="track-value">${dateFmt(o.released_at)}</div></div>` : ''}
        ${o.completed_at ? `<div><div class="track-label">Completed</div><div class="track-value">${dateFmt(o.completed_at)}</div></div>` : ''}
      </div>
      ${notes}
      ${parts}
      ${invoice}
    </div>`;
  document.getElementById('track-back-btn').addEventListener('click', goBack);
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
