// admin/app.js — STSA Admin Dashboard Logic

const API = '/api';
let adminToken = '';
let currentEvent = null;

// ─── Auth ────────────────────────────────────────────
function isAuthenticated() {
  adminToken = sessionStorage.getItem('stsa_admin_token') || '';
  return !!adminToken;
}

function showDashboard() {
  document.getElementById('login-screen').hidden = true;
  document.getElementById('dashboard').hidden = false;
  loadEvent();
}

function showLogin() {
  sessionStorage.removeItem('stsa_admin_token');
  adminToken = '';
  document.getElementById('login-screen').hidden = false;
  document.getElementById('dashboard').hidden = true;
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const credential = document.getElementById('password-input').value;
  const errorEl = document.getElementById('login-error');
  errorEl.hidden = true;

  try {
    const res = await fetch(`${API}/verify-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': credential },
    });
    if (res.ok) {
      adminToken = credential;
      sessionStorage.setItem('stsa_admin_token', credential);
      showDashboard();
    } else {
      errorEl.hidden = false;
    }
  } catch {
    errorEl.hidden = false;
  }
});

document.getElementById('logout-btn').addEventListener('click', showLogin);

// ─── Tabs ────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => { c.hidden = true; c.classList.remove('active'); });
    tab.classList.add('active');
    const target = document.getElementById(`tab-${tab.dataset.tab}`);
    target.hidden = false;
    target.classList.add('active');

    // Load data when switching to registrations or print tabs
    if (tab.dataset.tab === 'registrations' || tab.dataset.tab === 'print-cards') {
      loadRegistrations();
    }
  });
});

// ─── Event Setup ─────────────────────────────────────
const EVENT_FIELDS = [
  'event_name', 'event_date', 'rsvp_deadline',
  'time_registration', 'time_lunch', 'time_meeting_start', 'time_meeting_end',
  'venue_name', 'venue_address', 'price_per_person',
  'meal_choice_1', 'meal_choice_2', 'meal_choice_3',
  'speaker_name', 'speaker_bio', 'topic',
  'guest_name', 'guest_bio',
  'speaker_sponsor_name', 'speaker_sponsor_company', 'speaker_sponsor_email',
  'luncheon_sponsor_name', 'luncheon_sponsor_company', 'luncheon_sponsor_website',
];

async function loadEvent() {
  try {
    const res = await fetch(`${API}/get-event`);
    const data = await res.json();
    if (data.event) {
      currentEvent = data.event;
      populateEventForm(data.event);
    }
  } catch (err) {
    console.error('Failed to load event:', err);
  }
}

function populateEventForm(event) {
  EVENT_FIELDS.forEach(field => {
    const el = document.getElementById(field);
    if (el && event[field] !== null && event[field] !== undefined) {
      el.value = event[field];
    }
  });
}

function gatherEventForm() {
  const formData = {};
  EVENT_FIELDS.forEach(field => {
    const el = document.getElementById(field);
    if (el) {
      formData[field] = field === 'price_per_person' ? parseInt(el.value, 10) : el.value;
    }
  });
  if (currentEvent?.id) {
    formData.id = currentEvent.id;
  }
  return formData;
}

document.getElementById('event-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById('save-status');
  statusEl.hidden = true;

  const formData = gatherEventForm();

  try {
    const res = await fetch(`${API}/save-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
      body: JSON.stringify(formData),
    });
    const data = await res.json();
    if (res.ok) {
      currentEvent = data.event;
      statusEl.textContent = 'Event saved and published!';
      statusEl.className = 'status-text success';
      statusEl.hidden = false;
      setTimeout(() => { statusEl.hidden = true; }, 3000);
    } else {
      statusEl.textContent = `Error: ${data.error}`;
      statusEl.className = 'status-text error';
      statusEl.hidden = false;
    }
  } catch (err) {
    statusEl.textContent = 'Network error. Please try again.';
    statusEl.className = 'status-text error';
    statusEl.hidden = false;
  }
});

// ─── Registrations ───────────────────────────────────
let registrations = [];

async function loadRegistrations() {
  try {
    const res = await fetch(`${API}/get-registrations`, {
      headers: { 'X-Admin-Token': adminToken },
    });
    const data = await res.json();
    registrations = data.registrations || [];
    renderRegistrations();
    renderMealCards();
  } catch (err) {
    console.error('Failed to load registrations:', err);
  }
}

function renderRegistrations() {
  // Summary
  const summaryEl = document.getElementById('reg-summary');
  const total = registrations.length;
  const mealCounts = {};
  registrations.forEach(r => {
    mealCounts[r.meal_choice] = (mealCounts[r.meal_choice] || 0) + 1;
  });
  const breakdown = Object.entries(mealCounts).map(([meal, count]) => `${count} ${meal}`).join(', ');
  summaryEl.textContent = total > 0 ? `${total} registered — ${breakdown}` : 'No registrations yet';

  // Table
  const tbody = document.getElementById('reg-tbody');
  tbody.innerHTML = '';
  registrations.forEach(r => {
    const tr = document.createElement('tr');
    const date = new Date(r.created_at).toLocaleDateString();
    const isPaid = r.payment_status === 'paid';
    const badgeClass = isPaid ? 'badge-paid' : 'badge-pending';

    const tdName = document.createElement('td');
    tdName.textContent = r.name + (r.is_walkin ? ' (walk-in)' : '');

    const tdEmail = document.createElement('td');
    tdEmail.textContent = r.email;

    const tdPhone = document.createElement('td');
    tdPhone.textContent = r.phone || '—';

    const tdMeal = document.createElement('td');
    tdMeal.textContent = r.meal_choice;

    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${badgeClass}`;
    badge.textContent = r.payment_status;
    tdStatus.appendChild(badge);

    const tdDate = document.createElement('td');
    tdDate.textContent = date;

    tr.append(tdName, tdEmail, tdPhone, tdMeal, tdStatus, tdDate);
    tbody.appendChild(tr);
  });

  // Populate walk-in modal meal dropdown
  const walkinMealSelect = document.getElementById('walkin-meal');
  walkinMealSelect.innerHTML = '<option value="">Select...</option>';
  if (currentEvent) {
    [currentEvent.meal_choice_1, currentEvent.meal_choice_2, currentEvent.meal_choice_3].forEach(m => {
      if (m) {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        walkinMealSelect.appendChild(opt);
      }
    });
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// CSV Export
document.getElementById('export-csv-btn').addEventListener('click', () => {
  if (!registrations.length) return;
  const headers = ['Name', 'Email', 'Phone', 'Meal Choice', 'Payment Status', 'Walk-in', 'Date'];
  const rows = registrations.map(r => [
    r.name, r.email, r.phone || '', r.meal_choice,
    r.payment_status, r.is_walkin ? 'Yes' : 'No',
    new Date(r.created_at).toLocaleDateString(),
  ]);
  const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stsa-registrations-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// Walk-in Modal
document.getElementById('add-walkin-btn').addEventListener('click', () => {
  document.getElementById('walkin-modal').hidden = false;
});

document.getElementById('walkin-cancel').addEventListener('click', () => {
  document.getElementById('walkin-modal').hidden = true;
});

document.getElementById('walkin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('walkin-name').value;
  const email = document.getElementById('walkin-email').value;
  const meal = document.getElementById('walkin-meal').value;

  try {
    const res = await fetch(`${API}/add-walkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
      body: JSON.stringify({ name, email, meal_choice: meal }),
    });
    if (res.ok) {
      document.getElementById('walkin-modal').hidden = true;
      document.getElementById('walkin-form').reset();
      loadRegistrations();
    }
  } catch (err) {
    console.error('Failed to add walk-in:', err);
  }
});

// ─── Print Meal Cards ────────────────────────────────
function renderMealCards() {
  const container = document.getElementById('cards-preview');
  container.innerHTML = '';

  if (!currentEvent || !registrations.length) {
    container.innerHTML = '<p style="color:var(--text-light)">No registrations to print.</p>';
    return;
  }

  const mealColors = {
    [currentEvent.meal_choice_1]: { border: 'var(--meal-1)', bg: 'var(--meal-1-light)', color: 'var(--meal-1)' },
    [currentEvent.meal_choice_2]: { border: 'var(--meal-2)', bg: 'var(--meal-2-light)', color: 'var(--meal-2)' },
    [currentEvent.meal_choice_3]: { border: 'var(--meal-3)', bg: 'var(--meal-3-light)', color: 'var(--meal-3)' },
  };

  registrations.forEach(r => {
    const colors = mealColors[r.meal_choice] || { border: 'var(--text-light)', bg: '#f0f0f0', color: '#666' };

    const card = document.createElement('div');
    card.className = 'meal-card';
    card.style.borderLeftColor = colors.border;

    const body = document.createElement('div');
    body.className = 'meal-card-body';
    body.style.background = colors.bg;

    const nameEl = document.createElement('div');
    nameEl.className = 'meal-card-name';
    nameEl.textContent = r.name;

    const mealEl = document.createElement('div');
    mealEl.className = 'meal-card-meal';
    mealEl.style.color = colors.color;
    mealEl.textContent = r.meal_choice;

    body.append(nameEl, mealEl);
    card.appendChild(body);
    container.appendChild(card);
  });
}

document.getElementById('print-btn').addEventListener('click', () => {
  window.print();
});

// ─── Init ────────────────────────────────────────────
if (isAuthenticated()) {
  // Verify token is still valid
  fetch(`${API}/verify-admin`, {
    method: 'POST',
    headers: { 'X-Admin-Token': adminToken },
  }).then(res => {
    if (res.ok) showDashboard();
    else showLogin();
  }).catch(() => showLogin());
} else {
  showLogin();
}
