# STSA Event RSVP & Meal Selection System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a prepay + meal selection system for STSA luncheons with a public RSVP page and an admin dashboard, deployed to Netlify.

**Architecture:** Two static HTML/CSS/JS frontends (RSVP page + admin dashboard) backed by Netlify Functions that talk to Supabase (data) and Square (payments). Three Netlify sites deploy from one GitHub repo with different publish directories.

**Tech Stack:** HTML/CSS/JS (no framework), Netlify Functions (Node.js), Supabase (Postgres), Square Checkout API

**Spec:** `docs/superpowers/specs/2026-04-08-stsa-event-rsvp-system-design.md`

---

## File Structure

```
stsa-website/
├── stsa-website.html                 (existing — no changes)
├── package.json                      (Create — dependencies for Netlify Functions)
├── netlify.toml                      (Create — build config, redirects, function dir)
├── rsvp/
│   ├── index.html                    (Create — public RSVP page)
│   ├── confirmation.html             (Create — post-payment confirmation)
│   ├── styles.css                    (Create — RSVP page styles)
│   └── app.js                        (Create — RSVP page logic)
├── admin/
│   ├── index.html                    (Create — admin dashboard)
│   ├── styles.css                    (Create — admin styles)
│   └── app.js                        (Create — admin dashboard logic)
├── shared/
│   └── brand.css                     (Create — shared STSA brand variables & base styles)
├── netlify/
│   └── functions/
│       ├── auth.js                   (Create — shared admin auth helper)
│       ├── supabase.js               (Create — shared Supabase client init)
│       ├── get-event.js              (Create — GET active event config)
│       ├── save-event.js             (Create — POST save/update event)
│       ├── create-checkout.js        (Create — POST create Square checkout)
│       ├── square-webhook.js         (Create — POST handle Square payment webhook)
│       ├── get-registrations.js      (Create — GET registrations for active event)
│       ├── add-walkin.js             (Create — POST add walk-in registration)
│       └── verify-admin.js           (Create — POST verify admin password, return token)
└── supabase/
    └── migration.sql                 (Create — SQL to create tables + RLS policies)
```

---

## Task 1: Project Scaffolding & Netlify Config

**Files:**
- Create: `package.json`
- Create: `netlify.toml`
- Create: `shared/brand.css`

- [ ] **Step 1: Create package.json with function dependencies**

```json
{
  "name": "stsa-website",
  "version": "1.0.0",
  "private": true,
  "description": "South Texas Surety Association website with event RSVP system",
  "dependencies": {
    "@supabase/supabase-js": "^2.49.0",
    "bcryptjs": "^3.0.2",
    "square": "^42.0.0"
  }
}
```

- [ ] **Step 2: Create netlify.toml**

```toml
[build]
  publish = "."
  functions = "netlify/functions"

[build.environment]
  NODE_VERSION = "20"

# Redirect /rsvp to rsvp/index.html
[[redirects]]
  from = "/rsvp"
  to = "/rsvp/index.html"
  status = 200

[[redirects]]
  from = "/rsvp/*"
  to = "/rsvp/:splat"
  status = 200

# Redirect /admin to admin/index.html
[[redirects]]
  from = "/admin"
  to = "/admin/index.html"
  status = 200

[[redirects]]
  from = "/admin/*"
  to = "/admin/:splat"
  status = 200

# API proxy — all /api/* calls go to Netlify Functions
[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[functions]
  node_bundler = "esbuild"

# Security headers
[[headers]]
  for = "/api/*"
  [headers.values]
    Access-Control-Allow-Origin = "*"
    Access-Control-Allow-Headers = "Content-Type, X-Admin-Token"
    Access-Control-Allow-Methods = "GET, POST, OPTIONS"
```

- [ ] **Step 3: Create shared/brand.css with STSA design tokens**

```css
/* STSA Brand Design Tokens */
:root {
  --navy: #1a3a52;
  --navy-light: #24506e;
  --navy-dark: #0f2537;
  --burnt-orange: #c05621;
  --warm-orange: #e67e22;
  --orange-light: #f39c12;
  --white: #ffffff;
  --light-gray: #f7f9fc;
  --medium-gray: #e2e8f0;
  --text-dark: #2c3e50;
  --text-light: #6c757d;
  --success: #27ae60;
  --success-light: #d4edda;
  --error: #e74c3c;
  --error-light: #f8d7da;

  /* Meal card colors */
  --meal-1: #e74c3c;
  --meal-1-light: #fadbd8;
  --meal-1-label: "Red";
  --meal-2: #27ae60;
  --meal-2-light: #d5f5e3;
  --meal-2-label: "Green";
  --meal-3: #2980b9;
  --meal-3-light: #d4e6f1;
  --meal-3-label: "Blue";

  --font-main: 'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif;
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.08);
  --shadow-md: 0 4px 20px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 40px rgba(0,0,0,0.12);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-main);
  line-height: 1.6;
  color: var(--text-dark);
  background: var(--light-gray);
  -webkit-font-smoothing: antialiased;
}

a {
  color: var(--burnt-orange);
  text-decoration: none;
  transition: var(--transition);
}

a:hover {
  color: var(--warm-orange);
}

button, .btn {
  cursor: pointer;
  border: none;
  font-family: var(--font-main);
  font-weight: 700;
  transition: var(--transition);
}

.btn-primary {
  background: linear-gradient(135deg, var(--burnt-orange), var(--warm-orange));
  color: var(--white);
  padding: 14px 32px;
  border-radius: var(--radius-sm);
  font-size: 1rem;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 15px rgba(192, 86, 33, 0.3);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 25px rgba(192, 86, 33, 0.4);
}

.btn-primary:active {
  transform: translateY(0);
}

.btn-success {
  background: linear-gradient(135deg, var(--success), #2ecc71);
  color: var(--white);
  padding: 14px 32px;
  border-radius: var(--radius-sm);
  font-size: 1rem;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 15px rgba(39, 174, 96, 0.3);
}

.btn-success:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 25px rgba(39, 174, 96, 0.4);
}

.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 24px;
}

/* Google Fonts import */
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated

- [ ] **Step 5: Commit**

```bash
git add package.json netlify.toml shared/brand.css package-lock.json
git commit -m "feat: scaffold project with Netlify config and shared brand styles"
```

---

## Task 2: Supabase Database Setup

**Files:**
- Create: `supabase/migration.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- STSA Event RSVP System — Database Schema

-- Events table: one row per event, only one active at a time
CREATE TABLE IF NOT EXISTS events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name text NOT NULL,
  event_date date NOT NULL,
  time_registration time NOT NULL DEFAULT '11:00',
  time_lunch time NOT NULL DEFAULT '11:30',
  time_meeting_start time NOT NULL DEFAULT '12:00',
  time_meeting_end time NOT NULL DEFAULT '13:00',
  venue_name text NOT NULL,
  venue_address text NOT NULL,
  price_per_person integer NOT NULL DEFAULT 40,
  rsvp_deadline date NOT NULL,
  meal_choice_1 text NOT NULL DEFAULT 'Option 1',
  meal_choice_2 text NOT NULL DEFAULT 'Option 2',
  meal_choice_3 text NOT NULL DEFAULT 'Option 3',
  speaker_name text NOT NULL DEFAULT '',
  speaker_bio text NOT NULL DEFAULT '',
  topic text NOT NULL DEFAULT '',
  guest_name text,
  guest_bio text,
  speaker_sponsor_name text,
  speaker_sponsor_company text,
  speaker_sponsor_email text,
  luncheon_sponsor_name text,
  luncheon_sponsor_company text,
  luncheon_sponsor_website text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Registrations table: one row per attendee per event
CREATE TABLE IF NOT EXISTS registrations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  meal_choice text NOT NULL,
  is_additional_guest boolean NOT NULL DEFAULT false,
  primary_registration_id uuid REFERENCES registrations(id) ON DELETE CASCADE,
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  square_transaction_id text,
  is_walkin boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_events_is_active ON events(is_active) WHERE is_active = true;

-- Ensure only one active event at a time via a partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_event ON events(is_active) WHERE is_active = true;

-- Row-Level Security
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- Public can read active events (for the RSVP page)
CREATE POLICY "Public can read active events"
  ON events FOR SELECT
  USING (is_active = true);

-- Service role can do anything (Netlify Functions use service role key)
CREATE POLICY "Service role full access on events"
  ON events FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on registrations"
  ON registrations FOR ALL
  USING (true)
  WITH CHECK (true);

-- Public can read registrations for active events (not needed, but harmless)
-- We intentionally do NOT expose registrations publicly; all reads go through Netlify Functions.

-- Auto-update updated_at on events
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Run migration via Supabase MCP**

Use the Supabase MCP `execute_sql` tool to run the migration SQL against the project database.
Verify: both tables created, RLS policies active, trigger installed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migration.sql
git commit -m "feat: add Supabase migration for events and registrations tables"
```

---

## Task 3: Netlify Functions — Shared Helpers

**Files:**
- Create: `netlify/functions/supabase.js`
- Create: `netlify/functions/auth.js`

- [ ] **Step 1: Create Supabase client helper**

```js
// netlify/functions/supabase.js
const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

module.exports = { getSupabaseClient };
```

- [ ] **Step 2: Create admin auth helper**

```js
// netlify/functions/auth.js
const bcrypt = require('bcryptjs');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function unauthorized() {
  return {
    statusCode: 401,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: 'Unauthorized' }),
  };
}

function verifyAdminToken(event) {
  const token = event.headers['x-admin-token'];
  if (!token) return false;
  // Token is the raw password; we compare against the stored hash
  // For simplicity in a shared-password system, the admin page sends
  // the password on each request and we verify it server-side.
  return bcrypt.compareSync(token, process.env.ADMIN_PASSWORD_HASH);
}

function handleCors(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  return null;
}

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

module.exports = { CORS_HEADERS, unauthorized, verifyAdminToken, handleCors, jsonResponse };
```

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/supabase.js netlify/functions/auth.js
git commit -m "feat: add shared Supabase client and admin auth helpers"
```

---

## Task 4: Netlify Functions — verify-admin & get-event

**Files:**
- Create: `netlify/functions/verify-admin.js`
- Create: `netlify/functions/get-event.js`

- [ ] **Step 1: Create verify-admin function**

```js
// netlify/functions/verify-admin.js
const { verifyAdminToken, handleCors, jsonResponse } = require('./auth');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  if (!verifyAdminToken(event)) {
    return jsonResponse(401, { error: 'Invalid password' });
  }

  return jsonResponse(200, { authenticated: true });
};
```

- [ ] **Step 2: Create get-event function**

```js
// netlify/functions/get-event.js
const { getSupabaseClient } = require('./supabase');
const { handleCors, jsonResponse } = require('./auth');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('is_active', true)
    .single();

  if (error && error.code === 'PGRST116') {
    // No active event found
    return jsonResponse(200, { event: null });
  }

  if (error) {
    return jsonResponse(500, { error: error.message });
  }

  return jsonResponse(200, { event: data });
};
```

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/verify-admin.js netlify/functions/get-event.js
git commit -m "feat: add verify-admin and get-event Netlify Functions"
```

---

## Task 5: Netlify Functions — save-event

**Files:**
- Create: `netlify/functions/save-event.js`

- [ ] **Step 1: Create save-event function**

```js
// netlify/functions/save-event.js
const { getSupabaseClient } = require('./supabase');
const { verifyAdminToken, handleCors, jsonResponse, unauthorized } = require('./auth');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  if (!verifyAdminToken(event)) {
    return unauthorized();
  }

  const body = JSON.parse(event.body);
  const supabase = getSupabaseClient();

  // Deactivate all existing events first
  await supabase
    .from('events')
    .update({ is_active: false })
    .eq('is_active', true);

  // If we have an existing event ID, update it; otherwise insert new
  if (body.id) {
    const { id, created_at, updated_at, ...updateData } = body;
    const { data, error } = await supabase
      .from('events')
      .update({ ...updateData, is_active: true })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return jsonResponse(500, { error: error.message });
    }
    return jsonResponse(200, { event: data });
  } else {
    const { data, error } = await supabase
      .from('events')
      .insert({ ...body, is_active: true })
      .select()
      .single();

    if (error) {
      return jsonResponse(500, { error: error.message });
    }
    return jsonResponse(201, { event: data });
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add netlify/functions/save-event.js
git commit -m "feat: add save-event Netlify Function with upsert logic"
```

---

## Task 6: Netlify Functions — get-registrations & add-walkin

**Files:**
- Create: `netlify/functions/get-registrations.js`
- Create: `netlify/functions/add-walkin.js`

- [ ] **Step 1: Create get-registrations function**

```js
// netlify/functions/get-registrations.js
const { getSupabaseClient } = require('./supabase');
const { verifyAdminToken, handleCors, jsonResponse, unauthorized } = require('./auth');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  if (!verifyAdminToken(event)) {
    return unauthorized();
  }

  const supabase = getSupabaseClient();

  // Get active event
  const { data: activeEvent, error: eventError } = await supabase
    .from('events')
    .select('id')
    .eq('is_active', true)
    .single();

  if (eventError || !activeEvent) {
    return jsonResponse(200, { registrations: [], summary: null });
  }

  // Get registrations for active event
  const { data: registrations, error: regError } = await supabase
    .from('registrations')
    .select('*')
    .eq('event_id', activeEvent.id)
    .order('created_at', { ascending: true });

  if (regError) {
    return jsonResponse(500, { error: regError.message });
  }

  return jsonResponse(200, { registrations: registrations || [] });
};
```

- [ ] **Step 2: Create add-walkin function**

```js
// netlify/functions/add-walkin.js
const { getSupabaseClient } = require('./supabase');
const { verifyAdminToken, handleCors, jsonResponse, unauthorized } = require('./auth');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  if (!verifyAdminToken(event)) {
    return unauthorized();
  }

  const body = JSON.parse(event.body);
  const supabase = getSupabaseClient();

  // Get active event
  const { data: activeEvent, error: eventError } = await supabase
    .from('events')
    .select('id')
    .eq('is_active', true)
    .single();

  if (eventError || !activeEvent) {
    return jsonResponse(400, { error: 'No active event found' });
  }

  const { data, error } = await supabase
    .from('registrations')
    .insert({
      event_id: activeEvent.id,
      name: body.name,
      email: body.email || '',
      phone: body.phone || null,
      meal_choice: body.meal_choice,
      is_walkin: true,
      payment_status: 'paid',
    })
    .select()
    .single();

  if (error) {
    return jsonResponse(500, { error: error.message });
  }

  return jsonResponse(201, { registration: data });
};
```

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/get-registrations.js netlify/functions/add-walkin.js
git commit -m "feat: add get-registrations and add-walkin Netlify Functions"
```

---

## Task 7: Netlify Functions — create-checkout (Square)

**Files:**
- Create: `netlify/functions/create-checkout.js`

- [ ] **Step 1: Create create-checkout function**

```js
// netlify/functions/create-checkout.js
const { Client, Environment } = require('square');
const { getSupabaseClient } = require('./supabase');
const { handleCors, jsonResponse } = require('./auth');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const body = JSON.parse(event.body);
  const { name, email, phone, guests } = body;
  // guests is an array: [{ name: "John", meal_choice: "Steak" }, ...]

  if (!name || !email || !guests || !guests.length) {
    return jsonResponse(400, { error: 'Missing required fields: name, email, guests' });
  }

  const supabase = getSupabaseClient();

  // Get active event
  const { data: activeEvent, error: eventError } = await supabase
    .from('events')
    .select('*')
    .eq('is_active', true)
    .single();

  if (eventError || !activeEvent) {
    return jsonResponse(400, { error: 'No active event found' });
  }

  // Save registrations as pending
  const primaryReg = {
    event_id: activeEvent.id,
    name: guests[0].name || name,
    email,
    phone: phone || null,
    meal_choice: guests[0].meal_choice,
    is_additional_guest: false,
    payment_status: 'pending',
  };

  const { data: primaryData, error: primaryError } = await supabase
    .from('registrations')
    .insert(primaryReg)
    .select()
    .single();

  if (primaryError) {
    return jsonResponse(500, { error: primaryError.message });
  }

  // Save additional guests if any
  if (guests.length > 1) {
    const additionalGuests = guests.slice(1).map(g => ({
      event_id: activeEvent.id,
      name: g.name,
      email,
      phone: null,
      meal_choice: g.meal_choice,
      is_additional_guest: true,
      primary_registration_id: primaryData.id,
      payment_status: 'pending',
    }));

    const { error: guestError } = await supabase
      .from('registrations')
      .insert(additionalGuests);

    if (guestError) {
      return jsonResponse(500, { error: guestError.message });
    }
  }

  // Create Square Checkout
  const squareClient = new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN,
    environment: process.env.SQUARE_ENVIRONMENT === 'production'
      ? Environment.Production
      : Environment.Sandbox,
  });

  const totalCents = BigInt(activeEvent.price_per_person * guests.length * 100);
  const idempotencyKey = primaryData.id;

  try {
    const { result } = await squareClient.checkoutApi.createPaymentLink({
      idempotencyKey,
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        lineItems: [
          {
            name: `${activeEvent.event_name} — ${guests.length} guest(s)`,
            quantity: '1',
            basePriceMoney: {
              amount: totalCents,
              currency: 'USD',
            },
          },
        ],
        metadata: {
          registration_id: primaryData.id,
        },
      },
      checkoutOptions: {
        redirectUrl: `${process.env.URL}/rsvp/confirmation.html?reg=${primaryData.id}`,
      },
    });

    // Store the Square order ID on the primary registration
    await supabase
      .from('registrations')
      .update({ square_transaction_id: result.paymentLink.orderId })
      .eq('id', primaryData.id);

    return jsonResponse(200, {
      checkoutUrl: result.paymentLink.url,
      registrationId: primaryData.id,
    });
  } catch (err) {
    console.error('Square checkout error:', err);
    return jsonResponse(500, { error: 'Failed to create checkout' });
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add netlify/functions/create-checkout.js
git commit -m "feat: add create-checkout function with Square payment link"
```

---

## Task 8: Netlify Functions — square-webhook

**Files:**
- Create: `netlify/functions/square-webhook.js`

- [ ] **Step 1: Create square-webhook function**

```js
// netlify/functions/square-webhook.js
const crypto = require('crypto');
const { getSupabaseClient } = require('./supabase');
const { jsonResponse } = require('./auth');

function verifyWebhookSignature(body, signature, sigKey, notificationUrl) {
  const combined = notificationUrl + body;
  const expectedSignature = crypto
    .createHmac('sha256', sigKey)
    .update(combined)
    .digest('base64');
  return signature === expectedSignature;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  // Verify Square webhook signature
  const signature = event.headers['x-square-hmacsha256-signature'];
  const sigKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const notificationUrl = `${process.env.URL}/.netlify/functions/square-webhook`;

  if (!signature || !sigKey) {
    console.error('Missing webhook signature or key');
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  if (!verifyWebhookSignature(event.body, signature, sigKey, notificationUrl)) {
    console.error('Invalid webhook signature');
    return jsonResponse(401, { error: 'Invalid signature' });
  }

  const body = JSON.parse(event.body);

  // We care about payment.completed events
  if (body.type !== 'payment.completed') {
    return jsonResponse(200, { message: 'Ignored event type' });
  }

  const orderId = body.data?.object?.payment?.order_id;
  if (!orderId) {
    console.error('No order_id in webhook payload');
    return jsonResponse(200, { message: 'No order_id found' });
  }

  const supabase = getSupabaseClient();

  // Find the primary registration by square_transaction_id (which stores the order ID)
  const { data: primaryReg, error: findError } = await supabase
    .from('registrations')
    .select('id')
    .eq('square_transaction_id', orderId)
    .single();

  if (findError || !primaryReg) {
    console.error('Registration not found for order:', orderId);
    return jsonResponse(200, { message: 'Registration not found' });
  }

  // Mark primary registration as paid
  await supabase
    .from('registrations')
    .update({ payment_status: 'paid' })
    .eq('id', primaryReg.id);

  // Mark all additional guests linked to this registration as paid
  await supabase
    .from('registrations')
    .update({ payment_status: 'paid' })
    .eq('primary_registration_id', primaryReg.id);

  return jsonResponse(200, { message: 'Payment recorded' });
};
```

- [ ] **Step 2: Commit**

```bash
git add netlify/functions/square-webhook.js
git commit -m "feat: add Square webhook handler to confirm payments"
```

---

## Task 9: Admin Dashboard — Login Screen & Shell

**Files:**
- Create: `admin/index.html`
- Create: `admin/styles.css`
- Create: `admin/app.js`

- [ ] **Step 1: Create admin/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>STSA Admin Dashboard</title>
  <link rel="stylesheet" href="/shared/brand.css">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <!-- Login Screen -->
  <div id="login-screen" class="login-screen">
    <div class="login-card">
      <div class="login-logo">
        <h1>STSA</h1>
        <p>Admin Dashboard</p>
      </div>
      <form id="login-form">
        <input type="password" id="password-input" placeholder="Enter admin password" autocomplete="current-password" required>
        <button type="submit" class="btn-primary btn-full">Sign In</button>
        <p id="login-error" class="error-text" hidden>Invalid password. Try again.</p>
      </form>
    </div>
  </div>

  <!-- Dashboard (hidden until authenticated) -->
  <div id="dashboard" class="dashboard" hidden>
    <header class="dash-header">
      <h1>STSA Admin</h1>
      <button id="logout-btn" class="btn-logout">Logout</button>
    </header>

    <nav class="tabs">
      <button class="tab active" data-tab="event-setup">Event Setup</button>
      <button class="tab" data-tab="registrations">Registrations</button>
      <button class="tab" data-tab="print-cards">Print Meal Cards</button>
    </nav>

    <!-- Tab 1: Event Setup -->
    <section id="tab-event-setup" class="tab-content active">
      <form id="event-form" class="event-form">
        <h2>Event Details</h2>
        <div class="form-grid">
          <div class="form-group full-width">
            <label for="event_name">Event Name</label>
            <input type="text" id="event_name" name="event_name" placeholder="May Luncheon" required>
          </div>
          <div class="form-group">
            <label for="event_date">Event Date</label>
            <input type="date" id="event_date" name="event_date" required>
          </div>
          <div class="form-group">
            <label for="rsvp_deadline">RSVP Deadline</label>
            <input type="date" id="rsvp_deadline" name="rsvp_deadline" required>
          </div>
          <div class="form-group">
            <label for="time_registration">Registration / Networking</label>
            <input type="time" id="time_registration" name="time_registration" value="11:00" required>
          </div>
          <div class="form-group">
            <label for="time_lunch">Lunch Begins</label>
            <input type="time" id="time_lunch" name="time_lunch" value="11:30" required>
          </div>
          <div class="form-group">
            <label for="time_meeting_start">Meeting Starts</label>
            <input type="time" id="time_meeting_start" name="time_meeting_start" value="12:00" required>
          </div>
          <div class="form-group">
            <label for="time_meeting_end">Meeting Ends</label>
            <input type="time" id="time_meeting_end" name="time_meeting_end" value="13:00" required>
          </div>
          <div class="form-group">
            <label for="venue_name">Venue Name</label>
            <input type="text" id="venue_name" name="venue_name" placeholder="The Barn Door" required>
          </div>
          <div class="form-group">
            <label for="venue_address">Venue Address</label>
            <input type="text" id="venue_address" name="venue_address" placeholder="8400 N. New Braunfels Ave, San Antonio, TX 78209" required>
          </div>
          <div class="form-group">
            <label for="price_per_person">Price Per Person ($)</label>
            <input type="number" id="price_per_person" name="price_per_person" value="40" min="0" required>
          </div>

          <h2 class="full-width section-divider">Meal Choices</h2>
          <div class="form-group">
            <label for="meal_choice_1">Meal Choice 1 <span class="meal-dot" style="background:var(--meal-1)"></span></label>
            <input type="text" id="meal_choice_1" name="meal_choice_1" placeholder="Steak" required>
          </div>
          <div class="form-group">
            <label for="meal_choice_2">Meal Choice 2 <span class="meal-dot" style="background:var(--meal-2)"></span></label>
            <input type="text" id="meal_choice_2" name="meal_choice_2" placeholder="Chicken" required>
          </div>
          <div class="form-group">
            <label for="meal_choice_3">Meal Choice 3 <span class="meal-dot" style="background:var(--meal-3)"></span></label>
            <input type="text" id="meal_choice_3" name="meal_choice_3" placeholder="Fish" required>
          </div>

          <h2 class="full-width section-divider">Speaker</h2>
          <div class="form-group">
            <label for="speaker_name">Speaker Name</label>
            <input type="text" id="speaker_name" name="speaker_name" placeholder="John Smith">
          </div>
          <div class="form-group">
            <label for="topic">Topic</label>
            <input type="text" id="topic" name="topic" placeholder="AI in Construction & Surety">
          </div>
          <div class="form-group full-width">
            <label for="speaker_bio">Speaker Title / Bio</label>
            <textarea id="speaker_bio" name="speaker_bio" rows="3" placeholder="Director of Engineering, City of San Antonio..."></textarea>
          </div>

          <h2 class="full-width section-divider">Special Guest (Optional)</h2>
          <div class="form-group">
            <label for="guest_name">Guest Name</label>
            <input type="text" id="guest_name" name="guest_name" placeholder="">
          </div>
          <div class="form-group full-width">
            <label for="guest_bio">Guest Bio</label>
            <textarea id="guest_bio" name="guest_bio" rows="3" placeholder=""></textarea>
          </div>

          <h2 class="full-width section-divider">Sponsors (Optional)</h2>
          <div class="form-group">
            <label for="speaker_sponsor_name">Speaker Sponsor Name</label>
            <input type="text" id="speaker_sponsor_name" name="speaker_sponsor_name">
          </div>
          <div class="form-group">
            <label for="speaker_sponsor_company">Speaker Sponsor Company</label>
            <input type="text" id="speaker_sponsor_company" name="speaker_sponsor_company">
          </div>
          <div class="form-group">
            <label for="speaker_sponsor_email">Speaker Sponsor Email</label>
            <input type="email" id="speaker_sponsor_email" name="speaker_sponsor_email">
          </div>
          <div class="form-group">
            <label for="luncheon_sponsor_name">Luncheon Sponsor Name</label>
            <input type="text" id="luncheon_sponsor_name" name="luncheon_sponsor_name">
          </div>
          <div class="form-group">
            <label for="luncheon_sponsor_company">Luncheon Sponsor Company</label>
            <input type="text" id="luncheon_sponsor_company" name="luncheon_sponsor_company">
          </div>
          <div class="form-group">
            <label for="luncheon_sponsor_website">Luncheon Sponsor Website</label>
            <input type="url" id="luncheon_sponsor_website" name="luncheon_sponsor_website">
          </div>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn-success btn-full btn-large">Save & Publish</button>
        </div>
        <p id="save-status" class="status-text" hidden></p>
      </form>
    </section>

    <!-- Tab 2: Registrations -->
    <section id="tab-registrations" class="tab-content" hidden>
      <div class="reg-header">
        <h2>Registrations</h2>
        <div class="reg-actions">
          <button id="add-walkin-btn" class="btn-primary">+ Add Walk-in</button>
          <button id="export-csv-btn" class="btn-secondary">Export CSV</button>
        </div>
      </div>
      <div id="reg-summary" class="reg-summary"></div>
      <div id="reg-table-wrap" class="table-wrap">
        <table id="reg-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Meal</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody id="reg-tbody"></tbody>
        </table>
      </div>

      <!-- Walk-in Modal -->
      <div id="walkin-modal" class="modal" hidden>
        <div class="modal-content">
          <h3>Add Walk-in</h3>
          <form id="walkin-form">
            <div class="form-group">
              <label for="walkin-name">Name</label>
              <input type="text" id="walkin-name" required>
            </div>
            <div class="form-group">
              <label for="walkin-email">Email (optional)</label>
              <input type="email" id="walkin-email">
            </div>
            <div class="form-group">
              <label for="walkin-meal">Meal Choice</label>
              <select id="walkin-meal" required>
                <option value="">Select...</option>
              </select>
            </div>
            <div class="modal-actions">
              <button type="button" id="walkin-cancel" class="btn-secondary">Cancel</button>
              <button type="submit" class="btn-primary">Add Walk-in</button>
            </div>
          </form>
        </div>
      </div>
    </section>

    <!-- Tab 3: Print Meal Cards -->
    <section id="tab-print-cards" class="tab-content" hidden>
      <div class="print-header">
        <h2>Meal Cards</h2>
        <button id="print-btn" class="btn-primary">Print Cards</button>
      </div>
      <div id="cards-preview" class="cards-grid"></div>
    </section>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit the HTML shell**

```bash
git add admin/index.html
git commit -m "feat: add admin dashboard HTML structure with all three tabs"
```

---

## Task 10: Admin Dashboard — Styles

**Files:**
- Create: `admin/styles.css`

- [ ] **Step 1: Create admin/styles.css**

```css
/* Admin Dashboard Styles */

/* Login Screen */
.login-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--navy) 0%, var(--navy-dark) 100%);
}

.login-card {
  background: var(--white);
  padding: 48px 40px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 400px;
  text-align: center;
}

.login-logo h1 {
  font-size: 2.5rem;
  font-weight: 800;
  color: var(--navy);
  letter-spacing: 2px;
}

.login-logo p {
  color: var(--text-light);
  margin-bottom: 32px;
  font-weight: 500;
}

#login-form input {
  width: 100%;
  padding: 14px 18px;
  border: 2px solid var(--medium-gray);
  border-radius: var(--radius-sm);
  font-size: 1rem;
  font-family: var(--font-main);
  margin-bottom: 16px;
  transition: var(--transition);
}

#login-form input:focus {
  outline: none;
  border-color: var(--burnt-orange);
  box-shadow: 0 0 0 3px rgba(192, 86, 33, 0.15);
}

.btn-full { width: 100%; }
.btn-large { padding: 16px 32px; font-size: 1.1rem; }

.error-text {
  color: var(--error);
  font-size: 0.9rem;
  margin-top: 12px;
  font-weight: 600;
}

.status-text {
  text-align: center;
  font-weight: 600;
  margin-top: 16px;
  padding: 12px;
  border-radius: var(--radius-sm);
}

.status-text.success {
  color: var(--success);
  background: var(--success-light);
}

.status-text.error {
  color: var(--error);
  background: var(--error-light);
}

/* Dashboard Shell */
.dashboard {
  min-height: 100vh;
}

.dash-header {
  background: var(--navy);
  color: var(--white);
  padding: 16px 32px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dash-header h1 {
  font-size: 1.4rem;
  letter-spacing: 1px;
}

.btn-logout {
  background: rgba(255,255,255,0.15);
  color: var(--white);
  padding: 8px 20px;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
}

.btn-logout:hover {
  background: rgba(255,255,255,0.25);
}

/* Tabs */
.tabs {
  display: flex;
  background: var(--white);
  border-bottom: 2px solid var(--medium-gray);
  padding: 0 32px;
  box-shadow: var(--shadow-sm);
}

.tab {
  padding: 16px 24px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-light);
  background: none;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
}

.tab:hover {
  color: var(--text-dark);
}

.tab.active {
  color: var(--burnt-orange);
  border-bottom-color: var(--burnt-orange);
}

.tab-content {
  padding: 32px;
  max-width: 1100px;
  margin: 0 auto;
}

/* Event Form */
.event-form h2 {
  font-size: 1.3rem;
  color: var(--navy);
  margin-bottom: 20px;
}

.section-divider {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--medium-gray);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 24px;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group.full-width {
  grid-column: 1 / -1;
}

.form-group label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-dark);
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.meal-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.form-group input,
.form-group textarea,
.form-group select {
  padding: 12px 16px;
  border: 2px solid var(--medium-gray);
  border-radius: var(--radius-sm);
  font-size: 0.95rem;
  font-family: var(--font-main);
  transition: var(--transition);
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--burnt-orange);
  box-shadow: 0 0 0 3px rgba(192, 86, 33, 0.15);
}

.form-actions {
  margin-top: 32px;
}

/* Registrations Tab */
.reg-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.reg-header h2 {
  font-size: 1.3rem;
  color: var(--navy);
}

.reg-actions {
  display: flex;
  gap: 12px;
}

.btn-secondary {
  background: var(--white);
  color: var(--text-dark);
  padding: 10px 20px;
  border: 2px solid var(--medium-gray);
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-weight: 600;
}

.btn-secondary:hover {
  border-color: var(--navy);
  color: var(--navy);
}

.reg-summary {
  background: var(--white);
  padding: 20px 24px;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  margin-bottom: 24px;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--navy);
}

.table-wrap {
  background: var(--white);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th {
  text-align: left;
  padding: 14px 16px;
  background: var(--light-gray);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-light);
  font-weight: 700;
}

td {
  padding: 12px 16px;
  border-top: 1px solid var(--medium-gray);
  font-size: 0.9rem;
}

tr:hover td {
  background: rgba(192, 86, 33, 0.03);
}

.badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

.badge-paid {
  background: var(--success-light);
  color: var(--success);
}

.badge-pending {
  background: #fff3cd;
  color: #856404;
}

/* Modal */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--white);
  padding: 32px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 440px;
}

.modal-content h3 {
  color: var(--navy);
  margin-bottom: 20px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
  justify-content: flex-end;
}

/* Print Meal Cards */
.print-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.print-header h2 {
  font-size: 1.3rem;
  color: var(--navy);
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.meal-card {
  background: var(--white);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  border-left: 6px solid;
}

.meal-card-body {
  padding: 20px;
}

.meal-card-name {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-dark);
}

.meal-card-meal {
  font-size: 1rem;
  font-weight: 600;
  margin-top: 4px;
}

/* Print styles */
@media print {
  .dash-header, .tabs, .print-header, .tab-content:not(#tab-print-cards) {
    display: none !important;
  }

  #tab-print-cards {
    display: block !important;
    padding: 0;
  }

  .cards-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .meal-card {
    break-inside: avoid;
    border-left-width: 8px;
    box-shadow: none;
    border: 1px solid #ccc;
    border-left-width: 8px;
  }

  .meal-card-body {
    padding: 12px;
  }

  .meal-card-name {
    font-size: 1rem;
  }
}

/* Responsive */
@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .tabs {
    padding: 0 16px;
    overflow-x: auto;
  }

  .tab {
    padding: 14px 16px;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .tab-content {
    padding: 20px 16px;
  }

  .reg-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .cards-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add admin/styles.css
git commit -m "feat: add admin dashboard styles with STSA branding and print support"
```

---

## Task 11: Admin Dashboard — JavaScript Logic

**Files:**
- Create: `admin/app.js`

- [ ] **Step 1: Create admin/app.js**

```js
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
  const password = document.getElementById('password-input').value;
  const errorEl = document.getElementById('login-error');
  errorEl.hidden = true;

  try {
    const res = await fetch(`${API}/verify-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': password },
    });
    if (res.ok) {
      adminToken = password;
      sessionStorage.setItem('stsa_admin_token', password);
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
    const badge = r.payment_status === 'paid' ? 'badge-paid' : 'badge-pending';
    const walkinTag = r.is_walkin ? ' (walk-in)' : '';
    tr.innerHTML = `
      <td>${escapeHtml(r.name)}${walkinTag}</td>
      <td>${escapeHtml(r.email)}</td>
      <td>${escapeHtml(r.phone || '—')}</td>
      <td>${escapeHtml(r.meal_choice)}</td>
      <td><span class="badge ${badge}">${r.payment_status}</span></td>
      <td>${date}</td>
    `;
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
    card.innerHTML = `
      <div class="meal-card-body" style="background:${colors.bg}">
        <div class="meal-card-name">${escapeHtml(r.name)}</div>
        <div class="meal-card-meal" style="color:${colors.color}">${escapeHtml(r.meal_choice)}</div>
      </div>
    `;
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
```

- [ ] **Step 2: Commit**

```bash
git add admin/app.js
git commit -m "feat: add admin dashboard JS with event setup, registrations, and print cards"
```

---

## Task 12: RSVP Page — HTML & Styles

**Files:**
- Create: `rsvp/index.html`
- Create: `rsvp/styles.css`

- [ ] **Step 1: Create rsvp/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>STSA Event RSVP</title>
  <link rel="stylesheet" href="/shared/brand.css">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <!-- Loading State -->
  <div id="loading" class="loading-screen">
    <div class="loader">
      <div class="loader-dot"></div>
      <div class="loader-dot"></div>
      <div class="loader-dot"></div>
    </div>
  </div>

  <!-- No Event State -->
  <div id="no-event" class="no-event-screen" hidden>
    <div class="message-card">
      <h1>STSA</h1>
      <p>No upcoming event at this time. Check back soon!</p>
    </div>
  </div>

  <!-- RSVP Page -->
  <div id="rsvp-page" class="rsvp-page" hidden>
    <header class="rsvp-header">
      <div class="container">
        <h1 class="brand">STSA</h1>
      </div>
    </header>

    <main class="container">
      <!-- Event Details Section -->
      <section class="event-hero">
        <div class="event-hero-content">
          <p class="event-label">You're Invited</p>
          <h2 id="ev-name" class="event-title"></h2>
          <div class="event-meta">
            <div class="meta-item">
              <span class="meta-icon">&#128197;</span>
              <span id="ev-date"></span>
            </div>
            <div class="meta-item">
              <span class="meta-icon">&#128205;</span>
              <a id="ev-venue-link" href="#" target="_blank">
                <span id="ev-venue"></span>
              </a>
            </div>
            <div class="meta-item">
              <span class="meta-icon">&#128176;</span>
              <span><span id="ev-price"></span> per person</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Schedule -->
      <section class="schedule-bar">
        <div class="schedule-item">
          <span class="sched-time" id="ev-time-reg"></span>
          <span class="sched-label">Registration & Networking</span>
        </div>
        <div class="schedule-item">
          <span class="sched-time" id="ev-time-lunch"></span>
          <span class="sched-label">Lunch</span>
        </div>
        <div class="schedule-item">
          <span class="sched-time" id="ev-time-meeting"></span>
          <span class="sched-label">Meeting</span>
        </div>
      </section>

      <!-- Speaker Info -->
      <section id="speaker-section" class="speaker-section" hidden>
        <h3>Featured Speaker</h3>
        <div class="speaker-card">
          <div class="speaker-info">
            <h4 id="ev-speaker-name"></h4>
            <p class="speaker-topic" id="ev-topic"></p>
            <p class="speaker-bio" id="ev-speaker-bio"></p>
          </div>
        </div>
      </section>

      <!-- Special Guest -->
      <section id="guest-section" class="speaker-section" hidden>
        <h3>Special Guest</h3>
        <div class="speaker-card">
          <div class="speaker-info">
            <h4 id="ev-guest-name"></h4>
            <p class="speaker-bio" id="ev-guest-bio"></p>
          </div>
        </div>
      </section>

      <!-- Registration Form -->
      <section class="reg-section">
        <h3>Register & Pick Your Meal</h3>
        <form id="rsvp-form">
          <div class="form-row">
            <div class="form-group">
              <label for="reg-name">Full Name *</label>
              <input type="text" id="reg-name" required placeholder="Your name">
            </div>
            <div class="form-group">
              <label for="reg-email">Email *</label>
              <input type="email" id="reg-email" required placeholder="you@email.com">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="reg-phone">Phone (optional)</label>
              <input type="tel" id="reg-phone" placeholder="(210) 555-0000">
            </div>
          </div>

          <div class="meal-picker">
            <label class="meal-label">Pick Your Meal *</label>
            <div id="meal-buttons" class="meal-buttons"></div>
          </div>

          <!-- Additional Guests -->
          <div class="additional-guests">
            <button type="button" id="add-guest-btn" class="btn-secondary">+ Add Another Guest</button>
            <div id="guest-list"></div>
          </div>

          <!-- Total -->
          <div class="total-bar">
            <span>Total:</span>
            <span id="total-amount" class="total-amount">$0</span>
          </div>

          <button type="submit" id="pay-btn" class="btn-primary btn-full btn-large pay-btn">
            Pay & Register
          </button>
          <p id="form-error" class="error-text" hidden></p>
        </form>
      </section>

      <!-- Sponsors -->
      <section id="sponsors-section" class="sponsors-section" hidden>
        <div id="speaker-sponsor" hidden>
          <p><strong>Speaker Sponsor:</strong> <span id="ev-speaker-sponsor"></span></p>
        </div>
        <div id="luncheon-sponsor" hidden>
          <p><strong>Luncheon Sponsor:</strong> <span id="ev-luncheon-sponsor"></span></p>
        </div>
      </section>
    </main>

    <footer class="rsvp-footer">
      <p>&copy; 2026 South Texas Surety Association</p>
    </footer>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create rsvp/styles.css**

```css
/* RSVP Page Styles */

/* Loading */
.loading-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--light-gray);
}

.loader {
  display: flex;
  gap: 8px;
}

.loader-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--burnt-orange);
  animation: bounce 0.6s ease-in-out infinite alternate;
}

.loader-dot:nth-child(2) { animation-delay: 0.2s; }
.loader-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
  to { transform: translateY(-12px); opacity: 0.5; }
}

/* No event */
.no-event-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--light-gray);
}

.message-card {
  text-align: center;
  background: var(--white);
  padding: 48px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.message-card h1 {
  font-size: 2.5rem;
  color: var(--navy);
  letter-spacing: 2px;
  margin-bottom: 12px;
}

/* RSVP Page */
.rsvp-page {
  min-height: 100vh;
  background: var(--light-gray);
}

.rsvp-header {
  background: var(--navy);
  padding: 16px 0;
}

.brand {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--white);
  letter-spacing: 2px;
}

/* Event Hero */
.event-hero {
  background: linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%);
  border-radius: var(--radius-lg);
  padding: 48px 40px;
  margin-top: 32px;
  color: var(--white);
  position: relative;
  overflow: hidden;
}

.event-hero::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -20%;
  width: 300px;
  height: 300px;
  background: rgba(192, 86, 33, 0.15);
  border-radius: 50%;
}

.event-hero-content {
  position: relative;
}

.event-label {
  text-transform: uppercase;
  font-size: 0.8rem;
  letter-spacing: 3px;
  font-weight: 700;
  color: var(--warm-orange);
  margin-bottom: 12px;
}

.event-title {
  font-size: 2rem;
  font-weight: 800;
  margin-bottom: 24px;
  line-height: 1.2;
}

.event-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
  font-weight: 500;
}

.meta-icon {
  font-size: 1.2rem;
}

.meta-item a {
  color: var(--white);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.meta-item a:hover {
  color: var(--warm-orange);
}

/* Schedule Bar */
.schedule-bar {
  display: flex;
  gap: 0;
  margin-top: 24px;
  background: var(--white);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.schedule-item {
  flex: 1;
  padding: 20px;
  text-align: center;
  border-right: 1px solid var(--medium-gray);
}

.schedule-item:last-child {
  border-right: none;
}

.sched-time {
  display: block;
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--burnt-orange);
}

.sched-label {
  display: block;
  font-size: 0.8rem;
  color: var(--text-light);
  font-weight: 600;
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Speaker */
.speaker-section {
  margin-top: 32px;
}

.speaker-section h3 {
  font-size: 1.1rem;
  color: var(--navy);
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.speaker-card {
  background: var(--white);
  border-radius: var(--radius-md);
  padding: 28px;
  box-shadow: var(--shadow-sm);
}

.speaker-info h4 {
  font-size: 1.2rem;
  color: var(--text-dark);
}

.speaker-topic {
  color: var(--burnt-orange);
  font-weight: 700;
  margin: 6px 0;
  font-size: 1rem;
}

.speaker-bio {
  color: var(--text-light);
  font-size: 0.9rem;
  line-height: 1.6;
}

/* Registration Form */
.reg-section {
  margin-top: 40px;
  background: var(--white);
  border-radius: var(--radius-lg);
  padding: 40px;
  box-shadow: var(--shadow-md);
}

.reg-section h3 {
  font-size: 1.4rem;
  color: var(--navy);
  margin-bottom: 28px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 24px;
  margin-bottom: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-dark);
  margin-bottom: 6px;
}

.form-group input {
  padding: 14px 18px;
  border: 2px solid var(--medium-gray);
  border-radius: var(--radius-sm);
  font-size: 1rem;
  font-family: var(--font-main);
  transition: var(--transition);
}

.form-group input:focus {
  outline: none;
  border-color: var(--burnt-orange);
  box-shadow: 0 0 0 3px rgba(192, 86, 33, 0.15);
}

/* Meal Picker */
.meal-picker {
  margin: 28px 0;
}

.meal-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-dark);
  margin-bottom: 12px;
  display: block;
}

.meal-buttons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.meal-btn {
  padding: 20px;
  border: 3px solid var(--medium-gray);
  border-radius: var(--radius-md);
  background: var(--white);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-dark);
  text-align: center;
  cursor: pointer;
  transition: var(--transition);
  position: relative;
}

.meal-btn:hover {
  border-color: var(--burnt-orange);
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.meal-btn.selected {
  border-color: var(--burnt-orange);
  background: linear-gradient(135deg, rgba(192, 86, 33, 0.08), rgba(230, 126, 34, 0.08));
  color: var(--burnt-orange);
  box-shadow: 0 0 0 3px rgba(192, 86, 33, 0.15);
}

.meal-btn.selected::after {
  content: '\2713';
  position: absolute;
  top: 8px;
  right: 12px;
  font-size: 0.8rem;
  color: var(--burnt-orange);
  font-weight: 800;
}

/* Additional Guests */
.additional-guests {
  margin: 24px 0;
}

.guest-entry {
  background: var(--light-gray);
  border-radius: var(--radius-sm);
  padding: 16px;
  margin-top: 12px;
  position: relative;
}

.guest-entry h4 {
  font-size: 0.9rem;
  color: var(--navy);
  margin-bottom: 12px;
}

.remove-guest {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  color: var(--error);
  font-size: 1.2rem;
  padding: 4px 8px;
  font-weight: 700;
}

/* Total */
.total-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 0;
  margin: 24px 0;
  border-top: 2px solid var(--medium-gray);
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--navy);
}

.total-amount {
  font-size: 1.5rem;
  color: var(--burnt-orange);
}

.pay-btn {
  font-size: 1.2rem;
  padding: 18px 32px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* Sponsors */
.sponsors-section {
  margin-top: 32px;
  padding: 24px;
  background: var(--white);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  font-size: 0.9rem;
  color: var(--text-light);
}

/* Footer */
.rsvp-footer {
  text-align: center;
  padding: 32px;
  color: var(--text-light);
  font-size: 0.85rem;
  margin-top: 48px;
}

/* Responsive */
@media (max-width: 768px) {
  .event-hero {
    padding: 32px 24px;
    margin-top: 20px;
  }

  .event-title {
    font-size: 1.5rem;
  }

  .event-meta {
    flex-direction: column;
    gap: 12px;
  }

  .schedule-bar {
    flex-direction: column;
  }

  .schedule-item {
    border-right: none;
    border-bottom: 1px solid var(--medium-gray);
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .meal-buttons {
    grid-template-columns: 1fr;
  }

  .reg-section {
    padding: 24px 20px;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add rsvp/index.html rsvp/styles.css
git commit -m "feat: add RSVP page HTML and styles with mobile-first STSA branding"
```

---

## Task 13: RSVP Page — JavaScript Logic

**Files:**
- Create: `rsvp/app.js`

- [ ] **Step 1: Create rsvp/app.js**

```js
// rsvp/app.js — STSA RSVP Page Logic

const API = '/api';
let eventData = null;
let selectedMeal = '';
let additionalGuests = [];

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

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h12}:${m} ${ampm}`;
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
  const meals = [eventData.meal_choice_1, eventData.meal_choice_2, eventData.meal_choice_3].filter(Boolean);

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

    // Wire up events
    div.querySelector('.remove-guest').addEventListener('click', () => {
      additionalGuests = additionalGuests.filter(g => g.id !== guest.id);
      renderGuestList();
      updateTotal();
    });

    div.querySelector('.guest-name').addEventListener('input', (e) => {
      guest.name = e.target.value;
    });

    div.querySelectorAll('.guest-meal-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        guest.meal_choice = btn.dataset.meal;
        div.querySelectorAll('.guest-meal-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
      window.location.href = data.checkoutUrl;
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

// ─── Init ────────────────────────────────────────────
init();
```

- [ ] **Step 2: Commit**

```bash
git add rsvp/app.js
git commit -m "feat: add RSVP page JS with event loading, meal selection, and Square checkout"
```

---

## Task 14: RSVP Confirmation Page

**Files:**
- Create: `rsvp/confirmation.html`

- [ ] **Step 1: Create rsvp/confirmation.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Registered! | STSA</title>
  <link rel="stylesheet" href="/shared/brand.css">
  <link rel="stylesheet" href="styles.css">
  <style>
    .confirm-screen {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--light-gray);
      padding: 24px;
    }

    .confirm-card {
      background: var(--white);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      padding: 48px 40px;
      max-width: 560px;
      width: 100%;
      text-align: center;
    }

    .confirm-check {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--success), #2ecc71);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      font-size: 2.5rem;
      color: var(--white);
      animation: pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }

    @keyframes pop {
      0% { transform: scale(0); }
      100% { transform: scale(1); }
    }

    .confirm-card h1 {
      font-size: 1.8rem;
      color: var(--navy);
      margin-bottom: 8px;
    }

    .confirm-card .subtitle {
      color: var(--text-light);
      font-size: 1rem;
      margin-bottom: 24px;
    }

    .confirm-detail {
      background: var(--light-gray);
      border-radius: var(--radius-md);
      padding: 20px;
      margin-bottom: 24px;
      text-align: left;
    }

    .confirm-detail p {
      margin-bottom: 8px;
      font-size: 0.95rem;
    }

    .confirm-detail strong {
      color: var(--navy);
    }

    .confirm-venue {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--medium-gray);
      font-size: 0.95rem;
      color: var(--text-dark);
    }

    .confirm-venue a {
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="confirm-screen">
    <div class="confirm-card">
      <div class="confirm-check">&#10003;</div>
      <h1>You're Registered!</h1>
      <p class="subtitle">We can't wait to see you there.</p>

      <div id="confirm-details" class="confirm-detail">
        <p>Loading your registration details...</p>
      </div>

      <div id="confirm-venue" class="confirm-venue" hidden></div>

      <p style="color: var(--text-light); font-size: 0.85rem; margin-top: 16px;">
        A payment receipt from Square has been sent to your email.
      </p>
    </div>
  </div>

  <script>
    const API = '/api';

    async function loadConfirmation() {
      const params = new URLSearchParams(window.location.search);
      const regId = params.get('reg');
      const detailsEl = document.getElementById('confirm-details');

      // Load event details for venue info
      try {
        const res = await fetch(`${API}/get-event`);
        const data = await res.json();
        if (data.event) {
          const ev = data.event;
          const venueEl = document.getElementById('confirm-venue');
          const eventDate = new Date(ev.event_date + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          });
          venueEl.innerHTML = `
            <p><strong>${ev.event_name}</strong></p>
            <p>${eventDate}</p>
            <p><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.venue_address)}" target="_blank">
              ${ev.venue_name} — ${ev.venue_address}
            </a></p>
          `;
          venueEl.hidden = false;

          detailsEl.innerHTML = `
            <p><strong>Event:</strong> ${ev.event_name}</p>
            <p><strong>Date:</strong> ${eventDate}</p>
            <p><strong>Amount Paid:</strong> Check your email for receipt details</p>
          `;
        }
      } catch (err) {
        detailsEl.innerHTML = '<p>Your registration is confirmed! Check your email for details.</p>';
      }
    }

    loadConfirmation();
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add rsvp/confirmation.html
git commit -m "feat: add RSVP confirmation page with animated check and event details"
```

---

## Task 15: Environment Setup & Deployment Config

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Create .env.example for documentation**

```
# STSA Event RSVP System — Environment Variables
# Copy to Netlify dashboard as environment variables

# Admin password hash (generate with: node -e "console.log(require('bcryptjs').hashSync('yourpassword', 10))")
ADMIN_PASSWORD_HASH=

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Square
SQUARE_ACCESS_TOKEN=
SQUARE_LOCATION_ID=
SQUARE_ENVIRONMENT=sandbox
SQUARE_WEBHOOK_SIGNATURE_KEY=
```

- [ ] **Step 2: Ensure .gitignore excludes sensitive files**

Check if `.gitignore` exists. If not, create one:

```
node_modules/
.env
.netlify/
```

- [ ] **Step 3: Commit**

```bash
git add .env.example .gitignore
git commit -m "feat: add env example and gitignore for deployment config"
```

---

## Task 16: Smoke Test & Netlify Deploy

- [ ] **Step 1: Install dependencies locally**

Run: `npm install`
Expected: Clean install, no errors

- [ ] **Step 2: Run Supabase migration**

Use the Supabase MCP `execute_sql` tool to run the contents of `supabase/migration.sql` against the project database. Verify both tables exist.

- [ ] **Step 3: Deploy to Netlify via MCP**

Use the Netlify MCP to create a new site linked to the GitHub repo. Set the publish directory to `.` and functions directory to `netlify/functions`.

- [ ] **Step 4: Set environment variables via Netlify dashboard or MCP**

Set all variables from `.env.example` on the Netlify site:
- `ADMIN_PASSWORD_HASH` — generate with: `node -e "console.log(require('bcryptjs').hashSync('yourpassword', 10))"`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_ENVIRONMENT`, `SQUARE_WEBHOOK_SIGNATURE_KEY`

- [ ] **Step 5: Trigger deploy and verify**

Deploy the site. Verify:
1. Main site loads at root URL
2. `/admin` shows login screen
3. `/rsvp` shows loading then event details (or "no event" if none configured)
4. `/api/get-event` returns JSON response

- [ ] **Step 6: End-to-end test**

1. Log into admin dashboard with the password
2. Fill in event details and hit "Save & Publish"
3. Open the RSVP page — verify event details appear
4. Fill in registration form, select meal, click "Pay & Register"
5. Verify Square Checkout page loads (sandbox mode)
6. Complete sandbox payment
7. Check admin Registrations tab — verify registration appears
8. Check Print Meal Cards tab — verify card renders

- [ ] **Step 7: Commit any fixes from testing**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
