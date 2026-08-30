import 'bootstrap-icons/font/bootstrap-icons.css';
import './style.css';
import { api, clearAuth, getStoredUser, getToken } from './api.js';
import { badge, dateFmt, esc, label, peso, STATUS_BADGE, INVOICE_BADGE, showToast } from './ui.js';

const user = getStoredUser();
if (!getToken() || !user) window.location.href = '/login.html';
if (user.role !== 'customer') window.location.href = '/admin.html';

document.getElementById('portal-name').textContent = user.full_name || user.email || user.username;
document.getElementById('portal-logout').addEventListener('click', () => { clearAuth(); window.location.href = '/login.html'; });

// ---------- View switching ----------
const views = ['repairs', 'invoices', 'request'];
document.querySelectorAll('.portal-nav-item').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});
document.querySelectorAll('[data-goto]').forEach((el) => el.addEventListener('click', () => switchView(el.dataset.goto)));

function switchView(view) {
  document.querySelectorAll('.portal-nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  views.forEach((v) => {
    document.getElementById('view-' + v).hidden = v !== view;
  });
  if (view === 'repairs') loadAllRepairs();
  if (view === 'invoices') loadInvoices();
}

// ---------- Booking a new repair ----------
const form = document.getElementById('portal-request-form');
const itemSelect = document.getElementById('portal-item-select');
const newItemToggle = document.getElementById('portal-new-item-toggle');
const newItemFields = document.getElementById('portal-new-item-fields');
const submitBtn = document.getElementById('portal-submit');

newItemToggle.addEventListener('change', () => {
  newItemFields.hidden = !newItemToggle.checked;
  itemSelect.required = !newItemToggle.checked;
  itemSelect.disabled = newItemToggle.checked;
  document.getElementById('portal-item-desc').required = newItemToggle.checked;
});

async function loadItems() {
  const items = await api.portal.items.list();
  itemSelect.innerHTML = '<option value="">Select an existing item…</option>' + items.map((i) =>
    `<option value="${i.id}">${esc(i.description)}${i.identifier ? ' — ' + esc(i.identifier) : ''}</option>`
  ).join('');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Submitting…';
  try {
    const data = {
      type: newItemToggle.checked ? 'new' : 'existing',
      problem_description: document.getElementById('portal-problem').value.trim() || null,
    };
    if (newItemToggle.checked) {
      data.item_description = document.getElementById('portal-item-desc').value.trim();
      data.item_identifier = document.getElementById('portal-item-identifier').value.trim() || null;
    } else {
      data.item_id = Number(itemSelect.value);
    }
    await api.portal.orders.create(data);
    form.reset();
    newItemToggle.checked = false;
    newItemFields.hidden = true;
    itemSelect.disabled = false;
    itemSelect.required = true;
    document.getElementById('portal-item-desc').required = false;
    const success = document.getElementById('portal-request-success');
    success.hidden = false;
    setTimeout(() => { success.hidden = true; }, 4000);
    showToast('Repair request submitted.');
    await Promise.all([loadItems(), loadAllRepairs()]);
    switchView('repairs');
  } catch (err) {
    showToast('Could not submit: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="bi bi-send"></i> Submit Request';
  }
});

// ---------- Repairs: current vs history ----------
const ACTIVE_STATUSES = [
  'requested', 'diagnosed', 'approved', 'in_progress', 'on_hold',
  'invoiced', 'completed',
];
const TERMINAL = ['closed', 'cancelled', 'rejected'];

function isActive(o) {
  return (ACTIVE_STATUSES.includes(o.status) && !TERMINAL.includes(o.status)) || o.status === 'invoiced';
}

function orderCardHtml(o, opts = {}) {
  const actions = [];
  if (opts.withDetail) actions.push(`<button class="btn btn-secondary btn-sm" data-portal-detail="${o.id}"><i class="bi bi-eye"></i> Details</button>`);
  if (o.status === 'requested') actions.push(`<button class="btn btn-secondary btn-sm" data-portal-cancel="${o.id}"><i class="bi bi-x-circle"></i> Cancel</button>`);
  if (o.tracking_token) actions.push(`<a class="btn btn-primary btn-sm" href="/track.html?token=${encodeURIComponent(o.tracking_token)}" target="_blank"><i class="bi bi-box-arrow-up-right"></i> Track</a>`);

  return `
    <div class="order-card">
      <div class="order-card-top">
        <b>${esc(o.ro_number)}</b>
        ${badge(STATUS_BADGE[o.status] || 'grey', label(o.status))}
      </div>
      <div>${esc(o.item_description || '')}${o.item_identifier ? ` <span class="cell-sub">· ${esc(o.item_identifier)}</span>` : ''}</div>
      <div class="cell-sub">${dateFmt(o.created_at)}${o.completed_at ? ` · completed ${dateFmt(o.completed_at)}` : ''}</div>
      ${actions.length ? `<div class="order-card-actions">${actions.join('')}</div>` : ''}
    </div>`;
}

// ---------- Quote approvals ----------
async function loadApprovals() {
  const panel = document.getElementById('approvals-panel');
  let reqs = [];
  try {
    reqs = (await api.portal.additionalCosts.list()).filter((r) => r.status === 'pending');
  } catch (err) {
    panel.innerHTML = '';
    return;
  }
  if (!reqs.length) { panel.innerHTML = ''; return; }
  panel.innerHTML = reqs.map((r) => `
    <div class="approval-card">
      <div class="approval-title"><i class="bi bi-exclamation-triangle-fill" style="color:var(--amber-500);"></i> Approve additional work for Order #<span id="ac-order-ro-${r.id}">…</span></div>
      <div class="approval-reason">${esc(r.reason || 'Additional repair needed')}</div>
      <div style="font-size:16px;font-weight:700;color:var(--gray-900);">${peso(r.amount)}</div>
      <div class="approval-actions">
        <button class="btn btn-primary" data-approve="${r.id}"><i class="bi bi-check-lg"></i> Approve</button>
        <button class="btn btn-secondary" data-decline="${r.id}"><i class="bi bi-x"></i> Decline</button>
      </div>
    </div>`).join('');

  // Fill in the order RO numbers for pending approvals.
  const orders = await api.portal.orders.list();
  const roByOrder = {};
  orders.forEach((o) => { roByOrder[o.id] = o.ro_number; });
  reqs.forEach((r) => {
    const el = document.getElementById(`ac-order-ro-${r.id}`);
    if (el) el.textContent = roByOrder[r.repair_order_id] || `#${r.repair_order_id}`;
  });

  document.querySelectorAll('[data-approve]').forEach((b) =>
    b.addEventListener('click', async () => { try { await api.portal.additionalCosts.respond(Number(b.dataset.approve), 'approved'); showToast('Approved. The shop can now proceed.'); await loadAllRepairs(); } catch (err) { showToast(err.message, 'error'); } }));
  document.querySelectorAll('[data-decline]').forEach((b) =>
    b.addEventListener('click', async () => { try { await api.portal.additionalCosts.respond(Number(b.dataset.decline), 'declined'); showToast('Declined. Work stays at original scope.'); await loadAllRepairs(); } catch (err) { showToast(err.message, 'error'); } }));
}

async function loadOrders() {
  const orders = await api.portal.orders.list();
  const active = orders.filter(isActive);
  const history = orders.filter((o) => TERMINAL.includes(o.status));

  document.getElementById('current-count').textContent = `${active.length} order(s)`;
  document.getElementById('history-count').textContent = `${history.length} repair(s)`;

  document.getElementById('current-orders').innerHTML =
    active.map((o) => orderCardHtml(o, { withDetail: true })).join('') ||
    `<div class="portal-empty">No active repairs. <button class="btn btn-primary btn-sm" data-goto="request" style="margin-top:10px;"><i class="bi bi-plus-circle"></i> Book a repair</button></div>`;

  document.getElementById('history-orders').innerHTML =
    history.map((o) => orderCardHtml(o, { withDetail: true })).join('') ||
    `<div class="portal-empty">No completed repairs yet.</div>`;

  document.querySelectorAll('[data-portal-detail]').forEach((b) => b.addEventListener('click', () => openDetail(Number(b.dataset.portalDetail))));
  document.querySelectorAll('[data-portal-cancel]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Cancel this repair request?')) return;
    try { await api.portal.orders.cancel(Number(b.dataset.portalCancel)); await loadAllRepairs(); }
    catch (err) { showToast(err.message, 'error'); }
  }));
}

async function loadAllRepairs() {
  await Promise.all([loadApprovals(), loadOrders()]);
}

// ---------- Order detail ----------
async function openDetail(id) {
  const o = await api.portal.orders.get(id);
  document.getElementById('portal-detail-title').textContent = `Order ${o.ro_number}`;
  const parts = o.parts || [];
  const history = o.status_history || [];
  const photos = await api.portal.orders.photos(id).catch(() => []);

  // Cost is only shown once approved (or further along), to avoid leaking pre-approval internals.
  const showCost = ['approved', 'in_progress', 'on_hold', 'completed', 'invoiced', 'closed'].includes(o.status);

  const photoHtml = photos.length ? `
    <div class="field"><label>Photos</label>
      <div class="photo-grid">${photos.map((p) => `
        <div class="photo-cell">
          <a href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.url)}" alt=""></a>
          ${p.caption ? `<div class="photo-caption">${esc(p.caption)}</div>` : ''}
        </div>`).join('')}
      </div>
    </div>` : '';

  document.getElementById('portal-detail-body').innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Item</div><div class="detail-value">${esc(o.item_description || '—')}</div></div>
      <div class="detail-item"><div class="detail-label">Serial/Plate</div><div class="detail-value">${esc(o.item_identifier || '—')}</div></div>
      <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${badge(STATUS_BADGE[o.status] || 'grey', label(o.status))}</div></div>
      <div class="detail-item"><div class="detail-label">Submitted</div><div class="detail-value">${dateFmt(o.created_at)}</div></div>
      <div class="detail-item"><div class="detail-label">Estimated Completion</div><div class="detail-value">${o.completed_at ? dateFmt(o.completed_at) : 'To be determined'}</div></div>
    </div>
    <div class="field"><label>Reported Issue</label><textarea class="input" rows="3" readonly>${esc(o.problem_description ?? '—')}</textarea></div>
    ${o.diagnosis ? `<div class="field"><label>Our Diagnosis</label><textarea class="input" rows="2" readonly>${esc(o.diagnosis)}</textarea></div>` : ''}
    ${photoHtml}
    ${showCost ? `
      <div class="detail-grid">
        <div class="detail-item"><div class="detail-label">Labor</div><div class="detail-value">${peso(o.labor_cost)}</div></div>
        <div class="detail-item"><div class="detail-label">Parts</div><div class="detail-value">${peso(o.parts_total)}</div></div>
        <div class="detail-item"><div class="detail-label">Total</div><div class="detail-value">${peso(o.quote_total)}</div></div>
      </div>
      ${parts.length ? `<div class="field"><label>Parts Used</label>
        <table class="payments-table"><tbody>${parts.map((p) => `<tr><td>${esc(p.name || 'Part')}</td><td>&times; ${p.quantity}</td><td style="text-align:right;">${peso(p.line_total)}</td></tr>`).join('')}</tbody></table>
      </div>` : ''}
    ` : ''}
    ${o.warranty_days ? `<div class="field"><label>Warranty</label><div style="font-size:13px;">${o.warranty_days} day(s)${o.warranty_notes ? ' · ' + esc(o.warranty_notes) : ''}</div></div>` : ''}
    <div class="field"><label>Status History</label>
      ${history.map((h) => `
        <div class="activity-item">
          <div class="activity-icon"><i class="bi bi-arrow-repeat"></i></div>
          <div>
            <div class="activity-title">${label(h.to_status)}</div>
            <div class="activity-sub">${dateFmt(h.created_at)}${h.note ? ' · ' + esc(h.note) : ''}</div>
          </div>
        </div>`).join('') || '<div class="portal-empty">No history yet.</div>'}
    </div>`;
  document.getElementById('portal-modal-detail').classList.add('open');
}

// ---------- Invoices ----------
async function loadInvoices() {
  const tbody = document.getElementById('invoices-tbody');
  let invoices = [];
  try {
    invoices = await api.portal.invoices.list();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="portal-empty">Could not load invoices.</td></tr>`;
    return;
  }
  if (!invoices.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="portal-empty">You have no invoices yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = invoices.map((inv) => `
    <tr>
      <td><b>${esc(inv.invoice_number)}</b></td>
      <td>${esc(inv.ro_number || `#${inv.repair_order_id}`)}</td>
      <td>${dateFmt(inv.issued_at)}</td>
      <td>${peso(inv.total)}</td>
      <td>${badge(INVOICE_BADGE[inv.status] || 'grey', label(inv.status))}</td>
      <td><button class="btn btn-secondary btn-sm" data-view-invoice="${inv.id}"><i class="bi bi-eye"></i> View</button></td>
    </tr>`).join('');
  tbody.querySelectorAll('[data-view-invoice]').forEach((b) => b.addEventListener('click', () => openInvoice(Number(b.dataset.viewInvoice))));
}

async function openInvoice(id) {
  const inv = await api.portal.invoices.get(id);
  document.getElementById('portal-invoice-title').textContent = `Invoice ${inv.invoice_number}`;
  const lines = inv.line_items || [];
  const rows = lines.map((l) => `
    <tr>
      <td>${esc(l.description)}</td>
      <td class="num">${l.quantity}</td>
      <td class="num">${peso(l.unit_price)}</td>
      <td class="num">${peso(l.line_total)}</td>
    </tr>`).join('');
  const invStatus = inv.status;
  const statusPillClass = invStatus === 'paid' ? '#059669' : invStatus === 'void' ? '#6b7280' : '#d97706';

  document.getElementById('portal-invoice-body').innerHTML = `
    <div id="print-area">
      <div class="invoice-print">
        <div class="invoice-print-head">
          <div>
            <div class="shop">Precision Repair</div>
            <div class="invoice-print-meta">123 Repair Avenue, Quezon City<br>+63 917 555 0142 · hello@precisionrepair.com</div>
          </div>
          <div style="text-align:right;">
            <div class="invoice-print-title">INVOICE</div>
            <div class="invoice-print-meta" style="margin:0;">${esc(inv.invoice_number)}</div>
            <div class="invoice-print-meta" style="margin:0 0 6px 0;">Issued ${dateFmt(inv.issued_at)}</div>
            <span class="status-pill" style="background:${statusPillClass};color:#fff;">${label(invStatus)}</span>
          </div>
        </div>
        <div style="font-size:12.5px;color:#444;margin-bottom:14px;">
          <b>Order:</b> ${esc(inv.ro_number || `#${inv.repair_order_id}`)}<br>
          <b>Item:</b> ${esc(inv.order_item_description || '—')}
        </div>
        <table>
          <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="totals">
          <div><span>Total</span><span>${peso(inv.total)}</span></div>
          <div><span>Paid</span><span>${peso(inv.amount_paid)}</span></div>
          <div class="grand"><span>Balance</span><span>${peso(inv.balance)}</span></div>
        </div>
      </div>
    </div>`;
  document.getElementById('portal-modal-invoice').classList.add('open');
}

document.getElementById('print-invoice').addEventListener('click', () => window.print());

// ---------- Modal helpers ----------
document.querySelectorAll('[data-close-modal]').forEach((b) => b.addEventListener('click', () => document.getElementById(b.dataset.closeModal).classList.remove('open')));
document.querySelectorAll('.modal-overlay').forEach((o) => o.addEventListener('mousedown', (e) => { if (e.target === o) o.classList.remove('open'); }));

// ---------- Init ----------
loadItems();
loadAllRepairs();
loadInvoices();
