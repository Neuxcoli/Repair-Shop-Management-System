import 'bootstrap-icons/font/bootstrap-icons.css';
import './style.css';
import { api, getToken, setAuth } from './api.js';

const form = document.getElementById('login-form');
const errorEl = document.getElementById('login-error');
const btn = document.getElementById('login-btn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  errorEl.hidden = true;
  btn.disabled = true;
  btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Signing in&hellip;';
  try {
    const data = await api.auth.login({
      username: form.username.value.trim(),
      password: form.password.value,
    });
    setAuth(data.access_token, data.user);
    window.location.href = data.user.role === 'customer' ? '/customer.html' : '/admin.html';
  } catch (err) {
    errorEl.textContent = err.message || 'Sign in failed.';
    errorEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Sign In';
  }
});
