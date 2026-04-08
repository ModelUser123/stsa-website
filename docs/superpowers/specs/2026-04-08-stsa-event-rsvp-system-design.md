# STSA Event RSVP & Meal Selection System — Design Spec

**Date:** 2026-04-08
**Status:** Approved
**Author:** Chris Johnson + Claude

---

## Problem Statement

The South Texas Surety Association (STSA) holds regular luncheons where attendees currently RSVP via reply-to email and pay at the door (cash, card, or check). This creates slow food service (no meal pre-selection), no prepayment, and manual tracking for board members Earl and Robbie. The board wants attendees to pre-register, select their meal, and prepay online — while keeping the system dead simple for non-technical admins to manage.

## Success Criteria

1. Earl/Robbie can update event details without touching code
2. Attendees can RSVP, pick a meal, and pay in under 2 minutes
3. Admin dashboard shows real-time registration counts and meal breakdowns
4. Printable color-coded meal cards for the venue servers
5. Zero ongoing maintenance burden for Chris — fully handoff-ready

## Architecture Overview

### Single Repo, Multiple Sites

Everything lives in the existing `stsa-website` GitHub repo with this structure:

```
stsa-website/
├── stsa-website.html          (existing main site)
├── rsvp/                      (public RSVP site)
│   ├── index.html
│   └── confirmation.html
├── admin/                     (admin dashboard)
│   └── index.html
├── netlify/
│   └── functions/             (shared serverless API)
│       ├── get-event.js
│       ├── save-event.js
│       ├── create-checkout.js
│       ├── square-webhook.js
│       └── get-registrations.js
└── netlify.toml               (build config for multi-site)
```

Three separate Netlify sites are created from this single repo, each configured with a different publish directory:

1. **stsa-website** (existing or new) — publishes root `/` (serves `stsa-website.html`)
2. **stsa-rsvp** — publishes `rsvp/` directory
3. **stsa-admin** — publishes `admin/` directory

All three sites share the same `netlify/functions/` directory for serverless functions. Each site gets its own `netlify.toml` (or the root `netlify.toml` handles all three via Netlify's build configuration). Environment variables are set per-site in Netlify's dashboard.

### Tech Stack

| Layer | Tool | Why |
|-------|------|-----|
| Frontend (both sites) | HTML / CSS / JS | Matches existing site, no framework overhead, impossible for Earl to break |
| Hosting | Netlify | Deploy via MCP, free tier covers this |
| Serverless API | Netlify Functions | No server to manage, scales to zero |
| Database | Supabase | Already connected via MCP, free tier is plenty |
| Payments | Square Checkout API | Redirect-based, PCI compliance is Square's problem |
| Repo | GitHub | Single repo, already set up |

### Data Flow

```
Earl updates event in Admin Dashboard
        ↓
Event config saved to Supabase (events table)
        ↓
Earl sends email with RSVP link
        ↓
Attendee clicks link → RSVP Page loads event config from Supabase
        ↓
Attendee fills form (name, email, meal choice)
        ↓
Clicks "Pay & Register" → Netlify Function creates Square Checkout link
        ↓
Attendee redirected to Square → pays $40
        ↓
Square webhook fires → Netlify Function marks registration as paid in Supabase
        ↓
Attendee redirected to confirmation page
        ↓
Earl/Robbie check Admin Dashboard → see registrations, print meal cards
```

---

## Component 1: Admin Dashboard

### Access

- Single shared password (no user accounts)
- Password stored as a hashed environment variable in Netlify
- Simple login screen: password field + "Enter" button
- Session persists via a short-lived token in sessionStorage

### Tab 1: Event Setup

A single form with clearly labeled fields:

- **Event Name** — text (e.g., "May Luncheon")
- **Event Date** — date picker
- **Times** — Registration/networking start, lunch start, meeting start, meeting end
- **Venue Name** — text (e.g., "The Barn Door")
- **Venue Address** — text (e.g., "8400 N. New Braunfels Ave, San Antonio, TX 78209")
- **Price Per Person** — number (e.g., 40)
- **RSVP Deadline** — date picker
- **Meal Choice 1** — text (e.g., "Steak")
- **Meal Choice 2** — text (e.g., "Chicken")
- **Meal Choice 3** — text (e.g., "Fish")
- **Speaker Name** — text
- **Speaker Title/Bio** — textarea
- **Topic** — text
- **Special Guest Name** — text (optional)
- **Special Guest Bio** — textarea (optional)
- **Speaker Sponsor** — name, company, email (optional)
- **Luncheon Sponsor** — name, company, website (optional)

One big green **"Save & Publish"** button. Saves to Supabase. The RSVP page instantly reflects the changes.

### Tab 2: Registrations

- Summary bar at top: **"23 registered — 10 Steak, 8 Chicken, 5 Fish"**
- Table: Name | Email | Phone | Meal Choice | Payment Status | Registered Date
- **Export to CSV** button
- **Add Walk-in** button (for day-of attendees who didn't pre-register)

### Tab 3: Print Meal Cards

- Preview grid of printable cards
- Each card shows: **Attendee Name** + **Color-coded meal indicator**
  - Color mapping: Meal 1 = Red, Meal 2 = Green, Meal 3 = Blue
  - Large, readable text and bold color block
- **"Print Cards"** button triggers browser print dialog with print-optimized CSS
- Cards designed to be cut apart and placed at each seat

### Design

- STSA branded: navy (#1a3a52) + burnt-orange (#c05621) palette
- Clean, minimal, large touch targets
- Mobile-friendly (Earl might check registrations from his phone)

---

## Component 2: Public RSVP Page

### Top Section: Event Details

All pulled dynamically from Supabase (whatever Earl/Robbie saved):

- Event name + date
- Time breakdown (networking, lunch, meeting)
- Venue name + address (clickable Google Maps link)
- Speaker name, title, topic
- Special guest info (if present)
- Sponsor acknowledgments

### Middle Section: Registration Form

- **Name** — required
- **Email** — required
- **Phone** — optional
- **Meal Selection** — 3 large, tappable buttons showing meal options with clear visual feedback for selection
- **Number of Guests** — default 1, can add additional guests (each picks a meal)

### Bottom Section: Payment

- Displays total: guests x price per person
- Big **"Pay & Register"** button
- Redirects to Square Checkout (server-generated link via Netlify Function)
- After payment, Square redirects to confirmation page

### Confirmation Page

- "You're registered! Here's what you ordered:"
- Summary of name, meal choice(s), amount paid
- "See you at [Venue] on [Date]!"
- Square sends its own payment receipt email automatically

### Walk-in Friendly

The RSVP page is for pre-registration, not a gate. The email can still say "or just show up!" Earl/Robbie add walk-ins via the admin dashboard on event day.

### Design

- STSA branded, matching the main site aesthetic
- Fun, premium feel — smooth animations, satisfying interactions
- Mobile-first (most people will click the link from Earl's email on their phone)

---

## Component 3: Netlify Functions (Serverless API)

### get-event.js
- **GET** — returns the current active event config from Supabase
- Public (no auth needed, the RSVP page calls this)

### save-event.js
- **POST** — saves/updates event config to Supabase
- Protected: requires admin password in request header

### create-checkout.js
- **POST** — receives registration data (name, email, phone, meal choices, guest count)
- Saves registration to Supabase with status "pending"
- Creates a Square Checkout link via Square API with the total amount
- Returns the Square Checkout URL to the frontend

### square-webhook.js
- **POST** — receives webhook from Square when payment completes
- Verifies the webhook signature
- Updates the registration status to "paid" in Supabase

### get-registrations.js
- **GET** — returns all registrations for the active event
- Protected: requires admin password in request header

---

## Database Schema (Supabase)

### events table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| event_name | text | |
| event_date | date | |
| time_registration | time | |
| time_lunch | time | |
| time_meeting_start | time | |
| time_meeting_end | time | |
| venue_name | text | |
| venue_address | text | |
| price_per_person | integer | in dollars |
| rsvp_deadline | date | |
| meal_choice_1 | text | |
| meal_choice_2 | text | |
| meal_choice_3 | text | |
| speaker_name | text | |
| speaker_bio | text | |
| topic | text | |
| guest_name | text | nullable |
| guest_bio | text | nullable |
| speaker_sponsor_name | text | nullable |
| speaker_sponsor_company | text | nullable |
| speaker_sponsor_email | text | nullable |
| luncheon_sponsor_name | text | nullable |
| luncheon_sponsor_company | text | nullable |
| luncheon_sponsor_website | text | nullable |
| is_active | boolean | only one event active at a time |
| created_at | timestamptz | auto |
| updated_at | timestamptz | auto |

### registrations table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| event_id | uuid | foreign key → events.id |
| name | text | |
| email | text | |
| phone | text | nullable |
| meal_choice | text | |
| is_additional_guest | boolean | true if added by a primary registrant |
| primary_registration_id | uuid | nullable, links additional guests to primary |
| payment_status | text | "pending" or "paid" |
| square_transaction_id | text | nullable |
| is_walkin | boolean | default false |
| created_at | timestamptz | auto |

---

## Security

- **Admin password**: hashed with bcrypt, stored as `ADMIN_PASSWORD_HASH` env var in Netlify
- **Supabase**: Row-level security enabled, API keys stored as Netlify env vars (never in client code)
- **Square**: API keys stored as Netlify env vars, checkout links generated server-side
- **CORS**: Netlify Functions configured to only accept requests from the RSVP and admin origins
- **Webhook verification**: Square webhook signature verified before processing

## Environment Variables (Netlify)

- `ADMIN_PASSWORD_HASH` — bcrypt hash of the admin password
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Supabase anonymous key (for public reads)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (for server-side writes)
- `SQUARE_ACCESS_TOKEN` — Square API access token
- `SQUARE_LOCATION_ID` — Square location ID
- `SQUARE_WEBHOOK_SIGNATURE_KEY` — for verifying Square webhooks

---

## Handoff Instructions (for Earl/Robbie)

1. Go to the admin URL
2. Enter the password
3. Fill in the event details and hit "Save & Publish"
4. Copy the RSVP link into your email
5. Check registrations anytime from the Registrations tab
6. Before the event, go to Print Meal Cards and hit Print
7. Walk-ins? Add them from the Registrations tab on event day

No technical knowledge required.

---

## Future V2 (not in scope, noted for later)

- Annual dues notices and payment through the same system
- Email blast integration (send directly from admin dashboard)
- Member directory
- Event history / past event archive
