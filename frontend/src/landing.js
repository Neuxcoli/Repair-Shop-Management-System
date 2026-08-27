import 'bootstrap-icons/font/bootstrap-icons.css';
import './style.css';

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

document.getElementById('contact-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  if (!form.reportValidity()) return;
  document.getElementById('contact-success').hidden = false;
  document.getElementById('contact-submit').disabled = true;
  form.reset();
});
