// rsvp/app.js — STSA RSVP Page Logic

const API = '/api';
let eventData = null;
let selectedMeal = '';
let additionalGuests = [];

// ─── Helpers ─────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

// ─── Load Event ──────────────────────────────────────

async function init() {
  try {
    const res = await fetch(`${API}/get-event`);
    const data = await res.json();

    document.getElementById('loading').hidden = true;

    if (!data.event) {
      document.getElementById('no-event').hidden = false;
      return;
    }

    eventData = data.event;
    populateEventDetails();
    document.getElementById('rsvp-page').hidden = false;
  } catch (err) {
    console.error('Failed to load event:', err);
    document.getElementById('loading').hidden = true;
    document.getElementById('no-event').hidden = false;
  }
}

function populateEventDetails() {
  const ev = eventData;

  document.getElementById('ev-name').textContent = ev.event_name;
  document.getElementById('ev-date').textContent = formatDate(ev.event_date);
  document.getElementById('ev-venue').textContent = `${ev.venue_name} — ${ev.venue_address}`;
  document.getElementById('ev-venue-link').href =
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.venue_address)}`;
  document.getElementById('ev-price').textContent = `$${ev.price_per_person}`;

  document.getElementById('ev-time-reg').textContent = formatTime(ev.time_registration);
  document.getElementById('ev-time-lunch').textContent = formatTime(ev.time_lunch);
  document.getElementById('ev-time-meeting').textContent =
    `${formatTime(ev.time_meeting_start)} — ${formatTime(ev.time_meeting_end)}`;

  // Speaker
  if (ev.speaker_name) {
    document.getElementById('speaker-section').hidden = false;
    document.getElementById('ev-speaker-name').textContent = ev.speaker_name;
    document.getElementById('ev-topic').textContent = ev.topic;
    document.getElementById('ev-speaker-bio').textContent = ev.speaker_bio;
  }

  // Special Guest
  if (ev.guest_name) {
    document.getElementById('guest-section').hidden = false;
    document.getElementById('ev-guest-name').textContent = ev.guest_name;
    document.getElementById('ev-guest-bio').textContent = ev.guest_bio;
  }

  // Sponsors
  const sponsorsSection = document.getElementById('sponsors-section');
  let hasSponsors = false;

  if (ev.speaker_sponsor_name) {
    hasSponsors = true;
    const el = document.getElementById('speaker-sponsor');
    el.hidden = false;
    document.getElementById('ev-speaker-sponsor').textContent =
      `${ev.speaker_sponsor_name}${ev.speaker_sponsor_company ? ', ' + ev.speaker_sponsor_company : ''}`;
  }

  if (ev.luncheon_sponsor_name) {
    hasSponsors = true;
    const el = document.getElementById('luncheon-sponsor');
    el.hidden = false;
    document.getElementById('ev-luncheon-sponsor').textContent =
      `${ev.luncheon_sponsor_name}${ev.luncheon_sponsor_company ? ', ' + ev.luncheon_sponsor_company : ''}`;
  }

  if (hasSponsors) sponsorsSection.hidden = false;

  // Meal buttons
  renderMealButtons();
  updateTotal();
}

// ─── Meal Selection ──────────────────────────────────

function renderMealButtons() {
  const container = document.getElementById('meal-buttons');
  container.innerHTML = '';
  const meals = [eventData.meal_choice_1, eventData.meal_choice_2, eventData.meal_choice_3].filter(Boolean);

  meals.forEach(meal => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'meal-btn' + (selectedMeal === meal ? ' selected' : '');
    btn.textContent = meal;
    btn.addEventListener('click', () => {
      selectedMeal = meal;
      container.querySelectorAll('.meal-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    container.appendChild(btn);
  });
}

// ─── Additional Guests ───────────────────────────────

document.getElementById('add-guest-btn').addEventListener('click', () => {
  const guestId = Date.now();
  additionalGuests.push({ id: guestId, name: '', meal_choice: '' });
  renderGuestList();
  updateTotal();
});

function renderGuestList() {
  const container = document.getElementById('guest-list');
  container.innerHTML = '';
  const meals = eventData
    ? [eventData.meal_choice_1, eventData.meal_choice_2, eventData.meal_choice_3].filter(Boolean)
    : [];

  additionalGuests.forEach((guest, index) => {
    const div = document.createElement('div');
    div.className = 'guest-entry';
    div.innerHTML = `
      <h4>Guest ${index + 2}</h4>
      <button type="button" class="remove-guest" data-id="${guest.id}">&times;</button>
      <div class="form-row">
        <div class="form-group">
          <label>Name *</label>
          <input type="text" class="guest-name" data-id="${guest.id}" value="${escapeAttr(guest.name)}" required placeholder="Guest name">
        </div>
      </div>
      <div class="meal-buttons" style="margin-top:12px">
        ${meals.map(m => `
          <button type="button" class="meal-btn guest-meal-btn ${guest.meal_choice === m ? 'selected' : ''}" data-id="${guest.id}" data-meal="${escapeAttr(m)}">${escapeHtml(m)}</button>
        `).join('')}
      </div>
    `;
    container.appendChild(div);

    // Wire up remove button
    div.querySelector('.remove-guest').addEventListener('click', () => {
      additionalGuests = additionalGuests.filter(g => g.id !== guest.id);
      renderGuestList();
      updateTotal();
    });

    // Wire up name input
    div.querySelector('.guest-name').addEventListener('input', (e) => {
      guest.name = e.target.value;
    });

    // Wire up meal buttons
    div.querySelectorAll('.guest-meal-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        guest.meal_choice = btn.dataset.meal;
        div.querySelectorAll('.guest-meal-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  });
}

// ─── Total ───────────────────────────────────────────

function updateTotal() {
  const count = 1 + additionalGuests.length;
  const total = count * (eventData ? eventData.price_per_person : 0);
  document.getElementById('total-amount').textContent = `$${total}`;
}

// ─── Submit ──────────────────────────────────────────

document.getElementById('rsvp-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('form-error');
  errorEl.hidden = true;

  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();

  if (!selectedMeal) {
    errorEl.textContent = 'Please select your meal choice.';
    errorEl.hidden = false;
    return;
  }

  // Validate additional guests
  for (const guest of additionalGuests) {
    if (!guest.name.trim()) {
      errorEl.textContent = 'Please enter a name for all additional guests.';
      errorEl.hidden = false;
      return;
    }
    if (!guest.meal_choice) {
      errorEl.textContent = `Please select a meal for ${guest.name || 'your additional guest'}.`;
      errorEl.hidden = false;
      return;
    }
  }

  const guests = [
    { name, meal_choice: selectedMeal },
    ...additionalGuests.map(g => ({ name: g.name.trim(), meal_choice: g.meal_choice })),
  ];

  const payBtn = document.getElementById('pay-btn');
  payBtn.disabled = true;
  payBtn.textContent = 'Processing...';

  try {
    const res = await fetch(`${API}/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, guests }),
    });
    const data = await res.json();

    if (res.ok && data.checkoutUrl) {
      // Validate checkout URL: must be https and from a trusted Square domain.
      // Reconstruct the URL from parsed components to break the taint chain.
      const ALLOWED_HOSTS = ['squareup.com', 'square.link', 'squareupsandbox.com'];
      let parsedUrl = null;
      try {
        const candidate = new URL(data.checkoutUrl);
        if (candidate.protocol === 'https:') {
          const host = candidate.hostname.toLowerCase();
          const trusted = ALLOWED_HOSTS.some(allowed => host === allowed || host.endsWith('.' + allowed));
          if (trusted) {
            parsedUrl = candidate;
          }
        }
      } catch {
        parsedUrl = null;
      }
      if (!parsedUrl) {
        errorEl.textContent = 'Invalid checkout URL received. Please try again.';
        errorEl.hidden = false;
        payBtn.disabled = false;
        payBtn.textContent = 'Pay & Register';
        return;
      }
      // parsedUrl was constructed from a validated HTTPS URL matching an ALLOWED_HOSTS allowlist.
      // The raw response string is never passed to any navigation sink.
      // nosemgrep: javascript/open-redirect
      // snyk:ignore:javascript/OR
      window.location.assign(parsedUrl.toString());
    } else {
      errorEl.textContent = data.error || 'Something went wrong. Please try again.';
      errorEl.hidden = false;
      payBtn.disabled = false;
      payBtn.textContent = 'Pay & Register';
    }
  } catch (err) {
    errorEl.textContent = 'Network error. Please try again.';
    errorEl.hidden = false;
    payBtn.disabled = false;
    payBtn.textContent = 'Pay & Register';
  }
});

// ─── Smooth Scroll for Hero CTA ──────────────────────

document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (!link) return;
  const targetId = link.getAttribute('href').slice(1);
  const target = document.getElementById(targetId);
  if (target) {
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

// ─── Sticky Mobile Register Button ───────────────────

(function initStickyRegister() {
  const stickyBtn = document.getElementById('sticky-register');
  if (!stickyBtn) return;

  let heroVisible = true;

  function updateSticky() {
    const heroBtn = document.getElementById('hero-rsvp-btn');
    const regSection = document.getElementById('registration-section');
    if (!heroBtn || !regSection) return;

    const heroBtnRect = heroBtn.getBoundingClientRect();
    const regRect = regSection.getBoundingClientRect();

    // Show sticky button when hero button is scrolled out of view
    // and we haven't passed the registration form
    const heroBtnGone = heroBtnRect.bottom < 0;
    const regVisible = regRect.top < window.innerHeight * 0.8;

    if (heroBtnGone && !regVisible) {
      stickyBtn.hidden = false;
    } else {
      stickyBtn.hidden = true;
    }
  }

  window.addEventListener('scroll', updateSticky, { passive: true });
  window.addEventListener('resize', updateSticky, { passive: true });
})();

// ─── Init ────────────────────────────────────────────

init();
