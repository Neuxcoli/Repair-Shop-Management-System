import 'bootstrap-icons/font/bootstrap-icons.css';
import './style.css';
import { api, getStoredUser, redirectToLogin } from './api.js';

// ---------- Auth guard ----------
let currentUser = getStoredUser();
if (!currentUser || !localStorage.getItem('rs_token')) {
  window.location.href = '/login.html';
}

const ROLE_LABEL = {
  admin: 'Administrator',
  manager: 'Manager',
  technician: 'Technician',
  front_desk: 'Front Desk',
  parts_staff: 'Parts Staff',
};

// Mirrors backend ROLE_PERMISSIONS in app/dependencies.py.
const ROLE_PERMISSIONS = {
  front_desk: [
    'repair_order.view.all', 'repair_order.create',
    'customer.view', 'customer.manage',
    'invoice.view', 'invoice.create',
    'parts.view', 'dashboard.view',
  ],
  technician: [
    'repair_order.view', 'repair_order.diagnose', 'repair_order.start',
    'repair_order.complete', 'repair_order.parts.add',
    'parts.view', 'dashboard.view',
  ],
  parts_staff: ['parts.view', 'parts.manage', 'dashboard.view'],
  manager: [
    'repair_order.view.all', 'repair_order.create', 'repair_order.diagnose',
    'repair_order.approve', 'repair_order.assign', 'repair_order.start',
    'repair_order.complete', 'repair_order.cancel', 'repair_order.parts.add',
    'customer.view', 'customer.manage', 'parts.view', 'parts.manage',
    'invoice.view', 'invoice.create', 'payment.record', 'technician.view',
    'technician.manage', 'dashboard.view', 'record.delete',
  ],
  admin: [
    'repair_order.view.all', 'repair_order.create', 'repair_order.diagnose',
    'repair_order.approve', 'repair_order.assign', 'repair_order.start',
    'repair_order.complete', 'repair_order.cancel', 'repair_order.parts.add',
    'customer.view', 'customer.manage', 'parts.view', 'parts.manage',
    'invoice.view', 'invoice.create', 'payment.record', 'technician.view',
    'technician.manage', 'user.manage', 'dashboard.view', 'record.delete',
  ],
};
const can = (perm) => ROLE_PERMISSIONS[currentUser.role]?.includes(perm);

const NAV = {
  admin: {
    Management: [
      ['dashboard', 'bi-grid-1x2-fill', 'Dashboard'],
      ['orders', 'bi-clipboard2-check', 'Repair Orders'],
      ['customers', 'bi-people', 'Customers'],
      ['technicians', 'bi-person-badge', 'Technicians'],
    ],
    Operations: [
      ['inventory', 'bi-box-seam', 'Inventory'],
      ['invoices', 'bi-receipt', 'Invoices'],
    ],
  },
  manager: {
    Management: [
      ['dashboard', 'bi-grid-1x2-fill', 'Dashboard'],
      ['orders', 'bi-clipboard2-check', 'Repair Orders'],
      ['customers', 'bi-people', 'Customers'],
      ['technicians', 'bi-person-badge', 'Technicians'],
    ],
    Operations: [
      ['inventory', 'bi-box-seam', 'Inventory'],
      ['invoices', 'bi-receipt', 'Invoices'],
    ],
  },
  technician: {
    Work: [
      ['dashboard', 'bi-grid-1x2-fill', 'Dashboard'],
      ['orders', 'bi-clipboard2-check', 'My Work Orders'],
      ['inventory', 'bi-box-seam', 'Parts Catalog'],
    ],
  },
  front_desk: {
    'Front Desk': [
      ['dashboard', 'bi-grid-1x2-fill', 'Dashboard'],
      ['orders', 'bi-clipboard2-check', 'Repair Orders'],
      ['customers', 'bi-people', 'Customers'],
      ['invoices', 'bi-receipt', 'Invoices'],
    ],
    Reference: [
      ['inventory', 'bi-box-seam', 'Parts Catalog'],
    ],
  },
  parts_staff: {
    Inventory: [
      ['dashboard', 'bi-grid-1x2-fill', 'Dashboard'],
      ['inventory', 'bi-box-seam', 'Parts Inventory'],
    ],
  },
};

const ALL_STATUSES = ['requested', 'diagnosed', 'approved', 'in_progress', 'on_hold', 'completed', 'invoiced', 'closed', 'cancelled', 'rejected'];
const TECH_STATUSES = ['requested', 'diagnosed', 'approved', 'in_progress', 'on_hold', 'completed'];

// ---------- Helpers ----------
const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const dateFmt = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const STATUS_BADGE = {
  requested: 'grey', diagnosed: 'blue', approved: 'amber',
  in_progress: 'amber', on_hold: 'amber', completed: 'green',
  invoiced: 'blue', closed: 'green', cancelled: 'rose', rejected: 'rose',
};
const PRIORITY_BADGE = { low: 'grey', normal: 'grey', high: 'amber', urgent: 'rose' };
const INVOICE_BADGE = { unpaid: 'rose', partially_paid: 'amber', paid: 'green', void: 'grey' };
const TECH_BADGE = { active: 'green', inactive: 'grey' };

const label = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function badge(kind, text) {
  return `<span class="badge badge-${kind}"><span class="bdot"></span>${text}</span>`;
}

function initials(name) {
  return name.split(/[\s_.-]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ---------- Sidebar (role-based) ----------
function buildNav() {
  const config = NAV[currentUser.role];
  const sections = Object.entries(config).map(([section, items]) => `
    <div class="nav-section-label">${section}</div>
    ${items.map(([page, icon, name], i) => `
      <div class="nav-item ${i === 0 ? 'active' : ''}" data-page="${page}">
        <i class="bi ${icon}"></i> ${name}
      </div>`).join('')}
  `).join('');
  document.getElementById('main-nav').innerHTML = sections;

  document.getElementById('sidebar-avatar').textContent = initials(currentUser.full_name || currentUser.username);
  document.getElementById('sidebar-name').textContent = currentUser.full_name || currentUser.username;
  document.getElementById('sidebar-role').textContent = ROLE_LABEL[currentUser.role];
  document.getElementById('topbar-avatar').textContent = initials(currentUser.full_name || currentUser.username);

  const MODAL_PERM = {
    'modal-order': 'repair_order.create',
    'modal-customer': 'customer.manage',
    'modal-technician': 'technician.manage',
    'modal-part': 'parts.manage',
  };
  document.querySelectorAll('[data-open-modal]').forEach((b) => {
    b.hidden = !can(MODAL_PERM[b.dataset.openModal]);
  });
}

document.getElementById('logout-btn').addEventListener('click', redirectToLogin);

// ---------- Change password ----------
document.getElementById('change-pw-btn').addEventListener('click', () => {
  document.getElementById('form-password').reset();
  document.getElementById('password-error').hidden = true;
  openModal('modal-password');
});
document.getElementById('change-pw-submit').addEventListener('click', async () => {
  const form = document.getElementById('form-password');
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form).entries());
  const errBox = document.getElementById('password-error');
  if (data.new_password !== document.getElementById('confirm-password').value) {
    errBox.textContent = 'New passwords do not match.';
    errBox.hidden = false;
    return;
  }
  try {
    await api.auth.changePassword({
      current_password: data.current_password,
      new_password: data.new_password,
    });
    closeModal('modal-password');
    form.reset();
    alert('Password updated successfully.');
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
  }
});

document.querySelectorAll('[data-goto-page]').forEach((el) => {
  el.addEventListener('click', (e) => { e.preventDefault(); switchPage(el.dataset.gotoPage); });
});

// ---------- Page switching ----------
function switchPage(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.page === page));
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + page));
  loadPage(page);
}

function loadPage(page) {
  const loaders = {
    dashboard: renderDashboard,
    orders: renderOrders,
    customers: renderCustomers,
    technicians: renderTechnicians,
    inventory: renderParts,
    invoices: renderInvoices,
  };
  loaders[page]?.();
}

// ---------- Modals ----------
document.querySelectorAll('[data-open-modal]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const id = btn.dataset.openModal;
    resetModalForCreate(id);
    if (id === 'modal-order') await populateOrderModal();
    openModal(id);
  });
});
document.querySelectorAll('[data-close-modal]').forEach((btn) => {
  btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
});
document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
});
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Draggable modals
document.querySelectorAll('[data-drag]').forEach((modal) => {
  const handle = modal.querySelector('[data-drag-handle]');
  let dragging = false, offsetX = 0, offsetY = 0;
  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    const rect = modal.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    modal.style.position = 'fixed';
    modal.style.margin = 0;
    modal.style.left = rect.left + 'px';
    modal.style.top = rect.top + 'px';
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    modal.style.left = (e.clientX - offsetX) + 'px';
    modal.style.top = (e.clientY - offsetY) + 'px';
  });
  document.addEventListener('mouseup', () => (dragging = false));
});

// ---------- Form submit -> API create ----------
document.querySelectorAll('[data-submit-form]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const formId = btn.dataset.submitForm;
    const form = document.getElementById(formId);
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      if (formId === 'form-order') {
        let itemId = Number(data.item_id);
        if (data.item_id === 'new') {
          const item = await api.items.create({
            customer_id: Number(data.customer_id),
            description: document.getElementById('new-item-description').value,
            identifier: document.getElementById('new-item-identifier').value || null,
            item_type: document.getElementById('new-item-type').value || null,
          });
          itemId = item.id;
        }
        await api.orders.create({
          customer_id: Number(data.customer_id),
          item_id: itemId,
          technician_id: data.technician_id ? Number(data.technician_id) : null,
          problem_description: data.problem_description || null,
          priority: data.priority,
        });
        closeModal('modal-order'); form.reset(); loadPage('orders');
      } else if (formId === 'form-customer') {
        if (editingCustomerId) {
          await api.customers.update(editingCustomerId, data);
          editingCustomerId = null;
        } else {
          await api.customers.create(data);
        }
        closeModal('modal-customer'); form.reset(); loadPage('customers');
      } else if (formId === 'form-technician') {
        let technician;
        if (editingTechnicianId) {
          technician = await api.technicians.update(editingTechnicianId, data);
          editingTechnicianId = null;
        } else {
          technician = await api.technicians.create(data);
          alert(`Technician created. Login account:\nUsername: ${technician.username}\nPassword: ${data.password || 'tech123'}`);
        }
        closeModal('modal-technician'); form.reset(); loadPage('technicians');
      } else if (formId === 'form-part') {
        const partData = {
          sku: data.sku,
          name: data.name,
          qty_on_hand: Number(data.qty_on_hand || 0),
          reorder_threshold: Number(data.reorder_threshold || 5),
          unit_cost: Number(data.unit_cost || 0),
          unit_price: Number(data.unit_price || 0),
        };
        if (editingPartId) {
          await api.parts.update(editingPartId, partData);
          editingPartId = null;
        } else {
          await api.parts.create(partData);
        }
        closeModal('modal-part'); form.reset(); loadPage('inventory');
      }
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  });
});

async function populateOrderModal() {
  const [customers, parts_items] = await Promise.all([api.customers.list(), api.items.list()]);

  const custSel = document.getElementById('order-customer-select');
  custSel.innerHTML = customers.map((c) => `<option value="${c.id}">${c.full_name}</option>`).join('');

  const itemSel = document.getElementById('order-item-select');
  itemSel.innerHTML = '<option value="new">+ New item…</option>' +
    parts_items.map((i) => `<option value="${i.id}">${i.description}${i.identifier ? ' — ' + i.identifier : ''}</option>`).join('');
  if (parts_items.length) itemSel.value = String(parts_items[0].id);

  const newItemFields = document.getElementById('order-new-item-fields');
  newItemFields.hidden = true;
  document.getElementById('new-item-description').required = false;
  document.getElementById('new-item-description').value = '';
  document.getElementById('new-item-identifier').value = '';
  document.getElementById('new-item-type').value = '';
  itemSel.addEventListener('change', () => {
    const isNew = itemSel.value === 'new';
    newItemFields.hidden = !isNew;
    document.getElementById('new-item-description').required = isNew;
  });

  const techField = document.getElementById('order-technician-field');
  const techSel = document.getElementById('order-technician-select');
  if (can('technician.view')) {
    techField.hidden = false;
    const technicians = await api.technicians.list();
    techSel.innerHTML = '<option value="">Unassigned</option>' +
      technicians.filter((t) => t.status === 'active').map((t) => `<option value="${t.id}">${t.full_name}</option>`).join('');
  } else {
    techField.hidden = true;
    techSel.innerHTML = '';
  }
}

// ---------- Dashboard ----------
async function renderDashboard() {
  const role = currentUser.role;
  const canViewOrders = can('repair_order.view') || can('repair_order.view.all');
  const orders = canViewOrders ? await api.orders.list() : [];
  const openOrders = orders.filter((o) => !['completed', 'invoiced', 'closed', 'cancelled', 'rejected'].includes(o.status));
  const byStatus = orders.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {});

  let kpis;
  if (can('repair_order.view.all')) {
    const summary = await api.dashboard.summary();
    kpis = `
      <div class="kpi-card">
        <div class="kpi-top">
          <div class="kpi-icon" style="background:var(--blue-50); color:var(--blue-600);"><i class="bi bi-clipboard2-pulse"></i></div>
        </div>
        <div class="kpi-label">Open Orders</div>
        <div class="kpi-value">${summary.open_orders}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top">
          <div class="kpi-icon" style="background:var(--amber-50); color:var(--amber-600);"><i class="bi bi-stopwatch"></i></div>
        </div>
        <div class="kpi-label">Avg. Turnaround</div>
        <div class="kpi-value">${summary.avg_turnaround_days}d</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top">
          <div class="kpi-icon" style="background:var(--rose-50); color:var(--rose-600);"><i class="bi bi-box-seam"></i></div>
        </div>
        <div class="kpi-label">Low Stock Parts</div>
        <div class="kpi-value">${summary.low_stock_parts}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top">
          <div class="kpi-icon" style="background:var(--emerald-50); color:var(--emerald-600);"><i class="bi bi-cash-stack"></i></div>
        </div>
        <div class="kpi-label">Revenue This Month</div>
        <div class="kpi-value">${peso(summary.revenue_this_month)}</div>
      </div>`;
  } else {
    kpis = `
      <div class="kpi-card">
        <div class="kpi-top">
          <div class="kpi-icon" style="background:var(--blue-50); color:var(--blue-600);"><i class="bi bi-clipboard2-pulse"></i></div>
        </div>
        <div class="kpi-label">My Open Jobs</div>
        <div class="kpi-value">${openOrders.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top">
          <div class="kpi-icon" style="background:var(--amber-50); color:var(--amber-600);"><i class="bi bi-tools"></i></div>
        </div>
        <div class="kpi-label">In Progress</div>
        <div class="kpi-value">${byStatus.in_progress || 0}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top">
          <div class="kpi-icon" style="background:var(--emerald-50); color:var(--emerald-600);"><i class="bi bi-check2-circle"></i></div>
        </div>
        <div class="kpi-label">Completed</div>
        <div class="kpi-value">${byStatus.completed || 0}</div>
      </div>`;
  }
  document.getElementById('dashboard-kpis').innerHTML = kpis;

  if (role === 'parts_staff') {
    const parts = await api.parts.list();
    const low = parts.filter((p) => p.qty_on_hand <= p.reorder_threshold).sort((a, b) => a.qty_on_hand - b.qty_on_hand);
    document.getElementById('dashboard-status-breakdown').innerHTML =
      low.map((p) => `
        <div class="status-list-item">
          <div class="status-row">
            <span><i class="bi bi-circle-fill" style="color:var(--rose-600); font-size:8px;"></i> ${p.name}</span>
            <span class="cell-sub">${p.qty_on_hand} left (${p.reorder_threshold} threshold)</span>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${Math.min(100, Math.round((p.qty_on_hand / (p.reorder_threshold || 1)) * 100))}%; background:var(--rose-600);"></div></div>
        </div>`).join('')
      || '<div class="status-list-item cell-sub">All parts in stock.</div>';
    document.getElementById('dashboard-activity').innerHTML =
      '<div class="activity-item cell-sub">Order data is not available to the Parts Staff role.</div>';
    return;
  }

  const statuses = Object.entries(byStatus);
  const total = statuses.reduce((sum, [, n]) => sum + n, 0) || 1;
  document.getElementById('dashboard-status-breakdown').innerHTML = statuses.map(([status, count]) => `
    <div class="status-list-item">
      <div class="status-row">
        <span><i class="bi bi-circle-fill" style="color:var(--blue-600); font-size:8px;"></i> ${label(status)}</span>
        <span class="cell-sub">${count} Orders</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${Math.round((count / total) * 100)}%; background:var(--blue-600);"></div></div>
    </div>
  `).join('') || '<div class="status-list-item cell-sub">No orders yet.</div>';

  document.getElementById('dashboard-activity').innerHTML = orders.slice(0, 5).map((o) => `
    <div class="activity-item">
      <div class="activity-icon"><i class="bi bi-clipboard2-check"></i></div>
      <div>
        <div class="activity-title">${o.ro_number} — ${o.item?.description ?? ''}</div>
        <div class="activity-sub">${o.customer?.full_name ?? ''} · ${label(o.status)}</div>
      </div>
    </div>
  `).join('') || '<div class="activity-item cell-sub">No recent activity.</div>';
}

// ---------- Repair Orders ----------
async function renderOrders() {
  const role = currentUser.role;
  const status = document.getElementById('orders-status-filter').value;
  const q = document.getElementById('orders-search').value;
  const orders = await api.orders.list({ ...(status && { status }), ...(q && { q }) });

  document.querySelector('#page-orders .page-title').textContent =
    role === 'technician' ? 'My Work Orders' : 'Repair Orders';

  const rows = orders.map((o) => {
    const statusCell = role === 'technician'
      ? `<select class="status-select" data-order-id="${o.id}">${TECH_STATUSES.map((s) => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${label(s)}</option>`).join('')}</select>`
      : can('repair_order.approve')
        ? `<select class="status-select" data-order-id="${o.id}">${ALL_STATUSES.map((s) => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${label(s)}</option>`).join('')}</select>`
        : badge(STATUS_BADGE[o.status], label(o.status));
    const actions = can('repair_order.approve') ? kebab(o.id, 'order') : '';
    return `
    <tr data-order-row="${o.id}">
      <td><b>${o.ro_number}</b><div class="cell-sub">${dateFmt(o.created_at)}</div></td>
      <td>${o.customer?.full_name ?? '—'}</td>
      <td>${o.item?.description ?? '—'}${o.item?.identifier ? `<div class="cell-sub">${o.item.identifier}</div>` : ''}</td>
      <td>${o.technician?.full_name ?? '—'}</td>
      <td>${badge(PRIORITY_BADGE[o.priority], label(o.priority))}</td>
      <td>${statusCell}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('') || `<tr class="empty-row"><td colspan="7">No repair orders found.</td></tr>`;

  document.getElementById('orders-table-body').innerHTML = rows;
  document.getElementById('orders-count').textContent = `Showing ${orders.length} order(s)`;

  document.querySelectorAll('[data-order-row]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('select') || e.target.closest('.kebab-wrap')) return;
      openOrderDetail(Number(row.dataset.orderRow));
    });
  });
  wireKebabs();

  document.querySelectorAll('.status-select').forEach((sel) => {
    sel.addEventListener('click', (e) => e.stopPropagation());
    sel.addEventListener('change', async () => {
      try {
        await api.orders.update(Number(sel.dataset.orderId), { status: sel.value });
      } catch (err) {
        alert('Update failed: ' + err.message);
        renderOrders();
      }
    });
  });
}
document.getElementById('orders-status-filter').addEventListener('change', renderOrders);
document.getElementById('orders-search').addEventListener('input', debounce(renderOrders));

// ---------- Order Detail ----------
let activeOrderId = null;
let currentPage = 'dashboard';
let editingCustomerId = null;
let editingTechnicianId = null;
let editingPartId = null;
let lastCustomers = [];
let lastTechnicians = [];
let lastParts = [];

async function openOrderDetail(id) {
  activeOrderId = id;
  const role = currentUser.role;
  const order = await api.orders.get(id);
  let invoice = null;
  if (can('invoice.view')) {
    const invoices = await api.invoices.list({ repair_order_id: id });
    invoice = invoices[0] || null;
  }

  document.getElementById('order-detail-title').textContent = `Repair Order ${order.ro_number}`;
  document.getElementById('order-detail-badge').innerHTML = badge(STATUS_BADGE[order.status], label(order.status));

  document.getElementById('od-ro').textContent = order.ro_number;
  document.getElementById('od-customer').textContent = order.customer?.full_name ?? '—';
  document.getElementById('od-item').textContent = order.item?.description ?? '—';
  document.getElementById('od-technician').textContent = order.technician?.full_name ?? 'Unassigned';
  document.getElementById('od-priority').innerHTML = badge(PRIORITY_BADGE[order.priority], label(order.priority));
  document.getElementById('od-created').textContent = dateFmt(order.created_at);

  document.getElementById('od-problem').value = order.problem_description ?? '';
  document.getElementById('od-inspection').value = order.inspection_notes ?? '';
  document.getElementById('od-diagnosis').value = order.diagnosis ?? '';
  document.getElementById('od-labor').value = order.labor_cost ?? 0;
  document.getElementById('od-estimated').value = order.estimated_cost ?? '';
  document.getElementById('od-actual').value = order.actual_cost != null ? peso(order.actual_cost) : '';
  document.getElementById('od-parts-total').value = peso(order.parts_total);
  document.getElementById('od-quote-total').value = peso(order.quote_total);
  document.getElementById('od-warranty-days').value = order.warranty_days || 0;
  document.getElementById('od-warranty-notes').value = order.warranty_notes ?? '';
  document.getElementById('od-released').value = order.released_at ? dateFmt(order.released_at) : '—';
  document.getElementById('od-completed').value = order.completed_at ? dateFmt(order.completed_at) : '—';

  document.getElementById('od-problem').disabled = !can('repair_order.create');
  document.getElementById('od-estimated').disabled = !can('repair_order.approve');
  ['od-labor', 'od-warranty-days', 'od-warranty-notes'].forEach((f) => {
    document.getElementById(f).disabled = !can('repair_order.approve');
  });
  ['od-inspection', 'od-diagnosis'].forEach((f) => {
    document.getElementById(f).disabled = !can('repair_order.diagnose');
  });

  const statusSel = document.getElementById('od-status');
  const statuses = role === 'technician' ? TECH_STATUSES
    : can('repair_order.approve') ? ALL_STATUSES
    : [order.status];
  statusSel.innerHTML = statuses.map((s) => `<option value="${s}" ${order.status === s ? 'selected' : ''}>${label(s)}</option>`).join('');
  statusSel.disabled = !(role === 'technician' || can('repair_order.approve'));

  await renderOrderParts(order);
  await renderOrderInvoice(order, invoice);
  renderOrderHistory(order);
  openModal('modal-order-detail');
}

function renderOrderHistory(order) {
  const el = document.getElementById('od-status-history');
  const items = order.status_history;
  if (!items || !items.length) {
    el.innerHTML = '<div class="cell-sub">No status changes recorded.</div>';
    return;
  }
  el.innerHTML = items.map((h) => `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <div class="timeline-head">${h.from_status ? `${label(h.from_status)} &rarr; ` : ''}${label(h.to_status)}</div>
        <div class="cell-sub">${dateFmt(h.created_at)}${h.note ? ` &middot; ${h.note}` : ''}</div>
      </div>
    </div>`).join('');
}

async function refreshOrderDetail() {
  if (activeOrderId) await openOrderDetail(activeOrderId);
}

async function renderOrderParts(order) {
  const canManageParts = can('repair_order.parts.add');
  document.getElementById('od-parts-body').innerHTML = order.parts.map((line) => `
    <tr>
      <td>${line.part?.name ?? '—'}<div class="cell-sub">${line.part?.sku ?? ''}</div></td>
      <td>${line.quantity}</td>
      <td>${peso(line.unit_price)}</td>
      <td>${peso(line.unit_price * line.quantity)}</td>
      <td>${canManageParts ? `<button class="link-danger" data-remove-line="${line.id}">Remove</button>` : ''}</td>
    </tr>`).join('') || '<tr class="empty-row"><td colspan="5">No parts added yet.</td></tr>';

  const addRow = document.getElementById('od-add-part');
  if (canManageParts) {
    addRow.hidden = false;
    const parts = await api.parts.list();
    const sel = document.getElementById('od-part-select');
    sel.innerHTML = parts.filter((p) => p.qty_on_hand > 0).map((p) =>
      `<option value="${p.id}">${p.name} (${p.qty_on_hand} in stock)</option>`).join('')
      || '<option value="">No parts in stock</option>';
  } else {
    addRow.hidden = true;
  }

  document.querySelectorAll('[data-remove-line]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api.orders.removePart(order.id, Number(btn.dataset.removeLine));
        await refreshOrderDetail();
      } catch (err) { alert('Remove failed: ' + err.message); }
    });
  });
}

document.getElementById('od-part-add').addEventListener('click', async () => {
  const partId = document.getElementById('od-part-select').value;
  const qty = Number(document.getElementById('od-part-qty').value) || 1;
  if (!partId) return;
  try {
    await api.orders.addPart(activeOrderId, { part_id: Number(partId), quantity: qty });
    document.getElementById('od-part-qty').value = 1;
    await refreshOrderDetail();
  } catch (err) { alert('Add part failed: ' + err.message); }
});

async function renderOrderInvoice(order, invoice) {
  const container = document.getElementById('od-invoice');

  if (!can('invoice.view')) {
    container.innerHTML = '<div class="cell-sub">Billing details are managed by the front desk and management.</div>';
    return;
  }

  if (!invoice) {
    const canInvoice = ['completed'].includes(order.status);
    container.innerHTML = `
      <div class="cell-sub">No invoice yet.</div>
      ${can('invoice.create') && canInvoice
        ? `<button class="btn btn-primary btn-sm" id="od-generate-invoice" style="margin-top:10px;"><i class="bi bi-receipt"></i> Generate Invoice (${peso(order.quote_total)})</button>`
        : ''}`;
    const genBtn = document.getElementById('od-generate-invoice');
    if (genBtn) {
      genBtn.addEventListener('click', async () => {
        try {
          await api.invoices.create({
            repair_order_id: order.id,
            customer_id: order.customer_id,
            total: order.quote_total,
            amount_paid: 0,
          });
          await refreshOrderDetail();
        } catch (err) { alert('Invoice failed: ' + err.message); }
      });
    }
    return;
  }

  const payments = await api.payments.list(invoice.id);
  const balance = invoice.total - invoice.amount_paid;

  container.innerHTML = `
    <div class="invoice-row">
      <div>
        <div class="detail-value">${invoice.invoice_number}</div>
        <div class="cell-sub">Issued ${dateFmt(invoice.issued_at)}${invoice.paid_at ? ` · Paid ${dateFmt(invoice.paid_at)}` : ''}</div>
      </div>
      <div class="invoice-stats">
        <div class="detail-item"><div class="detail-label">Total</div><div class="detail-value">${peso(invoice.total)}</div></div>
        <div class="detail-item"><div class="detail-label">Paid</div><div class="detail-value">${peso(invoice.amount_paid)}</div></div>
        <div class="detail-item"><div class="detail-label">Balance</div><div class="detail-value">${peso(balance)}</div></div>
        <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${badge(INVOICE_BADGE[invoice.status], label(invoice.status))}</div></div>
      </div>
    </div>
    <table class="payments-table">
      <tbody>${payments.map((p) => `
        <tr>
          <td>${dateFmt(p.paid_at)}</td>
          <td>${peso(p.amount)}</td>
          <td>${label(p.method)}</td>
          <td class="cell-sub">${p.reference ?? ''}</td>
        </tr>`).join('') || '<tr class="empty-row"><td colspan="4">No payments recorded.</td></tr>'}
      </tbody>
    </table>
    ${can('payment.record') ? `
      <div class="field-row" id="od-payment-form">
        <div class="field"><label>Amount</label><input class="input" id="od-pay-amount" type="number" min="0.01" step="0.01" placeholder="0.00"></div>
        <div class="field"><label>Method</label><select class="input" id="od-pay-method"><option value="cash">Cash</option><option value="gcash">GCash</option><option value="card">Card</option><option value="bank">Bank Transfer</option></select></div>
        <div class="field"><label>Reference</label><input class="input" id="od-pay-ref" placeholder="optional"></div>
        <div class="field" style="max-width:150px;"><label>&nbsp;</label><button class="btn btn-primary" id="od-pay-add">Record Payment</button></div>
      </div>` : ''}`;

  const payBtn = document.getElementById('od-pay-add');
  if (payBtn) {
    payBtn.addEventListener('click', async () => {
      const amount = Number(document.getElementById('od-pay-amount').value);
      if (!amount || amount <= 0) { alert('Enter a valid amount'); return; }
      try {
        await api.payments.create({
          invoice_id: invoice.id,
          amount,
          method: document.getElementById('od-pay-method').value,
          reference: document.getElementById('od-pay-ref').value || null,
        });
        await refreshOrderDetail();
      } catch (err) { alert('Payment failed: ' + err.message); }
    });
  }
}

document.getElementById('od-save').addEventListener('click', async () => {
  if (!activeOrderId) return;
  const payload = {};
  if (currentUser.role !== 'front_desk') {
    payload.status = document.getElementById('od-status').value;
  }
  if (can('repair_order.diagnose')) {
    payload.inspection_notes = document.getElementById('od-inspection').value;
    payload.diagnosis = document.getElementById('od-diagnosis').value;
  }
  if (can('repair_order.create')) {
    payload.problem_description = document.getElementById('od-problem').value;
  }
  if (can('repair_order.approve')) {
    payload.labor_cost = Number(document.getElementById('od-labor').value) || 0;
    const est = document.getElementById('od-estimated').value;
    if (est !== '') payload.estimated_cost = Number(est) || 0;
    payload.warranty_days = Number(document.getElementById('od-warranty-days').value) || 0;
    payload.warranty_notes = document.getElementById('od-warranty-notes').value;
  }
  try {
    await api.orders.update(activeOrderId, payload);
    loadPage('orders');
    await refreshOrderDetail();
  } catch (err) { alert('Save failed: ' + err.message); }
});

// ---------- Admin: kebab menus, edit & delete ----------
function kebab(id, entity) {
  return `<div class="kebab-wrap">
    <button class="kebab-btn" aria-label="Actions"><i class="bi bi-three-dots-vertical"></i></button>
    <div class="kebab-menu">
      <button class="kebab-item" data-entity="${entity}" data-action="edit" data-id="${id}"><i class="bi bi-pencil"></i> Edit</button>
      <button class="kebab-item danger" data-entity="${entity}" data-action="delete" data-id="${id}"><i class="bi bi-trash"></i> Delete</button>
    </div>
  </div>`;
}

document.addEventListener('click', (e) => {
  const openMenu = document.querySelector('.kebab-menu.open');
  if (openMenu) openMenu.classList.remove('open');
  const btn = e.target.closest('.kebab-btn');
  if (btn) {
    e.stopPropagation();
    btn.nextElementSibling.classList.add('open');
  }
});

function wireKebabs() {
  document.querySelectorAll('.kebab-item[data-entity]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { entity, action, id } = btn.dataset;
      document.querySelectorAll('.kebab-menu.open').forEach((m) => m.classList.remove('open'));
      if (action === 'edit') {
        if (entity === 'customer') openEditCustomer(Number(id));
        else if (entity === 'technician') openEditTechnician(Number(id));
        else if (entity === 'part') openEditPart(Number(id));
        else if (entity === 'order') openOrderDetail(Number(id));
      } else if (action === 'delete') {
        deleteRecord(entity, Number(id));
      }
    });
  });
}

function resetModalForCreate(modalId) {
  const formId = modalId.replace('modal-', 'form-');
  const form = document.getElementById(formId);
  if (form) form.reset();
  const title = document.querySelector(`#${modalId} .modal-title`);
  const submit = document.querySelector(`#${modalId} [data-submit-form]`);
  if (modalId === 'modal-customer') {
    editingCustomerId = null;
    if (title) title.textContent = 'New Customer';
    if (submit) submit.textContent = 'Save Customer';
  } else if (modalId === 'modal-technician') {
    editingTechnicianId = null;
    if (title) title.textContent = 'New Technician';
    if (submit) submit.textContent = 'Save Technician';
  } else if (modalId === 'modal-part') {
    editingPartId = null;
    if (title) title.textContent = 'New Part';
    if (submit) submit.textContent = 'Save Part';
  }
}

function openEditCustomer(id) {
  const c = lastCustomers.find((x) => x.id === id);
  if (!c) return;
  editingCustomerId = id;
  const form = document.getElementById('form-customer');
  form.full_name.value = c.full_name ?? '';
  form.phone.value = c.phone ?? '';
  form.email.value = c.email ?? '';
  form.address.value = c.address ?? '';
  document.querySelector('#modal-customer .modal-title').textContent = 'Edit Customer';
  document.querySelector('#modal-customer [data-submit-form]').textContent = 'Save Changes';
  openModal('modal-customer');
}

function openEditTechnician(id) {
  const t = lastTechnicians.find((x) => x.id === id);
  if (!t) return;
  editingTechnicianId = id;
  const form = document.getElementById('form-technician');
  form.full_name.value = t.full_name ?? '';
  form.email.value = t.email ?? '';
  form.phone.value = t.phone ?? '';
  form.specialty.value = t.specialty ?? 'General';
  form.username.value = t.username ?? '';
  form.password.value = '';
  document.querySelector('#modal-technician .modal-title').textContent = 'Edit Technician';
  document.querySelector('#modal-technician [data-submit-form]').textContent = 'Save Changes';
  openModal('modal-technician');
}

function openEditPart(id) {
  const p = lastParts.find((x) => x.id === id);
  if (!p) return;
  editingPartId = id;
  const form = document.getElementById('form-part');
  form.sku.value = p.sku ?? '';
  form.name.value = p.name ?? '';
  form.qty_on_hand.value = p.qty_on_hand ?? 0;
  form.reorder_threshold.value = p.reorder_threshold ?? 5;
  form.unit_cost.value = p.unit_cost ?? 0;
  form.unit_price.value = p.unit_price ?? 0;
  document.querySelector('#modal-part .modal-title').textContent = 'Edit Part';
  document.querySelector('#modal-part [data-submit-form]').textContent = 'Save Changes';
  openModal('modal-part');
}

async function deleteRecord(entity, id) {
  const names = { customer: 'this customer', technician: 'this technician', part: 'this part', order: 'this repair order' };
  if (!confirm(`Delete ${names[entity]}? This cannot be undone.`)) return;
  try {
    if (entity === 'customer') await api.customers.remove(id);
    else if (entity === 'technician') await api.technicians.remove(id);
    else if (entity === 'part') await api.parts.remove(id);
    else if (entity === 'order') await api.orders.remove(id);
    loadPage(currentPage);
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// ---------- Customers ----------
async function renderCustomers() {
  const q = document.getElementById('customers-search').value;
  const customers = await api.customers.list(q);
  lastCustomers = customers;
  const canManage = can('customer.manage');

  document.getElementById('customers-table-body').innerHTML = customers.map((c) => `
    <tr>
      <td><div class="avatar-tiny" style="display:inline-flex;margin-right:8px;">${initials(c.full_name)}</div><b>${c.full_name}</b></td>
      <td>${c.phone ?? '—'}</td>
      <td>${c.email ?? '—'}</td>
      ${canManage ? `<td>${kebab(c.id, 'customer')}</td>` : ''}
    </tr>
  `).join('') || `<tr class="empty-row"><td colspan="${canManage ? 4 : 3}">No customers found.</td></tr>`;

  document.getElementById('customers-count').textContent = `Showing ${customers.length} customer(s)`;
  if (canManage) wireKebabs();
}
document.getElementById('customers-search').addEventListener('input', debounce(renderCustomers));

// ---------- Technicians ----------
async function renderTechnicians() {
  const q = document.getElementById('technicians-search').value;
  const technicians = await api.technicians.list(q);
  lastTechnicians = technicians;
  const canManage = can('technician.manage');

  document.getElementById('technicians-table-body').innerHTML = technicians.map((t) => `
    <tr>
      <td><div class="avatar-tiny" style="display:inline-flex;margin-right:8px;">${initials(t.full_name)}</div><b>${t.full_name}</b></td>
      <td>${t.email}</td>
      <td>${t.specialty}</td>
      <td>${badge(TECH_BADGE[t.status], label(t.status))}</td>
      ${canManage ? `<td>${kebab(t.id, 'technician')}</td>` : ''}
    </tr>
  `).join('') || `<tr class="empty-row"><td colspan="${canManage ? 5 : 4}">No technicians found.</td></tr>`;

  document.getElementById('technicians-count').textContent = `Showing ${technicians.length} technician(s)`;
  if (canManage) wireKebabs();
}
document.getElementById('technicians-search').addEventListener('input', debounce(renderTechnicians));

// ---------- Inventory ----------
async function renderParts() {
  const q = document.getElementById('parts-search').value;
  const parts = await api.parts.list(q);
  lastParts = parts;
  const canManage = can('parts.manage');

  document.getElementById('parts-table-body').innerHTML = parts.map((p) => {
    const stockBadge = p.qty_on_hand === 0 || p.qty_on_hand <= p.reorder_threshold / 2
      ? badge('rose', 'Critical')
      : p.qty_on_hand <= p.reorder_threshold ? badge('amber', 'Low Stock') : badge('green', 'In Stock');
    return `
    <tr>
      <td>${p.sku}</td>
      <td>${p.name}</td>
      <td>${p.qty_on_hand}</td>
      <td>${peso(p.unit_cost)}</td>
      <td>${peso(p.unit_price)}</td>
      <td>${stockBadge}</td>
      ${canManage ? `<td>${kebab(p.id, 'part')}</td>` : ''}
    </tr>`;
  }).join('') || `<tr class="empty-row"><td colspan="${canManage ? 7 : 6}">No parts found.</td></tr>`;

  document.getElementById('parts-count').textContent = `Showing ${parts.length} part(s)`;
  if (canManage) wireKebabs();
}
document.getElementById('parts-search').addEventListener('input', debounce(renderParts));

// ---------- Invoices ----------
async function renderInvoices() {
  const status = document.getElementById('invoices-status-filter').value;
  const invoices = await api.invoices.list(status ? { status } : {});

  document.getElementById('invoices-table-body').innerHTML = invoices.map((inv) => `
    <tr>
      <td><b>${inv.invoice_number}</b></td>
      <td>${inv.repair_order?.ro_number ?? '—'}</td>
      <td>${inv.customer?.full_name ?? '—'}</td>
      <td>${peso(inv.total)}</td>
      <td>${dateFmt(inv.issued_at)}</td>
      <td>${inv.paid_at ? dateFmt(inv.paid_at) : '—'}</td>
      <td>${badge(INVOICE_BADGE[inv.status], label(inv.status))}</td>
    </tr>
  `).join('') || `<tr class="empty-row"><td colspan="7">No invoices found.</td></tr>`;

  document.getElementById('invoices-count').textContent = `Showing ${invoices.length} invoice(s)`;
}
document.getElementById('invoices-status-filter').addEventListener('change', renderInvoices);

// ---------- Init ----------
async function initApp() {
  const me = await api.auth.me();
  currentUser = me;
  buildNav();
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => switchPage(item.dataset.page));
  });
  renderDashboard();
}

initApp();
