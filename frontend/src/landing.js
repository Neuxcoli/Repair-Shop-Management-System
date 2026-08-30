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

// ---- Service detail modal ----
const SERVICES = {
  diagnostics: {
    name: 'Diagnostics',
    icon: 'bi-search',
    iconBg: 'background:var(--blue-50); color:var(--blue-600);',
    tag: 'Est. ' + '\u20B11,200 – \u20B12,500',
    short: 'Computerized engine diagnostics and check-engine light analysis to pinpoint the exact problem — fast and accurate.',
    detail: 'Our certified technicians connect professional-grade diagnostic equipment to read your vehicle\u2019s trouble codes and live sensor data. We trace the root cause rather than guessing, so you know exactly what’s wrong before any parts are ordered.',
    included: [
      'On-board computer (OBD-II) scan and code reading',
      'Check-engine light diagnosis',
      '2-hour no-obligation diagnostic inspection',
      'Clear report of findings and repair options',
    ],
  },
  engine: {
    name: 'Engine Repair',
    icon: 'bi-gear-wide-connected',
    iconBg: 'background:var(--emerald-50); color:var(--emerald-600);',
    tag: 'Starts at ' + '\u20B15,000',
    short: 'From minor engine repairs to major overhauls — we restore performance and reliability with certified workmanship.',
    detail: 'Whether it’s a rough idle, loss of power, overheating, or a full rebuild, our technicians handle engines of all makes and models. We diagnose precisely, source quality parts, and back every repair with our written workmanship warranty.',
    included: [
      'Full engine diagnostic assessment',
      'Repair or replacement of faulty components',
      'Oil and filter change with every engine job',
      'Workmanship warranty on all labor',
    ],
  },
  brakes: {
    name: 'Brake Service',
    icon: 'bi-droplet',
    iconBg: 'background:var(--rose-50); color:var(--rose-600);',
    tag: 'Est. ' + '\u20B12,500 – \u20B18,000',
    short: 'Pad and rotor replacement, brake fluid flushes, and complete brake system inspection for safe, confident stopping.',
    detail: 'Your brakes are your vehicle’s most important safety system. We inspect pads, rotors, calipers, and fluid, then recommend only what’s needed — never upselling. Every brake job leaves your vehicle stopping smoothly and safely.',
    included: [
      'Complete brake system inspection',
      'Brake pad and rotor replacement as needed',
      'Brake fluid flush and bleed',
      'Test drive to confirm performance',
    ],
  },
  electrical: {
    name: 'Electrical Repairs',
    icon: 'bi-lightning-charge',
    iconBg: 'background:var(--amber-50); color:var(--amber-600);',
    tag: 'Est. ' + '\u20B11,500 – \u20B16,000',
    short: 'Batteries, alternators, wiring, and lighting — we troubleshoot and repair your vehicle’s electrical systems.',
    detail: 'From a dead battery and faulty alternator to shorts in the wiring or dim headlights, we trace and repair electrical faults methodically. We use proper diagnostic tools and quality replacement components to get your electrical systems working reliably.',
    included: [
      'Battery testing and replacement',
      'Alternator and starter diagnosis',
      'Wiring fault tracing and repair',
      'Lighting and electrical accessory repair',
    ],
  },
  maintenance: {
    name: 'Preventive Maintenance',
    icon: 'bi-arrow-repeat',
    iconBg: 'background:var(--blue-50); color:var(--blue-600);',
    tag: 'Est. ' + '\u20B12,000 – \u20B14,000',
    short: 'Scheduled servicing including oil changes, fluid top-ups, filter replacements, and multi-point safety checks.',
    detail: 'Regular maintenance is the best way to protect your vehicle and avoid costly breakdowns. We perform scheduled servicing with quality fluids and genuine filters, and our multi-point inspection catches small issues before they become big ones.',
    included: [
      'Engine oil and filter change',
      'Fluid top-ups and checks',
      'Air, cabin, and fuel filter replacement',
      'Multi-point vehicle safety inspection',
    ],
  },
  wheel: {
    name: 'Wheel & Tire Service',
    icon: 'bi-geo-alt',
    iconBg: 'background:var(--emerald-50); color:var(--emerald-600);',
    tag: 'Est. ' + '\u20B1800 – \u20B13,000',
    short: 'Alignment, balancing, and tire rotation to prolong tire life and keep your ride smooth and even.',
    detail: 'Even tire wear, a smooth ride, and proper handling start with correct alignment and balancing. We rotate, balance, and align your wheels to extend tire life, improve fuel economy, and keep your vehicle tracking straight.',
    included: [
      'Wheel alignment and adjustment',
      'Tire balancing and rotation',
      'Tire wear and pressure inspection',
      'Capless valve and torque check',
    ],
  },
};

const serviceModal = document.getElementById('service-modal');
const serviceBody = document.getElementById('service-modal-body');
const serviceName = document.getElementById('service-modal-name');
const serviceTag = document.getElementById('service-modal-tag');
const serviceIcon = document.getElementById('service-modal-icon');
const serviceCta = document.getElementById('service-modal-cta');

function openServiceModal(key) {
  const s = SERVICES[key];
  if (!s) return;
  serviceIcon.innerHTML = `<i class="bi ${s.icon}"></i>`;
  serviceIcon.style.cssText = s.iconBg;
  serviceName.textContent = s.name;
  serviceTag.textContent = s.tag;
  serviceCta.setAttribute('href', `/login.html?service=${encodeURIComponent(s.name)}`);
  serviceBody.innerHTML = `
    <p style="font-size:14px;color:var(--gray-600);margin:0;">${escapeHtml(s.detail)}</p>
    <div class="service-modal-included">
      <div class="service-modal-included-title"><i class="bi bi-check2-circle"></i> What’s included</div>
      <ul class="service-modal-list">
        ${s.included.map((li) => `<li><i class="bi bi-check2"></i> ${escapeHtml(li)}</li>`).join('')}
      </ul>
    </div>
    ${s.tag ? `<div class="service-modal-price"><i class="bi bi-tag"></i> ${escapeHtml(s.tag)}</div>` : ''}
    <p style="font-size:12px;color:var(--gray-400);margin:0;">Estimated price range as configured in shop business rules. Final quote is confirmed after inspection.</p>`;
  serviceModal.classList.add('open');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.querySelectorAll('.service-card').forEach((card) => {
  card.addEventListener('click', () => openServiceModal(card.dataset.service));
});

document.querySelectorAll('[data-close-modal]').forEach((b) => {
  b.addEventListener('click', () => document.getElementById(b.dataset.closeModal).classList.remove('open'));
});
serviceModal.addEventListener('mousedown', (e) => {
  if (e.target === serviceModal) serviceModal.classList.remove('open');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') serviceModal.classList.remove('open');
});
