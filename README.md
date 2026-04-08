# STSA Event Management System

> **For the South Texas Surety Association Board** — built with care so your luncheons run smoother than ever.

---

## What This Does

The STSA Event Management System is your all-in-one tool for running luncheon events. Board members set up events in the Admin Dashboard — enter the date, venue, meal choices, and speaker details — and the RSVP page goes live instantly. Members visit the RSVP link, pick their meal, and pay securely online. You can track who's coming, see meal counts, add walk-ins on event day, and print color-coded place cards for the venue staff. Everything is connected in real time.

---

## Quick Links

| Page | Link |
|------|------|
| 🍽️ **Member RSVP Page** | https://stsa-events.netlify.app/rsvp |
| 🔒 **Admin Dashboard** | https://stsa-events.netlify.app/admin |

> **Tip:** Bookmark the Admin Dashboard link so you always have it handy.

---

## How It Works (For Board Members)

### Setting Up an Event

1. **Go to the Admin Dashboard** — https://stsa-events.netlify.app/admin
2. **Enter your password** and click Sign In
3. **You're on the Event Setup tab** — this is where you fill in event details
4. **Fill in the form:**
   - Event name (e.g., "May Luncheon")
   - Date and RSVP deadline
   - Start times for registration, lunch, and the meeting
   - Venue name and address
   - Price per person
   - Three meal choices (e.g., Steak, Chicken, Fish)
   - Speaker name, topic, and bio (if applicable)
   - Sponsors (optional)
5. **Click the Preview tab** to see exactly how the RSVP page will look to members
6. **Click "Save & Publish"** — the event goes live immediately. That's it!

> 💡 You can edit and re-save the event as many times as you need before and after publishing.

---

### Managing Registrations

Click the **Registrations** tab to see everyone who has signed up.

- **View who's registered** — names, email, phone, and meal choice are all listed
- **See payment status** — green "Paid" badge means their Square payment went through
- **Add a walk-in on event day** — click the "Add Walk-in" button, enter their name and meal
- **Mark cash or check payments as paid** — click the green "✓ Mark Paid" button next to their name
- **The page auto-refreshes every 30 seconds** — no need to keep hitting refresh manually

At the top of the page you'll see four summary numbers: Total registered, Paid, Pending, and Walk-ins. Below that is a meal breakdown bar showing how many of each meal were chosen.

---

### Printing Meal Cards

1. Click the **Print Meal Cards** tab
2. You'll see a color-coded card for every attendee — each card shows their name and meal choice
3. Click **Print Cards** — your browser's print dialog will open
4. Hand the printed cards to the venue servers so they know who gets what

> 🎨 Each meal choice gets its own color (e.g., Steak = blue, Chicken = green, Fish = orange) so servers can tell at a glance.

---

### Sending the RSVP Link

Once your event is saved and published:

1. Copy this link: **https://stsa-events.netlify.app/rsvp**
2. Paste it in your email blast to members
3. Members click → pick their meal → pay via Square → done!

Members will see the event details, schedule, speaker info, and a simple form to select their meal and pay. After paying, they get a confirmation screen.

---

### Activity & Payments

The **Activity & Payments** tab has two sections:

- **Activity Log** — a live feed of registrations and payments, newest first (great for event day monitoring)
- **Payment Reconciliation** — a table showing Square transaction IDs for every registration, useful for reconciling with your Square dashboard

---

### Analytics

The **Analytics** tab gives you a quick overview:
- Total registered, confirmed paid, revenue collected, and walk-in count
- Meal breakdown with visual bars
- Payment status breakdown (Paid vs. Pending)
- A historical table showing all past events with attendance and revenue

---

## For Developers

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | HTML, CSS, JavaScript (no frameworks) |
| **Hosting** | Netlify (static site + serverless functions) |
| **Database** | Supabase (PostgreSQL) |
| **Payments** | Square Checkout API |
| **Fonts** | Google Fonts (Cormorant Garamond + DM Sans) |

### Environment Variables

Set these in the Netlify dashboard under **Site Settings → Environment Variables**. Never put real values in code or commit them to Git.

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL (e.g., `https://xxxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | Supabase public anon key (safe for frontend) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only — keep secret) |
| `SQUARE_ACCESS_TOKEN` | Square API access token (sandbox or production) |
| `SQUARE_LOCATION_ID` | Square location ID for your business |
| `SQUARE_ENVIRONMENT` | `sandbox` for testing, `production` for live payments |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Used to verify Square webhook authenticity |
| `ADMIN_PASSWORD` | The password that protects the Admin Dashboard |

### Project Structure

```
stsa-website/
├── admin/
│   ├── index.html      # Admin Dashboard — login + full dashboard UI
│   ├── app.js          # Dashboard logic (auth, tabs, data loading, rendering)
│   └── styles.css      # Dashboard styles ("The Boardroom" theme)
│
├── rsvp/
│   ├── index.html      # Member RSVP page
│   ├── app.js          # RSVP form logic (loads event, handles submission)
│   ├── styles.css      # RSVP page styles
│   └── confirmation.html  # Post-payment confirmation page
│
├── netlify/
│   └── functions/      # Serverless API functions (Node.js)
│       ├── auth.js              # Auth helper (shared)
│       ├── supabase.js          # Supabase client (shared)
│       ├── verify-admin.js      # Validates admin password
│       ├── get-event.js         # Returns current active event
│       ├── save-event.js        # Creates or updates the active event
│       ├── get-registrations.js # Returns all registrations for active event
│       ├── add-walkin.js        # Adds a walk-in registration
│       ├── update-registration.js  # Updates payment status
│       ├── create-checkout.js   # Creates Square Checkout session
│       ├── square-webhook.js    # Handles Square payment webhooks
│       └── get-event-history.js # Returns all past events with stats
│
├── shared/
│   └── brand.css       # Shared design tokens (colors, fonts, base styles)
│
├── supabase/
│   └── migration.sql   # Database schema (run once to set up tables)
│
├── netlify.toml        # Netlify build config and function routing
├── package.json        # Node.js dependencies for functions
└── .env.example        # Template for environment variables (no real values)
```

### Switching to Live Payments

When you're ready to accept real money (instead of test payments):

1. **Change `SQUARE_ENVIRONMENT`** from `sandbox` to `production` in Netlify environment variables
2. **Update `SQUARE_ACCESS_TOKEN`** with your live production access token from the Square Developer Portal
3. **Update `SQUARE_LOCATION_ID`** with your production location ID (if different from sandbox)
4. **Redeploy** — Netlify will pick up the new env vars on the next deploy

> ⚠️ Make sure to test thoroughly in sandbox mode before going live. Square sandbox payments use fake cards and no real money changes hands.

### Database Setup

The database schema lives in `supabase/migration.sql`. Run it once in the Supabase SQL Editor to create the `events` and `registrations` tables with proper indexes and row-level security policies.

### Local Development

```bash
# Install dependencies
npm install

# Install Netlify CLI globally (if not already)
npm install -g netlify-cli

# Create a .env file from the example (fill in real values)
cp .env.example .env

# Run locally with Netlify Dev (handles functions + env vars)
netlify dev
```

The site will be available at `http://localhost:8888`.

---

## Questions?

Contact the system administrator or the board member who set this up. The RSVP link is always: **https://stsa-events.netlify.app/rsvp**

---

*STSA Event Management System — Built for the South Texas Surety Association &copy; 2026*
