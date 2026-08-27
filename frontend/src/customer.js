import 'bootstrap-icons/font/bootstrap-icons.css';
import './style.css';
import { api, clearAuth, getStoredUser, getToken } from './api.js';
import { badge, dateFmt, esc, label, peso, STATUS_BADGE } from './ui.js';

const user = getStoredUser();
if (!getToken() || !user) window.location.href = '/login.html';
if (user.role !== 'customer') window.location.href = '/admin.html';

document.getElementById('portal-name').textContent = user.full_name || user.email || user.username;
document.getElementById('portal-logout').addEventListener('click', () => { clearAuth(); window.location.href = '/login.html'; });

const form = document.getElementById('portal-order-form');
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
  itemSelect.innerHTML = '<option value="">Select your item…</option>' + items.map((i) =>
    `<option value="${i.id}">${esc(i.description)}${i.identifier ? ' — ' + esc(i.identifier) : ''}</option>`
  ).join('');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Submitting…';
  try {
    let itemId = Number(itemSelect.value);
    if (newItemToggle.checked) {
      const item = await api.portal.items.create({
        description: document.getElementById('portal-item-desc').value.trim(),
        identifier: document.getElementById('portal-item-identifier').value.trim() || null,
      });
      itemId = item.id;
    }
    await api.portal.orders.create({
      item_id: itemId,
      problem_description: document.getElementById('portal-problem').value.trim() || null,
    });
    form.reset();
    newItemToggle.checked = false;
    newItemFields.hidden = true;
    itemSelect.disabled = false;
    itemSelect.required = true;
    document.getElementById('portal-item-desc').required = false;
    await Promise.all([loadItems(), loadOrders()]);
  } catch (err) {
    alert('Could not submit: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="bi bi-send"></i> Submit Request';
  }
});

async function loadOrders() {
  const orders = await api.portal.orders.list();
  document.getElementById('portal-order-count').textContent = `${orders.length} order(s)`;
  const list = document.getElementById('portal-orders-list');
  list.innerHTML = orders.map((o) => `
    <div class="order-card">
      <div class="order-card-top">
        <b>${esc(o.ro_number)}</b>
        ${badge(STATUS_BADGE[o.status], label(o.status))}
      </div>
      <div>${esc(o.item?.description ?? '—')}${o.item?.identifier ? ` <span class="cell-sub">· ${esc(o.item.identifier)}</span>` : ''}</div>
      <div class="cell-sub">Submitted ${dateFmt(o.created_at)}</div>
      <div class="order-card-actions">
        <button class="btn btn-secondary btn-sm" data-portal-detail="${o.id}"><i class="bi bi-eye"></i> Details</button>
        ${o.status === 'requested' ? `<button class="btn btn-secondary btn-sm" data-portal-cancel="${o.id}"><i class="bi bi-x-circle"></i> Cancel</button>` : ''}
        ${o.tracking_token ? `<a class="btn btn-primary btn-sm" href="/track.html?token=${encodeURIComponent(o.tracking_token)}" target="_blank"><i class="bi bi-box-arrow-up-right"></i> Track</a>` : ''}
      </div>
    </div>
  `).join('') || '<div class="status-list-item cell-sub">You have no repair orders yet.</div>';

  list.querySelectorAll('[data-portal-detail]').forEach((b) => b.addEventListener('click', () => openDetail(Number(b.dataset.portalDetail))));
  list.querySelectorAll('[data-portal-cancel]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Cancel this repair request?')) return;
    try {
      await api.portal.orders.cancel(Number(b.dataset.portalCancel));
      await loadOrders();
    } catch (err) { alert(err.message); }
  }));
}

async function openDetail(id) {
  const o = await api.portal.orders.get(id);
  document.getElementById('portal-detail-title').textContent = `Order ${o.ro_number}`;
  const parts = o.parts || [];
  const history = o.status_history || [];
  document.getElementById('portal-detail-body').innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Item</div><div class="detail-value">${esc(o.item?.description ?? '—')}</div></div>
      <div class="detail-item"><div class="detail-label">Identifier</div><div class="detail-value">${esc(o.item?.identifier ?? '—')}</div></div>
      <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${badge(STATUS_BADGE[o.status], label(o.status))}</div></div>
      <div class="detail-item"><div class="detail-label">Submitted</div><div class="detail-value">${dateFmt(o.created_at)}</div></div>
    </div>
    <div class="field"><label>Problem</label><textarea class="input" rows="3" readonly>${esc(o.problem_description ?? '—')}</textarea></div>
    ${o.diagnosis ? `<div class="field"><label>Diagnosis</label><textarea class="input" rows="2" readonly>${esc(o.diagnosis)}</textarea></div>` : ''}
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Labor</div><div class="detail-value">${peso(o.labor_cost)}</div></div>
      <div class="detail-item"><div class="detail-label">Parts</div><div class="detail-value">${peso(o.parts_total)}</div></div>
      <div class="detail-item"><div class="detail-label">Total</div><div class="detail-value">${peso(o.quote_total)}</div></div>
    </div>
    ${parts.length ? `<div class="field"><label>Parts Used</label>
      <table class="payments-table"><tbody>${parts.map((p) => `<tr><td>${esc(p.part?.name ?? 'Part')}</td><td>&times; ${p.quantity}</td><td>${peso(p.unit_price * p.quantity)}</td></tr>`).join('')}</tbody></table>
    </div>` : ''}
    <div class="field"><label>Status History</label>
      ${history.map((h) => `
        <div class="activity-item">
          <div class="activity-icon"><i class="bi bi-arrow-repeat"></i></div>
          <div>
            <div class="activity-title">${label(h.to_status)}</div>
            <div class="activity-sub">${dateFmt(h.created_at)}${h.note ? ' · ' + esc(h.note) : ''}</div>
          </div>
        </div>`).join('') || '<div class="activity-item cell-sub">No history yet.</div>'}
    </div>`;
  document.getElementById('portal-modal-detail').classList.add('open');
}

document.querySelectorAll('[data-close-modal]').forEach((b) => b.addEventListener('click', () => document.getElementById(b.dataset.closeModal).classList.remove('open')));
document.querySelectorAll('.modal-overlay').forEach((o) => o.addEventListener('mousedown', (e) => { if (e.target === o) o.classList.remove('open'); }));

loadItems();
loadOrders();
