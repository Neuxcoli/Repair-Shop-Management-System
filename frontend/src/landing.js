import 'bootstrap-icons/font/bootstrap-icons.css';
import './style.css';
import { showToast } from './ui.js';

const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');
const iconOpen = document.getElementById('hamburger-open');
const iconClose = document.getElementById('hamburger-close');

hamburger.addEventListener('click', () => {
  const open = mobileMenu.classList.toggle('open');
  iconOpen.hidden = open;
  iconClose.hidden = !open;
  hamburger.setAttribute('aria-expanded', open);
});

document.querySelectorAll('.mobile-menu-link, .site-nav-link').forEach((a) => {
  a.addEventListener('click', () => {
    mobileMenu.classList.remove('open');
    iconOpen.hidden = false;
    iconClose.hidden = true;
    hamburger.setAttribute('aria-expanded', false);
  });
});

document.getElementById('contact-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if (!form.reportValidity()) return;

  const data = Object.fromEntries(new FormData(form).entries());
  const btn = document.getElementById('contact-submit');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to send');
    document.getElementById('contact-success').hidden = false;
    form.reset();
    showToast('Message sent successfully!');
  } catch (err) {
    showToast('Failed to send message. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Message';
  }
});
