import 'bootstrap-icons/font/bootstrap-icons.css';
import './style.css';
import { api, getStoredUser, redirectToLogin } from './api.js';
import { badge, dateFmt, esc, initials, label, peso, PRIORITY_BADGE, STATUS_BADGE, INVOICE_BADGE, TECH_BADGE, showToast } from './ui.js';

// ---------- Auth guard ----------
let currentUser = getStoredUser();
if (!currentUser || !localStorage.getItem('rs_token')) {
  localStorage.removeItem('rs_token');
  localStorage.removeItem('rs_user');
  window.location.href = '/staff-login.html';
}

const ROLE_LABEL = {
  admin: 'Administrator',
  technician: 'Technician',
};

const can = (perm) => currentUser.permissions?.includes(perm) ?? false;

const NAV = {
  admin: {
    Management: [
      ['dashboard', 'bi-grid-1x2-fill', 'Dashboard'],
      ['orders', 'bi-clipboard2-check', 'Repair Orders'],
      ['customers', 'bi-people', 'Customers'],
      ['technicians', 'bi-person-badge', 'Technicians'],
      ['settings', 'bi-gear', 'Settings'],
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
      ['pricelist', 'bi-tags', 'Price List'],
      ['inventory', 'bi-box-seam', 'Parts Catalog'],
    ],
  },
};

const ALL_STATUSES = ['requested', 'diagnosed', 'approved', 'in_progress', 'on_hold', 'completed', 'invoiced', 'closed', 'cancelled', 'rejected'];
const TECH_STATUSES = ['requested', 'diagnosed', 'approved', 'in_progress', 'on_hold', 'completed'];

// ---------- Helpers ----------
function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function createCombobox({ input, list, getEntries, onSelect, onAddNew, debounceMs = 150 }) {
  let entries = [];
  let activeIndex = -1;
  let openToken = 0;

  function render() {
    const items = entries.map((e, i) => {
      const cls = `combobox-item ${e.kind === 'addnew' ? 'combobox-addnew' : ''} ${i === activeIndex ? 'active' : ''}`.trim();
      const sub = e.sub ? `<small>${esc(e.sub)}</small>` : '';
      return `<li class="${cls}" data-index="${i}"><span>${esc(e.label)}</span>${sub}</li>`;
    }).join('');
    list.innerHTML = items || '<li class="combobox-empty">No matches</li>';
  }

  async function open() {
    const q = input.value.trim();
    const token = ++openToken;
    entries = (await getEntries(q)) || [];
    if (token !== openToken) return;
    activeIndex = entries.length ? 0 : -1;
    list.classList.add('open');
    render();
  }

  function close() {
    openToken++;
    list.classList.remove('open');
    list.innerHTML = '';
  }

  function choose(i) {
    const e = entries[i];
    if (!e) return;
    close();
    input.dataset.selected = '1';
    if (e.kind === 'addnew') { if (onAddNew) onAddNew(e); return; }
    input.value = e.label;
    if (onSelect) onSelect(e);
  }

  const debouncedOpen = debounce(() => { if (document.activeElement === input) open(); }, debounceMs);
  input.addEventListener('input', () => {
    if (!input.value.trim()) { input.dataset.selected = ''; close(); if (onSelect) onSelect(null); return; }
    input.dataset.selected = '';
    debouncedOpen();
  });
  input.addEventListener('focus', () => { if (input.value.trim()) open(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && list.classList.contains('open')) {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, entries.length - 1);
      render();
    } else if (e.key === 'ArrowUp' && list.classList.contains('open')) {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      render();
    } else if (e.key === 'Enter' && list.classList.contains('open') && activeIndex >= 0) {
      e.preventDefault();
      choose(activeIndex);
    } else if (e.key === 'Escape' && list.classList.contains('open')) {
      e.preventDefault();
      close();
    }
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('[data-index]');
    if (!li) return;
    e.preventDefault();
    choose(Number(li.dataset.index));
  });

  return {
    reset() {
      input.value = '';
      input.dataset.selected = '';
      close();
    },
    close,
  };
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

  document.getElementById('topbar-avatar').textContent = initials(currentUser.full_name || currentUser.username);
  document.getElementById('user-menu-avatar').textContent = initials(currentUser.full_name || currentUser.username);
  document.getElementById('user-menu-name').textContent = currentUser.full_name || currentUser.username;
  document.getElementById('user-menu-role').textContent = ROLE_LABEL[currentUser.role] || currentUser.role;

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

// ---------- Topbar user menu ----------
const userMenuBtn = document.getElementById('topbar-avatar');
const userMenuPop = document.getElementById('user-menu-pop');
userMenuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = !userMenuPop.hidden;
  userMenuPop.hidden = open;
  userMenuBtn.setAttribute('aria-expanded', String(!open));
});
userMenuBtn.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); userMenuBtn.click(); }
});
document.addEventListener('click', () => {
  userMenuPop.hidden = true;
  userMenuBtn.setAttribute('aria-expanded', 'false');
});
document.getElementById('user-menu-logout').addEventListener('click', redirectToLogin);

// ---------- Notifications ----------
const bellBtn = document.getElementById('bell-btn');
const bellDot = document.getElementById('bell-dot');
const notifPanel = document.getElementById('notif-panel');
const notifList = document.getElementById('notif-list');

async function loadNotifications() {
  if (!can('repair_order.view') && !can('repair_order.view.all')) return;
  const orders = await api.orders.list();
  const recent = orders
    .filter((o) => !['cancelled', 'rejected'].includes(o.status))
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 8);

  if (!recent.length) {
    notifList.innerHTML = '<div class="notif-empty">No recent activity.</div>';
    bellDot.classList.add('hidden');
    return;
  }

  const openCount = orders.filter((o) => ['requested', 'diagnosed', 'approved', 'in_progress', 'on_hold'].includes(o.status)).length;
  bellDot.classList.toggle('hidden', openCount === 0);

  notifList.innerHTML = recent.map((o) => {
    const isUrgent = o.priority === 'urgent' || o.priority === 'high';
    const bgColor = isUrgent ? 'var(--rose-50)' : 'var(--blue-50)';
    const fgColor = isUrgent ? 'var(--rose-600)' : 'var(--blue-600)';
    const icon = ['completed', 'invoiced', 'closed'].includes(o.status) ? 'bi-check2-circle' : 'bi-clipboard2-check';
    return `
      <div class="notif-item" data-order-id="${o.id}">
        <div class="notif-icon" style="background:${bgColor}; color:${fgColor};"><i class="bi ${icon}"></i></div>
        <div>
          <div class="notif-text"><strong>${o.ro_number}</strong> — ${o.item?.description ?? 'Repair order'}</div>
          <div class="notif-time">${o.customer?.full_name ?? ''} · ${label(o.status)}</div>
        </div>
      </div>`;
  }).join('');
}

bellBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = !notifPanel.hidden;
  notifPanel.hidden = open;
  if (!open) loadNotifications();
});
document.addEventListener('click', (e) => {
  if (!notifPanel.contains(e.target) && e.target !== bellBtn) notifPanel.hidden = true;
});
notifList.addEventListener('click', (e) => {
  const item = e.target.closest('[data-order-id]');
  if (item) {
    notifPanel.hidden = true;
    openOrderDetail(Number(item.dataset.orderId));
  }
});

// ---------- Change password ----------
function openChangePassword() {
  document.getElementById('form-password').reset();
  document.getElementById('password-error').hidden = true;
  openModal('modal-password');
}
document.getElementById('user-menu-changepw').addEventListener('click', () => {
  userMenuPop.hidden = true;
  userMenuBtn.setAttribute('aria-expanded', 'false');
  openChangePassword();
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
    showToast('Password updated successfully.');
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
    settings: renderSettings,
    pricelist: renderPriceList,
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
        if (!data.customer_id) {
          alert('Please select a customer (or add a new one) before saving.');
          document.getElementById('order-customer-input').focus();
          return;
        }
        if (!data.item_id) {
          alert('Please select an item (or add a new one) before saving.');
          document.getElementById('order-item-input').focus();
          return;
        }
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
          technician_id: data.technician_id ? Number(data.technician_id)
            : currentUser.role === 'technician' ? currentUser.technician_id : null,
          problem_description: data.problem_description || null,
          priority: data.priority,
        });
        closeModal('modal-order'); form.reset(); loadPage('orders');
        showToast('Repair order created.');
      } else if (formId === 'form-customer') {
        let created = null;
        const wasEditing = !!editingCustomerId;
        if (editingCustomerId) {
          await api.customers.update(editingCustomerId, data);
          editingCustomerId = null;
        } else {
          created = await api.customers.create(data);
        }
        closeModal('modal-customer');
        form.reset();
        if (quickAddFromOrder) {
          quickAddFromOrder = false;
          if (created) selectCustomerInOrderForm(created);
          return;
        }
        loadPage('customers');
        showToast(wasEditing ? 'Customer updated.' : 'Customer created.');
      } else if (formId === 'form-technician') {
        let technician;
        if (editingTechnicianId) {
          technician = await api.technicians.update(editingTechnicianId, data);
          editingTechnicianId = null;
        } else {
          technician = await api.technicians.create(data);
          showToast(`Technician created. Login: ${technician.username} / ${data.password || 'tech123'}`, 'info');
        }
        closeModal('modal-technician'); form.reset(); loadPage('technicians');
        if (editingTechnicianId) showToast('Technician updated.');
      } else if (formId === 'form-part') {
        const partData = {
          sku: data.sku,
          name: data.name,
          qty_on_hand: Number(data.qty_on_hand || 0),
          reorder_threshold: Number(data.reorder_threshold || 5),
          unit_cost: Number(data.unit_cost || 0),
          unit_price: Number(data.unit_price || 0),
        };
        const wasEditingPart = !!editingPartId;
        if (editingPartId) {
          await api.parts.update(editingPartId, partData);
          editingPartId = null;
        } else {
          await api.parts.create(partData);
        }
        closeModal('modal-part'); form.reset(); loadPage('inventory');
        showToast(wasEditingPart ? 'Part updated.' : 'Part created.');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
});

async function populateOrderModal() {
  const [customers, items] = await Promise.all([api.customers.list(), api.items.list()]);
  orderCustomers = customers;
  orderItems = items;

  const newItemFields = document.getElementById('order-new-item-fields');
  newItemFields.hidden = true;
  document.getElementById('new-item-description').required = false;
  document.getElementById('new-item-description').value = '';
  document.getElementById('new-item-identifier').value = '';
  document.getElementById('new-item-type').value = '';
  document.getElementById('order-customer-id').value = '';
  document.getElementById('order-item-id').value = '';
  customerCombobox.reset();
  itemCombobox.reset();

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

function selectCustomerInOrderForm(c) {
  orderCustomers.unshift(c);
  const input = document.getElementById('order-customer-input');
  const id = document.getElementById('order-customer-id');
  input.value = c.full_name;
  input.dataset.selected = '1';
  id.value = String(c.id);
}

function openCustomerQuickAdd(name) {
  quickAddFromOrder = true;
  const form = document.getElementById('form-customer');
  editingCustomerId = null;
  form.reset();
  form.full_name.value = name;
  document.querySelector('#modal-customer .modal-title').textContent = 'New Customer';
  document.querySelector('#modal-customer [data-submit-form]').textContent = 'Save Customer';
  openModal('modal-customer');
  form.full_name.focus();
}

function initOrderComboboxes() {
  customerCombobox = createCombobox({
    input: document.getElementById('order-customer-input'),
    list: document.getElementById('order-customer-list'),
    getEntries: async (q) => {
      const rows = q ? await api.customers.list(q) : orderCustomers;
      const entries = rows.map((c) => ({
        kind: 'option',
        value: c.id,
        label: c.full_name,
        sub: [c.phone, c.email].filter(Boolean).join(' · '),
      }));
      if (q.trim()) entries.push({ kind: 'addnew', name: q.trim(), label: `+ Add "${q.trim()}" as new customer` });
      return entries;
    },
    onSelect: (e) => { document.getElementById('order-customer-id').value = e ? String(e.value) : ''; },
    onAddNew: (e) => openCustomerQuickAdd(e.name),
  });

  itemCombobox = createCombobox({
    input: document.getElementById('order-item-input'),
    list: document.getElementById('order-item-list'),
    getEntries: (q) => {
      const t = q.trim().toLowerCase();
      const matches = orderItems.filter((i) => !t
        || (i.description || '').toLowerCase().includes(t)
        || (i.identifier || '').toLowerCase().includes(t));
      const entries = matches.map((i) => ({
        kind: 'option',
        value: i.id,
        label: i.description || 'Untitled item',
        sub: i.identifier || (i.item_type ? label(i.item_type) : ''),
      }));
      entries.push({ kind: 'addnew', label: '+ New item…' });
      return entries;
    },
    onSelect: (e) => {
      const newItemFields = document.getElementById('order-new-item-fields');
      document.getElementById('new-item-description').required = false;
      newItemFields.hidden = true;
      if (e) document.getElementById('order-item-id').value = String(e.value);
    },
    onAddNew: () => {
      const input = document.getElementById('order-item-input');
      if (!input.value.trim()) input.value = '+ New item…';
      document.getElementById('order-item-id').value = 'new';
      const newItemFields = document.getElementById('order-new-item-fields');
      document.getElementById('new-item-description').required = true;
      newItemFields.hidden = false;
      document.getElementById('new-item-description').focus();
    },
  });
}

// ---------- Dashboard ----------
async function renderDashboard() {
  const role = currentUser.role;
  const canViewOrders = can('repair_order.view') || can('repair_order.view.all');
  const orders = canViewOrders ? await api.orders.list() : [];
  const openOrders = orders.filter((o) => !['completed', 'invoiced', 'closed', 'cancelled', 'rejected'].includes(o.status));
  const byStatus = orders.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {});

  if (role === 'technician') {
    await renderTechnicianDashboard(orders, byStatus, openOrders);
    return;
  }

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

async function renderTechnicianDashboard(orders, byStatus, openOrders) {
  const [parts, settings] = await Promise.all([
    api.parts.list(),
    api.settings.get().catch(() => null),
  ]);
  const low = parts.filter((p) => p.qty_on_hand <= (p.reorder_threshold || settings?.low_stock_threshold || 5)).sort((a, b) => a.qty_on_hand - b.qty_on_hand);
  const awaitingDiagnosis = orders.filter((o) => ['requested', 'diagnosed'].includes(o.status)).length;

  const now = Date.now();
  const OVERDUE_HOURS = {
    urgent: settings?.overdue_urgent_hours ?? 4,
    high: settings?.overdue_high_hours ?? 24,
    normal: settings?.overdue_normal_hours ?? 72,
    low: settings?.overdue_low_hours ?? 168,
  };
  const overdueOrders = openOrders.filter((o) => {
    const ageMs = now - new Date(o.created_at).getTime();
    const ageH = ageMs / (1000 * 60 * 60);
    return ageH > (OVERDUE_HOURS[o.priority] || 72);
  });

  document.querySelector('#page-dashboard .page-title').textContent = 'Technician Dashboard';
  document.querySelector('#page-dashboard .page-sub').textContent = 'Your assigned jobs and the parts you need, at a glance.';

  document.getElementById('dashboard-kpis').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-top">
        <div class="kpi-icon" style="background:var(--blue-50); color:var(--blue-600);"><i class="bi bi-clipboard2-pulse"></i></div>
      </div>
      <div class="kpi-label">My Open Jobs</div>
      <div class="kpi-value">${openOrders.length}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-top">
        <div class="kpi-icon" style="background:var(--amber-50); color:var(--amber-600);"><i class="bi bi-search"></i></div>
      </div>
      <div class="kpi-label">Awaiting Diagnosis</div>
      <div class="kpi-value">${awaitingDiagnosis}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-top">
        <div class="kpi-icon" style="background:${overdueOrders.length > 0 ? 'var(--rose-50)' : 'var(--slate-800)'}; color:${overdueOrders.length > 0 ? 'var(--rose-600)' : '#fff'};"><i class="bi bi-${overdueOrders.length > 0 ? 'exclamation-triangle' : 'hourglass-split'}"></i></div>
      </div>
      <div class="kpi-label">Overdue</div>
      <div class="kpi-value">${overdueOrders.length}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-top">
        <div class="kpi-icon" style="background:var(--rose-50); color:var(--rose-600);"><i class="bi bi-box-seam"></i></div>
      </div>
      <div class="kpi-label">Low Stock Parts</div>
      <div class="kpi-value">${low.length}</div>
    </div>`;

  document.getElementById('dashboard-panel-title').textContent = 'My Repair Orders';
  document.getElementById('dashboard-panel-link').textContent = 'Open My Work Orders';
  document.getElementById('dashboard-status-breakdown').innerHTML = orders.slice(0, 8).map((o) => {
    const ageMs = now - new Date(o.created_at).getTime();
    const ageH = ageMs / (1000 * 60 * 60);
    const isOverdue = ageH > (OVERDUE_HOURS[o.priority] || 72) && !['completed', 'invoiced', 'closed', 'cancelled', 'rejected'].includes(o.status);
    const ageText = ageH < 24 ? `${Math.round(ageH)}h` : `${Math.round(ageH / 24)}d`;
    return `
    <div class="tech-job-row" data-tech-order="${o.id}">
      <div class="tech-job-top">
        <b>${o.ro_number}</b>
        ${badge(PRIORITY_BADGE[o.priority], label(o.priority))}
        ${isOverdue ? `<span class="badge badge-rose"><span class="bdot"></span>OVERDUE ${ageText}</span>` : `<span class="cell-sub" style="margin-left:auto;">${ageText}</span>`}
      </div>
      <div class="tech-job-item">${o.item?.description ?? '—'}${o.item?.identifier ? ` <span class="cell-sub">· ${o.item.identifier}</span>` : ''}</div>
      <div class="cell-sub">${o.customer?.full_name ?? '—'} · ${badge(STATUS_BADGE[o.status], label(o.status))}</div>
    </div>`;
  }).join('') || '<div class="status-list-item cell-sub">No jobs assigned to you yet.</div>';

  document.querySelectorAll('#dashboard-status-breakdown [data-tech-order]').forEach((row) => {
    row.addEventListener('click', () => openOrderDetail(Number(row.dataset.techOrder)));
  });

  document.getElementById('dashboard-panel-title-2').textContent = 'Parts Inventory';
  document.getElementById('dashboard-activity').innerHTML = parts.slice(0, 8).map((p) => {
    const isLow = p.qty_on_hand <= p.reorder_threshold;
    const pct = Math.min(100, Math.round((p.qty_on_hand / (p.reorder_threshold || 1)) * 100));
    return `
      <div class="status-list-item">
        <div class="status-row">
          <span>${p.name}${isLow ? ` <span class="badge badge-rose"><span class="bdot"></span>LOW</span>` : ''}</span>
          <span class="cell-sub">${p.qty_on_hand} in stock${isLow ? ` · reorder at ${p.reorder_threshold}` : ''}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%; ${isLow ? 'background:var(--rose-600);' : 'background:var(--emerald-600);'}"></div></div>
      </div>`;
  }).join('') || '<div class="status-list-item cell-sub">No parts in the catalog.</div>';
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
        showToast('Status updated.');
      } catch (err) {
        showToast(err.message, 'error');
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
let orderCustomers = [];
let orderItems = [];
let quickAddFromOrder = false;
let customerCombobox = null;
let itemCombobox = null;
let lastTechnicians = [];
let lastParts = [];

async function openOrderDetail(id) {
  activeOrderId = id;
  const role = currentUser.role;
  const order = await api.orders.get(id);

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
  document.getElementById('od-diagnosis-notes').value = order.diagnosis_notes ?? '';
  document.getElementById('od-labor').value = order.labor_cost ?? 0;
  document.getElementById('od-estimated').value = order.estimated_cost ?? '';
  document.getElementById('od-actual').value = order.actual_cost != null ? peso(order.actual_cost) : '';
  document.getElementById('od-parts-total').value = peso(order.parts_total);
  document.getElementById('od-quote-total').value = peso(order.quote_total);
  document.getElementById('od-warranty-days').value = order.warranty_days || 0;
  document.getElementById('od-warranty-notes').value = order.warranty_notes ?? '';
  document.getElementById('od-released').value = order.released_at ? dateFmt(order.released_at) : '—';
  document.getElementById('od-completed').value = order.completed_at ? dateFmt(order.completed_at) : '—';

  const trackLink = document.getElementById('od-track-link');
  if (trackLink) {
    trackLink.value = order.tracking_token
      ? `${window.location.origin}/track.html?token=${encodeURIComponent(order.tracking_token)}`
      : '';
    document.getElementById('od-copy-link').hidden = !order.tracking_token;
  }

  document.getElementById('od-problem').disabled = !can('repair_order.create');
  document.getElementById('od-estimated').disabled = !can('repair_order.approve');
  ['od-labor', 'od-warranty-days', 'od-warranty-notes'].forEach((f) => {
    document.getElementById(f).disabled = !can('repair_order.approve');
  });
  ['od-inspection', 'od-diagnosis', 'od-diagnosis-notes'].forEach((f) => {
    document.getElementById(f).disabled = !can('repair_order.diagnose');
  });

  const statusSel = document.getElementById('od-status');
  const statuses = role === 'technician' ? TECH_STATUSES
    : can('repair_order.approve') ? ALL_STATUSES
    : [order.status];
  statusSel.innerHTML = statuses.map((s) => `<option value="${s}" ${order.status === s ? 'selected' : ''}>${label(s)}</option>`).join('');
  statusSel.disabled = !(role === 'technician' || can('repair_order.approve'));

  await renderOrderParts(order);
  await renderOrderInvoice(order);
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
        showToast('Part removed.');
      } catch (err) { showToast(err.message, 'error'); }
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
    showToast('Part added to order.');
  } catch (err) { showToast(err.message, 'error'); }
});

async function renderOrderInvoice(order) {
  const container = document.getElementById('od-invoice');
  if (!container) return;

  if (!can('invoice.view')) {
    container.innerHTML = '<div class="cell-sub">Invoicing is managed by the admin.</div>';
    return;
  }

  let invoice = null;
  const invoices = await api.invoices.list({ repair_order_id: order.id });
  invoice = invoices[0] || null;

  if (!invoice) {
    const canInvoice = order.status === 'completed';
    const diagRef = order.diagnosis_notes || order.diagnosis;
    container.innerHTML = `
      ${diagRef ? `<div style="background:var(--blue-50); border-left:3px solid var(--blue-600); padding:8px 12px; border-radius:6px; margin-bottom:10px; font-size:13px;"><strong>Diagnosis reference:</strong> ${esc(diagRef)}</div>` : ''}
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
          showToast('Invoice generated.');
        } catch (err) { showToast(err.message, 'error'); }
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
        <div class="field"><label>Method</label><select class="input" id="od-pay-method"><option value="cash">Cash</option><option value="gcash">GCash</option></select></div>
        <div class="field"><label>Reference</label><input class="input" id="od-pay-ref" placeholder="optional"></div>
        <div class="field" style="max-width:150px;"><label>&nbsp;</label><button class="btn btn-primary" id="od-pay-add">Record Payment</button></div>
      </div>` : ''}`;

  const payBtn = document.getElementById('od-pay-add');
  if (payBtn) {
    payBtn.addEventListener('click', async () => {
      const amount = Number(document.getElementById('od-pay-amount').value);
      if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
      try {
        await api.payments.create({
          invoice_id: invoice.id,
          amount,
          method: document.getElementById('od-pay-method').value,
          reference: document.getElementById('od-pay-ref').value || null,
        });
        await refreshOrderDetail();
        showToast('Payment recorded.');
      } catch (err) { showToast(err.message, 'error'); }
    });
  }
}

document.getElementById('od-copy-link').addEventListener('click', async () => {
  const input = document.getElementById('od-track-link');
  if (!input?.value) return;
  try {
    await navigator.clipboard.writeText(input.value);
    const btn = document.getElementById('od-copy-link');
    btn.innerHTML = '<i class="bi bi-check2"></i> Copied';
    setTimeout(() => { btn.innerHTML = '<i class="bi bi-clipboard"></i> Copy'; }, 1500);
  } catch (err) {
    input.select();
    document.execCommand('copy');
  }
});

document.getElementById('od-save').addEventListener('click', async () => {
  if (!activeOrderId) return;
  const payload = {};
  payload.status = document.getElementById('od-status').value;
  if (can('repair_order.diagnose')) {
    payload.inspection_notes = document.getElementById('od-inspection').value;
    payload.diagnosis = document.getElementById('od-diagnosis').value;
    payload.diagnosis_notes = document.getElementById('od-diagnosis-notes').value;
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
    showToast('Changes saved successfully.');
  } catch (err) { showToast(err.message, 'error'); }
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
    showToast(err.message, 'error');
  }
}

// ---------- Customers ----------
async function renderCustomers() {
  const q = document.getElementById('customers-search').value;
  const customers = await api.customers.list(q);
  lastCustomers = customers;
  const canManage = can('customer.manage');

  document.getElementById('customers-table-body').innerHTML = customers.map((c) => `
    <tr data-customer-id="${c.id}" style="cursor:pointer;">
      <td><div class="avatar-tiny" style="display:inline-flex;margin-right:8px;">${initials(c.full_name)}</div><b>${c.full_name}</b></td>
      <td>${c.phone ?? '—'}</td>
      <td>${c.email ?? '—'}</td>
      ${canManage ? `<td>${kebab(c.id, 'customer')}</td>` : ''}
    </tr>
  `).join('') || `<tr class="empty-row"><td colspan="${canManage ? 4 : 3}">No customers found.</td></tr>`;

  document.getElementById('customers-count').textContent = `Showing ${customers.length} customer(s)`;
  if (canManage) wireKebabs();

  document.querySelectorAll('[data-customer-id]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.kebab-wrap')) return;
      openCustomerDetail(Number(row.dataset.customerId));
    });
  });
}
document.getElementById('customers-search').addEventListener('input', debounce(renderCustomers));

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
  const status = document.getElementById('invoices-status-filter')?.value || '';
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
      <td>
        <div class="kebab-wrap">
          <button class="kebab-btn" aria-label="Actions"><i class="bi bi-three-dots-vertical"></i></button>
          <div class="kebab-menu">
            ${can('invoice.edit') && inv.status !== 'void' ? `<button class="kebab-item" data-invoice-action="edit" data-invoice-id="${inv.id}"><i class="bi bi-pencil"></i> Edit</button>` : ''}
            ${can('invoice.void') && inv.status !== 'void' ? `<button class="kebab-item danger" data-invoice-action="void" data-invoice-id="${inv.id}"><i class="bi bi-x-circle"></i> Void</button>` : ''}
            ${can('invoice.edit') ? `<button class="kebab-item danger" data-invoice-action="delete" data-invoice-id="${inv.id}"><i class="bi bi-trash"></i> Delete</button>` : ''}
          </div>
        </div>
      </td>
    </tr>
  `).join('') || `<tr class="empty-row"><td colspan="8">No invoices found.</td></tr>`;

  document.getElementById('invoices-count').textContent = `Showing ${invoices.length} invoice(s)`;

  document.querySelectorAll('[data-invoice-action]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.invoiceAction;
      const id = Number(btn.dataset.invoiceId);
      document.querySelectorAll('.kebab-menu.open').forEach((m) => m.classList.remove('open'));
      if (action === 'edit') openEditInvoice(id, invoices);
      else if (action === 'void') await voidInvoice(id);
      else if (action === 'delete') await deleteInvoice(id);
    });
  });
  wireKebabs();
}

let lastInvoices = [];

function openEditInvoice(id, invoices) {
  const inv = invoices.find((x) => x.id === id);
  if (!inv) return;
  document.getElementById('inv-edit-id').value = id;
  document.getElementById('inv-edit-total').value = inv.total;
  document.getElementById('inv-edit-status').value = inv.status;
  openModal('modal-invoice-edit');
}

async function voidInvoice(id) {
  if (!confirm('Void this invoice? This cannot be undone.')) return;
  try {
    await api.invoices.void(id);
    loadPage('invoices');
    showToast('Invoice voided.');
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteInvoice(id) {
  if (!confirm('Delete this invoice? This cannot be undone.')) return;
  try {
    await api.invoices.remove(id);
    loadPage('invoices');
    showToast('Invoice deleted.');
  } catch (err) { showToast(err.message, 'error'); }
}
document.getElementById('invoices-status-filter')?.addEventListener('change', renderInvoices);

// ---------- Customer Detail (drill-down) ----------
async function openCustomerDetail(id) {
  const c = lastCustomers.find((x) => x.id === id);
  if (!c) return;
  document.getElementById('cust-detail-name').textContent = c.full_name;
  document.getElementById('cust-detail-phone').textContent = c.phone ?? '—';
  document.getElementById('cust-detail-email').textContent = c.email ?? '—';
  document.getElementById('cust-detail-address').textContent = c.address ?? '—';
  document.getElementById('cust-detail-created').textContent = dateFmt(c.created_at);

  const orders = await api.customers.orders(id);
  document.getElementById('cust-detail-orders-body').innerHTML = orders.map((o) => `
    <tr>
      <td><b>${o.ro_number}</b></td>
      <td>${o.item_description ?? '—'}${o.item_identifier ? `<div class="cell-sub">${o.item_identifier}</div>` : ''}</td>
      <td>${o.technician_name ?? '—'}</td>
      <td>${badge(STATUS_BADGE[o.status], label(o.status))}</td>
      <td>${badge(PRIORITY_BADGE[o.priority], label(o.priority))}</td>
      <td>${dateFmt(o.created_at)}</td>
    </tr>
  `).join('') || '<tr class="empty-row"><td colspan="6">No repair orders for this customer.</td></tr>';

  document.getElementById('cust-detail-orders-count').textContent = `${orders.length} order(s)`;
  openModal('modal-customer-detail');
}

// ---------- Technicians (with workload) ----------
async function renderTechnicians() {
  const q = document.getElementById('technicians-search').value;
  const [technicians, workload] = await Promise.all([
    api.technicians.list(q),
    can('technician.view') ? api.technicians.workload() : Promise.resolve([]),
  ]);
  lastTechnicians = technicians;
  const canManage = can('technician.manage');
  const workloadMap = {};
  workload.forEach((w) => { workloadMap[w.id] = w; });

  document.getElementById('technicians-table-body').innerHTML = technicians.map((t) => {
    const w = workloadMap[t.id] || {};
    return `
    <tr>
      <td><div class="avatar-tiny" style="display:inline-flex;margin-right:8px;">${initials(t.full_name)}</div><b>${t.full_name}</b></td>
      <td>${t.email}</td>
      <td>${t.specialty}</td>
      <td>${badge(TECH_BADGE[t.status], label(t.status))}</td>
      <td class="cell-sub" style="text-align:center;">${w.open_orders ?? 0} / ${w.total_orders ?? 0}</td>
      ${canManage ? `<td>${kebab(t.id, 'technician')}</td>` : ''}
    </tr>`;
  }).join('') || `<tr class="empty-row"><td colspan="${canManage ? 6 : 5}">No technicians found.</td></tr>`;

  document.getElementById('technicians-count').textContent = `Showing ${technicians.length} technician(s)`;
  if (canManage) wireKebabs();
}

// ---------- Price List ----------
async function renderPriceList() {
  const s = await api.settings.get().catch(() => null);
  const cur = s?.currency_symbol || '₱';
  const container = document.getElementById('pricelist-content');
  if (!s) {
    container.innerHTML = '<div class="cell-sub">Unable to load price list.</div>';
    return;
  }
  container.innerHTML = `
    <div class="detail-grid" style="margin-bottom:24px;">
      <div class="detail-item" style="padding:20px; background:var(--blue-50); border-radius:12px;">
        <div class="detail-label">Diagnostic Fee</div>
        <div class="detail-value" style="font-size:24px; color:var(--blue-600);">${cur}${Number(s.diagnostic_fee || 0).toLocaleString()}</div>
        <div class="cell-sub">Charged for initial inspection/diagnosis</div>
      </div>
      <div class="detail-item" style="padding:20px; background:var(--emerald-50); border-radius:12px;">
        <div class="detail-label">Standard Labor Rate</div>
        <div class="detail-value" style="font-size:24px; color:var(--emerald-600);">${cur}${Number(s.labor_rate || 0).toLocaleString()}</div>
        <div class="cell-sub">Per-hour labor charge</div>
      </div>
    </div>
    <div class="detail-section" style="background:var(--gray-50); border-radius:12px; padding:20px;">
      <div class="detail-section-title">Additional Info</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div><div class="detail-label">Default Warranty</div><div class="detail-value">${s.default_warranty_days ?? 30} days</div></div>
        <div><div class="detail-label">Currency</div><div class="detail-value">${cur}</div></div>
      </div>
    </div>`;
}

// ---------- Settings ----------
async function renderSettings() {
  if (!can('settings.view')) {
    document.getElementById('settings-content').innerHTML = '<div class="cell-sub">You do not have permission to view settings.</div>';
    return;
  }
  const s = await api.settings.get();

  // Shop profile
  const form = document.getElementById('form-settings');
  form.shop_name.value = s.shop_name ?? '';
  form.address.value = s.address ?? '';
  form.phone.value = s.phone ?? '';
  form.email.value = s.email ?? '';
  form.hours.value = s.hours ?? '';

  // Account info
  document.getElementById('settings-username').textContent = currentUser.username ?? '—';
  document.getElementById('settings-role').textContent = label(currentUser.role);

  // Business rules (admin only)
  const bizPanel = document.getElementById('settings-business');
  if (can('settings.manage')) {
    bizPanel.hidden = false;
    const bForm = document.getElementById('form-business-rules');
    bForm.default_warranty_days.value = s.default_warranty_days ?? 30;
    bForm.currency_symbol.value = s.currency_symbol ?? '₱';
    bForm.low_stock_threshold.value = s.low_stock_threshold ?? 5;
    bForm.overdue_urgent_hours.value = s.overdue_urgent_hours ?? 4;
    bForm.overdue_high_hours.value = s.overdue_high_hours ?? 24;
    bForm.overdue_normal_hours.value = s.overdue_normal_hours ?? 72;
    bForm.overdue_low_hours.value = s.overdue_low_hours ?? 168;
    bForm.diagnostic_fee.value = s.diagnostic_fee ?? 500;
    bForm.labor_rate.value = s.labor_rate ?? 750;
  } else {
    bizPanel.hidden = true;
  }
}

// Shop profile save
document.getElementById('settings-save')?.addEventListener('click', async () => {
  const form = document.getElementById('form-settings');
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    await api.settings.update(data);
    showToast('Profile saved successfully.');
  } catch (err) { showToast(err.message, 'error'); }
});

// Password change
document.getElementById('settings-pw-save')?.addEventListener('click', async () => {
  const form = document.getElementById('form-change-pw-settings');
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form).entries());
  const errBox = document.getElementById('settings-pw-error');
  errBox.hidden = true;
  if (data.new_password !== document.getElementById('settings-confirm-pw').value) {
    errBox.textContent = 'New passwords do not match.';
    errBox.hidden = false;
    return;
  }
  try {
    await api.auth.changePassword({
      current_password: data.current_password,
      new_password: data.new_password,
    });
    form.reset();
    showToast('Password updated successfully.');
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
  }
});

// Business rules save
document.getElementById('settings-business-save')?.addEventListener('click', async () => {
  const form = document.getElementById('form-business-rules');
  const raw = Object.fromEntries(new FormData(form).entries());
  const data = {
    default_warranty_days: Number(raw.default_warranty_days) || 30,
    currency_symbol: raw.currency_symbol || '₱',
    low_stock_threshold: Number(raw.low_stock_threshold) || 5,
    overdue_urgent_hours: Number(raw.overdue_urgent_hours) || 4,
    overdue_high_hours: Number(raw.overdue_high_hours) || 24,
    overdue_normal_hours: Number(raw.overdue_normal_hours) || 72,
    overdue_low_hours: Number(raw.overdue_low_hours) || 168,
    diagnostic_fee: Number(raw.diagnostic_fee) || 0,
    labor_rate: Number(raw.labor_rate) || 0,
  };
  try {
    await api.settings.update(data);
    showToast('Business rules saved successfully.');
  } catch (err) { showToast(err.message, 'error'); }
});

document.getElementById('invoice-edit-save')?.addEventListener('click', async () => {
  const id = Number(document.getElementById('inv-edit-id').value);
  const total = Number(document.getElementById('inv-edit-total').value);
  const status = document.getElementById('inv-edit-status').value;
  if (!id) return;
  try {
    await api.invoices.update(id, { total, status });
    closeModal('modal-invoice-edit');
    loadPage('invoices');
    showToast('Invoice updated.');
  } catch (err) { showToast(err.message, 'error'); }
});

// ---------- Init ----------
async function initApp() {
  const me = await api.auth.me();
  currentUser = me;
  buildNav();
  initOrderComboboxes();
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => switchPage(item.dataset.page));
  });
  renderDashboard();
  loadNotifications();
}

initApp();
