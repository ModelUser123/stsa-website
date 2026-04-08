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
  startAutoRefresh();
}

function showLogin() {
  sessionStorage.removeItem('stsa_admin_token');
  adminToken = '';
  stopAutoRefresh();
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
      showDashboard(); // also calls startAutoRefresh()
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

    // Load data when switching to registrations, activity, recon, or print tabs
    if (['registrations', 'print-cards', 'activity', 'square-recon'].includes(tab.dataset.tab)) {
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
  const total = registrations.length;
  const paid = registrations.filter(r => r.payment_status === 'paid').length;
  const pending = registrations.filter(r => r.payment_status !== 'paid').length;
  const walkins = registrations.filter(r => r.is_walkin).length;

  // ── Big number stats ──
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('stat-total', total);
  setEl('stat-paid', paid);
  setEl('stat-pending', pending);
  setEl('stat-walkin', walkins);

  // ── Meal breakdown with percentages ──
  const mealCounts = {};
  registrations.forEach(r => {
    mealCounts[r.meal_choice] = (mealCounts[r.meal_choice] || 0) + 1;
  });
  const mealBreakdownEl = document.getElementById('meal-breakdown');
  if (mealBreakdownEl) {
    if (total === 0) {
      mealBreakdownEl.innerHTML = '';
    } else {
      const meals = Object.entries(mealCounts);
      const mealColors = ['var(--meal-1)', 'var(--meal-2)', 'var(--meal-3)'];
      const mealBgs = ['var(--meal-1-light)', 'var(--meal-2-light)', 'var(--meal-3-light)'];
      let idx = 0;
      mealBreakdownEl.innerHTML = meals.map(([meal, count]) => {
        const pct = Math.round((count / total) * 100);
        const color = mealColors[idx] || '#888';
        const bg = mealBgs[idx] || '#eee';
        idx++;
        return `
          <div class="meal-stat" style="--meal-color:${color};--meal-bg:${bg}">
            <div class="meal-stat-bar-wrap">
              <div class="meal-stat-bar" style="width:${pct}%;background:${color}"></div>
            </div>
            <div class="meal-stat-info">
              <span class="meal-stat-name" style="color:${color}">${meal}</span>
              <span class="meal-stat-count">${count} <span class="meal-stat-pct">(${pct}%)</span></span>
            </div>
          </div>`;
      }).join('');
    }
  }

  // ── Table ──
  const tbody = document.getElementById('reg-tbody');
  tbody.innerHTML = '';
  registrations.forEach(r => {
    const tr = document.createElement('tr');
    const date = new Date(r.created_at).toLocaleDateString();
    const isPaid = r.payment_status === 'paid';
    const badgeClass = isPaid ? 'badge-paid' : 'badge-pending';

    const tdName = document.createElement('td');
    tdName.textContent = r.name + (r.is_walkin ? ' ★' : '');
    if (r.is_walkin) tdName.title = 'Walk-in';

    const tdEmail = document.createElement('td');
    tdEmail.textContent = r.email || '—';

    const tdPhone = document.createElement('td');
    tdPhone.textContent = r.phone || '—';

    const tdMeal = document.createElement('td');
    tdMeal.textContent = r.meal_choice;

    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${badgeClass}`;
    badge.textContent = isPaid ? 'Paid' : 'Pending';
    tdStatus.appendChild(badge);

    const tdDate = document.createElement('td');
    tdDate.textContent = date;

    // ── Payment override button ──
    const tdAction = document.createElement('td');
    const overrideBtn = document.createElement('button');
    overrideBtn.className = isPaid ? 'btn-override btn-mark-pending' : 'btn-override btn-mark-paid';
    overrideBtn.textContent = isPaid ? 'Mark Pending' : '✓ Mark Paid';
    overrideBtn.title = isPaid ? 'Override: set to pending' : 'Override: mark as paid (cash/check)';
    overrideBtn.dataset.id = r.id;
    overrideBtn.dataset.status = isPaid ? 'pending' : 'paid';
    overrideBtn.addEventListener('click', handlePaymentOverride);
    tdAction.appendChild(overrideBtn);

    tr.append(tdName, tdEmail, tdPhone, tdMeal, tdStatus, tdDate, tdAction);
    tbody.appendChild(tr);
  });

  // ── Populate walk-in modal meal dropdown ──
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

  // ── Also render activity and recon if those tabs exist ──
  renderActivityFeed();
  renderSquareRecon();
}

// ─── Payment Override ────────────────────────────────
async function handlePaymentOverride(e) {
  const btn = e.currentTarget;
  const registrationId = btn.dataset.id;
  const newStatus = btn.dataset.status;

  btn.disabled = true;
  btn.textContent = 'Updating…';

  try {
    const res = await fetch(`${API}/update-registration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
      body: JSON.stringify({ registrationId, payment_status: newStatus }),
    });
    if (res.ok) {
      // Optimistically update the local data
      const reg = registrations.find(r => String(r.id) === String(registrationId));
      if (reg) reg.payment_status = newStatus;
      renderRegistrations();
    } else {
      const data = await res.json();
      alert(`Error: ${data.error || 'Update failed'}`);
      btn.disabled = false;
      btn.textContent = newStatus === 'paid' ? '✓ Mark Paid' : 'Mark Pending';
    }
  } catch (err) {
    alert('Network error. Please try again.');
    btn.disabled = false;
    btn.textContent = newStatus === 'paid' ? '✓ Mark Paid' : 'Mark Pending';
  }
}

// ─── Activity Log ────────────────────────────────────
function renderActivityFeed() {
  const feedEl = document.getElementById('activity-feed');
  if (!feedEl) return;

  if (!registrations.length) {
    feedEl.innerHTML = '<p class="activity-empty">No registrations yet.</p>';
    return;
  }

  // Sort by created_at descending (most recent first)
  const sorted = [...registrations].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const items = sorted.map(r => {
    const time = new Date(r.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const isPaid = r.payment_status === 'paid';
    const isWalkin = r.is_walkin;

    let icon, message, badgeClass;
    if (isWalkin) {
      icon = '🚶';
      message = `Walk-in added: <strong>${r.name}</strong> — ${r.meal_choice}`;
      badgeClass = 'activity-badge-walkin';
    } else if (isPaid) {
      icon = '💳';
      message = `<strong>${r.name}</strong> registered &amp; paid — ${r.meal_choice}`;
      badgeClass = 'activity-badge-paid';
    } else {
      icon = '📋';
      message = `<strong>${r.name}</strong> registered — ${r.meal_choice}`;
      badgeClass = 'activity-badge-pending';
    }

    return `
      <div class="activity-item">
        <div class="activity-icon ${badgeClass}">${icon}</div>
        <div class="activity-body">
          <div class="activity-msg">${message}</div>
          <div class="activity-time">${date} at ${time}</div>
        </div>
      </div>`;
  }).join('');

  feedEl.innerHTML = items;
}

// ─── Square Reconciliation ───────────────────────────
function renderSquareRecon() {
  const tbody = document.getElementById('recon-tbody');
  if (!tbody) return;

  if (!registrations.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#8a8278;padding:24px">No registrations yet.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  registrations.forEach(r => {
    const tr = document.createElement('tr');
    const date = new Date(r.created_at).toLocaleDateString();
    const isPaid = r.payment_status === 'paid';
    const txId = r.square_transaction_id || r.payment_id || '—';
    const price = currentEvent ? `$${currentEvent.price_per_person}` : '—';

    const tdName = document.createElement('td');
    tdName.textContent = r.name + (r.is_walkin ? ' ★' : '');

    const tdAmount = document.createElement('td');
    tdAmount.textContent = price;
    tdAmount.style.fontWeight = '600';

    const tdTx = document.createElement('td');
    tdTx.className = 'tx-id';
    tdTx.textContent = txId;

    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${isPaid ? 'badge-paid' : 'badge-pending'}`;
    badge.textContent = isPaid ? 'Paid' : 'Pending';
    tdStatus.appendChild(badge);

    const tdDate = document.createElement('td');
    tdDate.textContent = date;

    tr.append(tdName, tdAmount, tdTx, tdStatus, tdDate);
    tbody.appendChild(tr);
  });
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

// ─── Manual Refresh Buttons ──────────────────────────
document.getElementById('manual-refresh-btn')?.addEventListener('click', () => {
  loadRegistrations();
});

document.getElementById('activity-refresh-btn')?.addEventListener('click', () => {
  loadRegistrations();
});

// ─── Auto-Refresh (30 seconds when dashboard visible) ─
let autoRefreshTimer = null;

function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(() => {
    // Only refresh if a data tab is active
    const activeTab = document.querySelector('.tab.active')?.dataset?.tab;
    if (['registrations', 'activity', 'square-recon', 'print-cards'].includes(activeTab)) {
      loadRegistrations();
    }
  }, 30000);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

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
