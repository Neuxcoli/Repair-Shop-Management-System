import 'bootstrap-icons/font/bootstrap-icons.css';
import './style.css';
import { api, setAuth } from './api.js';

const form = document.getElementById('register-form');
const errorEl = document.getElementById('register-error');
const btn = document.getElementById('register-btn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  if (form.password.value !== form.confirm.value) {
    errorEl.textContent = 'Passwords do not match.';
    errorEl.hidden = false;
    form.confirm.focus();
    return;
  }
  errorEl.hidden = true;
  btn.disabled = true;
  btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Creating account&hellip;';
  try {
    const data = await api.auth.register({
      full_name: form.full_name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim() || null,
      address: form.address.value.trim() || null,
      password: form.password.value,
    });
    setAuth(data.access_token, data.user);
    window.location.href = '/admin.html';
  } catch (err) {
    errorEl.textContent = err.message || 'Registration failed.';
    errorEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-person-plus"></i> Create Account';
  }
});
