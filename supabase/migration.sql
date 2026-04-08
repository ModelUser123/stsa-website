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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_events_is_active ON events(is_active) WHERE is_active = true;

-- Ensure only one active event at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_event ON events(is_active) WHERE is_active = true;

-- Row-Level Security
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- Public can read active events (for the RSVP page)
CREATE POLICY "Public can read active events"
  ON events FOR SELECT
  USING (is_active = true);

-- Service role has full access (Netlify Functions use service role key)
CREATE POLICY "Service role full access on events"
  ON events FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on registrations"
  ON registrations FOR ALL
  USING (true)
  WITH CHECK (true);

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
