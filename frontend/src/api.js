const BASE = '/api';
const TOKEN_KEY = 'rs_token';
const USER_KEY = 'rs_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function redirectToLogin() {
  clearAuth();
  window.location.href = '/staff-login.html';
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(BASE + path, { ...options, headers });
  if (res.status === 401) {
    redirectToLogin();
    throw new Error('Not authorized');
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  auth: {
    login: async (data) => {
      const res = await fetch(BASE + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail || `${res.status} ${res.statusText}`);
      return body;
    },
    register: async (data) => {
      const res = await fetch(BASE + '/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail || `${res.status} ${res.statusText}`);
      return body;
    },
    me: () => request('/auth/me'),
    changePassword: (data) => request('/auth/password', { method: 'PUT', body: JSON.stringify(data) }),
  },
  portal: {
    items: {
      list: () => request('/portal/items'),
      create: (data) => request('/portal/items', { method: 'POST', body: JSON.stringify(data) }),
    },
    orders: {
      list: () => request('/portal/orders'),
      get: (id) => request(`/portal/orders/${id}`),
      create: (data) => request('/portal/orders', { method: 'POST', body: JSON.stringify(data) }),
      cancel: (id) => request(`/portal/orders/${id}/cancel`, { method: 'POST' }),
    },
  },
  dashboard: {
    summary: () => request('/dashboard/summary'),
  },
  customers: {
    list: (q = '') => request(`/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    create: (data) => request('/customers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/customers/${id}`, { method: 'DELETE' }),
    orders: (id) => request(`/customers/${id}/orders`),
  },
  technicians: {
    list: (q = '') => request(`/technicians${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    create: (data) => request('/technicians', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/technicians/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/technicians/${id}`, { method: 'DELETE' }),
    workload: () => request('/technicians/workload'),
  },
  items: {
    list: (customerId) => request(`/items${customerId ? `?customer_id=${customerId}` : ''}`),
    create: (data) => request('/items', { method: 'POST', body: JSON.stringify(data) }),
  },
  parts: {
    list: (q = '') => request(`/parts${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    create: (data) => request('/parts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/parts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/parts/${id}`, { method: 'DELETE' }),
  },
  orders: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/orders${qs ? `?${qs}` : ''}`);
    },
    get: (id) => request(`/orders/${id}`),
    create: (data) => request('/orders', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id) => request(`/orders/${id}`, { method: 'DELETE' }),
    addPart: (id, data) => request(`/orders/${id}/parts`, { method: 'POST', body: JSON.stringify(data) }),
    removePart: (id, lineId) => request(`/orders/${id}/parts/${lineId}`, { method: 'DELETE' }),
  },
  invoices: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/invoices${qs ? `?${qs}` : ''}`);
    },
    create: (data) => request('/invoices', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/invoices/${id}`, { method: 'DELETE' }),
    void: (id) => request(`/invoices/${id}/void`, { method: 'PUT' }),
  },
  payments: {
    list: (invoiceId) => request(`/payments${invoiceId ? `?invoice_id=${invoiceId}` : ''}`),
    create: (data) => request('/payments', { method: 'POST', body: JSON.stringify(data) }),
  },
  settings: {
    get: () => request('/settings'),
    update: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  },
};
