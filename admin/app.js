// admin/app.js — STSA Admin Dashboard Logic
// ── ALL content is database-driven. Nothing is hardcoded. ──

const API = '/api';
let adminToken = '';
let currentEvent = null;
let registrations = [];
let eventHistory = [];

// ═════════════════════════════════════════════════════════════
// AUTH
// ═════════════════════════════════════════════════════════════

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
      showDashboard();
    } else {
      errorEl.hidden = false;
    }
  } catch {
    errorEl.hidden = false;
  }
});

document.getElementById('logout-btn').addEventListener('click', showLogin);

// ═════════════════════════════════════════════════════════════
// MAIN TAB ROUTING
// ═════════════════════════════════════════════════════════════

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => {
      c.hidden = true;
      c.classList.remove('active');
    });
    tab.classList.add('active');
    const target = document.getElementById(`tab-${tab.dataset.tab}`);
    if (!target) return;
    target.hidden = false;
    target.classList.add('active');

    // Load data when switching to data-heavy tabs
    const dataTab = tab.dataset.tab;
    if (['registrations', 'print-cards', 'activity-payments'].includes(dataTab)) {
      loadRegistrations();
    }
    if (dataTab === 'analytics') {
      loadAnalytics();
    }
    if (dataTab === 'ideas') {
      loadImprovements();
    }
    if (dataTab === 'event-setup') {
      // If history subtab is active when returning, refresh it
      const activeSubtab = document.querySelector('#tab-event-setup .subtab.active');
      if (activeSubtab && activeSubtab.dataset.subtab === 'es-history') {
        loadEventHistory();
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════
// GENERIC SUBTAB WIRING — handles ALL .subtab buttons
// Each .subtab has data-subtab="some-id" which maps to
// the element #subtab-{some-id}
// ═════════════════════════════════════════════════════════════

function wireSubtabs(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  container.querySelectorAll('.subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      // Deactivate all subtabs in this container
      container.querySelectorAll('.subtab').forEach(b => b.classList.remove('active'));
      container.querySelectorAll('.subtab-content').forEach(c => {
        c.hidden = true;
        c.classList.remove('active');
      });
      btn.classList.add('active');
      const targetId = `subtab-${btn.dataset.subtab}`;
      const panel = document.getElementById(targetId);
      if (panel) {
        panel.hidden = false;
        panel.classList.add('active');
      }

      // Trigger side effects
      const sub = btn.dataset.subtab;
      if (sub === 'es-preview') renderPreview();
      if (sub === 'es-history') loadEventHistory();
      if (sub === 'reg-walkins') renderWalkinSubtab();
      if (sub === 'reg-export') renderExportSubtab();
    });
  });
}

// Wire up all three subtab bars
wireSubtabs('#tab-event-setup');
wireSubtabs('#tab-registrations');
wireSubtabs('#tab-activity-payments');

// ═════════════════════════════════════════════════════════════
// EVENT SETUP — Load & Save
// ═════════════════════════════════════════════════════════════

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
      updateAllContextLabels();
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
    if (!el) return;
    const val = el.value.trim();
    if (field === 'price_per_person') {
      const num = parseInt(val, 10);
      // Only include price if it's a valid number (avoids NaN → null → Supabase 500)
      if (!isNaN(num)) formData[field] = num;
    } else if (val !== '') {
      // Only include non-empty strings — empty strings crash Supabase time/date columns
      formData[field] = val;
    }
    // If val is empty, we omit the field entirely so Supabase keeps the existing value
  });
  if (currentEvent?.id) formData.id = currentEvent.id;
  return formData;
}

document.getElementById('event-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById('save-status');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.innerHTML;
  
  statusEl.hidden = true;

  // Visual feedback — button changes immediately
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="btn-spinner"></span> Saving...';
  submitBtn.classList.add('btn-saving');

  const formData = gatherEventForm();

  // Validate critical fields
  const requiredFields = [
    { key: 'event_name', label: 'Event Name' },
    { key: 'event_date', label: 'Event Date' },
    { key: 'meal_choice_1', label: 'Meal Choice 1' },
    { key: 'meal_choice_2', label: 'Meal Choice 2' },
    { key: 'meal_choice_3', label: 'Meal Choice 3' },
  ];
  const missing = requiredFields.filter(f => !formData[f.key] || !formData[f.key].toString().trim());
  if (missing.length > 0) {
    statusEl.textContent = '⚠️ Please fill in: ' + missing.map(f => f.label).join(', ');
    statusEl.className = 'status-text error';
    statusEl.hidden = false;
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
    submitBtn.classList.remove('btn-saving');
    const firstMissing = document.getElementById(missing[0].key);
    if (firstMissing) firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  try {
    console.log('Saving event...', formData);
    const res = await fetch(`${API}/save-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
      body: JSON.stringify(formData),
    });
    const data = await res.json();
    console.log('Save response:', res.status, data);
    if (res.ok) {
      currentEvent = data.event;
      updateAllContextLabels();
      // Success state — green check, stays visible
      submitBtn.innerHTML = '✅ Published!';
      submitBtn.classList.remove('btn-saving');
      submitBtn.classList.add('btn-saved');
      statusEl.textContent = '✓ Event saved and published! RSVP page is now live.';
      statusEl.className = 'status-text success';
      statusEl.hidden = false;
      // Reset button after 3 seconds
      setTimeout(() => {
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
        submitBtn.classList.remove('btn-saved');
        statusEl.hidden = true;
      }, 3000);
      // Refresh history subtab if it exists
      if (typeof loadEventHistory === 'function') loadEventHistory();
    } else {
      statusEl.textContent = 'Error: ' + (data.error || 'Unknown error');
      statusEl.className = 'status-text error';
      statusEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
      submitBtn.classList.remove('btn-saving');
    }
  } catch (err) {
    console.error('Save error:', err);
    statusEl.textContent = 'Network error: ' + err.message + '. Please try again.';
    statusEl.className = 'status-text error';
    statusEl.hidden = false;
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
    submitBtn.classList.remove('btn-saving');
  }
});

// ═════════════════════════════════════════════════════════════
// CONTEXT LABELS — Database-driven headings across all tabs
// Updates every place that shows the active event name/date
// ═════════════════════════════════════════════════════════════

function updateAllContextLabels() {
  if (!currentEvent) return;
  const name = currentEvent.event_name || 'Unnamed Event';
  const dateStr = currentEvent.event_date
    ? formatDate(currentEvent.event_date)
    : '';
  const context = dateStr ? `${name} — ${dateStr}` : name;

  setEl('reg-event-context', context);
  setEl('ap-event-context', context);
  setEl('print-event-context', `Preview and print place cards for ${name}`);
  setEl('analytics-event-context', context);
  setEl('export-event-name', `${name}${dateStr ? ' · ' + dateStr : ''}`);

  // Export filename preview
  const slug = (currentEvent.event_date || new Date().toISOString().slice(0,10));
  setEl('export-filename-preview', `stsa-registrations-${slug}.csv`);
}

// ═════════════════════════════════════════════════════════════
// PREVIEW — Renders live RSVP page preview from form values
// ═════════════════════════════════════════════════════════════

function renderPreview() {
  const wrap = document.getElementById('event-preview-wrap');
  if (!wrap) return;

  // Publish status bar
  const isLive = currentEvent && currentEvent.is_active;
  const statusBarHtml = `<div class="publish-status-bar" style="background:${isLive ? '#ECFDF5' : '#F3F4F6'}; border:1px solid ${isLive ? '#A7F3D0' : '#D1D5DB'}">
    <span class="publish-dot ${isLive ? 'live' : 'draft'}"></span>
    ${isLive 
      ? '<strong>LIVE</strong> — <a href="/rsvp/" target="_blank">View RSVP Page →</a>' 
      : '<strong>DRAFT</strong> — Save &amp; Publish to make it live'}
  </div>`;

  // Read directly from the form fields (live, unsaved values)
  function fv(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  const eventName     = fv('event_name')        || '(Event Name)';
  const eventDate     = fv('event_date');
  const venueName     = fv('venue_name')         || '(Venue)';
  const venueAddress  = fv('venue_address')      || '';
  const price         = fv('price_per_person')   || '0';
  const timeReg       = fv('time_registration');
  const timeLunch     = fv('time_lunch');
  const timeMeetStart = fv('time_meeting_start');
  const timeMeetEnd   = fv('time_meeting_end');
  const speakerName   = fv('speaker_name');
  const speakerBio    = fv('speaker_bio');
  const topic         = fv('topic');
  const guestName     = fv('guest_name');
  const guestBio      = fv('guest_bio');
  const meal1         = fv('meal_choice_1')      || '—';
  const meal2         = fv('meal_choice_2')      || '—';
  const meal3         = fv('meal_choice_3')      || '—';
  const spkrSponsor   = fv('speaker_sponsor_name') && fv('speaker_sponsor_company')
    ? `${fv('speaker_sponsor_name')}, ${fv('speaker_sponsor_company')}`
    : '';
  const lunchSponsor  = fv('luncheon_sponsor_name') && fv('luncheon_sponsor_company')
    ? `${fv('luncheon_sponsor_name')}, ${fv('luncheon_sponsor_company')}`
    : '';

  const formattedDate = eventDate ? formatDate(eventDate) : '(Date not set)';
  const mapsUrl       = venueAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueAddress)}`
    : '#';
  const meetingTime   = timeMeetStart && timeMeetEnd
    ? `${formatTime(timeMeetStart)} – ${formatTime(timeMeetEnd)}`
    : timeMeetStart ? formatTime(timeMeetStart) : '—';

  const speakerHtml = speakerName ? `
    <div class="preview-speaker-label">Featured Speaker</div>
    <div class="preview-speaker-card">
      <div class="preview-speaker-name">${escapeHtml(speakerName)}</div>
      ${topic ? `<div class="preview-speaker-topic">${escapeHtml(topic)}</div>` : ''}
      ${speakerBio ? `<div class="preview-speaker-bio">${escapeHtml(speakerBio)}</div>` : ''}
    </div>` : '';

  const guestHtml = guestName ? `
    <div class="preview-speaker-label" style="margin-top:16px">Special Guest</div>
    <div class="preview-speaker-card">
      <div class="preview-speaker-name">${escapeHtml(guestName)}</div>
      ${guestBio ? `<div class="preview-speaker-bio">${escapeHtml(guestBio)}</div>` : ''}
    </div>` : '';

  const sponsorHtml = (spkrSponsor || lunchSponsor) ? `
    <div style="background:#fff;border-radius:10px;padding:14px 18px;border:1px solid #e8e4de;font-size:0.84rem;color:#8a8278;margin-top:8px">
      ${spkrSponsor ? `<div><strong style="color:var(--board-navy)">Speaker Sponsor:</strong> ${escapeHtml(spkrSponsor)}</div>` : ''}
      ${lunchSponsor ? `<div style="margin-top:4px"><strong style="color:var(--board-navy)">Luncheon Sponsor:</strong> ${escapeHtml(lunchSponsor)}</div>` : ''}
    </div>` : '';

  wrap.innerHTML = statusBarHtml + `
    <div class="preview-rsvp-header">
      <div class="preview-brand">STSA</div>
    </div>

    <div class="preview-hero">
      <div class="preview-event-label">You're Invited</div>
      <div class="preview-event-title">${escapeHtml(eventName)}</div>
      <div class="preview-meta-item">
        <span class="preview-meta-icon">📅</span>
        <span>${escapeHtml(formattedDate)}</span>
      </div>
      <div class="preview-meta-item">
        <span class="preview-meta-icon">📍</span>
        <a href="${mapsUrl}" target="_blank" style="color:rgba(255,255,255,0.85);text-decoration:underline;text-underline-offset:3px">
          ${escapeHtml(venueName)}${venueAddress ? ` — ${escapeHtml(venueAddress)}` : ''}
        </a>
      </div>
      <div class="preview-meta-item">
        <span class="preview-meta-icon">💰</span>
        <span>$${escapeHtml(price)} per person</span>
      </div>
    </div>

    <div class="preview-schedule">
      <div class="preview-sched-item">
        <span class="preview-sched-time">${timeReg ? formatTime(timeReg) : '—'}</span>
        <span class="preview-sched-label">Registration &amp; Networking</span>
      </div>
      <div class="preview-sched-item">
        <span class="preview-sched-time">${timeLunch ? formatTime(timeLunch) : '—'}</span>
        <span class="preview-sched-label">Lunch</span>
      </div>
      <div class="preview-sched-item">
        <span class="preview-sched-time">${meetingTime}</span>
        <span class="preview-sched-label">Meeting</span>
      </div>
    </div>

    ${speakerHtml}
    ${guestHtml}

    <div class="preview-meals-section">
      <div class="preview-meals-label">Pick Your Meal</div>
      <div class="preview-meal-btns">
        <div class="preview-meal-btn">${escapeHtml(meal1)}</div>
        <div class="preview-meal-btn">${escapeHtml(meal2)}</div>
        <div class="preview-meal-btn">${escapeHtml(meal3)}</div>
      </div>
      <div class="preview-price-note">$${escapeHtml(price)} per person · Pay securely via Square at checkout</div>
    </div>

    ${sponsorHtml}

    <div style="text-align:center;padding:24px 0 8px;color:#aaa;font-size:0.78rem;font-family:var(--font-body)">
      &copy; 2026 South Texas Surety Association
    </div>
  `;
}

// ═════════════════════════════════════════════════════════════
// EVENT HISTORY (subtab inside Event Setup)
// ═════════════════════════════════════════════════════════════

let selectedHistoryEventId = null;

async function loadEventHistory() {
  if (eventHistory.length > 0) {
    renderHistoryTable();
    return;
  }
  document.getElementById('history-loading').hidden = false;
  document.getElementById('history-table-wrap').hidden = true;
  document.getElementById('history-empty').hidden = true;

  try {
    const res = await fetch(`${API}/get-event-history`, {
      headers: { 'X-Admin-Token': adminToken },
    });
    const data = await res.json();
    eventHistory = data.events || [];
    renderHistoryTable();
  } catch (err) {
    console.error('Failed to load event history:', err);
    document.getElementById('history-loading').textContent = 'Failed to load. Please refresh.';
  }
}

function renderHistoryTable() {
  const loadEl  = document.getElementById('history-loading');
  const wrapEl  = document.getElementById('history-table-wrap');
  const emptyEl = document.getElementById('history-empty');
  const tbody   = document.getElementById('history-tbody');

  loadEl.hidden = true;

  if (!eventHistory.length) {
    emptyEl.hidden = false;
    wrapEl.hidden = true;
    return;
  }

  emptyEl.hidden = true;
  wrapEl.hidden = false;
  tbody.innerHTML = '';

  eventHistory.forEach(ev => {
    const tr = document.createElement('tr');
    tr.className = 'history-table-row';
    tr.dataset.eventId = ev.id;

    const dateStr  = ev.event_date ? formatDate(ev.event_date) : '—';
    const revenue  = `$${(ev.revenue || 0).toLocaleString()}`;
    const isActive = ev.is_active;

    tr.innerHTML = `
      <td style="font-weight:700;color:var(--board-navy)">${escapeHtml(ev.event_name || '—')}</td>
      <td>${escapeHtml(dateStr)}</td>
      <td style="text-align:center;font-weight:700">${ev.total_registrations}</td>
      <td style="text-align:center;font-weight:700;color:#1a7c4f">${ev.paid_count}</td>
      <td style="font-weight:700;color:#1a7c4f">${revenue}</td>
      <td>
        <span class="badge ${isActive ? 'badge-active' : 'badge-past'}">
          ${isActive ? 'Active' : 'Past'}
        </span>
      </td>
    `;

    tr.addEventListener('click', () => toggleHistoryDetail(ev));
    tbody.appendChild(tr);
  });
}

function toggleHistoryDetail(ev) {
  const panel = document.getElementById('history-detail-panel');
  const rows = document.querySelectorAll('.history-table-row');

  // If same row, collapse
  if (selectedHistoryEventId === ev.id) {
    selectedHistoryEventId = null;
    panel.hidden = true;
    rows.forEach(r => r.classList.remove('expanded'));
    return;
  }

  selectedHistoryEventId = ev.id;
  rows.forEach(r => r.classList.remove('expanded'));
  document.querySelector(`.history-table-row[data-event-id="${ev.id}"]`)?.classList.add('expanded');

  const mealBars = ev.meal_breakdown && Object.keys(ev.meal_breakdown).length
    ? `<div class="history-meal-bars">
        <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#8a8278;margin-bottom:10px">Meal Breakdown</div>
        ${Object.entries(ev.meal_breakdown).map(([meal, count]) => {
          const pct = ev.total_registrations > 0 ? Math.round((count / ev.total_registrations) * 100) : 0;
          return `<div class="analytics-meal-row" style="margin-bottom:10px">
            <div class="analytics-meal-info">
              <span class="analytics-meal-name">${escapeHtml(meal)}</span>
              <span class="analytics-meal-count">${count} (${pct}%)</span>
            </div>
            <div class="analytics-bar-wrap">
              <div class="analytics-bar" style="width:${pct}%;background:var(--board-burnt)"></div>
            </div>
          </div>`;
        }).join('')}
      </div>` : '';

  panel.innerHTML = `
    <div class="history-detail-title">📋 ${escapeHtml(ev.event_name || '—')} — ${ev.event_date ? formatDate(ev.event_date) : '—'}</div>
    <div class="history-detail-grid">
      <div class="history-detail-item">
        <div class="history-detail-label">Venue</div>
        <div class="history-detail-value" style="font-size:0.88rem">${escapeHtml(ev.venue_name || '—')}</div>
      </div>
      <div class="history-detail-item">
        <div class="history-detail-label">Price / Person</div>
        <div class="history-detail-value">$${ev.price_per_person || 0}</div>
      </div>
      <div class="history-detail-item">
        <div class="history-detail-label">Total Registered</div>
        <div class="history-detail-value">${ev.total_registrations}</div>
      </div>
      <div class="history-detail-item">
        <div class="history-detail-label">Confirmed Paid</div>
        <div class="history-detail-value" style="color:#1a7c4f">${ev.paid_count}</div>
      </div>
      <div class="history-detail-item">
        <div class="history-detail-label">Walk-ins</div>
        <div class="history-detail-value">${ev.walkin_count || 0}</div>
      </div>
      <div class="history-detail-item">
        <div class="history-detail-label">Revenue</div>
        <div class="history-detail-value" style="color:#1a7c4f">$${(ev.revenue || 0).toLocaleString()}</div>
      </div>
      ${ev.speaker_name ? `<div class="history-detail-item" style="grid-column:1/-1">
        <div class="history-detail-label">Speaker</div>
        <div class="history-detail-value" style="font-size:0.9rem">${escapeHtml(ev.speaker_name)}${ev.topic ? ` — ${escapeHtml(ev.topic)}` : ''}</div>
      </div>` : ''}
    </div>
    ${mealBars}
  `;
  panel.hidden = false;
}

// ═════════════════════════════════════════════════════════════
// REGISTRATIONS — Load, Render All subtabs
// ═════════════════════════════════════════════════════════════

async function loadRegistrations() {
  try {
    const res = await fetch(`${API}/get-registrations`, {
      headers: { 'X-Admin-Token': adminToken },
    });
    const data = await res.json();
    registrations = data.registrations || [];
    renderRegistrations();
    renderWalkinSubtab();
    renderMealCards();
    renderActivityFeed();
    renderSquareRecon();
  } catch (err) {
    console.error('Failed to load registrations:', err);
  }
}

function renderRegistrations() {
  const total   = registrations.length;
  const paid    = registrations.filter(r => r.payment_status === 'paid').length;
  const pending = registrations.filter(r => r.payment_status !== 'paid').length;
  const walkins = registrations.filter(r => r.is_walkin).length;

  // Summary stats (always visible at top of Registrations tab)
  setEl('stat-total',   total);
  setEl('stat-paid',    paid);
  setEl('stat-pending', pending);
  setEl('stat-walkin',  walkins);

  // Meal breakdown bar
  const mealCounts = {};
  registrations.forEach(r => {
    if (r.meal_choice) mealCounts[r.meal_choice] = (mealCounts[r.meal_choice] || 0) + 1;
  });
  const mealBreakdownEl = document.getElementById('meal-breakdown');
  if (mealBreakdownEl) {
    if (total === 0) {
      mealBreakdownEl.innerHTML = '';
    } else {
      const mealColors = ['var(--meal-1)', 'var(--meal-2)', 'var(--meal-3)'];
      let idx = 0;
      mealBreakdownEl.innerHTML = Object.entries(mealCounts).map(([meal, count]) => {
        const pct   = Math.round((count / total) * 100);
        const color = mealColors[idx++] || '#888';
        return `<div class="meal-stat">
          <div class="meal-stat-bar-wrap">
            <div class="meal-stat-bar" style="width:${pct}%;background:${color}"></div>
          </div>
          <div class="meal-stat-info">
            <span class="meal-stat-name" style="color:${color}">${escapeHtml(meal)}</span>
            <span class="meal-stat-count">${count} <span class="meal-stat-pct">(${pct}%)</span></span>
          </div>
        </div>`;
      }).join('');
    }
  }

  // Main registrations table
  const tbody = document.getElementById('reg-tbody');
  tbody.innerHTML = '';

  if (total === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#8a8278;padding:40px;font-size:0.95rem">No one has registered yet. Send out your RSVP link to get started! 🎉</td></tr>';
    return;
  }

  registrations.forEach(r => {
    const tr = document.createElement('tr');
    tr.dataset.regId = r.id;
    const date = new Date(r.created_at).toLocaleDateString();
    const isPaid = r.payment_status === 'paid';

    const tdName = document.createElement('td');
    tdName.textContent = r.name + (r.is_walkin ? ' ★' : '');
    tdName.style.fontWeight = '600';
    if (r.is_walkin) tdName.title = 'Walk-in guest';

    const tdEmail = document.createElement('td');
    tdEmail.textContent = r.email || '—';

    const tdPhone = document.createElement('td');
    tdPhone.textContent = r.phone || '—';

    const tdMeal = document.createElement('td');
    tdMeal.textContent = r.meal_choice || '—';

    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${isPaid ? 'badge-paid' : 'badge-pending'}`;
    badge.textContent = isPaid ? 'Paid' : 'Pending';
    tdStatus.appendChild(badge);

    const tdDate = document.createElement('td');
    tdDate.textContent = date;

    const tdPayment = document.createElement('td');
    const overrideBtn = document.createElement('button');
    overrideBtn.className = isPaid ? 'btn-override btn-mark-pending' : 'btn-override btn-mark-paid';
    overrideBtn.textContent = isPaid ? 'Mark Pending' : '✓ Mark Paid';
    overrideBtn.title = isPaid ? 'Override: set to pending' : 'Override: mark as paid (cash/check)';
    overrideBtn.dataset.id     = r.id;
    overrideBtn.dataset.status = isPaid ? 'pending' : 'paid';
    overrideBtn.addEventListener('click', handlePaymentOverride);
    tdPayment.appendChild(overrideBtn);

    const tdActions = document.createElement('td');
    tdActions.className = 'td-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'btn-edit-row';
    editBtn.innerHTML = '✏️';
    editBtn.title = 'Edit this registration';
    editBtn.addEventListener('click', () => handleInlineEditStart(r.id));
    tdActions.appendChild(editBtn);

    tr.append(tdName, tdEmail, tdPhone, tdMeal, tdStatus, tdDate, tdPayment, tdActions);
    tbody.appendChild(tr);
  });

  // Populate walk-in modal meal dropdown from currentEvent (database-driven)
  const walkinMealSelect = document.getElementById('walkin-meal');
  walkinMealSelect.innerHTML = '<option value="">Select…</option>';
  if (currentEvent) {
    [currentEvent.meal_choice_1, currentEvent.meal_choice_2, currentEvent.meal_choice_3]
      .filter(Boolean)
      .forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        walkinMealSelect.appendChild(opt);
      });
  }
}

// Walk-ins subtab — shows only walk-in guests
function renderWalkinSubtab() {
  const tbody = document.getElementById('walkin-tbody');
  if (!tbody) return;
  const walkins = registrations.filter(r => r.is_walkin);
  if (!walkins.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#8a8278;padding:40px;font-size:0.95rem">No walk-in guests yet. Use the "Add Walk-in" button on event day to add late arrivals.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  walkins.forEach(r => {
    const tr = document.createElement('tr');
    const date = new Date(r.created_at).toLocaleDateString();
    const isPaid = r.payment_status === 'paid';
    tr.innerHTML = `
      <td style="font-weight:600">${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.email || '—')}</td>
      <td>${escapeHtml(r.meal_choice || '—')}</td>
      <td>${date}</td>
      <td><span class="badge ${isPaid ? 'badge-paid' : 'badge-pending'}">${isPaid ? 'Paid' : 'Pending'}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Export subtab — updates stats from live data
function renderExportSubtab() {
  const total   = registrations.length;
  const paid    = registrations.filter(r => r.payment_status === 'paid').length;
  const walkins = registrations.filter(r => r.is_walkin).length;
  setEl('export-stat-total',  total);
  setEl('export-stat-paid',   paid);
  setEl('export-stat-walkin', walkins);
  // Context label and filename are already set by updateAllContextLabels()
}

// ═════════════════════════════════════════════════════════════
// PAYMENT OVERRIDE
// ═════════════════════════════════════════════════════════════

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
      const reg = registrations.find(r => String(r.id) === String(registrationId));
      if (reg) reg.payment_status = newStatus;
      renderRegistrations();
      renderWalkinSubtab();
      renderActivityFeed();
      renderSquareRecon();
    } else {
      const data = await res.json();
      alert(`Error: ${data.error || 'Update failed'}`);
      btn.disabled = false;
      btn.textContent = newStatus === 'paid' ? '✓ Mark Paid' : 'Mark Pending';
    }
  } catch {
    alert('Network error. Please try again.');
    btn.disabled = false;
    btn.textContent = newStatus === 'paid' ? '✓ Mark Paid' : 'Mark Pending';
  }
}

// ═════════════════════════════════════════════════════════════
// INLINE EDIT — Registrations table
// ═════════════════════════════════════════════════════════════

function handleInlineEditStart(regId) {
  const tbody = document.getElementById('reg-tbody');
  const tr = tbody.querySelector(`tr[data-reg-id="${regId}"]`);
  if (!tr || tr.classList.contains('editing')) return;

  const reg = registrations.find(r => String(r.id) === String(regId));
  if (!reg) return;

  tr.classList.add('editing');

  // Cell order: Name, Email, Phone, Meal, Status, Date, Payment, Actions
  const cells = tr.cells;

  // Name (0)
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'inline-edit-input';
  nameInput.value = reg.name || '';
  nameInput.maxLength = 100;
  cells[0].innerHTML = '';
  cells[0].appendChild(nameInput);

  // Email (1)
  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.className = 'inline-edit-input';
  emailInput.value = reg.email || '';
  emailInput.maxLength = 254;
  cells[1].innerHTML = '';
  cells[1].appendChild(emailInput);

  // Phone (2)
  const phoneInput = document.createElement('input');
  phoneInput.type = 'tel';
  phoneInput.className = 'inline-edit-input';
  phoneInput.value = reg.phone || '';
  phoneInput.maxLength = 20;
  cells[2].innerHTML = '';
  cells[2].appendChild(phoneInput);

  // Meal (3)
  const mealSelect = document.createElement('select');
  mealSelect.className = 'inline-edit-select';
  const mealOptions = currentEvent
    ? [currentEvent.meal_choice_1, currentEvent.meal_choice_2, currentEvent.meal_choice_3].filter(Boolean)
    : [reg.meal_choice].filter(Boolean);
  mealOptions.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    if (m === reg.meal_choice) opt.selected = true;
    mealSelect.appendChild(opt);
  });
  cells[3].innerHTML = '';
  cells[3].appendChild(mealSelect);

  // Status (4), Date (5), Payment (6) — keep as-is (not editable inline)

  // Actions (7) — replace with Save / Cancel
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-inline-save';
  saveBtn.textContent = '✓ Save';
  saveBtn.title = 'Save changes';
  saveBtn.addEventListener('click', () => handleInlineEditSave(regId, nameInput, emailInput, phoneInput, mealSelect));

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-inline-cancel';
  cancelBtn.textContent = '✗';
  cancelBtn.title = 'Cancel edit';
  cancelBtn.addEventListener('click', () => handleInlineEditCancel(regId));

  cells[7].innerHTML = '';
  cells[7].appendChild(saveBtn);
  cells[7].appendChild(cancelBtn);
}

async function handleInlineEditSave(regId, nameInput, emailInput, phoneInput, mealSelect) {
  const tbody = document.getElementById('reg-tbody');
  const tr = tbody.querySelector(`tr[data-reg-id="${regId}"]`);
  if (!tr) return;

  const saveBtn = tr.cells[7].querySelector('.btn-inline-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '…'; }

  const payload = {
    registrationId: regId,
    name: nameInput.value.trim(),
    email: emailInput.value.trim() || null,
    phone: phoneInput.value.trim() || null,
    meal_choice: mealSelect.value || null,
  };

  if (!payload.name) {
    alert('Name is required.');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '✓ Save'; }
    return;
  }

  try {
    const res = await fetch(`${API}/update-registration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      // Update local registrations array
      const reg = registrations.find(r => String(r.id) === String(regId));
      if (reg && data.registration) {
        Object.assign(reg, data.registration);
      }
      // Re-render to exit edit mode cleanly
      renderRegistrations();
      renderActivityFeed();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(`Save failed: ${data.error || 'Unknown error'}`);
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '✓ Save'; }
    }
  } catch {
    alert('Network error. Please try again.');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '✓ Save'; }
  }
}

function handleInlineEditCancel(regId) {
  renderRegistrations();
}

// ═════════════════════════════════════════════════════════════
// ACTIVITY LOG (Activity & Payments tab → Activity subtab)
// ═════════════════════════════════════════════════════════════

function renderActivityFeed() {
  const feedEl = document.getElementById('activity-feed');
  if (!feedEl) return;
  if (!registrations.length) {
    feedEl.innerHTML = '<p class="activity-empty">Activity will show up here as people register and pay. Check back soon! 📬</p>';
    return;
  }
  const sorted = [...registrations].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  feedEl.innerHTML = sorted.map(r => {
    const time  = new Date(r.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const date  = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const isPaid    = r.payment_status === 'paid';
    const isWalkin  = r.is_walkin;

    let icon, message, badgeClass;
    if (isWalkin) {
      icon = '🚶'; message = `Walk-in added: <strong>${escapeHtml(r.name)}</strong> — ${escapeHtml(r.meal_choice || '—')}`;
      badgeClass = 'activity-badge-walkin';
    } else if (isPaid) {
      icon = '💳'; message = `<strong>${escapeHtml(r.name)}</strong> registered &amp; paid — ${escapeHtml(r.meal_choice || '—')}`;
      badgeClass = 'activity-badge-paid';
    } else {
      icon = '📋'; message = `<strong>${escapeHtml(r.name)}</strong> registered — ${escapeHtml(r.meal_choice || '—')}`;
      badgeClass = 'activity-badge-pending';
    }
    return `<div class="activity-item" data-reg-id="${escapeHtml(String(r.id))}">
      <div class="activity-icon ${badgeClass}">${icon}</div>
      <div class="activity-body">
        <div class="activity-msg">${message}</div>
        <div class="activity-time">${date} at ${time}</div>
      </div>
      <button class="btn-activity-edit" title="Edit this entry" data-reg-id="${escapeHtml(String(r.id))}">✏️</button>
    </div>`;
  }).join('');

  // Wire edit buttons
  feedEl.querySelectorAll('.btn-activity-edit').forEach(btn => {
    btn.addEventListener('click', () => handleActivityInlineEditStart(btn.dataset.regId));
  });
}

// ═════════════════════════════════════════════════════════════
// ACTIVITY INLINE EDIT
// ═════════════════════════════════════════════════════════════

function handleActivityInlineEditStart(regId) {
  const feedEl = document.getElementById('activity-feed');
  const item = feedEl && feedEl.querySelector(`.activity-item[data-reg-id="${regId}"]`);
  if (!item || item.classList.contains('editing')) return;

  const reg = registrations.find(r => String(r.id) === String(regId));
  if (!reg) return;

  item.classList.add('editing');

  // Build inline edit form inside the activity body
  const body = item.querySelector('.activity-body');
  const mealOptions = currentEvent
    ? [currentEvent.meal_choice_1, currentEvent.meal_choice_2, currentEvent.meal_choice_3].filter(Boolean)
    : [reg.meal_choice].filter(Boolean);

  const mealOptsHtml = mealOptions.map(m =>
    `<option value="${escapeHtml(m)}" ${m === reg.meal_choice ? 'selected' : ''}>${escapeHtml(m)}</option>`
  ).join('');

  const statusOptsHtml = ['pending', 'paid'].map(s =>
    `<option value="${s}" ${s === reg.payment_status ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
  ).join('');

  body.innerHTML = `
    <div class="activity-edit-form">
      <label class="activity-edit-label">Name</label>
      <input class="inline-edit-input" id="act-edit-name-${regId}" type="text" value="${escapeHtml(reg.name)}" maxlength="100" />
      <label class="activity-edit-label">Meal</label>
      <select class="inline-edit-select" id="act-edit-meal-${regId}">${mealOptsHtml}</select>
      <label class="activity-edit-label">Status</label>
      <select class="inline-edit-select" id="act-edit-status-${regId}">${statusOptsHtml}</select>
      <div class="activity-edit-actions">
        <button class="btn-inline-save" id="act-save-${regId}">✓ Save</button>
        <button class="btn-inline-cancel" id="act-cancel-${regId}">✗ Cancel</button>
      </div>
    </div>`;

  document.getElementById(`act-save-${regId}`).addEventListener('click', () => handleActivityInlineEditSave(regId));
  document.getElementById(`act-cancel-${regId}`).addEventListener('click', () => renderActivityFeed());
}

async function handleActivityInlineEditSave(regId) {
  const nameEl   = document.getElementById(`act-edit-name-${regId}`);
  const mealEl   = document.getElementById(`act-edit-meal-${regId}`);
  const statusEl = document.getElementById(`act-edit-status-${regId}`);
  const saveBtn  = document.getElementById(`act-save-${regId}`);

  if (!nameEl || !mealEl || !statusEl) return;

  const name           = nameEl.value.trim();
  const meal_choice    = mealEl.value;
  const payment_status = statusEl.value;

  if (!name) { alert('Name is required.'); return; }

  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '…'; }

  try {
    const res = await fetch(`${API}/update-registration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
      body: JSON.stringify({ registrationId: regId, name, meal_choice, payment_status }),
    });
    if (res.ok) {
      const data = await res.json();
      const reg = registrations.find(r => String(r.id) === String(regId));
      if (reg && data.registration) Object.assign(reg, data.registration);
      renderRegistrations();
      renderActivityFeed();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(`Save failed: ${data.error || 'Unknown error'}`);
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '✓ Save'; }
    }
  } catch {
    alert('Network error. Please try again.');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '✓ Save'; }
  }
}

// ═════════════════════════════════════════════════════════════
// SQUARE RECONCILIATION (Activity & Payments → Payments subtab)
// ═════════════════════════════════════════════════════════════

function renderSquareRecon() {
  const tbody = document.getElementById('recon-tbody');
  if (!tbody) return;
  if (!registrations.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#8a8278;padding:40px;font-size:0.95rem">No registrations yet — Square transaction details will appear here once people start signing up.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  registrations.forEach(r => {
    const tr   = document.createElement('tr');
    const date = new Date(r.created_at).toLocaleDateString();
    const isPaid = r.payment_status === 'paid';
    // Price from database — never hardcoded
    const price = currentEvent ? `$${currentEvent.price_per_person}` : '—';
    const txId  = r.square_transaction_id || r.payment_id || '—';

    const tdName = document.createElement('td');
    tdName.textContent = r.name + (r.is_walkin ? ' ★' : '');
    tdName.style.fontWeight = '600';

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

// ═════════════════════════════════════════════════════════════
// WALK-IN MODAL
// ═════════════════════════════════════════════════════════════

document.getElementById('add-walkin-btn').addEventListener('click', () => {
  document.getElementById('walkin-modal').hidden = false;
});

document.getElementById('walkin-cancel').addEventListener('click', () => {
  document.getElementById('walkin-modal').hidden = true;
});

document.getElementById('walkin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name  = document.getElementById('walkin-name').value;
  const email = document.getElementById('walkin-email').value;
  const meal  = document.getElementById('walkin-meal').value;
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

// ═════════════════════════════════════════════════════════════
// CSV EXPORT — Fully database-driven filename
// ═════════════════════════════════════════════════════════════

document.getElementById('export-csv-btn').addEventListener('click', () => {
  if (!registrations.length) {
    alert('No registrations to export yet.');
    return;
  }
  const headers = ['Name', 'Email', 'Phone', 'Meal Choice', 'Payment Status', 'Walk-in', 'Date'];
  const rows = registrations.map(r => [
    r.name,
    r.email || '',
    r.phone || '',
    r.meal_choice || '',
    r.payment_status,
    r.is_walkin ? 'Yes' : 'No',
    new Date(r.created_at).toLocaleDateString(),
  ]);
  const csv  = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  // Filename from database event date — no hardcoding
  const dateSlug = currentEvent?.event_date || new Date().toISOString().slice(0, 10);
  a.download = `stsa-registrations-${dateSlug}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ═════════════════════════════════════════════════════════════
// PRINT MEAL CARDS — Earl Harper's color-coded place cards
// Database-driven color mapping. Server sees color → serves plate.
// ═════════════════════════════════════════════════════════════

let cardSortBy = 'name'; // current sort state

// Wire up the sort toggle buttons
document.querySelectorAll('.print-sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.print-sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    cardSortBy = btn.dataset.sort;
    renderMealCards();
  });
});

document.getElementById('print-btn').addEventListener('click', () => window.print());

function renderMealCards() {
  const MC = window.MealCards; // loaded from meal-cards.js
  const container = document.getElementById('cards-preview');
  const summaryEl  = document.getElementById('print-summary-text');
  const legendEl   = document.getElementById('print-legend');
  const legendItemsEl = document.getElementById('print-legend-items');
  const sortWrapEl = document.getElementById('print-sort-wrap');
  const tipEl      = document.getElementById('print-tip-text');

  if (!container) return;

  // Empty state
  if (!currentEvent || !registrations.length) {
    container.innerHTML = '<p class="cards-print-empty">No one has registered yet — once they do, their meal cards will appear here ready to print! 🎉</p>';
    if (summaryEl) summaryEl.textContent = 'No registrations yet';
    if (legendEl)   legendEl.hidden = true;
    if (sortWrapEl) sortWrapEl.hidden = true;
    if (tipEl)      tipEl.hidden = true;
    return;
  }

  // Generate sorted card data via the pure helper (database-driven colors)
  const cards = MC.generateCards(registrations, currentEvent, cardSortBy);
  const pages  = MC.paginateCards(cards);

  // ── Summary bar ──
  if (summaryEl) summaryEl.textContent = MC.buildSummary(cards, currentEvent);

  // ── Color legend ──
  if (legendEl && legendItemsEl) {
    const colorMap = MC.getMealColorMap(currentEvent);
    legendItemsEl.innerHTML = '';
    Object.entries(colorMap).forEach(([meal, color]) => {
      const item = document.createElement('div');
      item.className = 'print-legend-item';
      item.innerHTML = `
        <div class="print-legend-swatch" style="background:${color.hex};"></div>
        <span class="print-legend-meal"><strong style="color:${color.hex}">${color.name}</strong> — ${escapeHtml(meal)}</span>
      `;
      legendItemsEl.appendChild(item);
    });
    legendEl.hidden = false;
  }

  // ── Show controls ──
  if (sortWrapEl) sortWrapEl.hidden = false;
  if (tipEl)      tipEl.hidden = false;

  // ── Build card grid ──
  container.innerHTML = '';

  pages.forEach((pageCards) => {
    // Each group of ≤6 cards becomes a .cards-page-group
    // In print, page-break-after:always is applied to each group
    const group = document.createElement('div');
    group.className = 'cards-page-group';

    pageCards.forEach(card => {
      const cardEl = document.createElement('div');
      cardEl.className = 'meal-card';

      // Color band with meal text
      const band = document.createElement('div');
      band.className = 'meal-card-band';
      band.style.background = card.colorHex;

      const mealEl = document.createElement('div');
      mealEl.className = 'meal-card-meal';
      mealEl.textContent = card.mealText.toUpperCase();
      band.appendChild(mealEl);

      // Name (large, bold, centered)
      const body = document.createElement('div');
      body.className = 'meal-card-body';

      const nameEl = document.createElement('div');
      nameEl.className = 'meal-card-name';
      nameEl.textContent = card.name.toUpperCase();
      body.appendChild(nameEl);

      // Footer: event name · date (identifies loose cards)
      const footer = document.createElement('div');
      footer.className = 'meal-card-footer';
      const dateStr = card.eventDate
        ? new Date(card.eventDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
        : '';
      footer.textContent = dateStr
        ? `${card.eventName} · ${dateStr}`
        : card.eventName;

      cardEl.append(band, body, footer);
      group.appendChild(cardEl);
    });

    container.appendChild(group);
  });
}

// ═════════════════════════════════════════════════════════════
// ANALYTICS TAB — Loads current + history, renders everything
// ═════════════════════════════════════════════════════════════

async function loadAnalytics() {
  // Ensure we have registrations loaded
  if (!registrations.length) await loadRegistrations();
  // Ensure we have history (force refresh on analytics tab)
  try {
    const res = await fetch(`${API}/get-event-history`, {
      headers: { 'X-Admin-Token': adminToken },
    });
    const data = await res.json();
    eventHistory = data.events || [];
  } catch (err) {
    console.error('Analytics: failed to load history:', err);
  }
  renderAnalytics();
}

function renderAnalytics() {
  // ── Summary cards (current event) ──
  const total   = registrations.length;
  const paid    = registrations.filter(r => r.payment_status === 'paid').length;
  const walkins = registrations.filter(r => r.is_walkin).length;
  // Revenue from database price — never hardcoded
  const price   = currentEvent?.price_per_person || 0;
  const revenue = paid * price;

  setEl('ac-total',   total);
  setEl('ac-paid',    paid);
  setEl('ac-revenue', `$${revenue.toLocaleString()}`);
  setEl('ac-walkin',  walkins);

  // ── Meal Breakdown ──
  const mealsEl = document.getElementById('analytics-meals');
  if (mealsEl) {
    if (total === 0) {
      mealsEl.innerHTML = '<p class="analytics-empty-msg">No registrations yet.</p>';
    } else {
      const mealCounts = {};
      registrations.forEach(r => {
        if (r.meal_choice) mealCounts[r.meal_choice] = (mealCounts[r.meal_choice] || 0) + 1;
      });
      const colors = ['var(--meal-1)', 'var(--meal-2)', 'var(--meal-3)'];
      let ci = 0;
      mealsEl.innerHTML = Object.entries(mealCounts).map(([meal, count]) => {
        const pct   = Math.round((count / total) * 100);
        const color = colors[ci++] || 'var(--board-burnt)';
        return `<div class="analytics-meal-row">
          <div class="analytics-meal-info">
            <span class="analytics-meal-name">${escapeHtml(meal)}</span>
            <span class="analytics-meal-count">${count} &nbsp;<span style="color:#8a8278">(${pct}%)</span></span>
          </div>
          <div class="analytics-bar-wrap">
            <div class="analytics-bar" style="width:${pct}%;background:${color}"></div>
          </div>
        </div>`;
      }).join('');
    }
  }

  // ── Payment Status ──
  const paymentsEl = document.getElementById('analytics-payments');
  if (paymentsEl) {
    if (total === 0) {
      paymentsEl.innerHTML = '<p class="analytics-empty-msg">No registrations yet.</p>';
    } else {
      const pending = total - paid;
      const statuses = [
        { label: 'Paid',    count: paid,    color: '#2ecc71', pct: total > 0 ? Math.round((paid/total)*100) : 0 },
        { label: 'Pending', count: pending, color: 'var(--board-burnt)', pct: total > 0 ? Math.round((pending/total)*100) : 0 },
        { label: 'Walk-ins',count: walkins, color: 'var(--board-amber)', pct: total > 0 ? Math.round((walkins/total)*100) : 0 },
      ];
      paymentsEl.innerHTML = statuses.map(s => `
        <div class="ap-status-row">
          <div class="ap-status-dot" style="background:${s.color}"></div>
          <div class="ap-status-label">${s.label}</div>
          <div class="ap-status-count">${s.count}</div>
          <div class="ap-status-pct">${s.pct}%</div>
        </div>
      `).join('');
    }
  }

  // ── Event History Timeline ──
  const timelineEl = document.getElementById('analytics-timeline');
  if (timelineEl) {
    if (!eventHistory.length) {
      timelineEl.innerHTML = '<p class="analytics-empty-msg" style="padding:32px;text-align:center">This is your first event! History will appear here after you create your next one. 🌟</p>';
    } else {
      const maxAttendees = Math.max(...eventHistory.map(e => e.total_registrations), 1);
      timelineEl.innerHTML = `
        <div class="timeline-row timeline-header">
          <div>Event</div>
          <div style="text-align:center">Registered</div>
          <div style="text-align:center">Paid</div>
          <div style="text-align:center">Revenue</div>
          <div style="text-align:center">Status</div>
        </div>
        ${eventHistory.map(ev => {
          const isActive = ev.is_active;
          const barWidth = maxAttendees > 0 ? Math.round((ev.total_registrations / maxAttendees) * 100) : 0;
          return `<div class="timeline-row ${isActive ? 'timeline-active' : ''}">
            <div>
              <div class="timeline-event-name">${escapeHtml(ev.event_name || '—')}</div>
              <div class="timeline-event-date">${ev.event_date ? formatDate(ev.event_date) : '—'}</div>
              <div style="margin-top:5px;height:4px;background:#f0ece6;border-radius:999px;overflow:hidden;max-width:140px">
                <div style="height:100%;width:${barWidth}%;background:${isActive ? 'var(--board-burnt)' : 'var(--board-amber)'};border-radius:999px"></div>
              </div>
            </div>
            <div class="timeline-stat">${ev.total_registrations}</div>
            <div class="timeline-stat" style="color:#1a7c4f">${ev.paid_count}</div>
            <div class="timeline-revenue">$${(ev.revenue || 0).toLocaleString()}</div>
            <div><span class="badge ${isActive ? 'badge-active' : 'badge-past'}">${isActive ? 'Active' : 'Past'}</span></div>
          </div>`;
        }).join('')}
      `;
    }
  }
}

// ═════════════════════════════════════════════════════════════
// REFRESH BUTTONS
// ═════════════════════════════════════════════════════════════

document.getElementById('manual-refresh-btn')?.addEventListener('click', loadRegistrations);
document.getElementById('ap-refresh-btn')?.addEventListener('click', loadRegistrations);
document.getElementById('analytics-refresh-btn')?.addEventListener('click', () => {
  eventHistory = []; // force history re-fetch
  loadAnalytics();
});

// ═════════════════════════════════════════════════════════════
// AUTO-REFRESH (30 seconds for data tabs)
// ═════════════════════════════════════════════════════════════

let autoRefreshTimer = null;

function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(() => {
    const activeTab = document.querySelector('.tab.active')?.dataset?.tab;
    if (['registrations', 'activity-payments', 'print-cards'].includes(activeTab)) {
      loadRegistrations();
    }
    // Analytics auto-refreshes when active
    if (activeTab === 'analytics') loadAnalytics();
  }, 30000);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

// ═════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═════════════════════════════════════════════════════════════

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// Format "2026-05-14" → "Thursday, May 14, 2026"
function formatDate(isoDate) {
  if (!isoDate) return '';
  // Parse as local date (avoid UTC offset issues)
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// Format "11:00" → "11:00 AM"
function formatTime(t) {
  if (!t) return '';
  const [h, min] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
}

// ═════════════════════════════════════════════════════════════
// IDEAS / FUTURE IMPROVEMENTS TAB
// ═════════════════════════════════════════════════════════════

const STARTER_IDEAS = [
  {
    id: '__starter_1',
    title: 'Dues Payment System',
    description: 'Allow members to pay annual dues ($100/company) through the same RSVP system. Hit a button, pay online.',
    status: 'idea',
    priority: 'high',
    submitted_by: '',
    created_at: null,
    _starter: true,
  },
  {
    id: '__starter_2',
    title: 'Email Template Generator',
    description: 'Auto-generate save-the-date and RSVP emails with event details pre-filled. Copy and paste into your email client.',
    status: 'idea',
    priority: 'medium',
    submitted_by: '',
    created_at: null,
    _starter: true,
  },
  {
    id: '__starter_3',
    title: 'RSVP Deadline Enforcement',
    description: 'Show a \'late registration\' notice after the RSVP deadline passes. Form still works but attendees see they\'re registering late.',
    status: 'idea',
    priority: 'low',
    submitted_by: '',
    created_at: null,
    _starter: true,
  },
  {
    id: '__starter_4',
    title: 'Member Directory',
    description: 'Searchable list of all STSA member companies and contacts.',
    status: 'idea',
    priority: 'medium',
    submitted_by: '',
    created_at: null,
    _starter: true,
  },
  {
    id: '__starter_5',
    title: 'Event Email Blasts',
    description: 'Send RSVP invitations directly from the admin dashboard instead of manually composing emails.',
    status: 'idea',
    priority: 'medium',
    submitted_by: '',
    created_at: null,
    _starter: true,
  },
];

let improvements = [];         // Live DB improvements
let ideasFilterStatus = 'all'; // Current filter pill
let ideasSortMode = 'date';    // 'date' | 'priority'

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const STATUS_LABELS  = { idea: '💭 Idea', planned: '📋 Planned', 'in-progress': '⚙️ In Progress', done: '✅ Done' };
const STATUS_CLASSES = { idea: 'badge-idea', planned: 'badge-planned', 'in-progress': 'badge-inprogress', done: 'badge-done' };
const PRIORITY_LABELS  = { low: '🔵 Low', medium: '🟡 Medium', high: '🔴 High' };
const PRIORITY_CLASSES = { low: 'badge-plow', medium: 'badge-pmedium', high: 'badge-phigh' };

async function loadImprovements() {
  const listEl = document.getElementById('ideas-list');
  listEl.innerHTML = '<p class="ideas-loading">Loading ideas…</p>';
  try {
    const res = await fetch(`${API}/get-improvements`, {
      headers: { 'X-Admin-Token': adminToken },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    improvements = body.improvements || [];
    renderImprovements();
  } catch (err) {
    listEl.innerHTML = '<p class="ideas-error">⚠️ Failed to load ideas. Try again.</p>';
    console.error('loadImprovements:', err);
  }
}

function getFilteredSorted() {
  let list = [...improvements];

  // Filter
  if (ideasFilterStatus !== 'all') {
    list = list.filter(i => i.status === ideasFilterStatus);
  }

  // Sort
  if (ideasSortMode === 'priority') {
    list.sort((a, b) => {
      const pd = (PRIORITY_ORDER[a.priority] || 1) - (PRIORITY_ORDER[b.priority] || 1);
      if (pd !== 0) return pd;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  } else {
    list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  return list;
}

function renderImprovements() {
  const listEl = document.getElementById('ideas-list');
  const isUsingStarters = improvements.length === 0;
  const displayList = isUsingStarters ? STARTER_IDEAS : getFilteredSorted();

  if (isUsingStarters) {
    listEl.innerHTML = `
      <div class="ideas-starter-notice">
        💡 These are suggested improvements. Click <strong>Add New Idea</strong> to save your own ideas to the list.
      </div>
      ${displayList.map(renderIdeaCard).join('')}
    `;
    return;
  }

  if (displayList.length === 0) {
    listEl.innerHTML = '<p class="ideas-empty">No ideas in this category yet. Add one above! 👆</p>';
    return;
  }

  listEl.innerHTML = displayList.map(renderIdeaCard).join('');

  // Wire edit/delete buttons
  listEl.querySelectorAll('.idea-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditForm(btn.dataset.id));
  });
  listEl.querySelectorAll('.idea-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteIdea(btn.dataset.id));
  });
}

function renderIdeaCard(idea) {
  const isStarter = idea._starter;
  const dateStr = idea.created_at
    ? new Date(idea.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const submittedLine = [
    idea.submitted_by ? `<span class="idea-author">by ${escapeHtml(idea.submitted_by)}</span>` : '',
    dateStr ? `<span class="idea-date">${dateStr}</span>` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  return `
    <div class="idea-card${isStarter ? ' idea-card-starter' : ''}">
      <div class="idea-card-top">
        <div class="idea-badges">
          <span class="idea-badge ${STATUS_CLASSES[idea.status] || 'badge-idea'}">${STATUS_LABELS[idea.status] || idea.status}</span>
          <span class="idea-badge ${PRIORITY_CLASSES[idea.priority] || 'badge-pmedium'}">${PRIORITY_LABELS[idea.priority] || idea.priority}</span>
        </div>
        ${!isStarter ? `
        <div class="idea-actions">
          <button class="idea-action-btn idea-edit-btn" data-id="${escapeHtml(idea.id)}" title="Edit">✏️</button>
          <button class="idea-action-btn idea-delete-btn" data-id="${escapeHtml(idea.id)}" title="Delete">🗑️</button>
        </div>
        ` : ''}
      </div>
      <div class="idea-title">${escapeHtml(idea.title)}</div>
      ${idea.description ? `<div class="idea-description">${escapeHtml(idea.description)}</div>` : ''}
      ${submittedLine ? `<div class="idea-meta">${submittedLine}</div>` : ''}
    </div>
  `;
}

function openAddForm() {
  document.getElementById('idea-edit-id').value = '';
  document.getElementById('idea-title').value = '';
  document.getElementById('idea-description').value = '';
  document.getElementById('idea-priority').value = 'medium';
  document.getElementById('idea-status').value = 'idea';
  document.getElementById('idea-submitted-by').value = '';
  document.getElementById('ideas-form-error').hidden = true;
  document.getElementById('ideas-form-save').textContent = 'Save Idea';
  document.getElementById('ideas-form-wrap').hidden = false;
  document.getElementById('idea-title').focus();
}

function openEditForm(id) {
  const idea = improvements.find(i => i.id === id);
  if (!idea) return;
  document.getElementById('idea-edit-id').value = idea.id;
  document.getElementById('idea-title').value = idea.title;
  document.getElementById('idea-description').value = idea.description || '';
  document.getElementById('idea-priority').value = idea.priority || 'medium';
  document.getElementById('idea-status').value = idea.status || 'idea';
  document.getElementById('idea-submitted-by').value = idea.submitted_by || '';
  document.getElementById('ideas-form-error').hidden = true;
  document.getElementById('ideas-form-save').textContent = 'Update Idea';
  document.getElementById('ideas-form-wrap').hidden = false;
  document.getElementById('idea-title').focus();
}

function closeIdeaForm() {
  document.getElementById('ideas-form-wrap').hidden = true;
  document.getElementById('ideas-form-error').hidden = true;
}

async function saveIdea(e) {
  e.preventDefault();
  const errorEl = document.getElementById('ideas-form-error');
  errorEl.hidden = true;

  const id    = document.getElementById('idea-edit-id').value;
  const title = document.getElementById('idea-title').value.trim();
  const description = document.getElementById('idea-description').value.trim();
  const priority = document.getElementById('idea-priority').value;
  const status   = document.getElementById('idea-status').value;
  const submitted_by = document.getElementById('idea-submitted-by').value.trim();

  if (!title) {
    errorEl.textContent = 'Title is required.';
    errorEl.hidden = false;
    return;
  }

  const payload = { title, description, priority, status, submitted_by };
  if (id) payload.id = id;

  const saveBtn = document.getElementById('ideas-form-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    const res = await fetch(`${API}/save-improvement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': adminToken,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }

    closeIdeaForm();
    await loadImprovements();
  } catch (err) {
    errorEl.textContent = `Error: ${err.message}`;
    errorEl.hidden = false;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = id ? 'Update Idea' : 'Save Idea';
  }
}

async function deleteIdea(id) {
  if (!confirm('Delete this idea? This cannot be undone.')) return;

  try {
    const res = await fetch(`${API}/delete-improvement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': adminToken,
      },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await loadImprovements();
  } catch (err) {
    alert(`Failed to delete idea: ${err.message}`);
  }
}

// ── Wire up Ideas tab UI controls ────────────────────────────
(function initIdeasTab() {
  // Add button
  document.getElementById('ideas-add-btn').addEventListener('click', openAddForm);

  // Form submit + cancel
  document.getElementById('ideas-form').addEventListener('submit', saveIdea);
  document.getElementById('ideas-form-cancel').addEventListener('click', closeIdeaForm);

  // Filter pills
  document.getElementById('ideas-filter-pills').addEventListener('click', (e) => {
    const pill = e.target.closest('.ideas-pill');
    if (!pill) return;
    document.querySelectorAll('.ideas-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    ideasFilterStatus = pill.dataset.filter;
    renderImprovements();
  });

  // Sort select
  document.getElementById('ideas-sort-select').addEventListener('change', (e) => {
    ideasSortMode = e.target.value;
    renderImprovements();
  });
})();

// ═════════════════════════════════════════════════════════════
// WELCOME BANNER — Dismiss on click, remember in sessionStorage
// ═════════════════════════════════════════════════════════════

(function initWelcomeBanner() {
  const banner = document.getElementById('welcome-banner');
  const dismiss = document.getElementById('welcome-dismiss');
  if (!banner || !dismiss) return;

  // Dismiss if already closed this session
  if (sessionStorage.getItem('stsa_welcome_dismissed')) {
    banner.hidden = true;
  }

  dismiss.addEventListener('click', () => {
    banner.style.animation = 'welcomeFadeOut 0.3s ease forwards';
    setTimeout(() => { banner.hidden = true; }, 300);
    sessionStorage.setItem('stsa_welcome_dismissed', '1');
  });
})();

// ═════════════════════════════════════════════════════════════
// INIT — Check existing session
// ═════════════════════════════════════════════════════════════

if (isAuthenticated()) {
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

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
