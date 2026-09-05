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
const views = ['repairs', 'track', 'invoices', 'store', 'request'];
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});
document.querySelectorAll('[data-goto]').forEach((el) => el.addEventListener('click', () => switchView(el.dataset.goto)));

// ---------- Mobile sidebar ----------
const sidebar = document.querySelector('.sidebar');
const hamburger = document.getElementById('portal-hamburger');
let overlay = document.querySelector('.sidebar-overlay');
if (sidebar && !overlay) {
  overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  sidebar.parentNode.insertBefore(overlay, sidebar);
}
const closeSidebar = () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); };
hamburger.addEventListener('click', (e) => { e.stopPropagation(); sidebar.classList.toggle('open'); overlay.classList.toggle('open'); });
overlay.addEventListener('click', closeSidebar);
navItems.forEach((n) => n.addEventListener('click', closeSidebar));

function switchView(view) {
  navItems.forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  views.forEach((v) => {
    document.getElementById('view-' + v).hidden = v !== view;
  });
  if (view === 'repairs') loadAllRepairs();
  if (view === 'track') loadTrack();
  if (view === 'invoices') loadInvoices();
  if (view === 'store') loadStore();
}

// ---------- Booking a new repair ----------
const form = document.getElementById('portal-request-form');
const itemSelect = document.getElementById('portal-item-select');
const newItemToggle = document.getElementById('portal-new-item-toggle');
const newItemFields = document.getElementById('portal-new-item-fields');
const submitBtn = document.getElementById('portal-submit');
const apptDateInput = document.getElementById('portal-appt-date');
const slotsWrap = document.getElementById('portal-slots-wrap');
const slotGrid = document.getElementById('portal-slot-grid');
const slotSelected = document.getElementById('portal-slot-selected');
const slotSelectedLabel = document.getElementById('portal-slot-selected-label');
let selectedAppointment = null;

// Appointment date picker defaults to today and cannot be in the past.
(function initAppt() {
  const today = new Date();
  const iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  apptDateInput.min = iso;
})();

function localISO(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
}

const dateTimeFmt = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

apptDateInput.addEventListener('change', async () => {
  selectedAppointment = null;
  slotSelected.hidden = true;
  if (!apptDateInput.value) { slotsWrap.hidden = true; slotGrid.innerHTML = ''; return; }
  try {
    const av = await api.public.availability(apptDateInput.value);
    slotsWrap.hidden = false;
    if (!av.open) {
      slotGrid.innerHTML = '<div class="portal-empty" style="grid-column:1/-1;">The shop is closed on this day.</div>';
      return;
    }
    slotGrid.innerHTML = av.slots
      .map((s, i) => {
        const d = new Date(s.start);
        const label = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        return `<button type="button" class="slot-btn${s.available ? '' : ' slot-taken'}" data-slot="${i}" title="${s.available ? 'Select this slot' : 'Already booked'}" ${s.available ? '' : 'disabled'}>${label}</button>`;
      })
      .join('');
    slotGrid.querySelectorAll('[data-slot]').forEach((b) => b.addEventListener('click', () => {
      if (b.disabled) return;
      slotGrid.querySelectorAll('.slot-btn').forEach((x) => x.classList.remove('slot-selected'));
      b.classList.add('slot-selected');
      const slot = av.slots[Number(b.dataset.slot)];
      selectedAppointment = { start: slot.start, label: b.textContent };
      slotSelectedLabel.textContent = `${b.textContent} — ${new Date(slot.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`;
      slotSelected.hidden = false;
    }));
  } catch (err) {
    slotsWrap.hidden = true;
    slotGrid.innerHTML = '';
    showToast('Could not load availability.', 'error');
  }
});

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
      appointment_datetime: selectedAppointment ? selectedAppointment.start : null,
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
    selectedAppointment = null;
    slotSelected.hidden = true;
    slotsWrap.hidden = true;
    slotGrid.innerHTML = '';
    apptDateInput.value = '';
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
      <div class="cell-sub">${dateFmt(o.created_at)}${o.completed_at ? ` · completed ${dateFmt(o.completed_at)}` : ''}${o.appointment_datetime ? ` · appt ${dateTimeFmt(o.appointment_datetime)}` : ''}</div>
      ${actions.length ? `<div class="order-card-actions">${actions.join('')}</div>` : ''}
    </div>`;
}

// ---------- Tracking ----------
const TRACK_STEPS = ['requested', 'diagnosed', 'approved', 'in_progress', 'completed', 'closed'];
const TRACK_STATUS_INDEX = {
  requested: 0, diagnosed: 1, approved: 2,
  in_progress: 3, on_hold: 3, completed: 4, invoiced: 4, closed: 5,
};
const TRACK_PRIORITY_COLOR = { urgent: '#E11D48', high: '#D97706', normal: '#2563EB', low: '#6b7280' };

function stepper(status) {
  const idx = TRACK_STATUS_INDEX[status] ?? -1;
  return `<div class="stepper">${TRACK_STEPS.map((s, i) => `
    <div class="step ${i <= idx ? 'done' : ''}">
      <div class="step-dot">${i <= idx ? '&#10003;' : ''}</div>
      <div class="step-label">${label(s)}</div>
    </div>`).join('')}</div>`;
}

async function loadTrack() {
  const select = document.getElementById('track-order-select');
  const panel = document.getElementById('track-panel');
  let orders;
  try {
    orders = await api.portal.orders.list();
  } catch (err) {
    panel.innerHTML = '<div class="portal-empty">Could not load your repairs.</div>';
    return;
  }
  if (!orders.length) {
    select.innerHTML = '<option value="">No repairs yet</option>';
    panel.innerHTML = '<div class="portal-empty">You have no repairs to track yet. <button class="btn btn-primary btn-sm" data-goto="request" style="margin-top:10px;"><i class="bi bi-plus-circle"></i> Book a repair</button></div>';
    document.querySelectorAll('[data-goto]').forEach((el) => el.addEventListener('click', () => switchView(el.dataset.goto)));
    return;
  }

  const sorted = [...orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const defaultId = (sorted.find((o) => !TERMINAL.includes(o.status)) || sorted[0]).id;
  select.innerHTML = sorted.map((o) =>
    `<option value="${o.id}"${o.id === defaultId ? ' selected' : ''}>${esc(o.ro_number)} · ${label(o.status)} · ${dateFmt(o.created_at)}</option>`
  ).join('');

  const renderTrack = (o) => {
    panel.innerHTML = `
      <div class="result">
        <div class="result-head">
          <div>
            <div class="result-ro">${esc(o.ro_number)}</div>
            <div class="result-sub">${esc(o.item_description || 'Repair order')}${o.item_identifier ? ` &middot; ${esc(o.item_identifier)}` : ''}</div>
          </div>
          ${badge(STATUS_BADGE[o.status] || 'grey', label(o.status))}
        </div>
        ${['cancelled', 'rejected'].includes(o.status)
          ? `<div style="background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;border-radius:10px;padding:12px 16px;font-size:14px;font-weight:600;margin-bottom:16px;">This repair order was ${o.status}.</div>`
          : stepper(o.status)}
        <div class="detail-grid">
          <div class="detail-item"><div class="detail-label">Priority</div><div class="detail-value" style="color:${TRACK_PRIORITY_COLOR[o.priority] || '#6b7280'};font-weight:600;">${label(o.priority)}</div></div>
          <div class="detail-item"><div class="detail-label">Date Received</div><div class="detail-value">${dateFmt(o.created_at)}</div></div>
          <div class="detail-item"><div class="detail-label">Last Updated</div><div class="detail-value">${dateFmt(o.updated_at)}</div></div>
          ${o.appointment_datetime ? `<div class="detail-item"><div class="detail-label">Appointment</div><div class="detail-value">${dateTimeFmt(o.appointment_datetime)}</div></div>` : ''}
          ${o.released_at ? `<div class="detail-item"><div class="detail-label">Released</div><div class="detail-value">${dateFmt(o.released_at)}</div></div>` : ''}
          ${o.completed_at ? `<div class="detail-item"><div class="detail-label">Completed</div><div class="detail-value">${dateFmt(o.completed_at)}</div></div>` : ''}
        </div>
      </div>`;
  };

  const paint = () => {
    const found = sorted.find((x) => x.id === Number(select.value)) || sorted[0];
    if (found) renderTrack(found);
  };
  paint();
  select.addEventListener('change', paint);
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
      <div class="detail-item"><div class="detail-label">Appointment</div><div class="detail-value">${o.appointment_datetime ? dateTimeFmt(o.appointment_datetime) : 'Not scheduled'}</div></div>
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

// ---------- Parts Shop ----------
const STOCK_BADGE = { in_stock: ['green', 'In Stock'], low_stock: ['amber', 'Low Stock'], out_of_stock: ['rose', 'Out of Stock'] };
const PO_STATUS_BADGE = { pending: 'amber', fulfilled: 'green', cancelled: 'gray' };
let catalog = [];
let cart = new Map(); // partId -> qty

function renderCart() {
  const panel = document.getElementById('cart-panel');
  if (!cart.size) {
    panel.innerHTML = `
      <div class="cart-empty">
        <i class="bi bi-cart" style="font-size:28px;color:var(--gray-400);"></i>
        <div>Your cart is empty.</div>
        <div class="cell-sub">Add parts from the catalog to place an order.</div>
      </div>`;
    return;
  }
  let total = 0;
  const rows = [...cart.entries()].map(([partId, qty]) => {
    const p = catalog.find((x) => x.id === partId);
    if (!p) return '';
    total += p.unit_price * qty;
    return `
      <div class="cart-row">
        <div class="cart-item-info">
          <b>${esc(p.name)}</b>
          <div class="cell-sub">${peso(p.unit_price)} × ${qty}</div>
        </div>
        <div class="cart-row-actions">
          <button class="cart-qty-btn" data-cart-dec="${partId}">−</button>
          <span class="cart-qty">${qty}</span>
          <button class="cart-qty-btn" data-cart-inc="${partId}">+</button>
          <button class="cart-remove" data-cart-remove="${partId}" title="Remove">&times;</button>
        </div>
      </div>`;
  }).join('');
  panel.innerHTML = `
    <div class="cart-title">Your Cart</div>
    ${rows}
    <div class="cart-total"><span>Total</span><span>${peso(total)}</span></div>
    <div class="cell-sub" style="margin-top:6px;">Pay on pickup or delivery. Stock is reserved when you place the order.</div>
    <button class="btn btn-primary btn-block" id="store-checkout" style="margin-top:12px;"><i class="bi bi-bag-check"></i> Place Order</button>`;

  panel.querySelectorAll('[data-cart-inc]').forEach((b) => b.addEventListener('click', () => { const id = Number(b.dataset.cartInc); const p = catalog.find((x) => x.id === id); if (p && p.stock_status !== 'out_of_stock' && (p.available_qty ?? p.qty_on_hand ?? 99) > (cart.get(id) || 0)) { cart.set(id, (cart.get(id) || 0) + 1); renderCart(); } }));
  panel.querySelectorAll('[data-cart-dec]').forEach((b) => b.addEventListener('click', () => { const id = Number(b.dataset.cartDec); const n = (cart.get(id) || 0) - 1; if (n <= 0) cart.delete(id); else cart.set(id, n); renderCart(); }));
  panel.querySelectorAll('[data-cart-remove]').forEach((b) => b.addEventListener('click', () => { cart.delete(Number(b.dataset.cartRemove)); renderCart(); }));
  document.getElementById('store-checkout').addEventListener('click', checkout);
}

async function checkout() {
  if (!cart.size) return;
  if (!confirm('Place this parts order? You will pay on pickup/delivery. Stock will be deducted now.')) return;
  try {
    const items = [...cart.entries()].map(([partId, qty]) => ({ part_id: partId, quantity: qty }));
    await api.store.orders.create({ items });
    cart.clear();
    renderCart();
    showToast('Parts order placed. We\'ll get it ready for you.');
    await Promise.all([loadStore()]);
    switchStoreTab('orders');
  } catch (err) {
    showToast('Could not place order: ' + err.message, 'error');
  }
}

function renderCatalog(parts) {
  const grid = document.getElementById('store-grid');
  grid.innerHTML = parts.map((p) => {
    const [kind, text] = STOCK_BADGE[p.stock_status] || ['gray', p.stock_status];
    const isOut = p.stock_status === 'out_of_stock';
    const inCart = cart.get(p.id) || 0;
    return `
      <div class="store-card">
        <div class="store-card-top">
          <div class="store-card-name"><i class="bi bi-gear" style="color:var(--brand-500);"></i> ${esc(p.name)}</div>
          ${badge(kind, text)}
        </div>
        <div class="cell-sub">SKU: ${esc(p.sku)}</div>
        ${p.description ? `<div class="store-card-desc">${esc(p.description)}</div>` : ''}
        <div class="store-card-price">${peso(p.unit_price)}</div>
        <button class="btn ${isOut ? 'btn-secondary' : 'btn-primary'} btn-block btn-sm" data-store-add="${p.id}" ${isOut ? 'disabled' : ''}>
          <i class="bi ${isOut ? 'bi-x-circle' : 'bi-cart-plus'}"></i> ${isOut ? 'Out of Stock' : (inCart ? `In cart (${inCart})` : 'Add to Cart')}
        </button>
      </div>`;
  }).join('') || '<div class="portal-empty" style="grid-column:1/-1;">No parts available for purchase yet.</div>';

  grid.querySelectorAll('[data-store-add]').forEach((b) => b.addEventListener('click', () => {
    const id = Number(b.dataset.storeAdd);
    cart.set(id, (cart.get(id) || 0) + 1);
    renderCatalog(parts);
    renderCart();
  }));
}

async function renderStoreOrders() {
  const tbody = document.getElementById('store-orders-tbody');
  let orders;
  try { orders = await api.store.orders.list(); }
  catch (err) { tbody.innerHTML = '<tr><td colspan="5" class="portal-empty">Could not load orders.</td></tr>'; return; }
  document.getElementById('store-orders-count').textContent = orders.length ? `(${orders.length})` : '';
  tbody.innerHTML = orders.length
    ? orders.map((o) => `
      <tr>
        <td><b>${esc(o.order_number)}</b></td>
        <td>${dateFmt(o.created_at)}</td>
        <td>${peso(o.total)}</td>
        <td>${badge(PO_STATUS_BADGE[o.status] || 'gray', label(o.status))}</td>
        <td><button class="btn btn-secondary btn-sm" data-store-order-detail="${o.id}"><i class="bi bi-eye"></i> View</button></td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="portal-empty">You have no parts orders yet.</td></tr>';
  tbody.querySelectorAll('[data-store-order-detail]').forEach((b) => b.addEventListener('click', () => openPartsOrderDetail(Number(b.dataset.storeOrderDetail))));
}

function openPartsOrderDetail(id) {
  const o = (window.__storeOrders || []).find((x) => x.id === id);
  if (!o) return;
  document.getElementById('portal-po-title').textContent = `Order ${o.order_number}`;
  document.getElementById('portal-po-body').innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${badge(PO_STATUS_BADGE[o.status] || 'gray', label(o.status))}</div></div>
      <div class="detail-item"><div class="detail-label">Placed</div><div class="detail-value">${dateFmt(o.created_at)}</div></div>
      <div class="detail-item"><div class="detail-label">Fulfilled</div><div class="detail-value">${o.fulfilled_at ? dateFmt(o.fulfilled_at) : '—'}</div></div>
    </div>
    <table class="payments-table">
      <tbody>${o.items.map((i) => `<tr><td>${esc(i.name)}</td><td>&times; ${i.quantity}</td><td style="text-align:right;">${peso(i.line_total)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td><b>Total</b></td><td></td><td style="text-align:right;"><b>${peso(o.total)}</b></td></tr></tfoot>
    </table>
    <div class="cell-sub" style="margin-top:10px;">Pay on pickup or delivery.</div>`;
  document.getElementById('portal-modal-parts-order').classList.add('open');
}

async function loadStore() {
  let parts;
  try { parts = await api.store.catalog(document.getElementById('store-search').value.trim()); }
  catch (err) { document.getElementById('store-grid').innerHTML = '<div class="portal-empty">Could not load the parts catalog.</div>'; return; }
  catalog = parts;
  renderCatalog(parts);
  renderCart();
  const orders = await api.store.orders.list().catch(() => []);
  window.__storeOrders = orders;
  renderStoreOrders();
}

document.getElementById('store-search')?.addEventListener('input', debounce(loadStore, 250));
document.querySelectorAll('.store-tab').forEach((tab) => tab.addEventListener('click', () => switchStoreTab(tab.dataset.storeTab)));

function switchStoreTab(tab) {
  document.querySelectorAll('.store-tab').forEach((t) => t.classList.toggle('active', t.dataset.storeTab === tab));
  document.getElementById('store-catalog').hidden = tab !== 'catalog';
  document.getElementById('store-orders').hidden = tab !== 'orders';
  if (tab === 'orders') renderStoreOrders();
}

function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ---------- Modal helpers ----------
document.querySelectorAll('[data-close-modal]').forEach((b) => b.addEventListener('click', () => document.getElementById(b.dataset.closeModal).classList.remove('open')));
document.querySelectorAll('.modal-overlay').forEach((o) => o.addEventListener('mousedown', (e) => { if (e.target === o) o.classList.remove('open'); }));

// ---------- Init ----------
loadItems();
loadAllRepairs();
loadInvoices();
loadStore();

// Prefill the booking form when arriving from a landing-page service CTA.
(function prefillService() {
  const service = new URLSearchParams(window.location.search).get('service');
  if (!service) return;
  const problemField = document.getElementById('portal-problem');
  const descField = document.getElementById('portal-item-desc');
  problemField.value = `Requesting service: ${service}`;
  if (descField) descField.placeholder = `e.g. 2021 Honda Civic — ${service}`;
  switchView('request');
})();
